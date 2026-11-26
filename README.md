# Laboratorio de Química 3D

Explora los **118 elementos** con datos verificables, observa su **estructura atómica en 3D**, estudia **moléculas y cristales reales** obtenidos de bases de datos científicas y **forma estructuras documentadas** en un laboratorio tridimensional. Una sola base de código para Windows (navegador) y Android (Capacitor).

> El antiguo laboratorio electrónico se conserva en `archivo/electronica/`.

- Fuentes científicas, verificaciones y evaluación tecnológica: [docs/FUENTES.md](docs/FUENTES.md)
- Arquitectura y formato de experimento: [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)
- Fase 4 (química computacional): [docs/FASE4.md](docs/FASE4.md)
- Android Studio, APK, AAB y Google Play: [docs/ANDROID.md](docs/ANDROID.md)

## Estado de las fases (versión 0.4.0)

| Fase | Estado | Qué incluye |
|---|---|---|
| 1. Laboratorio atómico y tabla periódica | ✅ | 118 elementos (PubChem), fichas con procedencia, búsqueda y filtros; visor 3D: Bohr, configuración, orbitales s/p/d/f y núcleo; laboratorio 3D; experimentos guardados |
| 2. Constructor de enlaces | ✅ | Herramienta **Enlazar** (toca dos átomos; simple, doble o triple) validada por reglas de valencia, con reconocimiento automático de moléculas documentadas y su geometría de PubChem; análisis de combinaciones con 6 veredictos; formación animada de estructuras documentadas con sus enlaces y órdenes de enlace; separar; enlaces iónicos, covalentes (simple, doble, triple, polar, coordinado), metálicos y deslocalizados con ejemplos; **Analizador de enlaces** de dos elementos (tipo de enlace, Δχ y % iónico, semiconductor intrínseco o extrínseco N/P, función química, fórmula y nombre, tipo de sólido, aleaciones, comportamiento eléctrico, octeto y Lewis, fuerzas intermoleculares), también al enlazar en el laboratorio, en «Sustancias» y en la biblioteca |
| 3. Biblioteca molecular | ✅ | 20 compuestos de PubChem (18 con conformero 3D) y 5 sólidos de la COD (NaCl, MgO, Cu, Fe α, calcita); bolas y varillas, espacio lleno, estructural; longitudes, ángulos, VSEPR, polaridad, coordinación cristalina |
| 4. Química computacional | 📄 Documentada | **No hay cálculos cuánticos en la app** (Psi4 y PySCF no funcionan en Android). Flujo de trabajo y requisitos en [docs/FASE4.md](docs/FASE4.md) |
| 5. Plataforma educativa | ✅ | Academia de 18 módulos con explicación, enlaces a modelos 3D y reto con solución |
| 6. Android | ✅ | Probada en el emulador: barra de estado, botón Atrás nativo, icono adaptativo, pantalla de inicio, tabla compacta, nivel de detalle 3D según tamaño. Falta probar en un teléfono real |

## Calculadora química (sección propia, conectada con el laboratorio)

| Herramienta | Qué calcula |
|---|---|
| Fórmula | Masa molar, átomos, composición porcentual (masa y átomos), fórmula empírica, carga, estados de oxidación con la regla aplicada, y estructura (tipo de enlace, geometría VSEPR, polaridad) cuando la biblioteca la documenta. Admite paréntesis, corchetes, hidratos (CuSO4·5H2O) y cargas (SO4^2-, NH4+) |
| Ecuaciones | Ajuste exacto por álgebra lineal con fracciones (conserva átomos y carga; también redox iónicas); estequiometría desde cualquier especie; reactivo limitante, exceso y rendimiento teórico |
| Conversiones | Masa ↔ moles ↔ entidades ↔ átomos por elemento; volumen como gas ideal con T y P |
| Disoluciones | Molaridad, g/L, masa necesaria para una concentración, dilución C₁V₁ = C₂V₂ |
| Fórmula empírica | Desde porcentajes en masa; fórmula molecular si se da la masa molar |

**Conexión entre los dos sistemas:**
- Desde el laboratorio, «Enviar a la calculadora» lleva la composición de los átomos seleccionados.
- Desde la calculadora, «Ver estructura 3D» y «Llevar al laboratorio» insertan la estructura documentada con sus enlaces.
- El visor de la biblioteca también envía la fórmula a la calculadora.

Si la fórmula no corresponde a una estructura documentada, la calculadora lo dice y no inventa enlaces ni geometría. Si la encuentra, avisa de que pueden existir isómeros con la misma fórmula.

## Rigor científico: cómo se evita inventar

