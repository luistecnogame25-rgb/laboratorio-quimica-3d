import { element } from './elements';

/**
 * Fórmula de composición en notación de Hill (C primero, H después, el resto alfabético;
 * sin carbono, todo alfabético). Describe solo el RECUENTO de átomos seleccionados:
 * no implica que exista un compuesto con esa fórmula.
 */
export function hillFormula(zs: number[]): string {
  const count = new Map<string, number>();
  for (const z of zs) {
    const s = element(z).symbol;
    count.set(s, (count.get(s) ?? 0) + 1);
  }
  const syms = [...count.keys()];
  const hasC = count.has('C');
  const order = hasC ? ['C', ...(count.has('H') ? ['H'] : []), ...syms.filter((s) => s !== 'C' && s !== 'H').sort()] : syms.sort();
  return order.map((s) => s + (count.get(s)! > 1 ? count.get(s) : '')).join('');
}

const SUB = '₀₁₂₃₄₅₆₇₈₉';
export function subscript(formula: string): string {
  return formula.replace(/\d/g, (d) => SUB[Number(d)]);
}

/** Distancia (Å) y ángulo (grados) entre posiciones. */
export function distance(a: number[], b: number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function angle(a: number[], vertex: number[], c: number[]): number {
  const u = [a[0] - vertex[0], a[1] - vertex[1], a[2] - vertex[2]];
  const v = [c[0] - vertex[0], c[1] - vertex[1], c[2] - vertex[2]];
  const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const nu = Math.hypot(...u);
  const nv = Math.hypot(...v);
  if (nu === 0 || nv === 0) return NaN;
  return (Math.acos(Math.max(-1, Math.min(1, dot / (nu * nv)))) * 180) / Math.PI;
}
