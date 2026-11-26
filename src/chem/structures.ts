/**
 * Estructuras documentadas (moléculas de PubChem y cristales de la COD) y su análisis.
 *
 * Todo lo que se calcula aquí parte de coordenadas de la fuente:
 *  - longitudes y ángulos de enlace (geometría de la fuente);
 *  - geometría VSEPR del átomo central (dominios = átomos enlazados + pares libres, con pares libres
 *    deducidos de electrones de valencia, órdenes de enlace y carga formal);
 *  - polaridad molecular ESTIMADA (suma vectorial de dipolos de enlace ∝ Δχ): cualitativa;
 *  - en cristales: distancias a vecinos y números de coordinación con imágenes periódicas.
 */
import { element } from './elements';
import { hillFormula } from './formula';

export type StructureKind = 'molecular' | 'ion' | 'coordinacion' | 'ionico' | 'metalico';

export interface StructureRecord {
  id: string;
  name: string;
  kind: StructureKind;
  bonding: string;
  formula: string | null;
  charge: number;
  mw: string | null;
  iupac: string | null;
  smiles: string | null;
  cid: number | null;
  geometry: 'pubchem3d' | 'cod' | 'none';
  atoms: { z: number; p: [number, number, number] | null; q: number }[];
  bonds: [number, number, number][];
  conformerId?: string | null;
  cell?: { a: number; b: number; c: number; alpha: number; beta: number; gamma: number; spaceGroup: string };
  cellAtoms?: { z: number; f: [number, number, number] }[];
  source: { name: string; url: string; detail: string; cod?: string; doi?: string | null; temperature?: string | null };
}

export const KIND_LABEL: Record<StructureKind, string> = {
  molecular: 'Molécula',
  ion: 'Ion poliatómico',
  coordinacion: 'Compuesto de coordinación',
  ionico: 'Sólido iónico',
  metalico: 'Sólido metálico',
};

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/* ------------------------------ cristales ------------------------------ */

/** Matriz de la celda (filas = vectores a, b, c en Å) a partir de a, b, c, α, β, γ. */
export function cellMatrix(c: NonNullable<StructureRecord['cell']>): [V3, V3, V3] {
  const r = Math.PI / 180;
  const [al, be, ga] = [c.alpha * r, c.beta * r, c.gamma * r];
  const ax: V3 = [c.a, 0, 0];
  const bx: V3 = [c.b * Math.cos(ga), c.b * Math.sin(ga), 0];
  const cx = c.c * Math.cos(be);
  const cy = (c.c * (Math.cos(al) - Math.cos(be) * Math.cos(ga))) / Math.sin(ga);
  const cz = Math.sqrt(Math.max(0, c.c * c.c - cx * cx - cy * cy));
  return [ax, bx, [cx, cy, cz]];
}

export function fracToCart(f: V3, m: [V3, V3, V3]): V3 {
  return [f[0] * m[0][0] + f[1] * m[1][0] + f[2] * m[2][0], f[0] * m[0][1] + f[1] * m[1][1] + f[2] * m[2][1], f[0] * m[0][2] + f[1] * m[1][2] + f[2] * m[2][2]];
}

/** Bloque de n×n×n celdas incluyendo los átomos de las caras exteriores (visualización). */
export function crystalBlock(rec: StructureRecord, n: number): { z: number; p: V3 }[] {
  const m = cellMatrix(rec.cell!);
  const out: { z: number; p: V3 }[] = [];
  const eps = 1e-4;
  for (const a of rec.cellAtoms!)
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= n; j++)
        for (let k = 0; k <= n; k++) {
          const f: V3 = [a.f[0] + i, a.f[1] + j, a.f[2] + k];
          if (f.some((v) => v > n + eps)) continue;
          out.push({ z: a.z, p: fracToCart(f, m) });
        }
  return out;
}

export interface Coordination {
  center: string;
  neighbor: string;
  distance: number;
  count: number;
}

