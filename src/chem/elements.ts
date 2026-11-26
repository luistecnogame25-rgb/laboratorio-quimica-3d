/**
 * Modelo de elementos químicos.
 *
 * Procedencia: los valores numéricos provienen sin modificar de PubChem (ver DATA_SOURCE).
 * Lo que se CALCULA aquí (y se identifica como derivado): grupo y período (por la estructura de la
 * tabla periódica), bloque, configuración electrónica expandida, electrones por nivel y número
 * de neutrones estimado. Ningún campo vacío en la fuente se rellena.
 */
import { DATA_SOURCE, RAW_ELEMENTS, type RawElement } from '../data/elements.data';

export { DATA_SOURCE };

export type FamilyId =
  | 'alkali'
  | 'alkaline-earth'
  | 'transition'
  | 'post-transition'
  | 'metalloid'
  | 'nonmetal'
  | 'halogen'
  | 'noble-gas'
  | 'lanthanide'
  | 'actinide';

export const FAMILIES: Record<FamilyId, { name: string; source: string; color: string }> = {
  alkali: { name: 'Metales alcalinos', source: 'Alkali metal', color: '#ef7d6f' },
  'alkaline-earth': { name: 'Metales alcalinotérreos', source: 'Alkaline earth metal', color: '#f0a965' },
  transition: { name: 'Metales de transición', source: 'Transition metal', color: '#e3c46a' },
  'post-transition': { name: 'Metales postransición', source: 'Post-transition metal', color: '#9cc38e' },
  metalloid: { name: 'Metaloides', source: 'Metalloid', color: '#5fc2b4' },
  nonmetal: { name: 'No metales', source: 'Nonmetal', color: '#6fa9ef' },
  halogen: { name: 'Halógenos', source: 'Halogen', color: '#8f93ef' },
  'noble-gas': { name: 'Gases nobles', source: 'Noble gas', color: '#bf93ec' },
  lanthanide: { name: 'Lantánidos', source: 'Lanthanide', color: '#ec8fbd' },
  actinide: { name: 'Actínidos', source: 'Actinide', color: '#d48aa3' },
};

export type Block = 's' | 'p' | 'd' | 'f';
export type StateKey = 'solid' | 'liquid' | 'gas';
export type DataStatus = 'fuente' | 'calculada' | 'predicha';

export interface Subshell {
  n: number;
  l: number; // 0 s, 1 p, 2 d, 3 f
  electrons: number;
}

export const L_LETTER = ['s', 'p', 'd', 'f', 'g'];
export const L_CAPACITY = [2, 6, 10, 14, 18];

export interface Measured {
  value: number | null;
  text: string;
}

export interface ChemElement {
  z: number;
  symbol: string;
  name: string;
  nameEn: string;
  /** Masa atómica relativa tal como la da la fuente. */
  mass: Measured;
  massNote: string | null;
  period: number;
  /** null para La–Yb y Ac–No (fila f, fuera de los 18 grupos en esta disposición). */
  group: number | null;
  block: Block;
  family: FamilyId;
  classificationNotes: string[];
  configuration: {
    raw: string;
    status: DataStatus;
    /** Subniveles completos (núcleo de gas noble expandido), ordenados por n y luego l. */
    subshells: Subshell[];
    /** Notación abreviada ordenada por n y l (p. ej. "[Ar] 3d6 4s2"). */
    short: string;
  };
  shells: number[];
  /** Solo para elementos de los bloques s y p; en d/f depende del contexto químico. */
  valenceElectrons: number | null;
  oxidationStates: string[];
  electronegativity: Measured;
  atomicRadius: Measured;
  ionizationEnergy: Measured;
  electronAffinity: Measured;
  state: { key: StateKey | null; predicted: boolean; text: string };
  meltingK: Measured;
  boilingK: Measured;
  density: Measured;
  discovered: string;
  cpk: string | null;
  /** Elementos con Z ≥ 104: propiedades mayoritariamente predichas. */
  superheavy: boolean;
  /** Tabla: fila (1–7 principal, 9–10 serie f) y columna (1–18). */
  pos: { row: number; col: number };
}

/* ------------------------------ derivaciones ------------------------------ */

export function periodOf(z: number): number {
  if (z <= 2) return 1;
  if (z <= 10) return 2;
  if (z <= 18) return 3;
  if (z <= 36) return 4;
  if (z <= 54) return 5;
  if (z <= 86) return 6;
  return 7;
}

const PERIOD_START = [0, 1, 3, 11, 19, 37, 55, 87];

/**
 * Grupo IUPAC (1–18). Disposición con Lu y Lr en el grupo 3 y La–Yb / Ac–No en la serie f.
 */
