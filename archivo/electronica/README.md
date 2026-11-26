# Laboratorio Electrónico 3D — Fase 1

Plataforma para **diseñar, simular y aprender electrónica** en un entorno tridimensional: protoboards reales, componentes con modelos 3D reconocibles, cables interactivos y un **motor de simulación eléctrica propio** (análisis nodal modificado) cuyos resultados se contrastan con cálculos teóricos en pruebas automáticas. Funciona sin conexión, sin cuenta, sin publicidad y está preparada para empaquetarse como app Android.

- Investigación y decisiones tecnológicas: [docs/INVESTIGACION.md](docs/INVESTIGACION.md)
- Arquitectura, extensibilidad y formato de proyecto: [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)
- APK, AAB y requisitos de Google Play: [docs/ANDROID.md](docs/ANDROID.md)

## Tecnología elegida (resumen)

| Capa | Tecnología | Licencia | Motivo |
|---|---|---|---|
| Lenguaje / build | TypeScript 7 + Vite 8 | Apache‑2.0 / MIT | Tipado fuerte, recarga en caliente, build reproducible |
| 3D | Three.js 0.187 | MIT | Ligero, maduro, funciona en el WebView de Android |
| Simulación | Motor MNA propio (Newton‑Raphson + Euler implícito) | Propia | Offline, verificable, extensible; backend ngspice‑WASM previsto en Fase 2 |
| Android | Capacitor 8.6 (`targetSdk 36`) | MIT | Mismo código web empaquetado como app nativa |
| Pruebas | Vitest 5 | MIT | Pruebas del motor en Node |

Todo es gratuito y open source; no se usan servicios de pago, servidores ni suscripciones.

## Ejecutar en tu computadora

Requisito: **Node.js 22 o superior**. En este equipo se instaló una copia portátil verificada (SHA‑256 oficial) en `C:\Users\Luis\tools\node-v26.13.1-win-x64`, sin tocar la configuración del sistema. Para usarla en una terminal de PowerShell:

```powershell
$env:Path = "$env:USERPROFILE\tools\node-v26.13.1-win-x64;" + $env:Path
```

(O instala Node.js LTS desde nodejs.org y omite ese paso.) Después, en la carpeta `laboratorio-3d`:

```powershell
npm install
```

```powershell
npm run dev
```

Abre http://localhost:5173. Para probar en tu teléfono desde la misma red Wi‑Fi, usa la dirección "Network" que muestra Vite.

Otros comandos:

```powershell
npm test
```

```powershell
npm run build
```

`npm test` ejecuta las 45 pruebas; `npm run build` verifica tipos y genera `dist/`.

## Cómo usarlo

1. **Inicio → Nuevo circuito** crea un proyecto con una protoboard de 830 puntos (o abre una plantilla).
2. Añade componentes desde el panel izquierdo (clic o arrastrar al lienzo). Sus patas **encajan en las perforaciones**.
3. Herramientas (barra superior):
   - **Seleccionar (V)**: arrastra componentes; Shift+clic para selección múltiple; R rota; Supr elimina; Ctrl+D duplica; Ctrl+G agrupa; Ctrl+Z / Ctrl+Y deshacer/rehacer.
   - **Cable (W)**: clic en un terminal o perforación y clic en el destino. Al pasar el puntero se resaltan en verde **todos los puntos eléctricamente conectados**. Color automático (rojo +, negro GND, azul señal) o manual.
   - **Sonda (M)**: primer clic = punta roja, segundo = negra (sin negra mide respecto a GND). El multímetro muestra el voltaje y el registro dibuja V(t).
4. **▶ Ejecutar**: simulación transitoria en tiempo real (escala de tiempo ajustable). **DC**: punto de operación en régimen permanente. **■**: detener y reiniciar (repara LEDs quemados).
5. Durante la simulación: mantén presionado un pulsador o haz clic en un interruptor deslizante para accionarlo.
6. Selecciona un componente para ver parámetros, terminales (dónde está insertado cada uno), valores en vivo, advertencias y el modelo matemático. El botón ⓘ abre su **ficha educativa**.
7. Cámara: arrastrar = girar 360°, rueda/pellizco = zoom, clic derecho o dos dedos = desplazar; botones de vista superior, frontal, isométrica y *encuadrar todo*.
8. Los proyectos se **autoguardan** en el dispositivo. *Mis proyectos* permite abrir, duplicar, renombrar, exportar/importar (`.lab3d.json`) y eliminar.

