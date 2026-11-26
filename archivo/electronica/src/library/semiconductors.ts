import { eng } from '../core/format';
import { num } from '../core/registry';
import { PITCH, type ComponentDef, type Params, type TerminalDef, type Warning } from '../core/types';
import { Bjt, Diode, Resistor } from '../electrical/devices';
import { VT } from '../electrical/mna';

/* ------------------------------ LED ------------------------------ */

/**
 * Parámetros por color: Vf típico a 20 mA, resistencia serie y longitud de onda.
 * Is se deriva para que el modelo reproduzca Vf a 20 mA (aproximación de hoja de datos).
 */
export const LED_COLORS: Record<string, { label: string; vf: number; rs: number; n: number; hex: string; nm: number }> = {
  red: { label: 'Rojo', vf: 2.0, rs: 6, n: 2, hex: '#ff2a2a', nm: 625 },
  orange: { label: 'Naranja', vf: 2.05, rs: 6, n: 2, hex: '#ff7a1a', nm: 605 },
  yellow: { label: 'Amarillo', vf: 2.1, rs: 6, n: 2, hex: '#ffd21a', nm: 590 },
  green: { label: 'Verde', vf: 2.2, rs: 7, n: 2, hex: '#3dff5a', nm: 570 },
  blue: { label: 'Azul', vf: 3.1, rs: 10, n: 2.6, hex: '#2a7bff', nm: 470 },
  white: { label: 'Blanco', vf: 3.1, rs: 10, n: 2.6, hex: '#f4f7ff', nm: 0 },
};

export function ledModelParams(color: string) {
  const c = LED_COLORS[color] ?? LED_COLORS.red;
  const inom = 0.02;
  const vj = c.vf - inom * c.rs;
  const is = inom / Math.exp(vj / (c.n * VT));
  return { is, n: c.n, rs: c.rs };
}

export const led: ComponentDef = {
  type: 'led',
  name: 'LED 5 mm',
  prefix: 'LED',
  category: 'semiconductores',
  summary: 'Diodo emisor de luz. Requiere resistencia limitadora de corriente.',
  insertable: true,
  size: { w: 5.8, h: 8.6, d: 5.8 },
  params: [
    { key: 'color', label: 'Color', type: 'select', default: 'red', options: Object.entries(LED_COLORS).map(([value, c]) => ({ value, label: c.label })) },
    { key: 'imax', label: 'Corriente máxima', type: 'number', unit: 'A', default: 0.03, min: 0.005, max: 0.1, help: 'Máximo absoluto de corriente directa continua.' },
  ],
  terminals: () => [
    { id: 'A', name: 'Ánodo (+)', kind: 'anode', polarity: '+', local: { x: -PITCH / 2, z: 0 }, maxCurrent: 0.03, func: 'Pata larga. Va hacia el positivo.' },
    { id: 'K', name: 'Cátodo (−)', kind: 'cathode', polarity: '-', local: { x: PITCH / 2, z: 0 }, maxVoltage: 5, func: 'Pata corta, lado plano del encapsulado. Va hacia GND.' },
  ],
  label: (p) => `LED ${LED_COLORS[String(p.color)]?.label ?? ''}`,
  modelLevel: 'fisico',
  modelDoc:
    'Ecuación de Shockley con resistencia serie: I = Is·(e^(Vj/(n·Vt)) − 1), V = Vj + I·Rs. Is se ajusta para reproducir el Vf típico a 20 mA de cada color. El brillo mostrado es proporcional a la corriente (aproximación). Sin ruptura inversa modelada: se advierte si Vr > 5 V. Si la corriente supera 100 mA el LED se marca como quemado (abierto).',
  eduId: 'led',
  createModel(ctx) {
    const nodeA = ctx.node('A');
    const nodeK = ctx.node('K');
    const imax = num(ctx.params, 'imax');
    if (ctx.runtime.damaged.has(ctx.id)) {
      const open = new Resistor(ctx.id + ':open', nodeA, nodeK, 1e9);
      return {
        elements: [open],
        report: (sol) => ({
          values: [{ label: 'Voltaje', value: sol.v(nodeA) - sol.v(nodeK), unit: 'V' }],
          warnings: [{ level: 'error', message: 'LED quemado por exceso de corriente. Detén la simulación para reiniciarlo.' }],
          visual: { brightness: 0, damaged: true },
        }),
      };
    }
    const mp = ledModelParams(String(ctx.params.color));
    const mid = ctx.internalNode();
    const d = new Diode(ctx.id, nodeA, mid, { is: mp.is, n: mp.n });
    const rs = new Resistor(ctx.id + ':rs', mid, nodeK, mp.rs);
    return {
      elements: [d, rs],
      report(sol) {
        const v = sol.v(nodeA) - sol.v(nodeK);
        const i = (sol.v(mid) - sol.v(nodeK)) / mp.rs;
        const warnings: Warning[] = [];
        if (i > 0.1) {
          ctx.runtime.damaged.add(ctx.id);
          warnings.push({ level: 'error', message: `Corriente de ${eng(i, 'A')}: el LED se quema. Falta una resistencia limitadora.` });
        } else if (i > imax) {
          warnings.push({ level: 'warn', message: `Corriente de ${eng(i, 'A')} supera el máximo de ${eng(imax, 'A')}. Aumenta la resistencia en serie.` });
        }
        if (v < -5) warnings.push({ level: 'error', message: `Voltaje inverso de ${eng(-v, 'V')}: supera los 5 V que soporta un LED.` });
        else if (v < -0.5) warnings.push({ level: 'info', message: 'Polarizado en inversa: el LED no conduce. Revisa ánodo (pata larga) y cátodo.' });
        return {
          values: [
            { label: 'Voltaje directo', value: v, unit: 'V' },
            { label: 'Corriente', value: i, unit: 'A' },
            { label: 'Potencia', value: Math.max(0, v * i), unit: 'W' },
          ],
          warnings,
          visual: { brightness: Math.max(0, Math.min(1.5, i / 0.02)) },
        };
      },
    };
  },
};

