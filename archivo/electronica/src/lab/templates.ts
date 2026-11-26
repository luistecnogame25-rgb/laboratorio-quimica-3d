/**
 * Circuitos de referencia / plantillas. Cada uno incluye el resultado teórico calculado de
 * forma independiente para que el usuario pueda contrastarlo con la simulación.
 */
import type { Project, WireEnd } from '../core/types';
import { CircuitBuilder, hole, pin } from '../library/builder';

export interface Template {
  id: string;
  name: string;
  summary: string;
  level: string;
  expected: string;
  probes?: { red: WireEnd; black?: WireEnd };
  build(): { project: Project; probes?: { red: WireEnd; black?: WireEnd } };
}

function batteryOnRails(cb: CircuitBuilder, pb: string) {
  const bt = cb.free('battery-9v', { chemistry: 'alkaline', soc: 100 }, -45, -82);
  cb.wire(pin(bt, '+'), hole(pb, 'T+3'));
  cb.wire(pin(bt, '-'), hole(pb, 'T-3'));
  return bt;
}

function supplyOnRails(cb: CircuitBuilder, pb: string, voltage: number, ilim: number) {
  const ps = cb.free('dc-supply', { voltage, ilim }, -40, -112);
  cb.wire(pin(ps, '+'), hole(pb, 'T+3'));
  cb.wire(pin(ps, '-'), hole(pb, 'T-3'));
  return ps;
}