## Funcionalidades implementadas (Fase 1)

**Interfaz**: 9 secciones (Inicio, Mi laboratorio, Nuevo circuito, Biblioteca, Simulaciones, Robótica, Academia, Mis proyectos, Configuración); tema oscuro; diseño adaptable a escritorio, tableta y teléfono (paneles deslizantes en móvil); controles táctiles.

**Laboratorio 3D**: mesa con tapete, iluminación con entorno PBR y sombras; cámara orbital; seleccionar, arrastrar con encaje, rotar, duplicar, eliminar, selección múltiple, agrupar, deshacer/rehacer, editar propiedades; etiquetas de valores y advertencias sobre los componentes.

**Protoboards** (modelo eléctrico completo de tiras, canal y rieles): 830, 400 y 170 puntos. Mover una protoboard arrastra los componentes insertados.

**Componentes** (con modelo 3D procedural, terminales identificados, límites y modelo eléctrico):

| Componente | Variantes | Modelo |
|---|---|---|
| Resistencia | cualquier valor, 1/8–1 W, ±5/±1 %, separación de patas | Ohm; bandas de color reales; aviso y brillo por sobrepotencia |
| Capacitor cerámico | 1 pF–10 µF | i = C·dv/dt (Euler implícito) |
| Capacitor electrolítico | 0,1 µF–10 mF, 6,3–63 V | Igual + polaridad y voltaje nominal |
| LED 5 mm | rojo, naranja, amarillo, verde, azul, blanco | Shockley + Rs ajustado a Vf@20 mA; brillo ∝ corriente; se quema > 100 mA |
| Diodo | 1N4148, 1N4007 | Shockley + Rs (parámetros SPICE públicos) |
| Transistor NPN | PN2222A, 2N3904, BC547B (patillaje propio de cada uno) | Ebers‑Moll; indicador de región |
| Transistor PNP | 2N3906, PN2907A, BC557B | Ebers‑Moll |
| Batería 9 V | alcalina, NiMH, litio; estado de carga | E + Rint; consumo y autonomía estimada |
| Fuente DC regulable | 0–30 V, límite 1 mA–5 A | CV/CC; pantalla 3D con lectura en vivo |
| Pulsador táctil 4 patas | — | Contactos ideales, accionable en simulación |
| Interruptor SPDT | — | Contactos ideales |

**Conexiones**: cables entre cualquier terminal/perforación, conectividad real por union‑find, resaltado de nodo, color automático por tipo de net.

**Simulación**: DC (Newton‑Raphson + gmin stepping), transitorio en tiempo real, voltaje/corriente/potencia por componente, multímetro de sondas con registro V(t), guardado de mediciones en el proyecto. Validaciones: cortocircuito directo, terminales sin conectar, componentes puenteados, ausencia de fuente, sobrecorriente, sobrepotencia, polaridad invertida, voltaje inverso de LED, límites de transistor, modo CC de la fuente.

**Educación**: fichas completas (qué es, para qué sirve, cómo funciona, símbolo, fórmulas, código de colores dinámico, límites, errores, ejemplos, ejercicios con solución) para los 12 tipos de elemento; Academia con 15 niveles (1–7 disponibles con retos y plantilla para practicar en 3D).

**Proyectos**: almacenamiento local, autoguardado, exportación/importación JSON validada y documentada.

## Pruebas realizadas

`npm test` → **45 pruebas, todas correctas**, contra resultados calculados de forma independiente:

