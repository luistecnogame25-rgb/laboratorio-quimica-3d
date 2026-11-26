/**
 * Analizador de enlaces entre dos elementos.
 *
 * Sigue el árbol de decisión del «Analizador de Enlaces» del autor (gas noble → mismo elemento →
 * metal + metal → metal + no metal con Δχ ≥ 1,7 → covalente; y la clasificación de semiconductores
 * intrínsecos / extrínsecos tipo N o P), con estas correcciones:
 *  - un metal consigo mismo es enlace metálico (no covalente);
 *  - el carbono (diamante) no se clasifica como semiconductor intrínseco: es un aislante de banda ancha;
 *  - la familia del semiconductor se revisa aunque el enlace tenga carácter iónico parcial (ZnO);
 *  - el dopaje (Si + P, Si + B…) no forma un compuesto: el dopante está en trazas;
 *  - las fórmulas se predicen equilibrando cargas con los estados de oxidación de la fuente (MgCl₂, no «MgCl»).
 *
 * Añade clasificaciones: polaridad y extremo δ⁻, % de carácter iónico (Pauling), σ/π, octeto y Lewis,
 * enlace coordinado, función química inorgánica, fórmula y nombre, tipo de sólido, aleaciones,
 * comportamiento eléctrico, familia IV-VI de semiconductores y fuerzas intermoleculares esperadas.
 *
 * Todo lo que sale de aquí es CALCULADO a partir de los datos de la fuente (PubChem) o una PREDICCIÓN
 * por reglas de libro de texto; la interfaz lo etiqueta como tal. Nada de esto crea un enlace.
 */
import { element, FAMILIES, type ChemElement } from './elements';
import { hillFormula } from './formula';
import { findByComposition } from './structures';
import { typicalValence } from './bonding';

export type BondTypeId = 'ionico' | 'covalente-polar' | 'covalente-no-polar' | 'metalico' | 'sin-dato';

export interface Classified {
  name: string;
  detail: string;
}

export interface FormulaPrediction {
  formula: string; // "Fe2O3"
  name: string; // "óxido de hierro(III)"
  documented: string | null; // nombre del registro de la biblioteca si existe
  /** Registro de la biblioteca (para verlo en 3D): molécula de PubChem o red cristalina de la COD. */
  recordId: string | null;
}

export interface Semiconductor {
  kind: 'intrinseco' | 'extrinseco' | 'no';
  label: string;
  family: string | null; // "III-V", "Elemental (grupo 14)"…
  pn: 'N' | 'P' | null;
  detail: string;
}

export interface BondAnalysis {
  ok: true;
  a: ChemElement;
  b: ChemElement;
  same: boolean;
  type: BondTypeId;
  typeLabel: string;
  dChi: number | null;
  ionicPercent: number | null;
  negativeEnd: ChemElement | null;
  order: number | null;
  sigmaPi: string | null;
  justification: string[];
  octet: string[];
  coordinate: string | null;
  func: Classified;
  formulas: FormulaPrediction[];
  formulaNote: string;
  solid: Classified;
  electrical: Classified;
  semiconductor: Semiconductor;
  alloy: Classified | null;
  intermolecular: string[];
  notes: string[];
}

export type BondAnalysisResult = BondAnalysis | { ok: false; a: ChemElement; b: ChemElement; reason: string; notes: string[] };

/* ------------------------------ utilidades ------------------------------ */

export const IONIC_THRESHOLD = 1.7;
export const POLAR_THRESHOLD = 0.4;
const JOIN = ['', '–', '=', '≡'];
const SIGMA_PI = ['', '1 σ', '1 σ + 1 π', '1 σ + 2 π'];
const DIATOMIC = new Set([1, 7, 8, 9, 17, 35, 53]);

export const isMetal = (e: ChemElement) => !['nonmetal', 'halogen', 'noble-gas', 'metalloid'].includes(e.family);
const isHalogen = (e: ChemElement) => e.family === 'halogen';
const lower = (e: ChemElement) => e.name.toLowerCase();

function oxStates(e: ChemElement): number[] {
  return e.oxidationStates.map((s) => Number(s.replace('+', ''))).filter((n) => Number.isInteger(n) && n !== 0);
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));

/** % de carácter iónico según Pauling: 100·(1 − e^(−Δχ²/4)). Estimación. */
export function paulingIonicPercent(dChi: number): number {
  return 100 * (1 - Math.exp(-(dChi * dChi) / 4));
}