export function groupOf(z: number): number | null {
  const p = periodOf(z);
  const i = z - PERIOD_START[p];
  if (p === 1) return z === 1 ? 1 : 18;
  if (p <= 3) return i < 2 ? i + 1 : i + 10 + 1; // i=2 → 13
  if (p <= 5) return i + 1;
  if (i < 2) return i + 1;
  if (i <= 15) return null; // serie f
  return i - 13;
}

export function blockOf(z: number): Block {
  const g = groupOf(z);
  if (g === null) return 'f';
  if (z === 2) return 's';
  if (g <= 2) return 's';
  if (g >= 13) return 'p';
  return 'd';
}

export function tablePosition(z: number): { row: number; col: number } {
  const p = periodOf(z);
  const g = groupOf(z);
  if (g !== null) return { row: p, col: g };
  const i = z - PERIOD_START[p] - 2; // 0..13
  return { row: p === 6 ? 9 : 10, col: 3 + i };
}

const CORES: Record<string, string> = {
  He: '1s2',
  Ne: '[He] 2s2 2p6',
  Ar: '[Ne] 3s2 3p6',
  Kr: '[Ar] 3d10 4s2 4p6',
  Xe: '[Kr] 4d10 5s2 5p6',
  Rn: '[Xe] 4f14 5d10 6s2 6p6',
};

/** Expande una configuración (con núcleo de gas noble) en subniveles. */
export function parseConfiguration(raw: string): { subshells: Subshell[]; core: string | null; status: DataStatus } {
  const status: DataStatus = /predicted/i.test(raw) ? 'predicha' : /calculated/i.test(raw) ? 'calculada' : 'fuente';
  const map = new Map<string, Subshell>();
  const add = (n: number, l: number, e: number) => {
    const k = `${n}${l}`;
    const cur = map.get(k);
    if (cur) cur.electrons += e;
    else map.set(k, { n, l, electrons: e });
  };
  const walk = (s: string) => {
    const core = /\[(\w+)\]/.exec(s);
    if (core) {
      const exp = CORES[core[1]];
      if (!exp) throw new Error(`Núcleo desconocido: ${core[1]}`);
      walk(exp);
    }
    const re = /(\d)([spdfg])(\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s.replace(/\[\w+\]/, '')))) add(Number(m[1]), L_LETTER.indexOf(m[2]), Number(m[3]));
  };
  walk(raw);
  const subshells = [...map.values()].sort((a, b) => a.n - b.n || a.l - b.l);
  const core = /\[(\w+)\]/.exec(raw)?.[1] ?? null;
  return { subshells, core, status };
}

export function subshellLabel(s: Pick<Subshell, 'n' | 'l'>): string {
  return `${s.n}${L_LETTER[s.l]}`;
}

function shortConfig(raw: string, subshells: Subshell[], core: string | null): string {
  if (!core) return subshells.map((s) => `${subshellLabel(s)}${s.electrons}`).join(' ');
  const coreSet = parseConfiguration(`[${core}]`).subshells;
  const rest = subshells
    .map((s) => {
      const c = coreSet.find((k) => k.n === s.n && k.l === s.l);
      const e = s.electrons - (c?.electrons ?? 0);
      return e > 0 ? `${subshellLabel(s)}${e}` : '';
    })
    .filter(Boolean);
  void raw;
  return `[${core}] ${rest.join(' ')}`;
}

function measured(text: string): Measured {
  const t = text.trim();
  const v = t === '' ? null : Number(t);
  return { value: v !== null && Number.isFinite(v) ? v : null, text: t };
}

function familyOf(groupBlock: string): FamilyId {
  const f = (Object.keys(FAMILIES) as FamilyId[]).find((k) => FAMILIES[k].source === groupBlock);
  if (!f) throw new Error(`Familia desconocida en la fuente: ${groupBlock}`);
  return f;
}

function notesFor(z: number, fam: FamilyId): string[] {
  const n: string[] = [];
  if (z === 1) n.push('Se ubica en el grupo 1, pero no es un metal alcalino. Su posición en la tabla es objeto de discusión.');
  if (z === 2) n.push('Por su configuración 1s² pertenece al bloque s, aunque se coloca en el grupo 18 por sus propiedades de gas noble.');
  if ([30, 48, 80, 112].includes(z))
    n.push('La definición IUPAC de metal de transición exige un subnivel d incompleto en el átomo o en sus cationes comunes; este elemento no la cumple estrictamente, aunque suele agruparse con ellos.');
  if ([57, 71, 89, 103].includes(z))
    n.push('Existen dos convenciones para el grupo 3 (Sc–Y–La–Ac o Sc–Y–Lu–Lr). Esta tabla coloca Lu y Lr en el grupo 3 y La/Ac al inicio de la serie f.');
  if (fam === 'metalloid' || [84, 85].includes(z)) n.push('La lista de metaloides no está normalizada: la clasificación de este elemento varía entre fuentes.');
  if (z >= 104) n.push('Elemento superpesado sintético: solo se han producido pocos átomos y la mayoría de sus propiedades son predicciones teóricas.');
  return n;
}

