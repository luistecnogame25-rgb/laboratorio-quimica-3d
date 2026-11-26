# Arquitectura

Una sola aplicación web (TypeScript) que se ejecuta en el navegador de Windows y, sin cambios, como app Android mediante Capacitor.

```
src/
  data/        elements.data.ts   ← GENERADO desde data/fuentes (no editar a mano)
  data/        structures.data.ts ← GENERADO desde data/fuentes/pubchem y data/fuentes/cod
  chem/        structures.ts      geometría, VSEPR, polaridad, coordinación cristalina, búsqueda por composición
               combination.ts     análisis de combinaciones (Fase 2)
               calculator.ts      calculadora: fórmulas, masas, oxidación, ajuste (fracciones exactas BigInt), estequiometría, disoluciones
               elements.ts        modelo de elemento: derivaciones (grupo, período, bloque, configuración, niveles)
               orbitals.ts        armónicos esféricos reales, regla de Hund
               formula.ts         notación de Hill, distancias y ángulos
  core/        types.ts           modelo del experimento
               project.ts         creación y validación (importación)
               store.ts           historial de deshacer/rehacer
  storage/     projectStorage.ts  repositorio local (interfaz asíncrona, reemplazable)
  render/      SceneManager.ts    renderizador, cámara orbital (táctil), luces, render bajo demanda
               atomModels.ts      Bohr, núcleo, orbitales, átomos del laboratorio
  ui/          App.tsx            armazón React: navegación, rutas, páginas
               PeriodicTable.ts   tabla interactiva (widget)
               ElementSheet.ts    ficha lateral y menú contextual
               AtomViewer.ts      visor atómico 3D (widget)
               LabView.ts         laboratorio 3D (widget)
               CalculatorPage.tsx calculadora química (React)
scripts/       build-elements.mjs genera src/data a partir de la fuente
data/fuentes/  datos originales descargados (trazabilidad)
tests/         pruebas (Vitest)
android/       proyecto nativo (generado por Capacitor)
archivo/       versión anterior (laboratorio electrónico), conservada
```

## Principios

1. **Separación ciencia / presentación.** `chem/` no depende de React ni de Three.js: se prueba en Node y podrá reutilizarse si cambia la interfaz.
2. **Procedencia explícita.** Los valores de la fuente se guardan como texto original (`Measured { value, text }`); la interfaz etiqueta cada dato como *Fuente*, *Calculado*, *Predicción* o *Aproximación*.
3. **React para la interfaz, Three.js imperativo para el 3D.** Las escenas son clases que se montan en React con `Host` (refs). React no re-renderiza la escena; así se evitan costes en dispositivos móviles.
4. **Una vista 3D activa a la vez.** Al salir del laboratorio o del visor se detiene su bucle de render (`deactivate`), y el render es bajo demanda (sin cambios no se dibuja), lo que ahorra GPU y batería en Android.
5. **Extensible.** Nuevas fuentes de datos: añadir un script en `scripts/` que genere un módulo en `src/data/`. Nuevos modelos 3D: añadir constructores en `render/`. Nuevo almacenamiento (IndexedDB, archivos, nube): implementar `ProjectRepository`.

## Formato de experimento (`.quimlab.json`, versión 2; la versión 1 se migra al importar)

```jsonc
{
  "format": "quimlab-experiment", "version": 1,
  "id": "exp-…", "name": "…", "created": "ISO-8601", "modified": "ISO-8601",
  "atoms": [ { "id": "at-…", "z": 8, "pos": [0, 0.53, 0], "group": "g-…" } ],   // posiciones en Å
  "measurements": [ { "id": "m-…", "kind": "distance", "atoms": ["at-1", "at-2"], "value": 1.21, "unit": "Å" } ],
  "structures": [ { "id": "st-…", "recordId": "agua", "atoms": ["at-1", "at-2", "at-3"] } ],   // estructuras documentadas formadas
  "bonds": [ { "a": "at-1", "b": "at-2", "order": 1, "structure": "st-…" },                    // de una estructura documentada
             { "a": "at-3", "b": "at-4", "order": 2, "manual": true } ],                     // creado con «Enlazar» (validado por valencia)
  "notes": "",
  "view": { "atomScale": 1, "labels": true },
  "sources": ["PubChem Periodic Table (NCBI/NLM) — … (obtenido 2026-11-23)"]
}
```

`parseExperiment` valida el formato, la versión, Z ∈ [1, 118] y las posiciones, y descarta las mediciones huérfanas. Los enlaces solo existen dentro de una estructura documentada (`structures`); al importar se descartan los que no la tienen y, si se elimina un átomo de una estructura, esta y sus enlaces dejan de existir.

## Preparación para las fases siguientes

- **Fase 2 (enlaces, implementada):** `src/chem/bonding.ts` combina dos fuentes de verdad: (a) estructuras conocidas importadas (PubChem/COD) con su referencia, y (b) un validador de valencias y cargas formales que solo permite o rechaza enlaces y nunca afirma que un compuesto exista. Una molécula construida a mano se muestra como «No validada» hasta que su grafo coincide con una estructura documentada (búsqueda de isomorfismo con elementos y órdenes de enlace); entonces se adopta la geometría de la fuente.
- **Fase 3 (biblioteca molecular):** `data/fuentes/` recibirá archivos SDF y CIF con su CID o identificador COD; un script los convertirá a módulos con geometría y referencias.
- **Fase 4:** los cálculos (geometrías optimizadas, orbitales moleculares) se ejecutarán fuera de la app con Psi4 o PySCF y se empaquetarán como datos con su método documentado.
