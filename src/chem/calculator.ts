/**
 * Calculadora química: algoritmos puros (sin interfaz) y verificados en tests/calculator.test.ts.
 *
 *  - Interpretación de fórmulas: paréntesis/corchetes anidados, hidratos (·, *), cargas (^2-, NH4+).
 *  - Masa molar y composición, con masas atómicas de PubChem.
 *  - Estados de oxidación por reglas estándar (con detección de casos en que no aplican).
 *  - Ajuste de ecuaciones por álgebra lineal exacta (fracciones con BigInt): conserva átomos y carga.
 *  - Estequiometría, reactivo limitante, conversiones, disoluciones y fórmula empírica.
 *
 * Constantes SI exactas (redefinición de 2019): N_A = 6,02214076·10²³ mol⁻¹; R = 8,314462618 J·mol⁻¹·K⁻¹.
 */
import { bySymbol, element, FAMILIES } from './elements';

export const AVOGADRO = 6.02214076e23;
export const R_GAS = 8.314462618;

export class FormulaError extends Error {}

/* =============================== fórmulas =============================== */

export interface ParsedFormula {
  /** Recuento de átomos por número atómico. */
  counts: Map<number, number>;
  charge: number;
  /** Representación normalizada, p. ej. "CuSO4·5H2O". */
  text: string;
}

const SUB: Record<string, string> = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
const SUP: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-' };

function normalize(s: string): string {
  let out = '';
  let sup = '';
  for (const ch of s.trim()) {
    if (SUB[ch]) out += SUB[ch];
    else if (SUP[ch]) sup += SUP[ch];
    else out += ch;
  }
  if (sup) out += '^' + sup;
  return out.replace(/\s+/g, '').replace(/[·•∙*]/g, '·');
}

/** Extrae la carga final: "^2-", "^+", "^3+", o signos sueltos al final ("NH4+", "Cl-", "O--"). */
function splitCharge(s: string): [string, number] {
  let m = /\^\{?(\d*)([+-])\}?$/.exec(s) ?? /\^\{?([+-])(\d*)\}?$/.exec(s);
  if (m) {
    const [a, b] = /\d/.test(m[1]) || m[1] === '' ? [m[1], m[2]] : [m[2], m[1]];
    const n = a === '' ? 1 : Number(a);
    return [s.slice(0, m.index), b === '-' ? -n : n];
  }
  m = /([+-]+)$/.exec(s);
  if (m) {
    const sign = m[1][0] === '-' ? -1 : 1;
    if (![...m[1]].every((c) => c === m![1][0])) throw new FormulaError('Carga mal escrita: usa, por ejemplo, SO4^2- o Fe^3+.');
    return [s.slice(0, m.index), sign * m[1].length];
  }
  return [s, 0];
}

function parseGroup(s: string, i: number, close: string | null, out: Map<number, number>, mult: number): number {
  while (i < s.length) {
    const ch = s[i];
    if (ch === ')' || ch === ']' || ch === '}') {
      if (ch !== close) throw new FormulaError(`Paréntesis no emparejado en la posición ${i + 1}.`);
      return i;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      const want = ch === '(' ? ')' : ch === '[' ? ']' : '}';
      const inner = new Map<number, number>();
      const end = parseGroup(s, i + 1, want, inner, 1);
      if (end >= s.length) throw new FormulaError('Falta cerrar un paréntesis.');
      i = end + 1;
      const m = /^\d+/.exec(s.slice(i));
      const k = m ? Number(m[0]) : 1;
      if (m) i += m[0].length;
      for (const [z, c] of inner) out.set(z, (out.get(z) ?? 0) + c * k * mult);
      continue;
    }
    const m = /^([A-Z][a-z]?)(\d*)/.exec(s.slice(i));
    if (!m) throw new FormulaError(`Carácter inesperado "${ch}" en la posición ${i + 1}. Los símbolos empiezan con mayúscula (Na, Cl, O…).`);
    const e = bySymbol(m[1]);
    if (!e || e.symbol !== m[1]) throw new FormulaError(`"${m[1]}" no es un símbolo químico.`);
    const k = m[2] ? Number(m[2]) : 1;
    if (k === 0) throw new FormulaError('Un subíndice no puede ser 0.');
    out.set(e.z, (out.get(e.z) ?? 0) + k * mult);
    i += m[0].length;
  }
  if (close) throw new FormulaError('Falta cerrar un paréntesis.');
  return i;
}

