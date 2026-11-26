import { describe, expect, it } from 'vitest';
import { hundBoxes, mValues, realSphericalHarmonic, unpaired } from '../src/chem/orbitals';
import { bySymbol } from '../src/chem/elements';

/** Integral numérica de Y1·Y2 sobre la esfera. */
function overlap(l1: number, m1: number, l2: number, m2: number): number {
  const N = 120;
  let s = 0;
  for (let i = 0; i < N; i++) {
    const th = ((i + 0.5) / N) * Math.PI;
    for (let j = 0; j < 2 * N; j++) {
      const ph = ((j + 0.5) / (2 * N)) * 2 * Math.PI;
      s += realSphericalHarmonic(l1, m1, th, ph) * realSphericalHarmonic(l2, m2, th, ph) * Math.sin(th);
    }
  }
  return s * (Math.PI / N) * ((2 * Math.PI) / (2 * N));
}

describe('Armónicos esféricos reales', () => {
  it('están normalizados (∫|Y|² dΩ = 1) para l = 0…3', () => {
    for (let l = 0; l <= 3; l++) for (const m of mValues(l)) expect(overlap(l, m, l, m)).toBeCloseTo(1, 3);
  });
  it('son ortogonales', () => {
    expect(overlap(1, 0, 1, 1)).toBeCloseTo(0, 3);
    expect(overlap(2, -2, 2, 2)).toBeCloseTo(0, 3);
    expect(overlap(3, 0, 1, 0)).toBeCloseTo(0, 3);
  });
  it('valores analíticos conocidos', () => {
    expect(realSphericalHarmonic(0, 0, 1, 2)).toBeCloseTo(1 / (2 * Math.sqrt(Math.PI)), 10);
    // pz = sqrt(3/4π)·cosθ
    expect(realSphericalHarmonic(1, 0, 0, 0)).toBeCloseTo(Math.sqrt(3 / (4 * Math.PI)), 10);
    // dz² en el plano xy: −(1/4)·sqrt(5/π)·1 → magnitud sqrt(5/π)/4
    expect(Math.abs(realSphericalHarmonic(2, 0, Math.PI / 2, 0))).toBeCloseTo(Math.sqrt(5 / Math.PI) / 4, 10);
  });
});

describe('Regla de Hund y Pauli', () => {
  it('llena primero con espín paralelo y luego aparea', () => {
    expect(hundBoxes(1, 3)).toEqual([1, 1, 1]);
    expect(hundBoxes(1, 4)).toEqual([2, 1, 1]);
    expect(hundBoxes(2, 6)).toEqual([2, 1, 1, 1, 1]);
    expect(() => hundBoxes(0, 3)).toThrow();
  });
  it('electrones desapareados: O (2), N (3), Fe 3d⁶ (4), Cr 3d⁵ (5)', () => {
    const o = bySymbol('O')!.configuration.subshells.find((s) => s.n === 2 && s.l === 1)!;
    expect(unpaired(1, o.electrons)).toBe(2);
    expect(unpaired(1, 3)).toBe(3);
    expect(unpaired(2, 6)).toBe(4);
    expect(unpaired(2, 5)).toBe(5);
  });
});
