import { eng } from '../core/format';
import { PITCH, type ComponentDef } from '../core/types';
import { VariableResistor } from '../electrical/devices';

const R_ON = 0.05;
const R_OFF = 1e9;

/**
 * Pulsador táctil 6×6 mm de 4 patas. Las patas 1a–1b están unidas internamente, igual que 2a–2b.
 * Al presionarlo se conectan los pares 1 y 2. Se coloca a caballo sobre el canal central.
 */
export const pushbutton: ComponentDef = {
  type: 'pushbutton',
  name: 'Pulsador táctil',
  prefix: 'SW',
  category: 'entrada',
  summary: 'Contacto momentáneo: conduce solo mientras se mantiene presionado.',
  insertable: true,
  size: { w: 6, h: 5, d: 6 },
  params: [],
  terminals: () => [
    { id: '1a', name: 'Pata 1a', kind: 'switch', local: { x: 0, z: 0 }, func: 'Unida internamente a 1b' },
    { id: '1b', name: 'Pata 1b', kind: 'switch', local: { x: 0, z: 3 * PITCH }, func: 'Unida internamente a 1a', optional: true },
    { id: '2a', name: 'Pata 2a', kind: 'switch', local: { x: 2 * PITCH, z: 0 }, func: 'Unida internamente a 2b' },
    { id: '2b', name: 'Pata 2b', kind: 'switch', local: { x: 2 * PITCH, z: 3 * PITCH }, func: 'Unida internamente a 2a', optional: true },
  ],
  label: () => 'Pulsador',
  modelLevel: 'ideal',
  modelDoc: 'Contactos ideales: 50 mΩ cerrado, 1 GΩ abierto. Sin rebote mecánico (se añadirá con los microcontroladores).',
  eduId: 'pushbutton',
  createModel(ctx) {
    const n1a = ctx.node('1a');
    const n1b = ctx.node('1b');
    const n2a = ctx.node('2a');
    const n2b = ctx.node('2b');
    const pressed = () => ctx.runtime.pressed.has(ctx.id);
    const sw = new VariableResistor(ctx.id, n1a, n2a, () => (pressed() ? R_ON : R_OFF));
    const l1 = new VariableResistor(ctx.id + ':l1', n1a, n1b, () => R_ON);
    const l2 = new VariableResistor(ctx.id + ':l2', n2a, n2b, () => R_ON);
    return {
      elements: [sw, l1, l2],
      report(sol) {
        const v = sol.v(n1a) - sol.v(n2a);
        const i = v / (pressed() ? R_ON : R_OFF);
        return {
          values: [
            { label: 'Estado', value: pressed() ? 1 : 0, unit: '' },
            { label: 'Voltaje entre contactos', value: v, unit: 'V' },
            { label: 'Corriente', value: i, unit: 'A' },
          ],
          warnings: Math.abs(i) > 0.05 ? [{ level: 'warn', message: `Corriente de ${eng(Math.abs(i), 'A')}: excede la capacidad típica (50 mA) de un pulsador táctil.` }] : [],
          visual: { pressed: pressed() },
        };
      },
    };
  },
};

/** Interruptor deslizante SPDT: el común (C) se conecta a A o a B según la posición. */
export const slideSwitch: ComponentDef = {
  type: 'slide-switch',
  name: 'Interruptor deslizante SPDT',
  prefix: 'SW',
  category: 'entrada',
  summary: 'Selector de dos posiciones: conecta el terminal común con A o con B.',
  insertable: true,
  size: { w: 8.6, h: 7, d: 3.6 },
  params: [
    {
      key: 'position',
      label: 'Posición',
      type: 'select',
      default: 'A',
      options: [
        { value: 'A', label: 'Común ↔ A' },
        { value: 'B', label: 'Común ↔ B' },
      ],
    },
  ],
  terminals: () => [
    { id: 'A', name: 'Terminal A', kind: 'switch', local: { x: -PITCH, z: 0 }, func: 'Contacto A' },
    { id: 'C', name: 'Común', kind: 'switch', local: { x: 0, z: 0 }, func: 'Terminal común' },
    { id: 'B', name: 'Terminal B', kind: 'switch', local: { x: PITCH, z: 0 }, func: 'Contacto B' },
  ],
  label: (p) => `SPDT (${p.position})`,
  modelLevel: 'ideal',
  modelDoc: 'Contactos ideales: 50 mΩ cerrado, 1 GΩ abierto.',
  eduId: 'switch',
  createModel(ctx) {
    const a = ctx.node('A');
    const c = ctx.node('C');
    const b = ctx.node('B');
    const posB = String(ctx.params.position) === 'B';
    const ra = new VariableResistor(ctx.id + ':a', c, a, () => (posB ? R_OFF : R_ON));
    const rb = new VariableResistor(ctx.id + ':b', c, b, () => (posB ? R_ON : R_OFF));
    return {
      elements: [ra, rb],
      report(sol) {
        return {
          values: [
            { label: 'Posición B', value: posB ? 1 : 0, unit: '' },
            { label: 'V común', value: sol.v(c) - sol.v(posB ? b : a), unit: 'V' },
          ],
          warnings: [],
          visual: { pressed: posB },
        };
      },
    };
  },
};