const ANION: Record<number, string> = {
  1: 'hidruro',
  5: 'boruro',
  6: 'carburo',
  7: 'nitruro',
  8: 'óxido',
  9: 'fluoruro',
  14: 'siliciuro',
  15: 'fosfuro',
  16: 'sulfuro',
  17: 'cloruro',
  33: 'arseniuro',
  34: 'seleniuro',
  35: 'bromuro',
  51: 'antimoniuro',
  52: 'telururo',
  53: 'yoduro',
};
const HYDRACID: Record<number, string> = { 9: 'fluorhídrico', 17: 'clorhídrico', 35: 'bromhídrico', 53: 'yodhídrico', 16: 'sulfhídrico', 34: 'selenhídrico', 52: 'telurhídrico' };
const NONMETAL_HYDRIDE: Record<number, string> = { 5: 'borano (existe como diborano, B₂H₆)', 6: 'metano', 7: 'amoníaco', 14: 'silano', 15: 'fosfano (fosfina)', 32: 'germano', 33: 'arsano (arsina)', 51: 'estibano' };
const PREFIX = ['', 'mono', 'di', 'tri', 'tetra', 'penta', 'hexa', 'hepta', 'octa'];
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

function anionName(e: ChemElement): string {
  return ANION[e.z] ?? `${lower(e)}uro`;
}

function prefixed(n: number, word: string, forceMono: boolean): string {
  if (n === 1 && !forceMono) return word;
  const p = PREFIX[n] ?? `${n}-`;
  // Elisión con «óxido»: monóxido, tetróxido, pentóxido
  if (word.startsWith('ó') && (p.endsWith('o') || p.endsWith('a')) && ['mono', 'tetra', 'penta'].includes(p)) return p.slice(0, -1) + word;
  return p + word;
}

const fmt = (sym: string, n: number) => `${sym}${n > 1 ? n : ''}`;

/* ------------------------------ semiconductores ------------------------------ */

const G13 = new Set([5, 13, 31, 49]); // B Al Ga In
const G15 = new Set([7, 15, 33, 51]); // N P As Sb
const G12 = new Set([30, 48, 80]); // Zn Cd Hg
const G16 = new Set([8, 16, 34, 52]); // O S Se Te
const IV_VI_CAT = new Set([32, 50, 82]); // Ge Sn Pb
const IV_VI_AN = new Set([16, 34, 52]); // S Se Te
const ELEMENTAL_SC = new Set([5, 14, 32, 34, 52]); // B Si Ge Se Te
const HOSTS = new Set([14, 32]); // Si Ge
const DOPANT_P = new Set([5, 13, 31, 49]); // B Al Ga In → aceptores
const DOPANT_N = new Set([15, 33, 51]); // P As Sb → donadores
const pair = (A: ChemElement, B: ChemElement, s1: Set<number>, s2: Set<number>) => (s1.has(A.z) && s2.has(B.z)) || (s1.has(B.z) && s2.has(A.z));