/* ------------------------------ Diodo ------------------------------ */

export const DIODES: Record<string, { label: string; is: number; n: number; rs: number; imax: number; vrrm: number }> = {
  '1N4148': { label: '1N4148 (señal)', is: 2.52e-9, n: 1.752, rs: 0.568, imax: 0.3, vrrm: 100 },
  '1N4007': { label: '1N4007 (rectificador 1 A)', is: 7.03e-9, n: 1.808, rs: 0.034, imax: 1, vrrm: 1000 },
};

export const diode: ComponentDef = {
  type: 'diode',
  name: 'Diodo rectificador',
  prefix: 'D',
  category: 'semiconductores',
  summary: 'Permite la corriente en un solo sentido (ánodo → cátodo).',
  insertable: true,
  size: { w: 5.2, h: 2.7, d: 2.7 },
  params: [
    { key: 'model', label: 'Modelo', type: 'select', default: '1N4007', options: Object.entries(DIODES).map(([value, d]) => ({ value, label: d.label })) },
    { key: 'span', label: 'Separación de patas', type: 'number', unit: 'pasos', default: 4, min: 3, max: 8, step: 1 },
  ],
  terminals(p) {
    const h = (num(p, 'span') * PITCH) / 2;
    return [
      { id: 'A', name: 'Ánodo', kind: 'anode', polarity: '+', local: { x: -h, z: 0 }, func: 'Entrada de corriente convencional' },
      { id: 'K', name: 'Cátodo', kind: 'cathode', polarity: '-', local: { x: h, z: 0 }, func: 'Lado de la franja' },
    ];
  },
  label: (p) => String(p.model),
  modelLevel: 'fisico',
  modelDoc: 'Shockley con resistencia serie; parámetros Is, n y Rs tomados de modelos SPICE públicos de referencia. Sin capacitancias ni ruptura inversa (se advierte si se supera VRRM).',
  eduId: 'diode',
  createModel(ctx) {
    const m = DIODES[String(ctx.params.model)] ?? DIODES['1N4007'];
    const a = ctx.node('A');
    const k = ctx.node('K');
    const mid = ctx.internalNode();
    const d = new Diode(ctx.id, a, mid, { is: m.is, n: m.n });
    const rs = new Resistor(ctx.id + ':rs', mid, k, m.rs);
    return {
      elements: [d, rs],
      report(sol) {
        const v = sol.v(a) - sol.v(k);
        const i = (sol.v(mid) - sol.v(k)) / m.rs;
        const warnings: Warning[] = [];
        if (i > m.imax) warnings.push({ level: 'error', message: `Corriente ${eng(i, 'A')} supera el máximo de ${eng(m.imax, 'A')}.` });
        if (-v > m.vrrm) warnings.push({ level: 'error', message: `Voltaje inverso supera VRRM (${m.vrrm} V).` });
        return {
          values: [
            { label: 'Voltaje', value: v, unit: 'V' },
            { label: 'Corriente', value: i, unit: 'A' },
            { label: 'Potencia', value: Math.max(0, v * i), unit: 'W' },
          ],
          warnings,
          visual: {},
        };
      },
    };
  },
};

/* ------------------------------ BJT ------------------------------ */

export interface BjtModel {
  label: string;
  is: number;
  bf: number;
  br: number;
  icmax: number;
  pmax: number;
  vceo: number;
  pinout: ('C' | 'B' | 'E')[]; // de izquierda a derecha mirando la cara plana
}

export const NPN_MODELS: Record<string, BjtModel> = {
  '2N2222A': { label: 'PN2222A', is: 1.4e-14, bf: 200, br: 3, icmax: 0.6, pmax: 0.625, vceo: 40, pinout: ['E', 'B', 'C'] },
  '2N3904': { label: '2N3904', is: 6.7e-15, bf: 300, br: 0.7, icmax: 0.2, pmax: 0.625, vceo: 40, pinout: ['E', 'B', 'C'] },
  BC547B: { label: 'BC547B', is: 1.8e-14, bf: 290, br: 5, icmax: 0.1, pmax: 0.5, vceo: 45, pinout: ['C', 'B', 'E'] },
};

