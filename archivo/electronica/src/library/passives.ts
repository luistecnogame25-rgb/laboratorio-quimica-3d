import { eng } from '../core/format';
import { num } from '../core/registry';
import { PITCH, type ComponentDef, type Warning } from '../core/types';
import { Capacitor, Resistor } from '../electrical/devices';

export const E12 = [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
export const RESISTOR_PRESETS = [10, 22, 47, 100, 150, 220, 330, 470, 680, 1e3, 2.2e3, 4.7e3, 10e3, 22e3, 47e3, 100e3, 220e3, 470e3, 1e6];

export const resistor: ComponentDef = {
  type: 'resistor',
  name: 'Resistencia',
  prefix: 'R',
  category: 'pasivos',
  summary: 'Limita la corriente y produce caídas de voltaje (ley de Ohm).',
  insertable: true,
  size: { w: 6.3, h: 2.4, d: 2.4 },
  params: [
    { key: 'resistance', label: 'Resistencia', type: 'number', unit: 'Ω', default: 220, min: 0.1, max: 10e6, presets: RESISTOR_PRESETS },
    {
      key: 'power',
      label: 'Potencia nominal',
      type: 'select',
      unit: 'W',
      default: '0.25',
      options: [
        { value: '0.125', label: '1/8 W' },
        { value: '0.25', label: '1/4 W' },
        { value: '0.5', label: '1/2 W' },
        { value: '1', label: '1 W' },
      ],
    },
    {
      key: 'tolerance',
      label: 'Tolerancia',
      type: 'select',
      default: '5',
      options: [
        { value: '5', label: '±5 % (banda dorada)' },
        { value: '1', label: '±1 % (banda marrón)' },
      ],
    },
    { key: 'span', label: 'Separación de patas', type: 'number', unit: 'pasos', default: 4, min: 2, max: 8, step: 1, help: 'Distancia entre patas en perforaciones de 2,54 mm.' },
  ],
  terminals(p) {
    const h = (num(p, 'span') * PITCH) / 2;
    return [
      { id: '1', name: 'Terminal 1', kind: 'passive', local: { x: -h, z: 0 }, func: 'Extremo de la resistencia (sin polaridad)' },
      { id: '2', name: 'Terminal 2', kind: 'passive', local: { x: h, z: 0 }, func: 'Extremo de la resistencia (sin polaridad)' },
    ];
  },
  label: (p) => eng(num(p, 'resistance'), 'Ω'),
  modelLevel: 'ideal',
  modelDoc: 'Ley de Ohm: V = I·R (lineal, sin dependencia de temperatura). Disipación P = I²·R comparada con la potencia nominal.',
  eduId: 'resistor',
  createModel(ctx) {
    const R = num(ctx.params, 'resistance');
    const pr = num(ctx.params, 'power');
    const el = new Resistor(ctx.id, ctx.node('1'), ctx.node('2'), R);
    return {
      elements: [el],
      report(sol) {
        const v = sol.v(el.a) - sol.v(el.c);
        const i = v / R;
        const p = v * i;
        const warnings: Warning[] = [];
        if (p > pr * 2) warnings.push({ level: 'error', message: `Disipa ${eng(p, 'W')}: más del doble de su potencia nominal (${eng(pr, 'W')}). En la realidad se quemaría.` });
        else if (p > pr) warnings.push({ level: 'warn', message: `Disipa ${eng(p, 'W')}, por encima de su potencia nominal (${eng(pr, 'W')}). Se sobrecalienta.` });
        return {
          values: [
            { label: 'Voltaje', value: v, unit: 'V' },
            { label: 'Corriente', value: i, unit: 'A' },
            { label: 'Potencia', value: Math.abs(p), unit: 'W' },
          ],
          warnings,
          visual: { heat: Math.abs(p) / pr },
        };
      },
    };
  },
};

function capacitorReport(el: Capacitor, C: number, vmax: number, polarized: boolean) {
  return () => {
    const v = el.vPrev;
    const i = el.iLast;
    const warnings: Warning[] = [];
    if (Math.abs(v) > vmax) warnings.push({ level: 'error', message: `Voltaje (${eng(Math.abs(v), 'V')}) supera el máximo nominal de ${eng(vmax, 'V')}.` });
    if (polarized && v < -1) warnings.push({ level: 'error', message: 'Polaridad invertida: un electrolítico conectado al revés puede dañarse o reventar.' });
    else if (polarized && v < -0.3) warnings.push({ level: 'warn', message: 'Voltaje inverso en un capacitor polarizado.' });
    return {
      values: [
        { label: 'Voltaje', value: v, unit: 'V' },
        { label: 'Corriente', value: i, unit: 'A' },
        { label: 'Carga Q', value: C * v, unit: 'C' },
        { label: 'Energía', value: 0.5 * C * v * v, unit: 'J' },
      ],
      warnings,
      visual: { charge: Math.min(1, Math.abs(v) / Math.max(vmax * 0.5, 1)) },
    };
  };
}

export const ceramicCapacitor: ComponentDef = {
  type: 'capacitor-ceramic',
  name: 'Capacitor cerámico',
  prefix: 'C',
  category: 'pasivos',
  summary: 'Capacitor no polarizado de baja capacidad, para filtrado y desacoplo.',
  insertable: true,
  size: { w: 5, h: 5, d: 2.5 },
  params: [
    { key: 'capacitance', label: 'Capacidad', type: 'number', unit: 'F', default: 100e-9, min: 1e-12, max: 10e-6, presets: [10e-12, 22e-12, 100e-12, 1e-9, 10e-9, 100e-9, 470e-9, 1e-6] },
    { key: 'vmax', label: 'Voltaje máximo', type: 'number', unit: 'V', default: 50, min: 1, max: 1000 },
    { key: 'v0', label: 'Voltaje inicial', type: 'number', unit: 'V', default: 0, min: -1000, max: 1000 },
  ],
  terminals: () => [
    { id: '1', name: 'Terminal 1', kind: 'passive', local: { x: -PITCH, z: 0 }, func: 'Placa del capacitor (sin polaridad)' },
    { id: '2', name: 'Terminal 2', kind: 'passive', local: { x: PITCH, z: 0 }, func: 'Placa del capacitor (sin polaridad)' },
  ],
  label: (p) => eng(num(p, 'capacitance'), 'F'),
  modelLevel: 'ideal',
  modelDoc: 'i = C·dv/dt, integrado con Euler implícito (modelo compañero G = C/Δt). Sin ESR ni fugas. En el análisis DC se comporta como circuito abierto.',
  eduId: 'capacitor',
  createModel(ctx) {
    const C = num(ctx.params, 'capacitance');
    const v0 = ctx.runtime.capVoltages.get(ctx.id) ?? num(ctx.params, 'v0');
    const el = new Capacitor(ctx.id, ctx.node('1'), ctx.node('2'), C, v0);
    return { elements: [el], report: capacitorReport(el, C, num(ctx.params, 'vmax'), false) };
  },
};

export const electrolyticCapacitor: ComponentDef = {
  type: 'capacitor-electrolytic',
  name: 'Capacitor electrolítico',
  prefix: 'C',
  category: 'pasivos',
  summary: 'Capacitor polarizado de alta capacidad, para almacenamiento de energía y temporización.',
  insertable: true,
  size: { w: 6.3, h: 11, d: 6.3 },
  params: [
    { key: 'capacitance', label: 'Capacidad', type: 'number', unit: 'F', default: 100e-6, min: 0.1e-6, max: 10e-3, presets: [1e-6, 4.7e-6, 10e-6, 47e-6, 100e-6, 220e-6, 470e-6, 1000e-6, 2200e-6] },
    {
      key: 'vmax',
      label: 'Voltaje máximo',
      type: 'select',
      unit: 'V',
      default: '25',
      options: ['6.3', '10', '16', '25', '35', '50', '63'].map((v) => ({ value: v, label: `${v} V` })),
    },
    { key: 'v0', label: 'Voltaje inicial', type: 'number', unit: 'V', default: 0, min: -100, max: 100 },
  ],
  terminals: () => [
    { id: '+', name: 'Positivo (+)', kind: 'passive', polarity: '+', local: { x: -PITCH / 2, z: 0 }, func: 'Ánodo: pata larga' },
    { id: '-', name: 'Negativo (−)', kind: 'passive', polarity: '-', local: { x: PITCH / 2, z: 0 }, func: 'Cátodo: pata corta, franja marcada en el cuerpo' },
  ],
  label: (p) => eng(num(p, 'capacitance'), 'F'),
  modelLevel: 'ideal',
  modelDoc: 'Igual que el capacitor ideal (i = C·dv/dt). Se verifica polaridad y voltaje nominal; no se modelan ESR, fugas ni explosión.',
  eduId: 'capacitor-electrolytic',
  createModel(ctx) {
    const C = num(ctx.params, 'capacitance');
    const v0 = ctx.runtime.capVoltages.get(ctx.id) ?? num(ctx.params, 'v0');
    const el = new Capacitor(ctx.id, ctx.node('+'), ctx.node('-'), C, v0);
    return { elements: [el], report: capacitorReport(el, C, num(ctx.params, 'vmax'), true) };
  },
};