export function classifySemiconductor(A: ChemElement, B: ChemElement): Semiconductor {
  const no = (detail: string): Semiconductor => ({ kind: 'no', label: 'No es un semiconductor', family: null, pn: null, detail });
  if (A.z === B.z) {
    if (ELEMENTAL_SC.has(A.z))
      return { kind: 'intrinseco', label: 'Semiconductor intrínseco', family: `Elemental (grupo ${A.group})`, pn: null, detail: `El ${lower(A)} puro es un semiconductor: conduce poco a baja temperatura y más al aumentarla, porque los electrones saltan la banda prohibida.` };
    if (A.z === 6) return no('El carbono como diamante es un aislante de banda prohibida muy ancha; como grafito conduce (semimetal). Por eso no se clasifica como semiconductor intrínseco.');
    if (A.z === 50) return no('El estaño gris (α-Sn, por debajo de 13 °C) es un semimetal; el estaño blanco, la forma habitual, es un metal.');
    return no('Esta sustancia elemental no pertenece a las familias de semiconductores.');
  }
  // Extrínseco: Si o Ge con un dopante del grupo 13 (P) o 15 (N)
  const host = HOSTS.has(A.z) ? A : HOSTS.has(B.z) ? B : null;
  const dop = host ? (host === A ? B : A) : null;
  if (host && dop && (DOPANT_P.has(dop.z) || DOPANT_N.has(dop.z))) {
    const n = DOPANT_N.has(dop.z);
    return {
      kind: 'extrinseco',
      label: `Semiconductor extrínseco tipo ${n ? 'N' : 'P'}`,
      family: `${host.symbol} dopado con ${dop.symbol}`,
      pn: n ? 'N' : 'P',
      detail: n
        ? `${dop.name} (${dop.valenceElectrons} e⁻ de valencia) es DONADOR: al ocupar el lugar de un ${host.symbol} (4 e⁻) sobra un electrón libre; los portadores mayoritarios son electrones (carga negativa).`
        : `${dop.name} (${dop.valenceElectrons} e⁻ de valencia) es ACEPTOR: al ocupar el lugar de un ${host.symbol} (4 e⁻) falta un electrón y queda un hueco; los portadores mayoritarios son huecos (carga positiva).`,
    };
  }
  if (pair(A, B, new Set([6, 14, 32]), new Set([6, 14, 32])))
    return { kind: 'intrinseco', label: 'Semiconductor intrínseco (compuesto)', family: 'IV-IV', pn: null, detail: 'Dos elementos del grupo 14 (p. ej. SiC, SiGe): cada átomo comparte 4 electrones en una red como la del diamante.' };
  if (pair(A, B, G13, G15))
    return { kind: 'intrinseco', label: 'Semiconductor intrínseco (compuesto)', family: 'III-V', pn: null, detail: 'Grupo 13 (3 e⁻) + grupo 15 (5 e⁻): de media 4 e⁻ por átomo, como en el silicio (p. ej. GaAs, InP, GaN). Algunos, como BN o AlN, tienen banda tan ancha que se comportan casi como aislantes.' };
  if (pair(A, B, G12, G16))
    return { kind: 'intrinseco', label: 'Semiconductor intrínseco (compuesto)', family: 'II-VI', pn: null, detail: 'Grupo 12 (2 e⁻) + grupo 16 (6 e⁻): de media 4 e⁻ por átomo (p. ej. ZnS, CdTe, ZnO). El enlace tiene carácter iónico parcial.' };
  if (pair(A, B, IV_VI_CAT, IV_VI_AN))
    return { kind: 'intrinseco', label: 'Semiconductor intrínseco (compuesto)', family: 'IV-VI', pn: null, detail: 'Grupo 14 (Ge, Sn, Pb) + calcógeno (S, Se, Te): semiconductores de banda estrecha, p. ej. PbS o PbTe, usados en detectores infrarrojos.' };
  return no('La pareja no pertenece a las familias de semiconductores (elementales, IV-IV, III-V, II-VI, IV-VI) ni es un dopaje de Si o Ge.');
}

/* ------------------------------ fórmulas y nombres ------------------------------ */

function lookup(zs: number[]): { documented: string | null; recordId: string | null } {
  const { exact, empirical } = findByComposition(hillFormula(zs));
  const r = exact[0] ?? empirical[0];
  return { documented: r?.name ?? null, recordId: r?.id ?? null };
}

function binaryName(cat: ChemElement, an: ChemElement, m: number, n: number, p: number): string {
  if (cat.z === 1 && HYDRACID[an.z]) return `${anionName(an)} de hidrógeno (en agua: ácido ${HYDRACID[an.z]})`;
  if (isMetal(cat)) {
    const states = oxStates(cat).filter((v) => v > 0);
    return `${anionName(an)} de ${lower(cat)}${states.length > 1 ? `(${ROMAN[p] ?? p})` : ''}`;
  }
  // No metal + no metal: nomenclatura con prefijos
  return `${prefixed(n, anionName(an), true)} de ${prefixed(m, lower(cat), false)}`;
}

/** Fórmulas binarias con carga total cero según los estados de oxidación de la fuente. */
export function predictFormulas(A: ChemElement, B: ChemElement): FormulaPrediction[] {
  if (A.z === B.z) return [];
  // Hidruros no metálicos (C, N, P, Si…): fórmula XHₙ con la valencia típica
  const h = A.z === 1 ? B : B.z === 1 ? A : null;
  if (h && NONMETAL_HYDRIDE[h.z]) {
    const n = typicalValence(h);
    const zs = [h.z, ...Array(n).fill(1)];
    return [{ formula: `${h.symbol}H${n > 1 ? n : ''}`, name: NONMETAL_HYDRIDE[h.z], ...lookup(zs) }];
  }
  if (h && h.z === 8) {
    return [
      { formula: 'H2O', name: 'agua (óxido de hidrógeno)', ...lookup([1, 1, 8]) },
      { formula: 'H2O2', name: 'peróxido de hidrógeno (agua oxigenada)', ...lookup([1, 1, 8, 8]) },
    ];
  }
  const [cat, an] = (A.electronegativity.value ?? 0) <= (B.electronegativity.value ?? 0) ? [A, B] : [B, A];
  const out: FormulaPrediction[] = [];
  const seen = new Set<string>();
  let pos = oxStates(cat).filter((v) => v > 0);
  const neg = oxStates(an).filter((v) => v < 0);
  if (cat.z === 1) pos = [1];
  for (const p of pos)
    for (const q of neg) {
      const l = (p * -q) / gcd(p, -q);
      const m = l / p;
      const n = l / -q;
      const f = fmt(cat.symbol, m) + fmt(an.symbol, n);
      if (seen.has(f)) continue;
      seen.add(f);
      out.push({ formula: f, name: binaryName(cat, an, m, n, p), ...lookup([...Array(m).fill(cat.z), ...Array(n).fill(an.z)]) });
    }
  return out.slice(0, 6);
}