function build(r: RawElement): ChemElement {
  const z = r.z;
  const { subshells, core, status } = parseConfiguration(r.electronConfiguration);
  const shells: number[] = [];
  for (const s of subshells) shells[s.n - 1] = (shells[s.n - 1] ?? 0) + s.electrons;
  for (let i = 0; i < shells.length; i++) shells[i] = shells[i] ?? 0;
  const block = blockOf(z);
  let valence: number | null = null;
  if (block === 's' || block === 'p') {
    const nmax = Math.max(...subshells.map((s) => s.n));
    valence = subshells.filter((s) => s.n === nmax && s.l <= 1).reduce((a, s) => a + s.electrons, 0);
  }
  const fam = familyOf(r.groupBlock);
  const stateText = r.standardState;
  const key: StateKey | null = /solid/i.test(stateText) ? 'solid' : /liquid/i.test(stateText) ? 'liquid' : /gas/i.test(stateText) ? 'gas' : null;
  const noStable = z === 43 || z === 61 || z >= 84;
  return {
    z,
    symbol: r.symbol,
    name: r.nameEs,
    nameEn: r.nameEn,
    mass: measured(r.atomicMass),
    massNote: noStable ? 'Elemento sin isótopos estables: el valor de la fuente puede corresponder a un isótopo concreto y no a una masa atómica estándar.' : null,
    period: periodOf(z),
    group: groupOf(z),
    block,
    family: fam,
    classificationNotes: notesFor(z, fam),
    configuration: { raw: r.electronConfiguration, status, subshells, short: shortConfig(r.electronConfiguration, subshells, core) },
    shells,
    valenceElectrons: valence,
    oxidationStates: r.oxidationStates ? r.oxidationStates.split(',').map((s) => s.trim()).filter(Boolean) : [],
    electronegativity: measured(r.electronegativity),
    atomicRadius: measured(r.atomicRadius),
    ionizationEnergy: measured(r.ionizationEnergy),
    electronAffinity: measured(r.electronAffinity),
    state: { key, predicted: /expected/i.test(stateText), text: stateText },
    meltingK: measured(r.meltingPoint),
    boilingK: measured(r.boilingPoint),
    density: measured(r.density),
    discovered: r.yearDiscovered === 'Ancient' ? 'Antigüedad' : r.yearDiscovered,
    cpk: r.cpkHex ? `#${r.cpkHex}` : null,
    superheavy: z >= 104,
    pos: tablePosition(z),
  };
}

export const ELEMENTS: ChemElement[] = RAW_ELEMENTS.map(build);

export function element(z: number): ChemElement {
  const e = ELEMENTS[z - 1];
  if (!e) throw new Error(`Número atómico fuera de rango: ${z}`);
  return e;
}

export function bySymbol(sym: string): ChemElement | undefined {
  return ELEMENTS.find((e) => e.symbol.toLowerCase() === sym.toLowerCase());
}

function norm(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/** Búsqueda por nombre (español o inglés), símbolo o número atómico. */
export function searchElements(q: string): ChemElement[] {
  const t = norm(q);
  if (!t) return ELEMENTS;
  if (/^\d+$/.test(t)) return ELEMENTS.filter((e) => String(e.z) === t || String(e.z).startsWith(t));
  const score = (e: ChemElement) => {
    const n = norm(e.name);
    const en = norm(e.nameEn);
    if (e.symbol.toLowerCase() === t) return 5;
    if (n === t || en === t) return 4;
    if (n.startsWith(t) || en.startsWith(t)) return 3;
    if (e.symbol.toLowerCase().startsWith(t)) return 2;
    if (n.includes(t) || en.includes(t)) return 1;
    return 0;
  };
  return ELEMENTS.map((e) => ({ e, s: score(e) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.e.z - b.e.z)
    .map((x) => x.e);
}

/** Estado estándar en español. */
export function stateLabel(e: ChemElement): string {
  const base = { solid: 'Sólido', liquid: 'Líquido', gas: 'Gas' }[e.state.key ?? 'solid'];
  if (!e.state.key) return 'Sin dato';
  return e.state.predicted ? `${base} (predicción)` : base;
}

/** Visualización atómica: N estimado = A − Z con A = masa redondeada (aproximación declarada). */
export function estimatedNeutrons(e: ChemElement): number | null {
  if (e.mass.value === null) return null;
  return Math.max(0, Math.round(e.mass.value) - e.z);
}

export function kToC(k: number) {
  return k - 273.15;
}