export const TEMPLATES: Template[] = [
  {
    id: 'led-basico',
    name: 'LED con resistencia',
    summary: 'Batería de 9 V, resistencia de 470 Ω y LED rojo: el primer circuito.',
    level: 'Nivel 2 · Ley de Ohm',
    expected: 'I ≈ (9,5 V − V<sub>f</sub>) / (470 Ω + 1,7 Ω de resistencia interna). Con V<sub>f</sub> ≈ 1,96 V a 16 mA → I ≈ 16,0 mA; V en la resistencia ≈ 7,5 V.',
    build() {
      const cb = new CircuitBuilder('LED con resistencia');
      const pb = cb.board();
      batteryOnRails(cb, pb);
      cb.place('resistor', { resistance: 470 }, pb, '10c');
      cb.place('led', { color: 'red' }, pb, '14d');
      cb.wire(hole(pb, 'T+8'), hole(pb, '10a'), '#e02b2b');
      cb.wire(hole(pb, '15a'), hole(pb, 'T-12'), '#1b1b1f');
      return { project: cb.project, probes: { red: hole(pb, '14a'), black: hole(pb, '15b') } };
    },
  },
  {
    id: 'divisor',
    name: 'Divisor de voltaje',
    summary: 'Fuente de 10 V con 4,7 kΩ y 10 kΩ en serie. Mide el punto medio con la sonda.',
    level: 'Nivel 3 · Voltaje, corriente y resistencia',
    expected: 'V<sub>out</sub> = 10 V × 10 kΩ / (4,7 kΩ + 10 kΩ) = 6,803 V. I = 10 / 14 700 = 0,680 mA.',
    build() {
      const cb = new CircuitBuilder('Divisor de voltaje');
      const pb = cb.board();
      supplyOnRails(cb, pb, 10, 0.1);
      cb.place('resistor', { resistance: 4700 }, pb, '20c');
      cb.place('resistor', { resistance: 10000 }, pb, '24d');
      cb.wire(hole(pb, 'T+14'), hole(pb, '20a'));
      cb.wire(hole(pb, '28a'), hole(pb, 'T-20'));
      return { project: cb.project, probes: { red: hole(pb, '24a') } };
    },
  },
  {
    id: 'leds-paralelo',
    name: 'LEDs en paralelo',
    summary: 'Tres LEDs de distinto color, cada uno con su resistencia, alimentados a 5 V.',
    level: 'Nivel 4 · Serie y paralelo',
    expected: 'Rojo: (5 − 2,0)/220 ≈ 13 mA · Verde: (5 − 2,2)/220 ≈ 12 mA · Azul: (5 − 3,1)/220 ≈ 8 mA (valores aproximados; el simulador resuelve la curva exponencial).',
    build() {
      const cb = new CircuitBuilder('LEDs en paralelo');
      const pb = cb.board();
      supplyOnRails(cb, pb, 5, 0.2);
      const colors = ['red', 'green', 'blue'];
      colors.forEach((color, i) => {
        const col = 10 + i * 8;
        cb.place('resistor', { resistance: 220 }, pb, `${col}c`);
        cb.place('led', { color }, pb, `${col + 4}d`);
        cb.wire(hole(pb, `T+${5 + i * 6}`), hole(pb, `${col}a`));
        cb.wire(hole(pb, `${col + 5}a`), hole(pb, `T-${8 + i * 6}`));
      });
      return { project: cb.project };
    },
  },
  {
    id: 'rc',
    name: 'Carga y descarga RC',
    summary: 'Interruptor SPDT para cargar (A) o descargar (B) un capacitor de 220 µF a través de 10 kΩ.',
    level: 'Nivel 6 · Capacitores',
    expected: 'τ = 10 kΩ × 220 µF = 2,2 s. Tras 2,2 s de carga: 5 V × 63,2 % = 3,16 V. Haz clic en el interruptor durante la simulación para descargar.',
    build() {
      const cb = new CircuitBuilder('Carga y descarga RC');
      const pb = cb.board();
      supplyOnRails(cb, pb, 5, 0.1);
      cb.place('slide-switch', { position: 'A' }, pb, '10c'); // A=10, C=11, B=12
      cb.place('resistor', { resistance: 10000 }, pb, '11b'); // 11–15
      cb.place('capacitor-electrolytic', { capacitance: 220e-6, vmax: '16' }, pb, '15c'); // + 15, − 16
      cb.wire(hole(pb, 'T+5'), hole(pb, '10a'));
      cb.wire(hole(pb, '12a'), hole(pb, 'T-8'));
      cb.wire(hole(pb, '16a'), hole(pb, 'T-11'));
      return { project: cb.project, probes: { red: hole(pb, '15a') } };
    },
  },
  {
    id: 'transistor-switch',
    name: 'Transistor como interruptor',
    summary: 'Un pulsador activa la base de un NPN, que enciende un LED en el colector.',
    level: 'Nivel 7 · Diodos y transistores',
    expected: 'Al pulsar: I<sub>B</sub> ≈ (9,5 − 0,7)/10 kΩ ≈ 0,88 mA → saturación. I<sub>LED</sub> ≈ (9,5 − 2,0 − 0,1)/470 ≈ 15,7 mA. Sin pulsar: corte, I<sub>C</sub> ≈ 0.',
    build() {
      const cb = new CircuitBuilder('Transistor como interruptor');
      const pb = cb.board();
      batteryOnRails(cb, pb);
      cb.place('pushbutton', {}, pb, '20e'); // 20e/20f — 22e/22f
      cb.place('resistor', { resistance: 10000 }, pb, '22b'); // 22–26 (base)
      cb.place('npn', { model: '2N2222A' }, pb, '25c'); // E 25, B 26, C 27
      cb.place('led', { color: 'green' }, pb, '28d', 2); // A 28, K 27
      cb.place('resistor', { resistance: 470 }, pb, '28b'); // 28–32
      cb.wire(hole(pb, 'T+10'), hole(pb, '20a'), '#e02b2b');
      cb.wire(hole(pb, '25a'), hole(pb, 'T-18'), '#1b1b1f');
      cb.wire(hole(pb, '32a'), hole(pb, 'T+24'), '#e02b2b');
      return { project: cb.project, probes: { red: hole(pb, '27a') } };
    },
  },
  {
    id: 'limite-corriente',
    name: 'Límite de corriente',
    summary: 'Fuente a 12 V con límite de 20 mA protegiendo un LED con solo 100 Ω.',
    level: 'Nivel 5 · Potencia eléctrica',
    expected: 'Sin límite: (12 − 2)/106 ≈ 94 mA (quemaría el LED). Con límite de 20 mA la fuente entra en modo CC y su salida cae a ≈ 2 V + 20 mA × 100 Ω ≈ 4,1 V.',
    build() {
      const cb = new CircuitBuilder('Límite de corriente');
      const pb = cb.board();
      supplyOnRails(cb, pb, 12, 0.02);
      cb.place('resistor', { resistance: 100 }, pb, '10c');
      cb.place('led', { color: 'yellow' }, pb, '14d');
      cb.wire(hole(pb, 'T+8'), hole(pb, '10a'));
      cb.wire(hole(pb, '15a'), hole(pb, 'T-12'));
      return { project: cb.project };
    },
  },
];

export function getTemplate(id: string) {
  return TEMPLATES.find((t) => t.id === id);
}
