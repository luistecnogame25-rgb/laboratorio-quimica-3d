/**
 * Fichas educativas de componentes. Cada ficha se muestra desde el botón ⓘ del panel de
 * propiedades o desde la Biblioteca. El contenido es HTML estático propio (sin fuentes externas).
 */
import { eng } from '../core/format';
import type { Params } from '../core/types';
import { BAND_COLORS, BAND_NAMES, resistorBands } from '../render/materials';
import { SYMBOLS } from './symbols';

export interface EduSection {
  title: string;
  html: string;
}

export interface EduSheet {
  id: string;
  title: string;
  intro: string;
  sections: EduSection[];
}

const f = (s: string) => `<div class="formula">${s}</div>`;
const ex = (q: string, a: string) => `<details class="exercise"><summary>${q}</summary><div>${a}</div></details>`;

function colorCode(params?: Params): string {
  const ohms = typeof params?.resistance === 'number' ? params.resistance : 220;
  const tol = String(params?.tolerance ?? '5');
  const bands = resistorBands(ohms, tol);
  const sw = (b: string) => `<span class="band" style="background:#${BAND_COLORS[b].toString(16).padStart(6, '0')}"></span>`;
  const mult = Math.pow(10, Number(bands[2]));
  return `
    <div class="band-demo">${bands.map(sw).join('')}</div>
    <p>Para <b>${eng(ohms, 'Ω')}</b> (±${tol} %):</p>
    <ol>
      <li>1.ª banda <b>${BAND_NAMES[bands[0]]}</b> = ${bands[0]} (primer dígito)</li>
      <li>2.ª banda <b>${BAND_NAMES[bands[1]]}</b> = ${bands[1]} (segundo dígito)</li>
      <li>3.ª banda <b>${BAND_NAMES[bands[2]]}</b> = ×${mult >= 1 ? mult.toLocaleString('es') : mult} (multiplicador)</li>
      <li>4.ª banda <b>${BAND_NAMES[bands[3]]}</b> = tolerancia ±${tol} %</li>
    </ol>
    <table class="mini"><tr><th>Color</th><th>Dígito</th><th>Multiplicador</th></tr>
    ${['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
      .map((d) => `<tr><td>${sw(d)} ${BAND_NAMES[d]}</td><td>${d}</td><td>×10<sup>${d}</sup></td></tr>`)
      .join('')}
    <tr><td>${sw('-1')} dorado</td><td>—</td><td>×0,1 (tolerancia ±5 %)</td></tr>
    <tr><td>${sw('-2')} plateado</td><td>—</td><td>×0,01 (tolerancia ±10 %)</td></tr></table>
    <p>Regla mnemotécnica: se lee empezando por la banda más cercana a un extremo; la banda de tolerancia (dorada o marrón) suele estar separada.</p>`;
}