/** Vecinos más próximos de cada especie (con imágenes periódicas), a partir de la celda experimental. */
export function coordination(rec: StructureRecord): Coordination[] {
  const m = cellMatrix(rec.cell!);
  const atoms = rec.cellAtoms!;
  const res: Coordination[] = [];
  for (const z of [...new Set(atoms.map((a) => a.z))]) {
    const a = atoms.find((x) => x.z === z)!;
    const pa = fracToCart(a.f, m);
    const ds: { z: number; d: number }[] = [];
    for (const b of atoms)
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++)
          for (let k = -1; k <= 1; k++) {
            const pb = fracToCart([b.f[0] + i, b.f[1] + j, b.f[2] + k], m);
            const d = len(sub(pa, pb));
            if (d > 1e-3) ds.push({ z: b.z, d });
          }
    const dmin = Math.min(...ds.map((x) => x.d));
    const shell = ds.filter((x) => x.d < dmin * 1.05);
    for (const nz of [...new Set(shell.map((x) => x.z))])
      res.push({ center: element(z).symbol, neighbor: element(nz).symbol, distance: dmin, count: shell.filter((x) => x.z === nz).length });
  }
  return res;
}

/** Fórmula convencional para mostrar (catión primero en sólidos iónicos). La búsqueda usa la de Hill. */
const DISPLAY: Record<string, string> = { 'cloruro-sodio': 'NaCl', 'oxido-magnesio': 'MgO', calcita: 'CaCO3', cobre: 'Cu', 'hierro-alfa': 'Fe', 'ion-amonio': 'NH4+', amoniaco: 'NH3', 'acido-sulfurico': 'H2SO4', 'cloruro-hidrogeno': 'HCl', 'fluoruro-hidrogeno': 'HF', cisplatino: 'Pt(NH3)2Cl2' };
export function displayFormula(rec: StructureRecord): string {
  return DISPLAY[rec.id] ?? rec.formula ?? empiricalFormula(rec);
}

/** Fórmula empírica (Hill) a partir de la composición de la celda. */
export function empiricalFormula(rec: StructureRecord): string {
  if (rec.formula) return rec.formula;
  const counts = new Map<number, number>();
  for (const a of rec.cellAtoms ?? []) counts.set(a.z, (counts.get(a.z) ?? 0) + 1);
  const g = [...counts.values()].reduce((x, y) => gcd(x, y));
  const zs: number[] = [];
  for (const [z, c] of counts) for (let i = 0; i < c / g; i++) zs.push(z);
  return hillFormula(zs);
}
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/* ------------------------------ moléculas ------------------------------ */

export interface BondInfo {
  a: number;
  b: number;
  order: number;
  length: number;
  dChi: number | null;
  character: string;
}

export function hasGeometry(rec: StructureRecord) {
  return rec.geometry === 'pubchem3d' && rec.atoms.every((a) => a.p);
}

export function bondInfo(rec: StructureRecord): BondInfo[] {
  return rec.bonds.map(([a, b, order]) => {
    const A = element(rec.atoms[a].z);
    const B = element(rec.atoms[b].z);
    const ca = A.electronegativity.value;
    const cb = B.electronegativity.value;
    const dChi = ca !== null && cb !== null ? Math.abs(ca - cb) : null;
    const length = hasGeometry(rec) ? len(sub(rec.atoms[a].p!, rec.atoms[b].p!)) : NaN;
    // Orientación por Δχ (no determina por sí sola el tipo de enlace).
    const character = dChi === null ? 'Sin dato de χ' : dChi < 0.4 ? 'Covalente no polar (Δχ < 0,4)' : 'Covalente polar';
    return { a, b, order, length, dChi, character };
  });
}

export function neighbors(rec: StructureRecord, i: number): number[] {
  return rec.bonds.flatMap(([a, b]) => (a === i ? [b] : b === i ? [a] : []));
}

export interface AngleInfo {
  vertex: number;
  a: number;
  b: number;
  value: number;
}

export function bondAngles(rec: StructureRecord): AngleInfo[] {
  if (!hasGeometry(rec)) return [];
  const out: AngleInfo[] = [];
  rec.atoms.forEach((v, i) => {
    const nb = neighbors(rec, i);
    for (let x = 0; x < nb.length; x++)
      for (let y = x + 1; y < nb.length; y++) {
        const u = sub(rec.atoms[nb[x]].p!, v.p!);
        const w = sub(rec.atoms[nb[y]].p!, v.p!);
        out.push({ vertex: i, a: nb[x], b: nb[y], value: (Math.acos(Math.max(-1, Math.min(1, dot(u, w) / (len(u) * len(w))))) * 180) / Math.PI });
      }
  });
  return out;
}

const VSEPR: Record<string, string> = {
  '2,0': 'Lineal',
  '3,0': 'Trigonal plana',
  '3,1': 'Angular',
  '4,0': 'Tetraédrica',
  '4,1': 'Piramidal trigonal',
  '4,2': 'Angular',
  '5,0': 'Bipiramidal trigonal',
  '6,0': 'Octaédrica',
};

