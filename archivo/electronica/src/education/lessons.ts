/** Ruta de aprendizaje (Academia). Las lecciones con plantilla se practican en el laboratorio 3D. */
export interface Lesson {
  level: number;
  title: string;
  status: 'disponible' | 'planificado';
  phase?: number;
  summary: string;
  html?: string;
  template?: string;
  sheet?: string;
  challenge?: { prompt: string; answer: string };
}

const f = (s: string) => `<div class="formula">${s}</div>`;

export const LESSONS: Lesson[] = [
  {
    level: 1,
    title: 'Fundamentos de electricidad',
    status: 'disponible',
    summary: 'Carga, corriente, voltaje y circuito cerrado.',
    html: `<p>La <b>carga eléctrica</b> (coulombs, C) es una propiedad de los electrones y protones. Cuando las cargas se mueven de forma ordenada hay <b>corriente</b> (amperios, A = C/s). Para que se muevan hace falta una "presión" eléctrica: el <b>voltaje</b> o diferencia de potencial (voltios, V).</p>
    <p>Una corriente solo circula si existe un <b>camino cerrado</b> desde el terminal positivo de la fuente, a través de la carga, de vuelta al negativo. Si el camino se interrumpe tenemos un <b>circuito abierto</b>; si la fuente se une directamente sin carga, un <b>cortocircuito</b>.</p>
    <p><b>Corriente convencional</b>: por convención se dibuja del + al −, aunque los electrones se mueven al revés.</p>`,
    template: 'led-basico',
    sheet: 'breadboard',
    challenge: { prompt: 'Abre la plantilla y quita el cable negro (selecciónalo y pulsa Supr). ¿Qué indica el laboratorio y por qué se apaga el LED?', answer: 'Circuito abierto: ya no hay camino de retorno a la fuente, la corriente es 0 y el validador avisa de un terminal sin conectar.' },
  },
  {
    level: 2,
    title: 'Ley de Ohm',
    status: 'disponible',
    summary: 'La relación V = I·R y cómo usarla para elegir resistencias.',
    html: f('V = I · R') + `<p>Si conoces dos de las tres magnitudes, puedes calcular la tercera. La ley se aplica a cada resistencia por separado: V es la caída de voltaje <i>en esa resistencia</i> e I la corriente <i>que la atraviesa</i>.</p>
    <p>Para un LED: la fuente aporta V<sub>s</sub>, el LED "consume" su V<sub>f</sub>, y la resistencia se queda con el resto: R = (V<sub>s</sub> − V<sub>f</sub>) / I.</p>`,
    template: 'led-basico',
    sheet: 'resistor',
    challenge: { prompt: 'Cambia la resistencia del circuito a 1 kΩ. Calcula antes la corriente y después compruébala en el panel de propiedades del LED.', answer: 'I ≈ (9,5 − 1,9) / 1001,7 ≈ 7,6 mA (el V<sub>f</sub> baja un poco con menos corriente).' },
  },
  {
    level: 3,
    title: 'Voltaje, corriente y resistencia',
    status: 'disponible',
    summary: 'Medición con la sonda y el divisor de voltaje.',
    html: `<p>El voltaje siempre se mide <b>entre dos puntos</b>. En el laboratorio, la herramienta <b>Sonda</b> funciona como un voltímetro: el primer clic coloca la punta roja y el segundo la negra. Si solo colocas la roja, se mide respecto a la referencia (GND, negativo de la fuente).</p>` + f('V<sub>out</sub> = V<sub>in</sub> · R₂ / (R₁ + R₂)'),
    template: 'divisor',
    challenge: { prompt: 'Sustituye la de 10 kΩ por 4,7 kΩ. ¿Qué voltaje esperas en el punto medio?', answer: 'La mitad: 5 V (las dos resistencias iguales).' },
  },
  {
    level: 4,
    title: 'Circuitos en serie y paralelo',
    status: 'disponible',
    summary: 'Cómo se reparten voltajes y corrientes.',
    html: `<p><b>Serie</b>: la misma corriente atraviesa todos los elementos; los voltajes se suman. R<sub>eq</sub> = R₁ + R₂ + …</p><p><b>Paralelo</b>: todos tienen el mismo voltaje; las corrientes se suman. 1/R<sub>eq</sub> = 1/R₁ + 1/R₂ + …</p>`,
    template: 'leds-paralelo',
    challenge: { prompt: '¿Por qué el LED azul recibe menos corriente que el rojo con la misma resistencia?', answer: 'Su V<sub>f</sub> es mayor (≈3,1 V), así que queda menos voltaje para la resistencia: I = (5 − 3,1)/220.' },
  },
  {
    level: 5,
    title: 'Potencia eléctrica',
    status: 'disponible',
    summary: 'P = V·I, disipación y protección por límite de corriente.',
    html: f('P = V · I = I² · R = V² / R') + `<p>Toda resistencia y semiconductor tiene una potencia máxima. Superarla genera calor que lo daña. En el laboratorio las resistencias brillan en rojo si se sobrecargan y aparece una advertencia.</p>`,
    template: 'limite-corriente',
    sheet: 'dc-supply',
    challenge: { prompt: 'Sube el límite de la fuente a 200 mA. ¿Qué le pasa al LED?', answer: 'Circulan ≈94 mA, muy por encima de 30 mA: el laboratorio advierte sobrecorriente (y lo quemaría a partir de 100 mA).' },
  },
  {
    level: 6,
    title: 'Capacitores e inductores',
    status: 'disponible',
    summary: 'Carga y descarga RC, constante de tiempo τ.',
    html: f('τ = R · C &nbsp;&nbsp; V(t) = V<sub>s</sub>(1 − e<sup>−t/τ</sup>)') + `<p>Usa la sonda sobre el capacitor y observa la curva en el registro de la sonda (panel de simulación). Cambia el interruptor para descargarlo. Inductores: planificado para la Fase 2.</p>`,
    template: 'rc',
    sheet: 'capacitor',
    challenge: { prompt: '¿Cuánto tarda en llegar a ~4,97 V (99,3 %)?', answer: '5 τ = 11 s.' },
  },
  {
    level: 7,
    title: 'Diodos y transistores',
    status: 'disponible',
    summary: 'El transistor NPN como interruptor y sus regiones de trabajo.',
    html: `<p>Un transistor NPN conduce entre colector y emisor cuando inyectamos corriente en la base. Con poca corriente de base trabaja en región <b>activa</b> (I<sub>C</sub> = β·I<sub>B</sub>); con suficiente, en <b>saturación</b> (interruptor cerrado).</p>`,
    template: 'transistor-switch',
    sheet: 'npn',
    challenge: { prompt: 'Cambia la resistencia de base a 1 MΩ y pulsa. ¿En qué región queda el transistor y por qué el LED brilla menos?', answer: 'I<sub>B</sub> ≈ 8,8 µA → I<sub>C</sub> ≈ 200 × 8,8 µA ≈ 1,8 mA: región activa (indicador ámbar), no saturación.' },
  },
  { level: 8, title: 'Electrónica analógica', status: 'planificado', phase: 2, summary: 'Amplificadores operacionales, filtros, osciladores (requiere motor SPICE).' },
  { level: 9, title: 'Electrónica digital', status: 'planificado', phase: 2, summary: 'Puertas lógicas, biestables, contadores.' },
  { level: 10, title: 'Microcontroladores', status: 'planificado', phase: 3, summary: 'Arquitectura, pines de E/S, ADC y PWM.' },
  { level: 11, title: 'Programación de Arduino', status: 'planificado', phase: 3, summary: 'Editor de código y bloques con simulación AVR (avr8js).' },
  { level: 12, title: 'Sensores y actuadores', status: 'planificado', phase: 3, summary: 'Lectura de sensores y control de salidas.' },
  { level: 13, title: 'Control de motores', status: 'planificado', phase: 4, summary: 'Puente H, PWM, servomotores y paso a paso.' },
  { level: 14, title: 'Robótica', status: 'planificado', phase: 4, summary: 'Constructor de vehículos y escenarios físicos.' },
  { level: 15, title: 'Automatización', status: 'planificado', phase: 5, summary: 'Sistemas de riego, ventilación e iluminación inteligente.' },
];
