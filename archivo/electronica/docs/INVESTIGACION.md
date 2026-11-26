# Investigación tecnológica y decisiones

> Alcance honesto: los requisitos de Google Play, la licencia y el alcance de **avr8js**, el estado de **EEcircuit/ngspice‑WASM** y las versiones de **Capacitor** se comprobaron con búsquedas web durante esta sesión (noviembre de 2026). El resto de la comparativa se basa en documentación pública conocida de cada proyecto; las filas marcadas con ⚠ deben volver a verificarse antes de integrar la tecnología.

## 1. Renderizado 3D compatible con Android

| Opción | Licencia | Android | Valoración |
|---|---|---|---|
| **Three.js** ([sitio](https://threejs.org/), [repo](https://github.com/mrdoob/three.js)) | MIT | WebGL 2 en WebView (Chrome ≥ 80 en la práctica) | **Elegido.** Ligero, sin compilación nativa, enorme ecosistema (OrbitControls, RoomEnvironment, geometrías). Renderizador WebGPU disponible para el futuro. |
| Babylon.js ([sitio](https://www.babylonjs.com/)) | Apache‑2.0 | WebGL/WebGPU en WebView | Excelente alternativa, más completo (física integrada, inspector) pero más pesado (~2–3× tamaño de bundle). |
| Godot ([sitio](https://godotengine.org/)) | MIT | Exportación nativa | Gran rendimiento nativo, pero obliga a escribir el simulador y la interfaz en GDScript/C#; la UI web y el contenido educativo HTML serían más difíciles. |
| Unity | Propietaria (términos de licencia y umbrales de ingresos) | Nativo | Descartado: no es open source y su licencia puede implicar costes. |
| WebGPU | Estándar W3C | Disponible en Chrome Android reciente; no en todos los WebView | Se mantiene como evolución: Three.js permite migrar a `WebGPURenderer`. |

## 2. Motor de simulación eléctrica

| Opción | Licencia | Valoración |
|---|---|---|
| **Motor MNA propio (TypeScript)** | Propia | **Elegido para la Fase 1.** Control total, sin dependencias, funciona offline, fácil de probar. Implementa análisis nodal modificado con Newton‑Raphson (diodos, LEDs, BJT) y transitorio por Euler implícito. |
| ngspice ([sitio](https://ngspice.sourceforge.io/)) | BSD‑3 (mayoritariamente) | Referencia de la industria (SPICE3). **Prevista para la Fase 2** como backend alternativo vía WebAssembly. |
| EEcircuit / eecircuit-engine ([repo](https://github.com/eelab-dev/EEcircuit)) | ⚠ MIT según listados antiguos; no se pudo confirmar el LICENSE del paquete npm | ngspice compilado a WASM con API JS. Candidato para la Fase 2 tras verificar licencia y tamaño (~varios MB). |
| CircuitJS / Falstad ([repo](https://github.com/pfalstad/circuitjs1)) | GPL‑2.0 | Muy buen simulador educativo en tiempo real, pero la GPL obligaría a publicar todo el código bajo GPL. Solo se usó como referencia conceptual (no se copió código). |

**Diferencia entre simulación, aproximación y animación** (regla aplicada en toda la app):
- *Simulación eléctrica real*: valores obtenidos resolviendo las ecuaciones del circuito (MNA). Ej.: corriente del LED, V<sub>CE</sub>, carga del capacitor.
- *Aproximación matemática documentada*: modelo simplificado declarado en la ficha del componente. Ej.: f.e.m. de la batería lineal con el estado de carga; brillo del LED proporcional a la corriente.
- *Animación visual*: solo decorativa y derivada de un valor simulado (halo del LED, display de la fuente). No existe ninguna animación sin un valor eléctrico detrás.

Cada componente declara `modelLevel` (`fisico` / `ideal` / `ninguno`) y `modelDoc`; ambos se muestran en la interfaz.

## 3. Microcontroladores (Fase 3)

| Opción | Licencia | Valoración |
|---|---|---|
| avr8js ([repo](https://github.com/wokwi/avr8js)) | MIT | Emula el **núcleo AVR** (ATmega328P de Arduino UNO/Nano). Solo la CPU y periféricos básicos: hay que implementar la integración con el circuito. **Elegido para la Fase 3.** |
| Compilación de código Arduino | — | El navegador no incluye avr-gcc. Opciones: (a) arduino-cli ([repo](https://github.com/arduino/arduino-cli), GPL‑3.0) como herramienta local de escritorio; (b) toolchain compilado a WASM (por investigar, tamaño elevado); (c) servidor propio (descartado por ahora: requiere hosting). **No se simulará una compilación que no ocurra.** |
| ESP32 / ESP8266 | — | Requieren emular Xtensa/RISC‑V; QEMU de Espressif ([repo](https://github.com/espressif/qemu)) no es apto para WebView. Pendiente de investigación. |
| RP2040 (Raspberry Pi Pico) | ⚠ | Existen emuladores JS de terceros (p. ej. rp2040js de Wokwi, MIT ⚠ verificar). |
| Programación por bloques: Blockly ([repo](https://github.com/google/blockly)) | Apache‑2.0 | Candidato para la modalidad visual. |

## 4. Física y robótica (Fase 4)

| Opción | Licencia | Valoración |
|---|---|---|
| Rapier ([sitio](https://rapier.rs/)) | Apache‑2.0 | Física rígida en WASM, determinista, rápida. **Elegido.** |
| cannon-es | MIT | Más simple, menos mantenido. |
| Ammo.js (Bullet) | zlib | Potente pero pesado. |

Acoplamiento previsto: motor DC como V = I·R + k·ω, τ = k·I resuelto junto al MNA; sensores por raycasting contra el escenario.

## 5. Modelos 3D

- **Elegido**: modelos procedurales generados por código (Three.js) con dimensiones de hojas de datos. Sin dependencias de licencia, ligeros (no hay archivos que descargar) y paramétricos (las bandas de color de la resistencia se calculan con su valor).
- Alternativas evaluadas: biblioteca 3D de KiCad ([repo](https://gitlab.com/kicad/libraries/kicad-packages3D), CC‑BY‑SA 4.0 con excepción) y piezas de Fritzing (CC‑BY‑SA): útiles para microcontroladores complejos en fases posteriores, respetando atribución y *share‑alike*. Herramientas CAD libres: Blender (GPL), FreeCAD (LGPL).

## 6. Aplicaciones de referencia (análisis, sin copiar interfaces)

| App | Fortalezas | Limitaciones | Oportunidad |
|---|---|---|---|
| Tinkercad Circuits | Arduino + protoboard sencilla, muy educativa | 2D, en línea, cuenta obligatoria | 3D real, offline, sin cuenta |
| Fritzing | Vista protoboard/esquema/PCB | Simulación muy limitada | Simulación eléctrica verificada |
| Falstad | Simulación en tiempo real muy didáctica | Solo esquema 2D | Misma inmediatez sobre montaje físico 3D |
| EveryCircuit | Animación de corrientes, móvil | Propietario, de pago | Gratis, open source en su núcleo |
| Proteus | Simulación de MCU profesional | Caro, Windows | Gratuito y móvil |
| Wokwi | Excelente simulación de MCU | En línea; compilación en la nube | Laboratorio físico + educativo offline |

## 7. Arquitectura resultante

Web (TypeScript + Vite + Three.js) empaquetada con **Capacitor** ([sitio](https://capacitorjs.com/), MIT) para Android. Ventajas: un solo código para navegador, Android (y potencialmente iOS/escritorio), recarga en caliente durante el desarrollo, y pruebas automáticas del motor en Node con Vitest.

Requisitos de Google Play consultados: [target SDK](https://developer.android.com/google/play/requirements/target-sdk) y [ayuda de Play Console](https://support.google.com/googleplay/android-developer/answer/11926878). Desde el 31‑ago‑2026 las apps nuevas y actualizaciones deben apuntar a Android 16 (API 36). El proyecto generado por Capacitor 8 usa `targetSdkVersion = 36`.
