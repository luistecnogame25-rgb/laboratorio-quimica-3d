import { eng } from '../core/format';
import { num } from '../core/registry';
import type { ComponentDef, Warning } from '../core/types';
import { LimitedSource, VoltageSource } from '../electrical/devices';

/**
 * Baterías: cada química tiene parámetros propios (no se confunde formato con química).
 * f.e.m. en función del estado de carga: aproximación lineal entre vFull y vEmpty.
 */
export const BATTERY_9V: Record<string, { label: string; vFull: number; vEmpty: number; rint: number; mAh: number; imax: number }> = {
  alkaline: { label: 'Alcalina 9 V (6LR61)', vFull: 9.5, vEmpty: 7.2, rint: 1.7, mAh: 550, imax: 0.5 },
  nimh: { label: 'NiMH recargable 8,4 V', vFull: 8.7, vEmpty: 7.2, rint: 1.2, mAh: 200, imax: 0.4 },
  lithium: { label: 'Litio (LiMnO₂) 9 V', vFull: 9.6, vEmpty: 7.5, rint: 1.0, mAh: 1200, imax: 0.8 },
};

export function batteryEmf(kind: string, soc: number): number {
  const b = BATTERY_9V[kind] ?? BATTERY_9V.alkaline;
  const s = Math.max(0, Math.min(100, soc)) / 100;
  return b.vEmpty + (b.vFull - b.vEmpty) * s;
}

export const battery9v: ComponentDef = {
  type: 'battery-9v',
  name: 'Batería 9 V',
  prefix: 'BT',
  category: 'alimentacion',
  summary: 'Fuente portátil con resistencia interna; su voltaje cae con la carga y el consumo.',
  insertable: false,
  size: { w: 26.5, h: 17.5, d: 48.5 },
  params: [
    { key: 'chemistry', label: 'Química', type: 'select', default: 'alkaline', options: Object.entries(BATTERY_9V).map(([value, b]) => ({ value, label: b.label })) },
    { key: 'soc', label: 'Estado de carga', type: 'number', unit: '%', default: 100, min: 0, max: 100, step: 5 },
  ],
  terminals: () => [
    { id: '+', name: 'Positivo (+)', kind: 'positive', polarity: '+', local: { x: 6.35, z: 27.5 }, height: 8.75, func: 'Broche pequeño redondo' },
    { id: '-', name: 'Negativo (−)', kind: 'negative', polarity: '-', local: { x: -6.35, z: 27.5 }, height: 8.75, func: 'Broche hexagonal grande. Referencia (GND)' },
  ],
  label: (p) => `${eng(batteryEmf(String(p.chemistry), num(p, 'soc')), 'V')}`,
  modelLevel: 'ideal',
  modelDoc:
    'Fuente de voltaje ideal en serie con resistencia interna: V = E − I·Rint. E depende linealmente del estado de carga (aproximación). La descarga en el tiempo no se simula en la Fase 1; se estima la autonomía como capacidad/corriente.',
  eduId: 'battery',
  createModel(ctx) {
    const b = BATTERY_9V[String(ctx.params.chemistry)] ?? BATTERY_9V.alkaline;
    const emf = batteryEmf(String(ctx.params.chemistry), num(ctx.params, 'soc'));
    const src = new VoltageSource(ctx.id, ctx.node('+'), ctx.node('-'), emf, b.rint);
    return {
      elements: [src],
      source: { pos: '+', neg: '-', emf, rint: b.rint, branchElement: src },
      report(sol) {
        const i = sol.branch(src.branchIndex);
        const v = sol.v(src.p) - sol.v(src.n);
        const warnings: Warning[] = [];
        if (i > 0.5 * (emf / b.rint)) warnings.push({ level: 'error', message: `Cortocircuito: la batería entrega ${eng(i, 'A')}. Se calentaría y se descargaría rápidamente.` });
        else if (i > b.imax) warnings.push({ level: 'warn', message: `Consumo de ${eng(i, 'A')}: excesivo para una batería de 9 V (recomendado < ${eng(b.imax, 'A')}).` });
        if (i < -1e-6) warnings.push({ level: 'warn', message: 'La corriente entra por el positivo: otra fuente está forzando a esta batería.' });
        const hours = i > 1e-6 ? b.mAh / 1000 / i : Infinity;
        return {
          values: [
            { label: 'Voltaje en bornes', value: v, unit: 'V' },
            { label: 'Corriente', value: i, unit: 'A' },
            { label: 'Potencia entregada', value: v * i, unit: 'W' },
            { label: 'Autonomía estimada', value: hours, unit: 'h' },
          ],
          warnings,
          visual: {},
        };
      },
    };
  },
};

export const benchSupply: ComponentDef = {
  type: 'dc-supply',
  name: 'Fuente DC regulable',
  prefix: 'PS',
  category: 'alimentacion',
  summary: 'Fuente de laboratorio 0–30 V con límite de corriente ajustable (modos CV/CC).',
  insertable: false,
  size: { w: 110, h: 62, d: 80 },
  params: [
    { key: 'voltage', label: 'Voltaje', type: 'number', unit: 'V', default: 5, min: 0, max: 30, step: 0.1 },
    { key: 'ilim', label: 'Límite de corriente', type: 'number', unit: 'A', default: 0.5, min: 0.001, max: 5, step: 0.01 },
  ],
  terminals: () => [
    { id: '+', name: 'Salida +', kind: 'positive', polarity: '+', local: { x: 33, z: 48 }, height: 16, func: 'Borne rojo' },
    { id: '-', name: 'Salida − (COM)', kind: 'negative', polarity: '-', local: { x: 15, z: 48 }, height: 16, func: 'Borne negro, referencia' },
  ],
  label: (p) => `${eng(num(p, 'voltage'), 'V')} / ${eng(num(p, 'ilim'), 'A')}`,
  modelLevel: 'ideal',
  modelDoc:
    'Regulador ideal con dos modos: CV (voltaje constante, Rint = 5 mΩ) mientras I < Ilim; CC (corriente constante = Ilim) cuando la carga exige más. El cambio de modo se resuelve dentro de la iteración de Newton-Raphson.',
  eduId: 'dc-supply',
  createModel(ctx) {
    const V = num(ctx.params, 'voltage');
    const ilim = num(ctx.params, 'ilim');
    const src = new LimitedSource(ctx.id, ctx.node('+'), ctx.node('-'), V, ilim);
    return {
      elements: [src],
      source: { pos: '+', neg: '-', emf: V, rint: src.rint, branchElement: src },
      report(sol) {
        const i = sol.branch(src.branchIndex);
        const v = sol.v(src.p) - sol.v(src.n);
        const warnings: Warning[] = [];
        if (src.mode === 'CC') {
          if (v < 0.05 * Math.max(V, 0.1)) warnings.push({ level: 'error', message: `Cortocircuito en la salida: la fuente limita a ${eng(ilim, 'A')}.` });
          else warnings.push({ level: 'warn', message: `Límite de corriente activo (modo CC): la carga pide más de ${eng(ilim, 'A')}.` });
        }
        return {
          values: [
            { label: 'Voltaje de salida', value: v, unit: 'V' },
            { label: 'Corriente', value: i, unit: 'A' },
            { label: 'Potencia', value: v * i, unit: 'W' },
          ],
          warnings,
          visual: { display: [`${v.toFixed(2)} V`, `${Math.abs(i) < 0.9995 ? (i * 1000).toFixed(1) + ' mA' : i.toFixed(3) + ' A'}`, src.mode] },
        };
      },
    };
  },
};
