/**
 * Orbitales atómicos: parte ANGULAR de las funciones hidrogenoides (armónicos esféricos reales).
 *
 * Alcance declarado: la forma mostrada es |Y_lm(θ, φ)| (superficie polar), la representación
 * habitual de "forma de orbital" en libros de texto. No incluye la parte radial R_nl(r), ni
 * efectos de apantallamiento o correlación de átomos polielectrónicos: es una aproximación
 * pedagógica, no una densidad electrónica calculada del átomo real.
 */

function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

/** Polinomio asociado de Legendre P_l^m(x), m ≥ 0 (sin fase de Condon-Shortley). */
export function assocLegendre(l: number, m: number, x: number): number {
  let pmm = 1;
  if (m > 0) {
    const s = Math.sqrt(Math.max(0, (1 - x) * (1 + x)));
    let fact = 1;
    for (let i = 1; i <= m; i++) {
      pmm *= fact * s;
      fact += 2;
    }
  }
  if (l === m) return pmm;
  let pmmp1 = x * (2 * m + 1) * pmm;
  if (l === m + 1) return pmmp1;
  let pll = 0;
  for (let ll = m + 2; ll <= l; ll++) {
    pll = (x * (2 * ll - 1) * pmmp1 - (ll + m - 1) * pmm) / (ll - m);
    pmm = pmmp1;
    pmmp1 = pll;
  }
  return pll;
}

/** Armónico esférico real normalizado Y_lm(θ, φ). θ: ángulo polar desde +z. */
export function realSphericalHarmonic(l: number, m: number, theta: number, phi: number): number {
  const am = Math.abs(m);
  const n = Math.sqrt(((2 * l + 1) / (4 * Math.PI)) * (factorial(l - am) / factorial(l + am)));
  const p = assocLegendre(l, am, Math.cos(theta));
  if (m === 0) return n * p;
  if (m > 0) return Math.SQRT2 * n * p * Math.cos(am * phi);
  return Math.SQRT2 * n * p * Math.sin(am * phi);
}

export const ORBITAL_NAMES: Record<number, Record<number, string>> = {
  0: { 0: 's' },
  1: { [-1]: 'py', 0: 'pz', 1: 'px' },
  2: { [-2]: 'dxy', [-1]: 'dyz', 0: 'dz²', 1: 'dxz', 2: 'dx²−y²' },
  3: { [-3]: 'fy(3x²−y²)', [-2]: 'fxyz', [-1]: 'fyz²', 0: 'fz³', 1: 'fxz²', 2: 'fz(x²−y²)', 3: 'fx(x²−3y²)' },
};

export function mValues(l: number): number[] {
  const out: number[] = [];
  for (let m = -l; m <= l; m++) out.push(m);
  return out;
}

/**
 * Ocupación de las cajas de un subnivel según el principio de exclusión de Pauli y la regla
 * de Hund (primero un electrón por orbital con espín paralelo, después se aparean).
 * Devuelve, por orbital, el número de electrones (0, 1 o 2).
 */
export function hundBoxes(l: number, electrons: number): number[] {
  const k = 2 * l + 1;
  if (electrons < 0 || electrons > 2 * k) throw new Error(`Electrones fuera de rango para l=${l}: ${electrons}`);
  const boxes = new Array(k).fill(0);
  for (let i = 0; i < electrons; i++) boxes[i % k] += 1;
  return boxes;
}

/** Electrones desapareados de un subnivel según la regla de Hund. */
export function unpaired(l: number, electrons: number): number {
  return hundBoxes(l, electrons).filter((b) => b === 1).length;
}