/* ------------------------------ función química ------------------------------ */

const AMPHOTERIC = new Set([4, 13, 30, 31, 50, 82]); // Be Al Zn Ga Sn Pb

function chemicalFunction(A: ChemElement, B: ChemElement): Classified {
  if (A.z === B.z) return { name: 'Sustancia elemental', detail: 'Un solo elemento: no es un compuesto, así que no pertenece a ninguna función química inorgánica.' };
  if (isMetal(A) && isMetal(B)) return { name: 'Aleación (no es una función química)', detail: 'Dos metales se mezclan en una red metálica; si guardan una proporción fija forman compuestos intermetálicos.' };
  const other = (z: number) => (A.z === z ? B : B.z === z ? A : null);
  const o = other(8);
  if (o) {
    if (o.z === 1) return { name: 'Agua y peróxido de hidrógeno', detail: 'El hidrógeno con oxígeno forma agua (H₂O) y peróxido de hidrógeno (H₂O₂). El agua es el disolvente de los ácidos e hidróxidos.' };
    if (o.z === 9) return { name: 'Fluoruro de oxígeno (no es un óxido)', detail: 'El flúor es más electronegativo que el oxígeno: el compuesto OF₂ se nombra como fluoruro, porque el oxígeno actúa con número de oxidación positivo.' };
    if (isMetal(o))
      return AMPHOTERIC.has(o.z)
        ? { name: 'Óxido metálico anfótero', detail: `Óxido de un metal que reacciona tanto con ácidos como con bases (el ${lower(o)} es anfótero).` }
        : { name: 'Óxido metálico (óxido básico)', detail: 'Metal + oxígeno. Con agua forma un hidróxido (una base): p. ej. Na₂O + H₂O → 2 NaOH.' };
    return { name: 'Óxido no metálico (óxido ácido o anhídrido)', detail: 'No metal + oxígeno. Con agua forma un oxiácido: p. ej. CO₂ + H₂O → H₂CO₃. Algunos, como CO o NO, son óxidos neutros.' };
  }
  const hh = other(1);
  if (hh) {
    if (isMetal(hh)) return { name: 'Hidruro metálico', detail: 'Metal + hidrógeno: el hidrógeno actúa como H⁻ (hidruro), p. ej. NaH o CaH₂.' };
    if (HYDRACID[hh.z]) return { name: 'Hidrácido', detail: `Hidrógeno + ${isHalogen(hh) ? 'halógeno' : 'calcógeno'} (sin oxígeno). En estado gaseoso es un ${anionName(hh)} de hidrógeno; disuelto en agua es el ácido ${HYDRACID[hh.z]}.` };
    return { name: 'Hidruro no metálico', detail: 'Hidrógeno + no metal de los grupos 13 a 15: tienen nombres propios (metano, amoníaco, fosfano, silano…).' };
  }
  const metal = isMetal(A) ? A : isMetal(B) ? B : null;
  if (metal) {
    const nm = metal === A ? B : A;
    if (isHalogen(nm) || [16, 34, 52].includes(nm.z)) return { name: 'Sal binaria (sal haloidea)', detail: `Metal + no metal sin oxígeno: se nombra con la terminación -uro (${anionName(nm)} de ${lower(metal)}). Es la sal del ácido ${HYDRACID[nm.z] ?? ''}`.trim() + '.' };
    return { name: 'Compuesto binario metal–no metal', detail: `Se nombra con la terminación -uro: ${anionName(nm)} de ${lower(metal)} (nitruros, carburos, fosfuros…).` };
  }
  return { name: 'Compuesto binario covalente (no metal + no metal)', detail: 'Se nombra con prefijos que indican el número de átomos: monóxido, dióxido, tricloruro, pentafluoruro…' };
}

/* ------------------------------ análisis ------------------------------ */

const NETWORK = [
  [14, 8],
  [14, 7],
  [5, 6],
  [14, 6],
  [5, 7],
  [13, 7],
];