export interface CentralGeometry {
  atom: number;
  bonded: number;
  lonePairs: number;
  geometry: string;
  ideal: string;
}

/**
 * Geometría VSEPR de cada átomo con ≥ 2 vecinos (solo elementos de los bloques s y p).
 * Pares libres = (e⁻ de valencia − carga formal − Σ órdenes de enlace) / 2.
 */
export function centralGeometries(rec: StructureRecord): CentralGeometry[] {
  const out: CentralGeometry[] = [];
  rec.atoms.forEach((a, i) => {
    const nb = neighbors(rec, i);
    if (nb.length < 2) return;
    const e = element(a.z);
    if (e.valenceElectrons === null) return;
    const orders = rec.bonds.filter(([x, y]) => x === i || y === i).reduce((s, b) => s + b[2], 0);
    const lp2 = e.valenceElectrons - a.q - orders;
    if (lp2 < 0 || lp2 % 2) return;
    const lp = lp2 / 2;
    const key = `${nb.length + lp},${lp}`;
    const ideal: Record<number, string> = { 2: '180°', 3: '120°', 4: '109,5°', 5: '90° / 120°', 6: '90°' };
    if (VSEPR[key]) out.push({ atom: i, bonded: nb.length, lonePairs: lp, geometry: VSEPR[key], ideal: ideal[nb.length + lp] });
  });
  return out;
}

/** Polaridad estimada: módulo de la suma de vectores de enlace ponderados por Δχ (cualitativo). */
export function polarityEstimate(rec: StructureRecord): { polar: boolean; magnitude: number } | null {
  if (!hasGeometry(rec)) return null;
  const sum: V3 = [0, 0, 0];
  for (const [a, b] of rec.bonds) {
    const ca = element(rec.atoms[a].z).electronegativity.value;
    const cb = element(rec.atoms[b].z).electronegativity.value;
    if (ca === null || cb === null) return null;
    const d = sub(rec.atoms[b].p!, rec.atoms[a].p!);
    const l = len(d);
    for (let k = 0; k < 3; k++) sum[k] += ((cb - ca) * d[k]) / l;
  }
  const magnitude = len(sum);
  return { polar: magnitude > 0.15, magnitude };
}

/**
 * Discrepancias conocidas entre la geometría de la fuente y valores experimentales de referencia.
 * Se muestran al usuario junto a la estructura (no se corrigen las coordenadas).
 */
export const KNOWN_DEVIATIONS: Record<string, { measured: string; reference: string; note: string }> = {
  'monoxido-carbono': {
    measured: 'Conformero de PubChem (MMFF94s)',
    reference: 'd(C≡O) = 1,128 Å, experimental en fase gas (NIST CCCBDB)',
    note: 'La distancia C–O del conformero calculado difiere unos 0,07 Å del valor experimental. El campo de fuerza MMFF94s no reproduce bien este enlace triple con componente dativa.',
  },
};

/* ------------------------------ búsqueda ------------------------------ */

import { STRUCTURES } from '../data/structures.data';
export { STRUCTURES };

export function structure(id: string): StructureRecord | undefined {
  return STRUCTURES.find((s) => s.id === id);
}

function normFormula(f: string) {
  return f.replace(/[+-]$/, '');
}

/** Estructuras cuya fórmula (molecular) o fórmula empírica (cristales) coincide con la composición. */
export function findByComposition(hill: string): { exact: StructureRecord[]; empirical: StructureRecord[] } {
  const exact = STRUCTURES.filter((s) => s.formula && normFormula(s.formula) === hill);
  const empirical = STRUCTURES.filter((s) => !s.formula && empiricalFormula(s) === reduceHill(hill));
  return { exact, empirical };
}

/** Reduce una fórmula de Hill por el máximo común divisor (Na2Cl2 → ClNa). */
export function reduceHill(hill: string): string {
  const parts = [...hill.matchAll(/([A-Z][a-z]?)(\d*)/g)].map((m) => [m[1], Number(m[2] || 1)] as const);
  const g = parts.map((p) => p[1]).reduce((a, b) => gcd(a, b), 0) || 1;
  return parts.map(([s, n]) => s + (n / g > 1 ? n / g : '')).join('');
}

export function searchStructures(q: string): StructureRecord[] {
  const t = q.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!t) return STRUCTURES;
  return STRUCTURES.filter((s) =>
    [s.name, s.formula ?? empiricalFormula(s), s.iupac ?? '', KIND_LABEL[s.kind], s.bonding]
      .join(' ')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .includes(t),
  );
}