export function parseFormula(input: string): ParsedFormula {
  const norm = normalize(input);
  if (!norm) throw new FormulaError('Escribe una fórmula, por ejemplo H2O, Ca(OH)2 o CuSO4·5H2O.');
  const [body, charge] = splitCharge(norm);
  const counts = new Map<number, number>();
  for (const part of body.split('·')) {
    if (!part) throw new FormulaError('Falta una parte de la fórmula alrededor de "·".');
    const m = /^(\d+)(.*)$/.exec(part);
    const k = m ? Number(m[1]) : 1;
    const rest = m ? m[2] : part;
    if (!rest) throw new FormulaError('Un coeficiente debe ir seguido de una fórmula.');
    const local = new Map<number, number>();
    parseGroup(rest, 0, null, local, 1);
    for (const [z, c] of local) counts.set(z, (counts.get(z) ?? 0) + c * k);
  }
  return { counts, charge, text: norm };
}

/* =============================== masa y composición =============================== */

export interface CompositionRow {
  z: number;
  symbol: string;
  name: string;
  count: number;
  atomicMass: number;
  massContribution: number;
  massPercent: number;
  atomPercent: number;
}

export interface FormulaAnalysis {
  formula: ParsedFormula;
  molarMass: number;
  totalAtoms: number;
  rows: CompositionRow[];
  empirical: string;
  /** Elementos cuya masa en la fuente corresponde a un isótopo concreto (sin masa estándar). */
  nonStandard: string[];
}

export function hill(counts: Map<number, number>): string {
  const sym = (z: number) => element(z).symbol;
  const zs = [...counts.keys()];
  const hasC = counts.has(6);
  const order = hasC ? [6, ...(counts.has(1) ? [1] : []), ...zs.filter((z) => z !== 6 && z !== 1).sort((a, b) => sym(a).localeCompare(sym(b)))] : zs.sort((a, b) => sym(a).localeCompare(sym(b)));
  return order.map((z) => sym(z) + (counts.get(z)! > 1 ? counts.get(z) : '')).join('');
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));

export function analyzeFormula(input: string): FormulaAnalysis {
  const f = parseFormula(input);
  let M = 0;
  let total = 0;
  for (const [z, c] of f.counts) {
    const m = element(z).mass.value;
    if (m === null) throw new FormulaError(`La fuente no da masa para ${element(z).symbol}.`);
    M += m * c;
    total += c;
  }
  const rows: CompositionRow[] = [...f.counts.entries()].map(([z, c]) => {
    const e = element(z);
    const am = e.mass.value!;
    return { z, symbol: e.symbol, name: e.name, count: c, atomicMass: am, massContribution: am * c, massPercent: (am * c * 100) / M, atomPercent: (c * 100) / total };
  });
  rows.sort((a, b) => b.massPercent - a.massPercent);
  const g = [...f.counts.values()].reduce((a, b) => gcd(a, b));
  const emp = new Map([...f.counts].map(([z, c]) => [z, c / g]));
  return { formula: f, molarMass: M, totalAtoms: total, rows, empirical: hill(emp), nonStandard: rows.filter((r) => element(r.z).massNote).map((r) => r.symbol) };
}

/* =============================== estados de oxidación =============================== */

export interface OxidationResult {
  states: { z: number; symbol: string; value: number | null; average: boolean; rule: string }[];
  consistent: boolean;
  notes: string[];
}