- Conexiones de protoboard (tiras, canal central, rieles continuos y aislados, 830 puntos, inserción de patas).
- Ley de Ohm: divisor 1k/1k (5 V), serie‑paralelo (5 mA), sobrecarga de 0,81 W.
- LED + 330 Ω a 9 V frente a una solución por bisección; Vf de rojo y azul; polaridad invertida (sin corriente + aviso); LED sin resistencia se quema; circuito abierto.
- Capacitores: carga RC (V(τ) = 63,2 %, error < 0,5 %), descarga (36,8 %), abierto en DC, electrolítico invertido.
- Transistores: NPN en saturación, corte y región activa (β = Ic/Ib ≈ βf), PNP en saturación.
- Fuentes: cortocircuito directo detectado y limitado por Rint, caída por resistencia interna, modo CC.
- Pulsador abierto/cerrado; aviso sin fuente.
- Las 6 plantillas: todas las patas insertadas, sin avisos, convergencia; valores (divisor 6,803 V; transistor 15,5 mA; RC 63 %; límite 20 mA).
- Formato de proyecto (ida y vuelta, rechazo de archivos inválidos, cables huérfanos), deshacer/rehacer, notación de ingeniería, rotaciones.

Además se verificó la aplicación en el navegador: carga sin errores de consola, plantillas, simulación en vivo (LED rojo + 470 Ω + batería: 15,98 mA y Vf 1,964 V), pulsador → transistor saturado, curva RC en el registro, creación de cables y arrastre con el puntero, disposición en teléfono (375 px).

No probado aún: consumo de motores y lecturas de sensores (no existen en la Fase 1), y ejecución en un dispositivo Android real (falta el SDK en este equipo).

## Funcionalidades pendientes

- **Fase 2**: backend ngspice‑WASM; análisis AC; fuentes AC y generador de señales; osciloscopio de 2 canales; amperímetro/ohmímetro como instrumentos 3D; Zener, Schottky, MOSFET, JFET, TRIAC, SCR, optoacoplador; potenciómetro, LDR, termistores, inductores, transformador; circuitos integrados (555, amplificadores operacionales, reguladores, lógica 74HC); pilas AA/AAA/14500/18650, convertidores DC‑DC, panel solar.
- **Fase 3**: Arduino UNO/Nano/Mega con avr8js, editor de código y bloques (Blockly), compilación real (ver investigación), sensores y actuadores; ESP32/ESP8266 y RP2040 por investigar.
- **Fase 4**: laboratorio de robótica con Rapier: constructor de vehículos, motores DC acoplados al circuito, sensores por raycasting, escenarios (pista seguidora de línea).
- **Fase 5**: niveles 8–15 de la Academia, más retos con verificación automática.
- **Fase 6**: optimización Android (botón Atrás, icono y splash propios, pruebas de rendimiento en gama media, división del bundle).

## Problemas conocidos y limitaciones

- La compilación del APK/AAB no se ha ejecutado: falta Android Studio/SDK en este equipo ([docs/ANDROID.md](docs/ANDROID.md)).
- Paso de integración fijo: transitorios más rápidos que ~1 ms no se resuelven con precisión (se puede bajar a 0,1 ms en Configuración).
- Modelos simplificados: sin efecto Early ni capacitancias en BJT; sin ruptura inversa en diodos (solo aviso); sin ESR en capacitores; la descarga de la batería no avanza con el tiempo (solo se estima la autonomía).
- El brillo del LED es una aproximación proporcional a la corriente (no fotométrica).
- Dos componentes pueden ocupar la misma perforación si se arrastran encima; los cables no evitan colisiones con componentes.
- Rotación solo en pasos de 90°; no hay selección por rectángulo (usa Shift+clic o Ctrl+A).
- El multímetro mide solo voltaje DC; las corrientes se leen en el panel de cada componente.
- El botón Atrás de Android cerrará la app (pendiente de integrar `@capacitor/app`).
- El paquete JS es un solo archivo de ~780 kB (213 kB comprimido) por Three.js; aceptable offline, optimizable en Fase 6.
- Rendimiento no medido aún en un teléfono de gama media real; existe el modo de calidad "Baja".
