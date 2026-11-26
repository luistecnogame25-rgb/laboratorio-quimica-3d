# Arquitectura

## Capas y dependencias

```
ui/  (DOM, vistas, paneles)          ──►  lab/  (controladores de interacción y simulación)
                                            │
render/ (Three.js: escena, modelos 3D) ◄───┤
                                            ▼
library/ (definiciones de componentes) ──► electrical/ (netlist, MNA, dispositivos, simulador)
        │                                   │
        └──────────────►  core/ (tipos, registro, proyecto, historial, geometría)  ◄──┘
education/ (fichas, lecciones)   storage/ (repositorio local, import/export)
```

Reglas: `core` no depende de nada; `electrical` no conoce Three.js ni el DOM (por eso se prueba en Node); `render` no conoce el circuito, solo dibuja; `lab` une proyecto ↔ escena ↔ simulador.

## Estructura de carpetas

```
src/
  core/        types.ts (contratos), registry.ts, project.ts (formato), store.ts (deshacer/rehacer), geometry.ts, format.ts
  electrical/  mna.ts (sistema MNA + solver), devices.ts (R, C, diodo, BJT, fuentes), netlist.ts (union‑find),
               simulator.ts (DC, transitorio, validación), designators.ts
  library/     breadboards.ts, passives.ts, semiconductors.ts, power.ts, inputs.ts, builder.ts, catalog.ts, index.ts
  render/      SceneManager.ts, models.ts (modelos procedurales), boardMesh.ts, wireMesh.ts, materials.ts
  lab/         LabController.ts (interacción 3D), SimulationController.ts (bucle en tiempo real), templates.ts
  education/   sheets.ts (fichas), lessons.ts (Academia), symbols.ts (SVG)
  storage/     projectStorage.ts
  ui/          App.ts (navegación y vistas), LabView.ts (espacio de trabajo), infoSheet.ts, dom.ts
tests/         electrical.test.ts, project.test.ts, templates.test.ts
android/       proyecto nativo generado por Capacitor
docs/          esta documentación
```

## Definición de componente (extensibilidad)

Cada componente es un `ComponentDef` (`src/core/types.ts`):

| Campo | Contenido |
|---|---|
| `type`, `name`, `prefix`, `category` | Identificador único, nombre, designador (R, C, Q…), categoría |
| `size` | Dimensiones (mm) |
| `terminals(params)` | Terminales con id, nombre, tipo/función, polaridad, posición 3D local, límites |
| `params` | Parámetros editables (unidades, rangos, valores estándar) |
| `modelLevel`, `modelDoc` | Nivel de modelado y descripción matemática (visible al usuario) |
| `createModel(ctx)` | Construye los elementos MNA y la función `report()` (valores, advertencias, estado visual) |
| `eduId` | Ficha educativa |
| `insertable` | Si sus patas se insertan en la protoboard |

**Añadir un componente nuevo** (p. ej. un diodo Zener):
1. Crear su `ComponentDef` en `src/library/` combinando elementos de `electrical/devices.ts` (o un elemento nuevo que implemente la interfaz `Element`: `stamp()`, `converged()`, `accept()`).
2. Registrarlo en `src/library/index.ts`.
3. Añadir su constructor 3D en `BUILDERS` (`src/render/models.ts`). Si falta, se muestra un bloque genérico.
4. Añadir su ficha en `src/education/sheets.ts`.

El simulador, la netlist, la interfaz y el almacenamiento no cambian.

## Motor eléctrico

- **Netlist** (`netlist.ts`): union‑find sobre perforaciones (tiras y rieles), pines insertados (por posición geométrica, tolerancia 0,9 mm) y cables. Produce nets reales.
- **MNA** (`mna.ts`): incógnitas = voltajes de nodo + corrientes de rama de fuentes. Eliminación gaussiana con pivoteo parcial (circuitos educativos: < 100 incógnitas).
- **No linealidad**: Newton‑Raphson con `pnjlim` (SPICE3) en uniones; gmin 1 pS por nodo; escalonamiento de gmin si no converge.
- **Transitorio**: Euler implícito (modelo compañero del capacitor G = C/Δt), paso fijo configurable (0,1–1 ms) con subdivisión ×4 hasta 6 veces si falla.
- **Tierra**: terminal negativo de la primera fuente.
- **Validación** previa: cortocircuito directo de fuente, terminales sin conectar, componentes puenteados, ausencia de fuente.
- **Estado en ejecución** (`RuntimeState`): pulsadores presionados, componentes dañados (LED quemado → abierto), voltajes de capacitores para continuidad al editar en plena simulación.

Preparado para un backend SPICE: la app solo usa `Simulator` (build/dc/step/reports/netVoltage). Un `NgspiceSimulator` con la misma interfaz podría generar la netlist SPICE desde los mismos `ComponentDef` (campo futuro `spice`).

## Formato de proyecto (`.lab3d.json`, versión 1)

```jsonc
{
  "format": "lab3d-project",       // obligatorio
  "version": 1,                    // obligatorio
  "id": "prj-…", "name": "…", "created": "ISO‑8601", "modified": "ISO‑8601",
  "components": [
    { "id": "r-…", "type": "resistor", "params": { "resistance": 220 }, "x": -12.7, "z": -8.89, "rot": 0, "group": "g-…" }
  ],                               // x, z en mm sobre la mesa; rot en pasos de 90°
  "wires": [
    { "id": "w-…", "color": "auto",
      "a": { "kind": "pin", "inst": "bt-…", "term": "+" },
      "b": { "kind": "hole", "board": "pb-…", "hole": "T+3" } }
  ],
  "simulation": { "timeScale": 1, "dt": 0.0002 },
  "measurements": [ { "label": "…", "value": 1.96, "unit": "V", "time": 0.86 } ]
}
```

Identificadores de perforación: `<columna><fila>` (`10a`…`63j`) y rieles `T-n`, `T+n`, `B+n`, `B-n`. La importación valida formato, versión, tipos de componente conocidos y elimina cables huérfanos (`parseProject`). Los parámetros ausentes toman sus valores por defecto, lo que permite evolucionar componentes sin romper proyectos antiguos.

## Almacenamiento

`ProjectRepository` (interfaz asíncrona) con implementación `LocalProjectRepository` (localStorage, persistente en el WebView). Autoguardado 0,7 s después de cada cambio. Para sincronización futura basta con otra implementación de la interfaz (p. ej. IndexedDB + nube).

## Rendimiento (gama media)

- Render bajo demanda (`needsRender`): sin cambios no se dibuja, ahorrando batería.
- Materiales compartidos; la cara de la protoboard es una sola textura (830 perforaciones = 1 draw call).
- Calidad configurable (sombras y densidad de píxeles).
- Simulación limitada a 400 pasos por cuadro: si el dispositivo no llega, se reduce la velocidad (se informa "× real") en lugar de perder precisión.