const METAL_FAMILIES = new Set(['alkali', 'alkaline-earth', 'transition', 'post-transition', 'lanthanide', 'actinide']);
const isMetal = (z: number) => METAL_FAMILIES.has(element(z).family);

/**
 * Asignación por reglas habituales de los libros de texto, en orden de prioridad:
 * F = −1; metales del grupo 1 = +1, grupo 2 = +2, Al = +3; H = +1 (−1 si solo hay metales);
 * O = −2 (si no hay F); Cl/Br/I = −1 si no hay O ni un halógeno más electronegativo.
 * El elemento restante se deduce de la carga total. Si quedan dos o más sin regla, se indica que
 * hace falta la estructura. Si la suma no cuadra (peróxidos, superóxidos…), se advierte.
 */
export function oxidationStates(input: string): OxidationResult {
  const f = parseFormula(input);
  const zs = [...f.counts.keys()];
  const notes: string[] = [];
  const st = new Map<number, { value: number | null; rule: string; average?: boolean }>();
  if (zs.length === 1) {
    const z = zs[0];
    const v = f.charge / f.counts.get(z)!;
    return { states: [{ z, symbol: element(z).symbol, value: v, average: !Number.isInteger(v), rule: f.charge ? 'Ion monoatómico/homonuclear: carga ÷ átomos' : 'Sustancia elemental: 0' }], consistent: true, notes };
  }
  const has = (z: number) => f.counts.has(z);
  if (has(9)) st.set(9, { value: -1, rule: 'El flúor siempre es −1 en compuestos' });
  for (const z of zs) {
    const g = element(z).group;
    if (g === 1 && z !== 1) st.set(z, { value: 1, rule: 'Metal alcalino: +1' });
    if (g === 2) st.set(z, { value: 2, rule: 'Metal alcalinotérreo: +2' });
    if (z === 13) st.set(z, { value: 3, rule: 'Aluminio: +3' });
  }
  if (has(1)) {
    const others = zs.filter((z) => z !== 1);
    if (others.every(isMetal)) st.set(1, { value: -1, rule: 'Hidrógeno en hidruros metálicos: −1' });
    else st.set(1, { value: 1, rule: 'Hidrógeno unido a no metales: +1' });
  }
  if (has(8) && !has(9)) st.set(8, { value: -2, rule: 'Oxígeno: −2 (salvo peróxidos y con flúor)' });
  for (const z of [17, 35, 53]) {
    if (!has(z) || st.has(z)) continue;
    const moreEN = zs.some((o) => o !== z && (o === 8 || o === 9 || ([17, 35].includes(o) && o < z)));
    if (!moreEN) st.set(z, { value: -1, rule: 'Halógeno combinado con elementos menos electronegativos: −1' });
  }
  const unknown = zs.filter((z) => !st.has(z));
  const known = [...st.entries()].reduce((s, [z, v]) => s + (v.value ?? 0) * f.counts.get(z)!, 0);
  let consistent = true;
  if (unknown.length === 1) {
    const z = unknown[0];
    const v = (f.charge - known) / f.counts.get(z)!;
    const avg = !Number.isInteger(Math.round(v * 1e9) / 1e9);
    st.set(z, { value: v, rule: avg ? 'Deducido de la carga total (valor promedio: hay átomos en estados distintos)' : 'Deducido de la carga total', average: avg });
    if (!avg && !element(z).oxidationStates.map((s) => Number(s.replace('+', ''))).includes(v)) notes.push(`${element(z).symbol} ${fmtOx(v)} no figura entre los estados de oxidación comunes que lista la fuente.`);
    if (z === 6 && zs.includes(1)) notes.push('En compuestos orgánicos, cada carbono puede tener un estado distinto; el valor mostrado es el promedio.');
  } else if (unknown.length === 0) {
    if (known !== f.charge) {
      consistent = false;
      notes.push(`Las reglas simples no cuadran (suma ${fmtOx(known)} frente a carga ${fmtOx(f.charge)}). Puede tratarse de un peróxido (O −1), un superóxido u otra excepción: hace falta la estructura.`);
    }
  } else {
    notes.push(`Quedan ${unknown.length} elementos sin regla (${unknown.map((z) => element(z).symbol).join(', ')}): no se pueden determinar sin conocer la estructura.`);
  }
  for (const z of unknown.slice(1)) if (unknown.length > 1) st.set(z, { value: null, rule: 'Indeterminado sin estructura' });
  if (unknown.length > 1) st.set(unknown[0], { value: null, rule: 'Indeterminado sin estructura' });
  return {
    states: zs.map((z) => ({ z, symbol: element(z).symbol, value: st.get(z)!.value, average: !!st.get(z)!.average, rule: st.get(z)!.rule })),
    consistent,
    notes,
  };
}