- **Elementos:** valores de PubChem copiados sin modificar. Cada dato indica si es *Fuente*, *Calculado*, *Predicción* o *Aproximación*.
- **Moléculas:** conformeros 3D de PubChem, que son **calculados** (campo de fuerza MMFF94s) y se marcan así. Si PubChem no ofrece geometría (H₂, cisplatino), no se dibuja ninguna.
- **Cristales:** celdas **experimentales** de la COD (difracción de rayos X), con autores, año y DOI; se expanden con las operaciones de simetría del propio CIF.
- **Validación:** las estructuras se comparan en pruebas con valores experimentales de referencia (NIST CCCBDB). Las discrepancias se documentan, no se ocultan: en el CO, el conformero calculado difiere 0,07 Å del valor experimental, y la app lo indica.
- **Laboratorio:** la proximidad y el arrastre nunca crean enlaces. Con «Enlazar», cada enlace se valida con reglas de valencia (H 1, O 2, N 3, C 4; enlace coordinado en N y O; capa expandida de P y S solo hacia O, F o Cl; sin gases nobles; dos metales forman una unión metálica que no cuenta para la valencia). Lo construido se marca «No validada» hasta que coincide —mismo grafo y órdenes de enlace— con un compuesto documentado; entonces se adopta su geometría de la fuente. También se puede seleccionar una composición y usar «Formar estructura». Las predicciones por estados de oxidación se etiquetan como predicciones.

## Ejecutar en Windows

Requisito: Node.js 22 o superior. Hay una copia portátil en `C:\Users\Luis\tools\node-v26.13.1-win-x64`:

```powershell
$env:Path = "$env:USERPROFILE\tools\node-v26.13.1-win-x64;" + $env:Path
```

```powershell
cd "C:\Users\Luis\OneDrive\Documentos\visual\laboratorio-3d"; npm install
```

```powershell
npm run dev
```

Abre http://localhost:5173. Otros comandos:

| Comando | Para qué |
|---|---|
| `npm test` | 124 pruebas (Vitest) |
| `npm run build` | Comprobación de tipos y compilación de producción |
| `npm run data:fetch` | Volver a descargar PubChem y la COD (requiere internet) |
| `npm run data:structures` | Regenerar la biblioteca a partir de `data/fuentes` |
| `npm run data:elements` | Regenerar la base de elementos |

Para verla en Android Studio o generar el APK, consulta [docs/ANDROID.md](docs/ANDROID.md).

## Pruebas

`npm test` → **124 pruebas, todas correctas**. 18 cubren el analizador de enlaces (NaCl, GaAs, Si+P tipo N, Si+B tipo P, ZnO, Na metálico, diamante, nomenclatura, funciones químicas…) y 20 el constructor de enlaces (valencias, rechazos, reconocimiento de agua, CO₂, O₂ y etanol en cualquier orden, guardado). Entre ellas, 34 de la calculadora:
- Masas molares de los 20 compuestos contrastadas con el valor independiente de PubChem (±0,01 g/mol).
- Ajustes de referencia, incluidos la redox del KMnO₄ (2, 16, 2, 2, 5, 8) y la iónica MnO₄⁻/Fe²⁺ (1, 5, 8, 1, 5, 4).
- Estados de oxidación de referencia; H₂O₂ detectado como excepción y Fe₃O₄ como promedio +8/3.
- Estequiometría y reactivo limitante.
- Volumen molar ideal de 22,414 L y fórmulas empíricas (CH₂O, Fe₂O₃).

El resto de las pruebas:
- **Elementos:**
  - Los 118, con configuraciones que suman Z, incluidas las excepciones de Cr, Cu, Pd y Au.
  - Grupos, períodos y bloques; valores de referencia; búsqueda.
- **Orbitales:** normalización, ortogonalidad, valores analíticos y regla de Hund.
- **Estructuras frente a valores experimentales:**
  - Distancias de enlace: H₂O, CH₄, NH₃, CO₂, N₂, O₂ (±0,04 Å).
  - Ángulos: H₂O, CH₄, NH₃ y CO₂.
  - Geometrías VSEPR y polaridad.
  - Benceno con seis enlaces C–C iguales.
- **Cristales:**
  - Coordinación de NaCl (6) y MgO (6).
  - Cu: 12 vecinos a a/√2. Fe α: 8 vecinos a a√3/2.
  - Calcita: 30 átomos por celda y CO₃ trigonal.
- **Combinaciones (Fase 2):** agua documentada; H₂ sin geometría; NaCl como red; He incompatible; Na₂O no validado con predicción; MgO y Al₂O₃ como proporciones de carga.
- **Experimentos:** formato v2, migración desde v1, descarte de enlaces sin estructura, deshacer/rehacer, notación de Hill y mediciones.

Verificación manual en el navegador y en el **emulador de Android (API 37)**:
- Inicio, tabla periódica, ficha y visor atómico.
- Biblioteca molecular con agua y red de NaCl.
- Formación animada del agua en el laboratorio.
- Menú, botón Atrás nativo, barra de estado e icono.

## Pendiente

- Fase 4: cálculos reales (geometrías optimizadas, orbitales moleculares, densidad, cargas) mediante PySCF fuera de la app.
- Fase 2:
  - Visualización 3D de interacciones intermoleculares entre varias moléculas.
  - Enlace multicéntrico (diborano) y sólidos covalentes de red (diamante, cuarzo): sus estructuras aún no se han importado.
  - Geometría del cisplatino: la COD contiene estructuras cristalinas de complejos que aún no se han importado.
- Datos de elementos y compuestos: aplicaciones, reactividad y seguridad. Hoy se enlaza la fuente.
- Simulación de reacciones (energía y cinética).
- Android:
  - Pruebas en un teléfono real (rendimiento y memoria).
  - Carga diferida de las vistas 3D para reducir el paquete inicial (≈960 kB, ≈260 kB comprimido).
  - Ficha de Google Play.