export function analyzeBond(za: number, zb: number, order: number | null = null): BondAnalysisResult {
  const A = element(za);
  const B = element(zb);
  const noble = [A, B].find((e) => e.family === 'noble-gas');
  if (noble) {
    const heavy = [36, 54, 86].includes(noble.z);
    return {
      ok: false,
      a: A,
      b: B,
      reason: `${noble.name} es un gas noble: tiene su capa de valencia completa y en el laboratorio no forma enlaces.`,
      notes: heavy ? [`Excepción: el ${lower(noble)} forma algunos compuestos con flúor u oxígeno en condiciones especiales (p. ej. XeF₂, KrF₂).`] : [],
    };
  }
  const same = A.z === B.z;
  const ca = A.electronegativity.value;
  const cb = B.electronegativity.value;
  const dChi = same ? 0 : ca !== null && cb !== null ? Math.abs(ca - cb) : null;
  const mA = isMetal(A);
  const mB = isMetal(B);
  const anyMetal = mA || mB;

  // 1) Tipo de enlace (árbol del autor, con la corrección del metal consigo mismo)
  let type: BondTypeId;
  if (mA && mB) type = 'metalico';
  else if (same) type = 'covalente-no-polar';
  else if (dChi === null) type = 'sin-dato';
  else if (anyMetal && dChi >= IONIC_THRESHOLD) type = 'ionico';
  else type = dChi < POLAR_THRESHOLD ? 'covalente-no-polar' : 'covalente-polar';
  const typeLabel = { ionico: 'Iónico', 'covalente-polar': 'Covalente polar', 'covalente-no-polar': 'Covalente no polar', metalico: 'Metálico', 'sin-dato': 'Sin dato de electronegatividad' }[type];

  const negativeEnd = dChi !== null && dChi >= POLAR_THRESHOLD && type !== 'metalico' ? (ca! > cb! ? A : B) : null;
  const ionicPercent = dChi !== null && type !== 'metalico' ? paulingIonicPercent(dChi) : null;
  const d = dChi?.toFixed(2).replace('.', ',');

  // 2) Justificación
  const justification: string[] = [];
  if (same && type === 'metalico') justification.push(`Ambos átomos son de ${lower(A)}, un metal: no forman un par aislado sino una red de cationes con los electrones de valencia deslocalizados («mar de electrones»).`);
  else if (same) justification.push(`Ambos átomos son del mismo elemento (${lower(A)}): los electrones se comparten por igual, Δχ = 0 → covalente no polar.`);
  else if (type === 'metalico') justification.push('Ambos elementos son metales: comparten sus electrones de valencia en un «mar de electrones» deslocalizado (enlace metálico).');
  else if (type === 'ionico') justification.push(`Metal + no metal con Δχ = ${d} ≥ 1,7: el metal cede electrones y el no metal los acepta (transferencia) → enlace iónico.`);
  else if (type === 'covalente-polar') justification.push(`Δχ = ${d}${anyMetal ? ' (con un metal, pero menor de 1,7)' : ''}: los electrones se comparten de forma desigual, desplazados hacia el ${lower(negativeEnd!)} (δ⁻) → covalente polar.`);
  else if (type === 'covalente-no-polar') justification.push(`Δχ = ${d} < 0,4: los electrones se comparten casi por igual → covalente no polar.`);
  else justification.push('La fuente no da electronegatividad para alguno de los dos elementos: no se puede estimar el tipo de enlace.');
  if (type !== 'metalico' && !same && dChi !== null) justification.push('Los límites 0,4 y 1,7 son orientativos: el carácter del enlace cambia de forma gradual.');

  // 3) Octeto y estructura de Lewis
  const octet: string[] = [];
  const ve = (e: ChemElement) => e.valenceElectrons;
  const describeShare = (e: ChemElement) => {
    const v = ve(e);
    if (v === null) return `${e.symbol}: electrones de valencia variables (bloque ${e.block}).`;
    const t = typicalValence(e);
    if (e.z === 1) return 'H: 1 e⁻ de valencia → forma 1 enlace y completa 2 e⁻ (dueto, como el helio).';
    const lp = v >= 4 ? (v - t) / 2 : 0;
    return `${e.symbol}: ${v} e⁻ de valencia → suele formar ${t} enlace${t === 1 ? '' : 's'}${lp ? ` y conserva ${lp} par${lp === 1 ? '' : 'es'} libre${lp === 1 ? '' : 's'}` : ''} para completar el octeto.`;
  };
  if (type === 'metalico') {
    for (const e of same ? [A] : [A, B]) octet.push(`${e.symbol}: aporta ${ve(e) ?? 'sus'} e⁻ de valencia al mar de electrones; no hay pares localizados ni octeto.`);
  } else if (type === 'ionico') {
    const [met, nm] = mA ? [A, B] : [B, A];
    const pos = oxStates(met).filter((v) => v > 0);
    const gain = ve(nm) !== null ? 8 - ve(nm)! : null;
    octet.push(
      met.block === 's' || (met.block === 'p' && pos.length === 1)
        ? `${met.symbol} cede ${pos[0] ?? ve(met)} e⁻ → ${met.symbol}${pos[0] && pos[0] > 1 ? pos[0] : ''}⁺ (queda con la configuración del gas noble anterior).`
        : `${met.symbol} puede ceder ${pos.join(' o ')} e⁻ (${pos.map((p) => `${met.symbol}${p > 1 ? p : ''}⁺`).join(', ')}) según los estados de oxidación de la fuente.`,
    );
    if (gain !== null) octet.push(`${nm.symbol} gana ${gain} e⁻ → ${nm.symbol}${gain > 1 ? gain : ''}⁻ (completa el octeto).`);
    octet.push('Los iones de carga opuesta se atraen y se ordenan en una red: no hay pares de electrones compartidos.');
  } else {
    if (same && DIATOMIC.has(A.z)) {
      const t = typicalValence(A);
      octet.push(`${A.symbol}${JOIN[t]}${A.symbol}: comparten ${t} par${t === 1 ? '' : 'es'} de electrones (${SIGMA_PI[t]}) y cada átomo completa ${A.z === 1 ? 'su dueto' : 'el octeto'}.`);
    } else for (const e of same ? [A] : [A, B]) octet.push(describeShare(e));
  }
  for (const e of same ? [A] : [A, B]) {
    if ((e.z === 4 || e.z === 5 || e.z === 13) && type !== 'metalico' && type !== 'ionico') octet.push(`Excepción: el ${lower(e)} puede quedar con octeto incompleto (p. ej. ${e.z === 5 ? 'BF₃' : e.z === 4 ? 'BeCl₂' : 'AlCl₃'}).`);
    if (!isMetal(e) && e.period >= 3 && e.family !== 'halogen' && type !== 'ionico' && [8, 9, 17].includes((e === A ? B : A).z)) octet.push(`Excepción: el ${lower(e)} (período ${e.period}) puede superar el octeto (octeto expandido, p. ej. PCl₅ o SF₆).`);
  }

  // 4) Enlace coordinado (dativo)
  const has = (z: number) => A.z === z || B.z === z;
  let coordinate: string | null = null;
  if (has(1) && (has(7) || has(8)) && !same) coordinate = `El ${has(7) ? 'nitrógeno' : 'oxígeno'} tiene pares libres: puede donar uno a un H⁺ y formar un enlace coordinado (${has(7) ? 'NH₄⁺' : 'H₃O⁺'}). Una vez formado, es igual a los demás.`;
  else if (has(6) && has(8) && !same) coordinate = 'En el monóxido de carbono (CO) uno de los tres pares lo aporta el oxígeno: el triple enlace tiene una componente coordinada.';
  else if (has(5) && (has(7) || has(9)) && !same) coordinate = 'El boro tiene un orbital vacío y acepta un par de electrones (BF₄⁻, NH₃–BF₃): enlace coordinado.';
  else if (anyMetal && !(mA && mB) && (A.family === 'transition' || B.family === 'transition') && [7, 8, 17].some(has))
    coordinate = 'Los metales de transición forman compuestos de coordinación: ligandos con pares libres (H₂O, NH₃, Cl⁻) los donan al ion metálico.';

  // 5) σ / π
  const ord = order ?? (same && DIATOMIC.has(A.z) ? typicalValence(A) : null);
  const sigmaPi = ord && type !== 'metalico' && type !== 'ionico' ? `${['', 'Simple', 'Doble', 'Triple'][ord]}: ${SIGMA_PI[ord]}` : null;

  // 6) Semiconductor, sólido, eléctrico, aleación
  const semiconductor = classifySemiconductor(A, B);
  let alloy: Classified | null = null;
  if (mA && mB && !same) {
    const ra = A.atomicRadius.value;
    const rb = B.atomicRadius.value;
    const diff = ra && rb ? Math.abs(ra - rb) / Math.max(ra, rb) : null;
    alloy =
      diff === null
        ? { name: 'Aleación', detail: 'No hay radio atómico en la fuente para comparar tamaños.' }
        : diff <= 0.15
          ? { name: 'Aleación sustitucional probable', detail: `Radios parecidos (diferencia ${Math.round(diff * 100)} % ≤ 15 %, regla de Hume-Rothery): los átomos de uno pueden sustituir a los del otro en la red (como Cu–Zn en el latón).` }
          : { name: 'Aleación con solubilidad limitada', detail: `Radios muy distintos (diferencia ${Math.round(diff * 100)} % > 15 %): se mezclan poco o forman compuestos intermetálicos con proporción fija.` };
  } else if (anyMetal && !same && [1, 5, 6, 7].some(has) && (A.family === 'transition' || B.family === 'transition')) {
    const small = [A, B].find((e) => [1, 5, 6, 7].includes(e.z))!;
    alloy = { name: 'Aleación intersticial posible', detail: `El ${lower(small)}, muy pequeño, puede ocupar los huecos de la red del metal (como el carbono en el hierro: acero).` };
  }

  const isNetwork = NETWORK.some(([x, y]) => pair(A, B, new Set([x]), new Set([y])));
  let solid: Classified;
  if (type === 'metalico')
    solid = same
      ? { name: 'Sólido metálico', detail: `Red de cationes de ${lower(A)} rodeados de electrones deslocalizados. Estado a temperatura ambiente según la fuente: ${A.state.text || 'sin dato'}.` }
      : { name: 'Sólido metálico (aleación)', detail: 'Red metálica con átomos de los dos metales.' };
  else if (type === 'ionico') solid = { name: 'Sólido iónico (red cristalina)', detail: 'Cationes y aniones alternados en una red: duro, frágil y con punto de fusión alto. No forma moléculas aisladas.' };
  else if (same) {
    const z = A.z;
    solid = DIATOMIC.has(z)
      ? { name: 'Sustancia molecular', detail: `Moléculas diatómicas ${A.symbol}₂ unidas por fuerzas de London débiles.` }
      : z === 6
        ? { name: 'Sólido de red covalente', detail: 'Diamante: red tridimensional de enlaces C–C (muy duro). Grafito: capas de anillos con electrones deslocalizados.' }
        : [5, 14, 32].includes(z)
          ? { name: 'Sólido de red covalente', detail: `Cada átomo de ${lower(A)} se une a sus vecinos en una red tridimensional.` }
          : z === 15
            ? { name: 'Molecular o polimérico', detail: 'Fósforo blanco: moléculas P₄; fósforo rojo y negro: redes covalentes.' }
            : z === 16
              ? { name: 'Sustancia molecular', detail: 'Anillos S₈ unidos por fuerzas de London.' }
              : [34, 52].includes(z)
                ? { name: 'Sólido de cadenas covalentes', detail: 'Cadenas helicoidales de átomos unidas entre sí por fuerzas débiles.' }
                : [33, 51].includes(z)
                  ? { name: 'Sólido de capas covalentes', detail: 'Capas plegadas de átomos; se comporta como semimetal.' }
                  : { name: 'Sustancia elemental', detail: 'Sin clasificación específica en esta app.' };
  } else if (isNetwork || semiconductor.kind === 'intrinseco') solid = { name: 'Sólido de red covalente', detail: 'Red tridimensional de enlaces covalentes (como SiO₂, SiC o GaAs): duro y con punto de fusión alto.' };
  else if (semiconductor.kind === 'extrinseco') solid = { name: `Cristal de ${semiconductor.family?.split(' ')[0] ?? ''} con impurezas`, detail: 'El dopante se añade en cantidades muy pequeñas (partes por millón) a la red del semiconductor: no forma un compuesto nuevo.' };
  else if (anyMetal) solid = { name: 'Enlace intermedio iónico-covalente', detail: 'Metal con no metal pero Δχ < 1,7 (p. ej. AlCl₃, FeS): la estructura depende del compuesto, entre red iónica y moléculas.' };
  else solid = { name: 'Sustancia molecular', detail: 'Moléculas discretas unidas entre sí por fuerzas intermoleculares: suelen ser gases, líquidos o sólidos blandos de bajo punto de fusión.' };

  let electrical: Classified;
  if (semiconductor.kind !== 'no') electrical = { name: semiconductor.label, detail: semiconductor.detail };
  else if (same && [6].includes(A.z)) electrical = { name: 'Aislante (diamante) o conductor (grafito)', detail: 'Depende de la forma alotrópica.' };
  else if (same && [33, 51, 83].includes(A.z)) electrical = { name: 'Semimetal', detail: 'Conduce, pero mucho menos que un metal típico: las bandas apenas se solapan.' };
  else if (type === 'metalico') electrical = { name: 'Conductor', detail: 'Los electrones deslocalizados se mueven libremente: conduce la electricidad y el calor.' };
  else if (type === 'ionico') electrical = { name: 'Aislante en estado sólido; conduce fundido o disuelto', detail: 'En el sólido los iones están fijos; fundido o disuelto en agua los iones se mueven (electrolito).' };
  else if (isNetwork) electrical = { name: 'Aislante', detail: 'Todos los electrones están en enlaces localizados de la red.' };
  else if (anyMetal) electrical = { name: 'Depende del compuesto', detail: 'Con enlace intermedio no se puede afirmar sin datos del compuesto concreto.' };
  else electrical = { name: 'Aislante', detail: `Moléculas neutras sin cargas libres.${HYDRACID[(A.z === 1 ? B : A).z] && has(1) ? ' En agua se ioniza (ácido) y la disolución sí conduce.' : ''}` };

  // 7) Fuerzas intermoleculares (solo sustancias moleculares)
  const intermolecular: string[] = [];
  if (solid.name.startsWith('Sustancia molecular') || solid.name.startsWith('Molecular')) {
    if (has(1) && [7, 8, 9].some(has) && !same) intermolecular.push('Puentes de hidrógeno: H unido a N, O o F atrae pares libres de moléculas vecinas.');
    if (type === 'covalente-polar') intermolecular.push('Dipolo-dipolo, si la molécula resulta polar (depende de su geometría: el CO₂ tiene enlaces polares pero es apolar).');
    intermolecular.push('Fuerzas de London (dispersión): existen entre todas las moléculas y crecen con su tamaño.');
  } else if (type === 'ionico') intermolecular.push('Ion-dipolo con disolventes polares: explica que muchas sales se disuelvan en agua.');

  // 8) Fórmulas
  let formulas: FormulaPrediction[] = [];
  let formulaNote = '';
  if (same) {
    formulaNote = DIATOMIC.has(A.z) ? `${A.symbol}₂: molécula diatómica.` : type === 'metalico' ? `${A.symbol}: metal puro, sin fórmula molecular.` : `${A.symbol}: sustancia elemental (sin fórmula molecular fija).`;
  } else if (type === 'metalico') {
    formulaNote = 'Las aleaciones tienen composición variable: no se escribe una fórmula por estados de oxidación.';
  } else if (semiconductor.kind === 'extrinseco') {
    formulaNote = `No es un compuesto: ${semiconductor.family} (el dopante está en trazas).`;
  } else {
    formulas = predictFormulas(A, B);
    formulaNote = formulas.length
      ? 'Predicción: proporciones con carga total cero según los estados de oxidación de la fuente. No confirman que el compuesto exista, salvo los marcados como documentados.'
      : 'Los estados de oxidación de la fuente no permiten equilibrar las cargas entre estos dos elementos.';
  }

  const notes: string[] = [];
  if (A.superheavy || B.superheavy) notes.push('Elemento superpesado: sus propiedades químicas son mayoritariamente predichas.');

  return {
    ok: true,
    a: A,
    b: B,
    same,
    type,
    typeLabel,
    dChi,
    ionicPercent,
    negativeEnd,
    order: ord,
    sigmaPi,
    justification,
    octet,
    coordinate,
    func: chemicalFunction(A, B),
    formulas,
    formulaNote,
    solid,
    electrical,
    semiconductor,
    alloy,
    intermolecular,
    notes,
  };
}

/** Ficha breve de un elemento para el análisis (todo de la fuente salvo grupo/período y e⁻ de valencia, calculados). */
export function elementCard(e: ChemElement): [string, string][] {
  return [
    ['Número atómico', String(e.z)],
    ['Electronegatividad (Pauling)', e.electronegativity.text || '—'],
    ['Electrones de valencia', e.valenceElectrons === null ? `variable (bloque ${e.block})` : String(e.valenceElectrons)],
    ['Categoría', FAMILIES[e.family].name],
    ['Grupo · período', `${e.group ?? '—'} · ${e.period}`],
    ['Estados de oxidación', e.oxidationStates.join(', ') || '—'],
  ];
}

/** Búsqueda tolerante: nombre (con o sin acentos), símbolo o número atómico. */
export function findElement(q: string, all: ChemElement[]): ChemElement | null {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const t = norm(q);
  if (!t) return null;
  if (/^\d+$/.test(t)) return all.find((e) => e.z === Number(t)) ?? null;
  return all.find((e) => norm(e.name) === t) ?? all.find((e) => e.symbol.toLowerCase() === t) ?? all.find((e) => norm(e.nameEn) === t) ?? null;
}