const SHEETS: Record<string, (params?: Params) => EduSheet> = {
  resistor: (params) => ({
    id: 'resistor',
    title: 'Resistencia',
    intro: 'Componente pasivo que se opone al paso de la corriente eléctrica, convirtiendo energía eléctrica en calor.',
    sections: [
      { title: '¿Qué es?', html: '<p>Una resistencia (o resistor) es un componente de dos terminales cuya relación entre voltaje y corriente es proporcional: a más voltaje, más corriente, en una proporción fija llamada <b>resistencia</b>, medida en ohmios (Ω).</p>' },
      { title: '¿Para qué sirve?', html: '<ul><li>Limitar la corriente (por ejemplo, de un LED).</li><li>Dividir voltajes (divisor resistivo).</li><li>Polarizar transistores y fijar niveles lógicos (pull-up / pull-down).</li><li>Formar constantes de tiempo con capacitores (circuitos RC).</li></ul>' },
      { title: '¿Cómo funciona?', html: '<p>El material resistivo (película de carbón o de metal) dificulta el movimiento de los electrones. Cada choque transfiere energía al material, que se calienta (efecto Joule). La resistencia depende del material, la longitud y la sección del elemento resistivo.</p>' },
      { title: 'Símbolo', html: `<div class="symbols">${SYMBOLS.resistor}</div><p>Izquierda: símbolo ANSI (zigzag). Derecha: símbolo IEC (rectángulo). No tiene polaridad.</p>` },
      { title: '¿Qué significa su valor en ohmios?', html: '<p>Un ohmio es la resistencia que deja pasar 1 A cuando se le aplica 1 V. Valores comunes: 220 Ω, 1 kΩ (1 000 Ω), 10 kΩ, 1 MΩ (1 000 000 Ω). Se fabrican en series normalizadas (E12: 1,0 – 1,2 – 1,5 – 1,8 – 2,2 – 2,7 – 3,3 – 3,9 – 4,7 – 5,6 – 6,8 – 8,2 ×10ⁿ).</p>' },
      { title: 'Código de colores', html: colorCode(params) },
      { title: 'Cálculo de corriente y caída de voltaje (ley de Ohm)', html: f('V = I · R &nbsp;&nbsp; I = V / R &nbsp;&nbsp; R = V / I') + '<p>Ejemplo: 9 V sobre 1 kΩ → I = 9 / 1000 = 9 mA. La caída de voltaje en una resistencia por la que circulan 20 mA con 220 Ω es V = 0,02 × 220 = 4,4 V.</p><p>En serie: R<sub>eq</sub> = R₁ + R₂ + … · En paralelo: 1/R<sub>eq</sub> = 1/R₁ + 1/R₂ + …</p>' },
      { title: '¿Qué potencia soporta?', html: f('P = V · I = I² · R = V² / R') + '<p>Las resistencias de uso general son de 1/4 W (0,25 W). Conviene trabajar por debajo del 50 % de su potencia nominal. Ejemplo: 9 V sobre 100 Ω → P = 81/100 = 0,81 W: una resistencia de 1/4 W se sobrecalentaría.</p>' },
      { title: '¿Qué pasa si se conecta incorrectamente o se excede su potencia?', html: '<p>Al no tener polaridad, no puede conectarse "al revés". Los errores típicos son elegir un valor demasiado bajo (corriente excesiva en el circuito) o una potencia insuficiente: se calienta, cambia de valor, se oscurece y puede quemarse o abrirse. En este laboratorio la resistencia se ilumina en rojo y aparece una advertencia cuando supera su potencia.</p>' },
      { title: 'Ejemplos prácticos', html: '<ul><li>LED rojo con batería de 9 V: R = (9 − 2) / 0,02 = 350 Ω → se usa 390 Ω o 470 Ω.</li><li>Divisor 10 kΩ / 10 kΩ a 5 V → 2,5 V en el punto medio.</li><li>Resistencia de base de un transistor: R<sub>B</sub> = (V − 0,7) / I<sub>B</sub>.</li></ul>' },
      {
        title: 'Ejercicios',
        html:
          ex('1. ¿Qué corriente circula por 470 Ω conectados a 5 V?', 'I = 5 / 470 ≈ 10,6 mA.') +
          ex('2. Dos resistencias de 1 kΩ en paralelo, ¿qué resistencia equivalen?', '1/R = 1/1000 + 1/1000 → R = 500 Ω.') +
          ex('3. ¿Qué potencia disipa una resistencia de 220 Ω con 20 mA?', 'P = I²R = 0,02² × 220 = 88 mW. Una de 1/4 W es suficiente.') +
          ex('4. Pruébalo: arma en el laboratorio un divisor con 4,7 kΩ y 10 kΩ a 10 V y mide el punto medio.', 'Teórico: V = 10 × 10 / 14,7 ≈ 6,80 V. Usa la herramienta Sonda para comprobarlo.'),
      },
      { title: 'Circuitos donde se utiliza', html: '<p>Prácticamente en todos: limitadores de LED, divisores de tensión, filtros RC, polarización de transistores, pull-ups en entradas digitales, sensores resistivos (LDR, termistores) y realimentación de amplificadores operacionales.</p>' },
    ],
  }),

  led: () => ({
    id: 'led',
    title: 'LED (diodo emisor de luz)',
    intro: 'Diodo semiconductor que emite luz cuando circula corriente en sentido directo (de ánodo a cátodo).',
    sections: [
      { title: '¿Qué es?', html: '<p>Un LED es un diodo cuya unión p-n libera energía en forma de fotones cuando los electrones se recombinan con huecos. El color depende del material semiconductor (energía de banda prohibida).</p>' },
      { title: '¿Para qué sirve?', html: '<p>Indicadores, iluminación, pantallas, comunicaciones ópticas (infrarrojo), optoacopladores.</p>' },
      { title: '¿Cómo funciona?', html: '<p>Por debajo de su voltaje directo (V<sub>f</sub>) casi no conduce. Al superarlo, la corriente crece de forma exponencial con el voltaje: por eso <b>siempre necesita una resistencia limitadora</b> o una fuente de corriente.</p><table class="mini"><tr><th>Color</th><th>V<sub>f</sub> típico a 20 mA</th></tr><tr><td>Rojo</td><td>1,8 – 2,1 V</td></tr><tr><td>Amarillo / verde clásico</td><td>2,0 – 2,3 V</td></tr><tr><td>Azul / blanco</td><td>2,9 – 3,4 V</td></tr></table>' },
      { title: 'Símbolo y polaridad', html: `<div class="symbols">${SYMBOLS.led}</div><p><b>Ánodo (+)</b>: pata larga. <b>Cátodo (−)</b>: pata corta y lado plano del encapsulado. La corriente convencional entra por el ánodo.</p>` },
      { title: 'Cálculo de la resistencia limitadora', html: f('R = (V<sub>fuente</sub> − V<sub>f</sub>) / I<sub>LED</sub>') + '<p>Ejemplo: fuente de 5 V, LED rojo (2 V), 15 mA → R = 3 / 0,015 = 200 Ω → valor comercial 220 Ω.</p>' + f('P<sub>R</sub> = (V<sub>fuente</sub> − V<sub>f</sub>) · I') },
      { title: 'Límites', html: '<ul><li>Corriente directa máxima continua: ~20–30 mA (LED de 5 mm estándar).</li><li>Voltaje inverso máximo: ~5 V.</li><li>Potencia: ~60–100 mW.</li></ul>' },
      { title: '¿Qué pasa si se conecta incorrectamente?', html: '<ul><li><b>Invertido</b>: no enciende (no conduce). Si el voltaje inverso supera ~5 V puede dañarse.</li><li><b>Sin resistencia</b>: la corriente sube hasta quemarlo en milisegundos. En el laboratorio el LED se marca como quemado y deja de conducir hasta reiniciar la simulación.</li></ul>' },
      { title: 'Ejemplos prácticos', html: '<p>Indicador de encendido, semáforo con tres LEDs, LED controlado por un transistor o por un pin de Arduino (con 220–330 Ω en serie).</p>' },
      {
        title: 'Ejercicios',
        html:
          ex('1. ¿Qué resistencia necesita un LED azul (3,1 V) a 9 V para 15 mA?', 'R = (9 − 3,1) / 0,015 ≈ 393 Ω → 390 Ω.') +
          ex('2. ¿Por qué dos LEDs en paralelo no deberían compartir una sola resistencia?', 'Sus V<sub>f</sub> nunca son idénticos; el de menor V<sub>f</sub> se lleva casi toda la corriente. Cada LED debe tener su propia resistencia.') +
          ex('3. Pruébalo: conecta un LED rojo con 470 Ω a la batería de 9 V. ¿Qué corriente mides?', 'Teórico: (9,5 − 2,0) / (470 + 1,7) ≈ 15–16 mA (la batería nueva tiene ~9,5 V y 1,7 Ω internos).'),
      },
      { title: 'Circuitos donde se utiliza', html: '<p>Indicadores de estado, iluminación con drivers de corriente, matrices y displays de 7 segmentos, sensores ópticos.</p>' },
    ],
  }),

  capacitor: () => ({
    id: 'capacitor',
    title: 'Capacitor (condensador)',
    intro: 'Almacena energía en un campo eléctrico entre dos placas separadas por un dieléctrico.',
    sections: [
      { title: '¿Qué es?', html: '<p>Dos conductores separados por un aislante. Al aplicar voltaje se acumula carga: Q = C·V. Su capacidad se mide en faradios (F); en la práctica pF, nF y µF.</p>' },
      { title: '¿Para qué sirve?', html: '<ul><li>Filtrar ruido y desacoplar la alimentación de circuitos integrados (100 nF).</li><li>Temporizar (circuitos RC, NE555).</li><li>Bloquear corriente continua dejando pasar señales alternas.</li><li>Almacenar energía (electrolíticos).</li></ul>' },
      { title: '¿Cómo funciona?', html: f('i = C · dV/dt') + '<p>La corriente solo circula mientras el voltaje cambia. En corriente continua y en régimen permanente, un capacitor se comporta como un circuito abierto.</p>' },
      { title: 'Símbolo', html: `<div class="symbols">${SYMBOLS.capacitor}</div><p>Los cerámicos no tienen polaridad.</p>` },
      { title: 'Carga y descarga (circuito RC)', html: f('τ = R · C') + f('Carga: V(t) = V<sub>s</sub> · (1 − e<sup>−t/τ</sup>)') + f('Descarga: V(t) = V<sub>0</sub> · e<sup>−t/τ</sup>') + '<p>Tras 1 τ se alcanza el 63,2 %; tras 5 τ se considera completamente cargado (99,3 %).</p>' },
      { title: 'Energía almacenada', html: f('E = ½ · C · V²') },
      { title: 'Errores comunes', html: '<p>Superar su voltaje nominal (rompe el dieléctrico). Confundir códigos: "104" = 10 × 10⁴ pF = 100 nF.</p>' },
      {
        title: 'Ejercicios',
        html:
          ex('1. ¿Cuál es τ con 10 kΩ y 100 µF?', 'τ = 10 000 × 0,0001 = 1 s.') +
          ex('2. ¿Qué voltaje tiene tras 2 s cargándose a 5 V con τ = 1 s?', 'V = 5 (1 − e⁻²) ≈ 4,32 V.') +
          ex('3. ¿Qué significa el código 473?', '47 × 10³ pF = 47 nF.'),
      },
      { title: 'Circuitos donde se utiliza', html: '<p>Fuentes de alimentación (filtro tras el rectificador), osciladores, temporizadores, filtros de audio, debounce de pulsadores.</p>' },
    ],
  }),

  'capacitor-electrolytic': () => {
    const base = SHEETS.capacitor();
    return {
      id: 'capacitor-electrolytic',
      title: 'Capacitor electrolítico',
      intro: 'Capacitor polarizado de gran capacidad por volumen. Debe conectarse con la polaridad correcta.',
      sections: [
        { title: 'Polaridad', html: `<div class="symbols">${SYMBOLS['capacitor-electrolytic']}</div><p><b>Positivo</b>: pata larga. <b>Negativo</b>: pata corta, marcado con una franja clara (−) en el cuerpo. El terminal positivo debe estar siempre a mayor potencial que el negativo.</p>` },
        { title: '¿Qué pasa si se conecta al revés?', html: '<p>El óxido dieléctrico se degrada, circula corriente de fuga, se calienta y puede abombarse o reventar (la cruz de la tapa es una válvula de alivio). El laboratorio muestra un error si el voltaje se invierte.</p>' },
        { title: 'Voltaje nominal', html: '<p>Elige un voltaje nominal al menos un 20–50 % mayor que el máximo del circuito (p. ej. 16 V o 25 V para 9–12 V).</p>' },
        ...base.sections.filter((s) => !s.title.startsWith('Símbolo')),
      ],
    };
  },

  diode: () => ({
    id: 'diode',
    title: 'Diodo rectificador',
    intro: 'Permite que la corriente circule en un solo sentido: de ánodo a cátodo.',
    sections: [
      { title: '¿Qué es y cómo funciona?', html: '<p>Una unión p-n de silicio. En directa conduce a partir de ~0,6–0,7 V; en inversa solo deja pasar una corriente de fuga mínima, hasta su voltaje de ruptura.</p>' + f('I = I<sub>s</sub> · (e<sup>V / (n·V<sub>T</sub>)</sup> − 1) &nbsp;&nbsp; V<sub>T</sub> ≈ 25,85 mV a 27 °C') },
      { title: 'Símbolo', html: `<div class="symbols">${SYMBOLS.diode}</div><p>La franja del encapsulado marca el <b>cátodo</b> (la barra del símbolo).</p>` },
      { title: 'Usos', html: '<ul><li>Rectificación (convertir AC en DC).</li><li>Protección contra polaridad inversa.</li><li>Diodo de rueda libre en relés y motores.</li></ul>' },
      { title: 'Modelos incluidos', html: '<table class="mini"><tr><th>Modelo</th><th>I máx.</th><th>V<sub>RRM</sub></th><th>Uso</th></tr><tr><td>1N4148</td><td>300 mA</td><td>100 V</td><td>Señal, conmutación rápida</td></tr><tr><td>1N4007</td><td>1 A</td><td>1000 V</td><td>Rectificador de red</td></tr></table>' },
      { title: 'Ejercicios', html: ex('1. Un diodo en serie con 1 kΩ a 5 V, ¿qué corriente circula?', 'I ≈ (5 − 0,7) / 1000 ≈ 4,3 mA.') + ex('2. ¿Y si el diodo está invertido?', 'Prácticamente 0 A (solo fuga, del orden de nA).') },
    ],
  }),

  npn: () => ({
    id: 'npn',
    title: 'Transistor bipolar NPN',
    intro: 'Dispositivo de tres terminales donde una pequeña corriente de base controla una corriente de colector mucho mayor.',
    sections: [
      { title: '¿Qué es?', html: '<p>Dos uniones p-n (base-emisor y base-colector) en una misma pieza de silicio. Terminales: <b>colector (C)</b>, <b>base (B)</b> y <b>emisor (E)</b>.</p>' },
      { title: 'Símbolo', html: `<div class="symbols">${SYMBOLS.npn}</div><p>La flecha del emisor apunta hacia fuera ("No Pincha": NPN).</p>` },
      { title: 'Regiones de funcionamiento', html: '<table class="mini"><tr><th>Región</th><th>Condición</th><th>Uso</th></tr><tr><td>Corte</td><td>V<sub>BE</sub> &lt; ~0,5 V</td><td>Interruptor abierto</td></tr><tr><td>Activa</td><td>BE directa, BC inversa</td><td>Amplificador: I<sub>C</sub> = β · I<sub>B</sub></td></tr><tr><td>Saturación</td><td>Ambas uniones en directa</td><td>Interruptor cerrado: V<sub>CE</sub> ≈ 0,1–0,2 V</td></tr></table><p>En el laboratorio, un indicador de color sobre el transistor muestra la región: gris = corte, ámbar = activa, verde = saturación.</p>' },
      { title: 'Transistor como interruptor', html: f('I<sub>C</sub> = (V<sub>CC</sub> − V<sub>carga</sub> − V<sub>CE(sat)</sub>) / R<sub>C</sub>') + f('R<sub>B</sub> ≤ (V<sub>in</sub> − 0,7) / (I<sub>C</sub> / β<sub>min</sub> × 2…5)') + '<p>Se elige una corriente de base varias veces mayor que la mínima para asegurar la saturación.</p>' },
      { title: 'Patillaje (¡varía según el modelo!)', html: '<p>Mirando la cara plana con las patas hacia abajo: <b>PN2222A / 2N3904: E-B-C</b>; <b>BC547: C-B-E</b>. Consulta siempre la hoja de datos. El laboratorio cambia el orden de los pines al cambiar de modelo.</p>' },
      { title: 'Errores comunes', html: '<ul><li>Conectar la base directamente a la fuente sin resistencia: corriente de base excesiva, el transistor se destruye.</li><li>Confundir el patillaje.</li><li>Poner la carga en el emisor esperando que se comporte como interruptor de lado bajo.</li></ul>' },
      { title: 'Ejercicios', html: ex('1. Con β = 100, ¿qué I<sub>B</sub> mínima saturaría un LED de 20 mA?', 'I<sub>B</sub> = 0,02 / 100 = 0,2 mA; con margen ×5 → 1 mA.') + ex('2. ¿Qué R<sub>B</sub> usarías desde 5 V para 1 mA de base?', 'R<sub>B</sub> = (5 − 0,7) / 0,001 = 4,3 kΩ → 4,7 kΩ o 3,9 kΩ.') },
      { title: 'Circuitos donde se utiliza', html: '<p>Conmutación de LEDs, relés y motores desde microcontroladores; amplificadores de audio; fuentes de corriente; puertas lógicas discretas.</p>' },
    ],
  }),

  pnp: () => ({
    id: 'pnp',
    title: 'Transistor bipolar PNP',
    intro: 'Complementario del NPN: conduce cuando la base está más negativa que el emisor.',
    sections: [
      { title: 'Símbolo', html: `<div class="symbols">${SYMBOLS.pnp}</div><p>La flecha del emisor apunta hacia dentro ("Pincha": PNP).</p>` },
      { title: 'Funcionamiento', html: '<p>El emisor se conecta normalmente al positivo. Al llevar la base ~0,7 V por debajo del emisor (por ejemplo a GND a través de una resistencia), el transistor conduce desde el emisor hacia el colector. Se usa como interruptor de lado alto.</p>' + f('V<sub>EB</sub> ≈ 0,7 V &nbsp;&nbsp; I<sub>C</sub> = β · I<sub>B</sub> (región activa)') },
      { title: 'Patillaje', html: '<p><b>PN2907A / 2N3906: E-B-C</b>; <b>BC557: C-B-E</b>.</p>' },
      { title: 'Ejercicio', html: ex('Un PNP con emisor a 5 V y base a GND por 10 kΩ: ¿qué I<sub>B</sub> circula?', 'I<sub>B</sub> ≈ (5 − 0,7) / 10 000 ≈ 0,43 mA.') },
    ],
  }),

  battery: () => ({
    id: 'battery',
    title: 'Batería de 9 V',
    intro: 'Fuente electroquímica formada por varias celdas en serie dentro de un encapsulado rectangular con broches.',
    sections: [
      { title: '¿Qué es?', html: `<div class="symbols">${SYMBOLS.battery}</div><p>Una batería 9 V "6LR61" alcalina contiene seis celdas de 1,5 V en serie. Sus parámetros dependen de la química, no solo del formato.</p>` },
      { title: 'Resistencia interna', html: f('V<sub>bornes</sub> = E − I · R<sub>int</sub>') + '<p>Una 9 V alcalina tiene ~1,5–2 Ω internos: con cargas grandes el voltaje en bornes cae. Por eso no es adecuada para motores.</p>' },
      { title: 'Químicas incluidas', html: '<table class="mini"><tr><th>Tipo</th><th>Voltaje (lleno → vacío)</th><th>Capacidad típica</th></tr><tr><td>Alcalina</td><td>9,5 → 7,2 V</td><td>~550 mAh</td></tr><tr><td>NiMH 8,4 V</td><td>8,7 → 7,2 V</td><td>~200 mAh</td></tr><tr><td>Litio LiMnO₂</td><td>9,6 → 7,5 V</td><td>~1200 mAh</td></tr></table><p>Valores aproximados de hojas de datos públicas; varían por fabricante.</p>' },
      { title: 'Autonomía', html: f('t ≈ Capacidad (Ah) / I (A)') + '<p>Estimación ideal: la capacidad real disminuye con corrientes altas.</p>' },
      { title: 'Peligros', html: '<p>Un cortocircuito entre los broches produce varios amperios: se calienta rápidamente. Nunca guardes baterías de 9 V sueltas junto a objetos metálicos.</p>' },
      { title: 'Ejercicio', html: ex('Con un LED y 470 Ω (≈16 mA), ¿cuántas horas dura una alcalina?', '0,55 Ah / 0,016 A ≈ 34 h (estimación ideal).') },
    ],
  }),

  'dc-supply': () => ({
    id: 'dc-supply',
    title: 'Fuente DC regulable de laboratorio',
    intro: 'Equipo que entrega un voltaje ajustable y limita la corriente máxima para proteger los circuitos.',
    sections: [
      { title: 'Modos CV y CC', html: `<div class="symbols">${SYMBOLS['dc-supply']}</div><p><b>CV (voltaje constante)</b>: mantiene el voltaje fijado mientras la carga consume menos que el límite. <b>CC (corriente constante)</b>: si la carga intenta consumir más, la fuente reduce el voltaje para entregar exactamente el límite de corriente.</p>` },
      { title: 'Buenas prácticas', html: '<ol><li>Ajusta el voltaje con la salida desconectada.</li><li>Fija un límite de corriente apenas superior al consumo esperado.</li><li>Conecta el circuito y observa: si se enciende el indicador CC, algo consume de más (o hay un cortocircuito).</li></ol>' },
      { title: 'Ejercicio', html: ex('Fuente a 12 V con límite de 20 mA y un LED con 100 Ω: ¿qué ocurre?', 'Sin límite circularían (12 − 2)/106 ≈ 94 mA. La fuente pasa a CC y entrega 20 mA: el LED queda protegido. Pruébalo con la plantilla "Límite de corriente".') },
    ],
  }),

  pushbutton: () => ({
    id: 'pushbutton',
    title: 'Pulsador táctil',
    intro: 'Interruptor momentáneo: cierra el contacto solo mientras se mantiene presionado.',
    sections: [
      { title: 'Patas internas', html: `<div class="symbols">${SYMBOLS.pushbutton}</div><p>Tiene 4 patas: las que están enfrentadas por el lado largo están unidas internamente (1a–1b y 2a–2b). Al presionar se unen los pares 1 y 2. Se coloca a caballo sobre el canal central de la protoboard.</p>` },
      { title: 'En el laboratorio', html: '<p>Durante la simulación, mantén presionado el pulsador con el ratón o el dedo (herramienta Seleccionar) para cerrarlo.</p>' },
      { title: 'Rebote', html: '<p>Los contactos reales rebotan durante unos milisegundos. Esto importa con microcontroladores (Fase 3); aquí el contacto es ideal.</p>' },
      { title: 'Ejercicio', html: ex('¿Para qué sirve una resistencia pull-down en la entrada?', 'Fija la entrada a 0 V cuando el pulsador está abierto, evitando una entrada flotante.') },
    ],
  }),

  switch: () => ({
    id: 'switch',
    title: 'Interruptor deslizante SPDT',
    intro: 'Un polo, dos posiciones: el terminal común se conecta con A o con B.',
    sections: [
      { title: 'Símbolo', html: `<div class="symbols">${SYMBOLS.switch}</div>` },
      { title: 'Usos', html: '<p>Encendido/apagado, selección entre dos fuentes, cambio de modo (por ejemplo, cargar o descargar un capacitor).</p><p>Durante la simulación, haz clic sobre él para cambiar de posición.</p>' },
    ],
  }),

  breadboard: () => ({
    id: 'breadboard',
    title: 'Protoboard (placa de pruebas)',
    intro: 'Placa con perforaciones conectadas internamente para armar circuitos sin soldar.',
    sections: [
      { title: 'Conexiones internas', html: `<div class="symbols">${SYMBOLS.breadboard}</div><ul><li>Cada <b>columna</b> numerada tiene dos tiras de 5 perforaciones: <b>a–e</b> y <b>f–j</b>, unidas internamente.</li><li>El <b>canal central</b> separa ambas mitades (ahí se colocan los circuitos integrados DIP).</li><li>Los <b>rieles</b> rojo (+) y azul (−) recorren la placa a lo largo.</li></ul><p>En el laboratorio, al usar la herramienta Cable o Sonda y pasar sobre una perforación, se resaltan en verde todos los puntos eléctricamente conectados con ella.</p>` },
      { title: 'Errores comunes', html: '<ul><li>Poner las dos patas de un componente en la misma columna (queda en cortocircuito / puenteado).</li><li>Olvidar que algunos modelos tienen los rieles cortados a la mitad.</li><li>Unir los rieles + y − con un cable: cortocircuito de la fuente.</li></ul>' },
      { title: 'Tamaños', html: '<table class="mini"><tr><th>Modelo</th><th>Puntos</th></tr><tr><td>Mini</td><td>170 (sin rieles)</td></tr><tr><td>Media</td><td>400</td></tr><tr><td>Completa</td><td>830</td></tr></table>' },
    ],
  }),
};

export function getSheet(id: string, params?: Params): EduSheet | null {
  const fn = SHEETS[id];
  return fn ? fn(params) : null;
}

export function hasSheet(id: string) {
  return id in SHEETS;
}