export function fmtOx(v: number): string {
  if (!Number.isInteger(Math.round(v * 1e9) / 1e9)) {
    // fracción simple (p. ej. 8/3)
    for (let d = 2; d <= 12; d++) if (Math.abs(v * d - Math.round(v * d)) < 1e-9) return `${v > 0 ? '+' : '−'}${Math.abs(Math.round(v * d))}/${d}`;
    return v.toFixed(3);
  }
  return v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0';
}

/* =============================== fracciones exactas =============================== */

class Frac {
  constructor(
    public n: bigint,
    public d: bigint = 1n,
  ) {
    if (d === 0n) throw new Error('División por cero');
    if (d < 0n) {
      this.n = -n;
      this.d = -d;
    }
    const g = bgcd(this.n < 0n ? -this.n : this.n, this.d);
    if (g > 1n) {
      this.n /= g;
      this.d /= g;
    }
  }
  sub(o: Frac) {
    return new Frac(this.n * o.d - o.n * this.d, this.d * o.d);
  }
  mul(o: Frac) {
    return new Frac(this.n * o.n, this.d * o.d);
  }
  div(o: Frac) {
    return new Frac(this.n * o.d, this.d * o.n);
  }
  isZero() {
    return this.n === 0n;
  }
}
const bgcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : bgcd(b, a % b));
const blcm = (a: bigint, b: bigint) => (a / bgcd(a, b)) * b;

/* =============================== ecuaciones =============================== */

export interface Species {
  text: string;
  formula: ParsedFormula;
  molarMass: number;
}

export interface BalancedEquation {
  reactants: Species[];
  products: Species[];
  coefficients: number[];
  text: string;
}