export const PNP_MODELS: Record<string, BjtModel> = {
  '2N3906': { label: '2N3906', is: 1.4e-14, bf: 180, br: 4, icmax: 0.2, pmax: 0.625, vceo: 40, pinout: ['E', 'B', 'C'] },
  '2N2907A': { label: 'PN2907A', is: 1.1e-14, bf: 200, br: 4, icmax: 0.6, pmax: 0.625, vceo: 60, pinout: ['E', 'B', 'C'] },
  BC557B: { label: 'BC557B', is: 2e-14, bf: 290, br: 5, icmax: 0.1, pmax: 0.5, vceo: 45, pinout: ['C', 'B', 'E'] },
};

const PIN_INFO = {
  C: { name: 'Colector (C)', kind: 'collector' as const, func: 'Corriente principal de salida' },
  B: { name: 'Base (B)', kind: 'base' as const, func: 'Control: una pequeña corriente de base controla Ic ≈ β·Ib' },
  E: { name: 'Emisor (E)', kind: 'emitter' as const, func: 'Referencia; en NPN suele ir a GND' },
};

function bjtDef(polarity: 1 | -1): ComponentDef {
  const models = polarity === 1 ? NPN_MODELS : PNP_MODELS;
  const first = Object.keys(models)[0];
  const npn = polarity === 1;
  return {
    type: npn ? 'npn' : 'pnp',
    name: npn ? 'Transistor NPN' : 'Transistor PNP',
    prefix: 'Q',
    category: 'semiconductores',
    summary: npn
      ? 'Interruptor o amplificador controlado por corriente de base. Se activa con la base más positiva que el emisor.'
      : 'Complementario del NPN: conduce cuando la base es más negativa que el emisor.',
    insertable: true,
    size: { w: 4.8, h: 5, d: 3.8 },
    params: [{ key: 'model', label: 'Modelo', type: 'select', default: first, options: Object.entries(models).map(([value, m]) => ({ value, label: m.label })) }],
    terminals(p: Params): TerminalDef[] {
      const m = models[String(p.model)] ?? models[first];
      return m.pinout.map((pin, i) => ({
        id: pin,
        ...PIN_INFO[pin],
        local: { x: (i - 1) * PITCH, z: 0 },
      }));
    },
    label: (p) => (models[String(p.model)] ?? models[first]).label,
    modelLevel: 'fisico',
    modelDoc:
      'Modelo de Ebers-Moll de transporte: Ic = Is(e^(Vbe/Vt) − e^(Vbc/Vt)) − (Is/βr)(e^(Vbc/Vt) − 1), Ib = (Is/βf)(e^(Vbe/Vt) − 1) + (Is/βr)(e^(Vbc/Vt) − 1). Parámetros aproximados de hojas de datos públicas. No incluye efecto Early, capacitancias, variación de β con Ic ni temperatura.',
    eduId: npn ? 'npn' : 'pnp',
    createModel(ctx) {
      const m = models[String(ctx.params.model)] ?? models[first];
      const c = ctx.node('C');
      const b = ctx.node('B');
      const e = ctx.node('E');
      const q = new Bjt(ctx.id, c, b, e, { polarity, is: m.is, bf: m.bf, br: m.br });
      return {
        elements: [q],
        report(sol) {
          const vbe = sol.v(b) - sol.v(e);
          const vce = sol.v(c) - sol.v(e);
          const ic = q.ic;
          const ib = q.ib;
          const p = Math.abs(ic * vce) + Math.abs(ib * vbe);
          const warnings: Warning[] = [];
          if (Math.abs(ic) > m.icmax) warnings.push({ level: 'error', message: `Ic = ${eng(Math.abs(ic), 'A')} supera el máximo (${eng(m.icmax, 'A')}).` });
          if (p > m.pmax) warnings.push({ level: 'error', message: `Disipa ${eng(p, 'W')}, más que su máximo (${eng(m.pmax, 'W')}).` });
          if (Math.abs(vce) > m.vceo) warnings.push({ level: 'error', message: `|Vce| supera Vceo (${m.vceo} V).` });
          if (polarity * vbe > 1.2) warnings.push({ level: 'warn', message: 'Vbe muy alto: probablemente falta una resistencia de base.' });
          const region = q.region();
          return {
            values: [
              { label: 'Vbe', value: vbe, unit: 'V' },
              { label: 'Vce', value: vce, unit: 'V' },
              { label: 'Ic', value: ic, unit: 'A' },
              { label: 'Ib', value: ib, unit: 'A' },
              { label: 'β (Ic/Ib)', value: Math.abs(ib) > 1e-12 ? ic / ib : 0, unit: '' },
              { label: 'Potencia', value: p, unit: 'W' },
            ],
            warnings,
            visual: { region },
          };
        },
      };
    },
  };
}

export const npn = bjtDef(1);
export const pnp = bjtDef(-1);