function splitSide(s: string): string[] {
  // Las especies se separan con " + " (con espacios), para no confundir con cargas (NH4+).
  return s
    .split(/\s\+\s/)
    .map((x) => x.trim().replace(/^\d+\s*(?=[A-Z([])/, ''))
    .filter(Boolean);
}

export function parseEquation(eq: string): { reactants: string[]; products: string[] } {
  const parts = eq.split(/\s*(?:->|→|⟶|=|⇌|<=>)\s*/);
  if (parts.length !== 2) throw new FormulaError('Escribe la ecuación con una flecha: A + B -> C + D (separa las especies con " + ").');
  const reactants = splitSide(parts[0]);
  const products = splitSide(parts[1]);
  if (!reactants.length || !products.length) throw new FormulaError('Faltan reactivos o productos.');
  return { reactants, products };
}

const species = (t: string): Species => {
  const f = parseFormula(t);
  const M = [...f.counts].reduce((s, [z, c]) => s + (element(z).mass.value ?? NaN) * c, 0);
  return { text: f.text, formula: f, molarMass: M };
};

/**
 * Ajusta una ecuación química: busca el vector entero positivo más pequeño del núcleo de la
 * matriz de conservación (una fila por elemento y otra para la carga).
 */
export function balanceEquation(eq: string): BalancedEquation {
  const { reactants, products } = parseEquation(eq);
  const R = reactants.map(species);
  const P = products.map(species);
  const all = [...R, ...P];
  const els = [...new Set(all.flatMap((s) => [...s.formula.counts.keys()]))];
  const rowsZ = [...els];
  const rows: Frac[][] = rowsZ.map((z) => all.map((s, j) => new Frac(BigInt((s.formula.counts.get(z) ?? 0) * (j < R.length ? 1 : -1)))));
  if (all.some((s) => s.formula.charge !== 0)) rows.push(all.map((s, j) => new Frac(BigInt(s.formula.charge * (j < R.length ? 1 : -1)))));
  for (const z of els) {
    const inR = R.some((s) => s.formula.counts.has(z));
    const inP = P.some((s) => s.formula.counts.has(z));
    if (inR !== inP) throw new FormulaError(`El elemento ${element(z).symbol} aparece solo en un lado: la ecuación no puede ajustarse.`);
  }
  // Reducción por filas (forma escalonada reducida)
  const n = all.length;
  const M = rows.map((r) => [...r]);
  const pivots: number[] = [];
  let r = 0;
  for (let c = 0; c < n && r < M.length; c++) {
    let p = r;
    while (p < M.length && M[p][c].isZero()) p++;
    if (p === M.length) continue;
    [M[r], M[p]] = [M[p], M[r]];
    const pv = M[r][c];
    M[r] = M[r].map((x) => x.div(pv));
    for (let i = 0; i < M.length; i++) {
      if (i === r || M[i][c].isZero()) continue;
      const k = M[i][c];
      M[i] = M[i].map((x, j) => x.sub(k.mul(M[r][j])));
    }
    pivots.push(c);
    r++;
  }
  const free = [...Array(n).keys()].filter((c) => !pivots.includes(c));
  if (free.length === 0) throw new FormulaError('La ecuación no tiene solución: no se conservan los átomos.');
  if (free.length > 1) throw new FormulaError('La ecuación admite varias combinaciones independientes de coeficientes (suele ser una suma de reacciones). Sepárala o añade información.');
  const fc = free[0];
  const sol: Frac[] = Array(n).fill(null);
  sol[fc] = new Frac(1n);
  pivots.forEach((c, i) => (sol[c] = new Frac(-M[i][fc].n, M[i][fc].d)));
  const den = sol.reduce((a, x) => blcm(a, x.d), 1n);
  let ints = sol.map((x) => (x.n * den) / x.d);
  if (ints.every((x) => x <= 0n)) ints = ints.map((x) => -x);
  if (ints.some((x) => x <= 0n)) throw new FormulaError('No existe un ajuste con todos los coeficientes positivos: revisa reactivos y productos.');
  const g = ints.reduce((a, b) => bgcd(a, b));
  const coef = ints.map((x) => Number(x / g));
  const side = (list: Species[], off: number) => list.map((s, i) => `${coef[i + off] > 1 ? coef[i + off] + ' ' : ''}${s.text}`).join(' + ');
  return { reactants: R, products: P, coefficients: coef, text: `${side(R, 0)} → ${side(P, R.length)}` };
}

/* =============================== estequiometría =============================== */

export interface StoichRow {
  text: string;
  role: 'reactivo' | 'producto';
  coefficient: number;
  molarMass: number;
  givenMol: number | null;
  mol: number;
  mass: number;
  excessMol?: number;
  limiting?: boolean;
}

/**
 * Cantidades de todas las especies a partir de las cantidades conocidas (moles) de una o más.
 * Con varios reactivos conocidos se determina el reactivo limitante (menor n/coeficiente).
 */
export function stoichiometry(eq: BalancedEquation, givenMol: (number | null)[]): { rows: StoichRow[]; extent: number; limiting: number | null } {
  const all = [...eq.reactants, ...eq.products];
  const known = givenMol.map((g, i) => (g !== null && g >= 0 ? { i, x: g / eq.coefficients[i] } : null)).filter(Boolean) as { i: number; x: number }[];
  if (!known.length) throw new FormulaError('Indica la cantidad de al menos una especie.');
  const knownR = known.filter((k) => k.i < eq.reactants.length);
  const pick = knownR.length ? knownR.reduce((a, b) => (b.x < a.x ? b : a)) : known[0];
  const extent = pick.x;
  const rows: StoichRow[] = all.map((s, i) => {
    const mol = eq.coefficients[i] * extent;
    const isR = i < eq.reactants.length;
    const g = givenMol[i];
    return {
      text: s.text,
      role: isR ? 'reactivo' : 'producto',
      coefficient: eq.coefficients[i],
      molarMass: s.molarMass,
      givenMol: g,
      mol,
      mass: mol * s.molarMass,
      excessMol: isR && g !== null ? g - mol : undefined,
      limiting: knownR.length > 1 && isR && i === pick.i,
    };
  });
  return { rows, extent, limiting: knownR.length > 1 ? pick.i : null };
}

/* =============================== conversiones y disoluciones =============================== */

export const massToMol = (mass: number, M: number) => mass / M;
export const molToMass = (mol: number, M: number) => mol * M;
export const molToParticles = (mol: number) => mol * AVOGADRO;
export const particlesToMol = (n: number) => n / AVOGADRO;

/** Gas ideal: V (L) = nRT/P, con T en K y P en kPa. */
export const idealGasVolume = (mol: number, T = 273.15, P = 101.325) => (mol * R_GAS * T) / P;

/** Molaridad (mol/L) a partir de masa de soluto (g), masa molar y volumen (L). */
export const molarity = (mass: number, M: number, volumeL: number) => mass / M / volumeL;

/** Dilución C₁V₁ = C₂V₂: resuelve la variable que falta (null). */
export function dilution(v: { c1: number | null; v1: number | null; c2: number | null; v2: number | null }) {
  const missing = Object.entries(v).filter(([, x]) => x === null);
  if (missing.length !== 1) throw new FormulaError('Deja vacía exactamente una de las cuatro magnitudes.');
  const { c1, v1, c2, v2 } = v;
  if (c1 === null) return { ...v, c1: (c2! * v2!) / v1! };
  if (v1 === null) return { ...v, v1: (c2! * v2!) / c1 };
  if (c2 === null) return { ...v, c2: (c1 * v1) / v2! };
  return { ...v, v2: (c1 * v1) / c2 };
}

/* =============================== fórmula empírica =============================== */

/** Fórmula empírica a partir de porcentajes en masa; opcionalmente la molecular con la masa molar. */
export function empiricalFromPercent(input: { symbol: string; percent: number }[], molarMass?: number) {
  const rows = input.map((r) => {
    const e = bySymbol(r.symbol);
    if (!e) throw new FormulaError(`"${r.symbol}" no es un símbolo químico.`);
    return { z: e.z, mol: r.percent / e.mass.value! };
  });
  const min = Math.min(...rows.map((r) => r.mol));
  const ratios = rows.map((r) => r.mol / min);
  let mult = 1;
  for (let k = 1; k <= 8; k++) {
    if (ratios.every((x) => Math.abs(x * k - Math.round(x * k)) < 0.1)) {
      mult = k;
      break;
    }
    if (k === 8) throw new FormulaError('Las proporciones no se aproximan a números enteros pequeños: revisa los porcentajes.');
  }
  const counts = new Map(rows.map((r, i) => [r.z, Math.round(ratios[i] * mult)]));
  const empirical = hill(counts);
  const Memp = [...counts].reduce((s, [z, c]) => s + element(z).mass.value! * c, 0);
  let molecular: string | null = null;
  if (molarMass) {
    const k = Math.round(molarMass / Memp);
    if (k >= 1) molecular = hill(new Map([...counts].map(([z, c]) => [z, c * k])));
  }
  const total = input.reduce((s, r) => s + r.percent, 0);
  return { empirical, empiricalMass: Memp, molecular, ratios, sumPercent: total };
}

export function familyName(z: number) {
  return FAMILIES[element(z).family].name;
}
