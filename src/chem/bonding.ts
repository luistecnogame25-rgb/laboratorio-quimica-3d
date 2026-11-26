/**
 * Constructor de enlaces manual (Fase 2).
 *
 * El usuario elige dos átomos y un orden de enlace; el enlace solo se crea si cumple reglas de
 * valencia de libro de texto (nunca por proximidad ni por arrastre). Lo que se construye así es una
 * PROPUESTA del usuario: no se presenta como compuesto real salvo que coincida (mismo grafo de
 * enlaces y órdenes) con una estructura documentada de la biblioteca; en ese caso se adopta la
 * geometría de la fuente.
 *
 * Reglas (aproximaciones didácticas, etiquetadas como tales en la interfaz):
 *  - Valencia típica de los no metales de los bloques s y p: 8 − e⁻ de valencia (H: 1, B: 3).
 *  - N y O admiten un enlace más como enlace coordinado (NH₄⁺, H₃O⁺, CO); el B acepta uno (BF₄⁻).
 *  - No metales del período ≥ 3 (P, S, Cl…) pueden superar el octeto hasta su nº de e⁻ de valencia.
 *  - Metales: tantos enlaces como su estado de oxidación positivo máximo de la fuente (máx. 6),
 *    solo simples y nunca con otro metal (el enlace metálico es una red, no barras entre pares).
 *  - Gases nobles: sin enlaces.
 */
import { element, type ChemElement } from './elements';
import { hillFormula } from './formula';
import { STRUCTURES, type StructureRecord } from './structures';

export interface SimpleBond {
  a: string;
  b: string;
  order: number;
}

export type BondCheck = { ok: true; kind: string } | { ok: false; reason: string };

const isMetal = (e: ChemElement) => !['nonmetal', 'halogen', 'noble-gas', 'metalloid'].includes(e.family);

function maxPositiveOx(e: ChemElement): number {
  const v = e.oxidationStates.map((s) => Number(s.replace('+', ''))).filter((n) => Number.isInteger(n) && n > 0);
  return v.length ? Math.min(6, Math.max(...v)) : 0;
}

/** Valencia típica (número de enlaces con el que el átomo queda neutro y con capa completa). */
export function typicalValence(e: ChemElement): number {
  if (e.family === 'noble-gas') return 0;
  if (e.z === 1) return 1;
  if (isMetal(e)) return maxPositiveOx(e);
  const ve = e.valenceElectrons;
  if (ve === null) return 0;
  return ve >= 4 ? 8 - ve : ve;
}

/** Máximo de enlaces (suma de órdenes) que admite el átomo según las reglas anteriores. */
export function maxValence(e: ChemElement): number {
  const t = typicalValence(e);
  if (e.family === 'noble-gas' || e.z === 1 || isMetal(e)) return t;
  if (e.z === 7 || e.z === 8 || e.z === 5) return t + 1; // enlace coordinado
  if (e.family === 'halogen') return t;
  if (e.period >= 3 && e.valenceElectrons !== null) return Math.max(t, e.valenceElectrons);
  return t;
}

/** Carga formal de los casos que el constructor reconoce (N y O con un enlace más; B con 4). */
export function formalCharge(e: ChemElement, bonds: number): number {
  if ((e.z === 7 || e.z === 8) && bonds === typicalValence(e) + 1) return 1;
  if (e.z === 5 && bonds === 4) return -1;
  return 0;
}

export function bondSum(bonds: SimpleBond[], id: string): number {
  return bonds.reduce((s, b) => s + (b.a === id || b.b === id ? b.order : 0), 0);
}

/** Tipo de enlace orientativo por Δχ y carácter metálico. */
export function bondKind(za: number, zb: number): string {
  const A = element(za);
  const B = element(zb);
  const ca = A.electronegativity.value;
  const cb = B.electronegativity.value;
  const d = ca !== null && cb !== null ? Math.abs(ca - cb) : null;
  const metal = isMetal(A) || isMetal(B);
  if (d === null) return 'Sin dato de electronegatividad';
  if (metal && d >= 1.7) return `Iónico predominante (Δχ ${d.toFixed(2)} ≥ 1,7)`;
  if (metal) return `Covalente polar con metal (Δχ ${d.toFixed(2)})`;
  return d < 0.4 ? `Covalente no polar (Δχ ${d.toFixed(2)})` : `Covalente polar (Δχ ${d.toFixed(2)})`;
}

/**
 * ¿Se puede crear (o cambiar a) un enlace de orden `order` entre `a` y `b`?
 * `bonds` son los enlaces actuales del laboratorio; si ya existe uno entre a y b, se evalúa el cambio.
 */
export function checkBond(za: number, zb: number, a: string, b: string, order: number, bonds: SimpleBond[]): BondCheck {
  if (a === b) return { ok: false, reason: 'Elige dos átomos distintos.' };
  const A = element(za);
  const B = element(zb);
  if (order < 1 || order > 3) return { ok: false, reason: 'El orden de enlace debe ser simple, doble o triple.' };
  for (const E of [A, B])
    if (E.family === 'noble-gas') return { ok: false, reason: `${E.name} es un gas noble: su capa de valencia está completa y el laboratorio no forma enlaces con él.` };
  if (isMetal(A) && isMetal(B))
    return { ok: false, reason: 'Entre dos metales no se forma un enlace localizado: el enlace metálico es una red de átomos con electrones deslocalizados. Consulta el cobre o el hierro en la biblioteca.' };
  if (order > 1) {
    for (const E of [A, B]) {
      if (E.z === 1) return { ok: false, reason: 'El hidrógeno solo forma enlaces simples.' };
      if (isMetal(E)) return { ok: false, reason: `Con ${E.name} (metal) el constructor solo admite enlaces simples.` };
      if (E.family === 'halogen') return { ok: false, reason: `${E.name} (halógeno) solo forma enlaces simples en el constructor.` };
    }
  }
  const existing = bonds.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  const prev = existing?.order ?? 0;
  for (const [E, id, other] of [[A, a, B], [B, b, A]] as const) {
    const used = bondSum(bonds, id) - prev;
    const max = maxValence(E);
    // Capa expandida (P, S, Si…): solo hacia átomos muy electronegativos (O, F, Cl), como en H₂SO₄ o PCl₅.
    if (E.period >= 3 && !isMetal(E) && used + order > typicalValence(E) && ![8, 9, 17].includes(other.z))
      return { ok: false, reason: `${E.name} solo supera su valencia habitual (${typicalValence(E)}) al unirse a O, F o Cl (capa expandida, como en el H₂SO₄).` };
    if (max === 0) return { ok: false, reason: `${E.name} no tiene una valencia definida en la fuente para formar enlaces.` };
    if (used + order > max)
      return {
        ok: false,
        reason: `${E.name} ya tiene ${used} enlace${used === 1 ? '' : 's'}; admite como máximo ${max}${max > typicalValence(E) ? ` (${typicalValence(E)} habituales + coordinado o capa expandida)` : ''}.`,
      };
  }
  return { ok: true, kind: bondKind(za, zb) };
}

/** Componentes conexas (por enlaces) de un conjunto de átomos. */
export function components(ids: string[], bonds: SimpleBond[]): string[][] {
  const adj = new Map<string, string[]>(ids.map((i) => [i, []]));
  for (const b of bonds) {
    adj.get(b.a)?.push(b.b);
    adj.get(b.b)?.push(b.a);
  }
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const comp: string[] = [];
    const stack = [id];
    seen.add(id);
    while (stack.length) {
      const x = stack.pop()!;
      comp.push(x);
      for (const y of adj.get(x) ?? []) if (!seen.has(y)) (seen.add(y), stack.push(y));
    }
    out.push(comp);
  }
  return out;
}

/**
 * Busca en la biblioteca una molécula con geometría 3D cuyo grafo (elementos, conectividad y
 * órdenes de enlace) sea idéntico al construido. Devuelve el registro y la asignación
 * índice-de-la-fuente → id-de-átomo.
 */
export function recognize(atoms: { id: string; z: number }[], bonds: SimpleBond[]): { record: StructureRecord; map: string[] } | null {
  if (atoms.length < 2) return null;
  const hill = hillFormula(atoms.map((a) => a.z));
  const ord = new Map<string, number>();
  const key = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);
  for (const b of bonds) ord.set(key(b.a, b.b), b.order);
  const deg = (id: string) => bonds.filter((b) => b.a === id || b.b === id).length;
  for (const rec of STRUCTURES) {
    if (rec.geometry !== 'pubchem3d' || !rec.formula || rec.formula.replace(/[+-]$/, '') !== hill) continue;
    if (rec.bonds.length !== bonds.length || rec.atoms.length !== atoms.length) continue;
    const rAdj: [number, number][][] = rec.atoms.map(() => []);
    for (const [x, y, o] of rec.bonds) (rAdj[x].push([y, o]), rAdj[y].push([x, o]));
    // Orden de búsqueda: primero los átomos con más vecinos (poda temprana).
    const orderIdx = rec.atoms.map((_, i) => i).sort((p, q) => rAdj[q].length - rAdj[p].length);
    const map: string[] = new Array(rec.atoms.length);
    const used = new Set<string>();
    const ok = (k: number): boolean => {
      if (k === orderIdx.length) return true;
      const i = orderIdx[k];
      for (const a of atoms) {
        if (used.has(a.id) || a.z !== rec.atoms[i].z || deg(a.id) !== rAdj[i].length) continue;
        if (!rAdj[i].every(([j, o]) => map[j] === undefined || ord.get(key(a.id, map[j])) === o)) continue;
        map[i] = a.id;
        used.add(a.id);
        if (ok(k + 1)) return true;
        used.delete(a.id);
        map[i] = undefined as unknown as string;
      }
      return false;
    };
    if (ok(0)) return { record: rec, map };
  }
  return null;
}

export interface ValenceReport {
  /** Átomos a los que les faltan enlaces para su valencia típica. */
  missing: { id: string; symbol: string; missing: number }[];
  charges: { id: string; symbol: string; charge: number }[];
  totalCharge: number;
  complete: boolean;
}

export function valenceReport(atoms: { id: string; z: number }[], bonds: SimpleBond[]): ValenceReport {
  const missing: ValenceReport['missing'] = [];
  const charges: ValenceReport['charges'] = [];
  for (const a of atoms) {
    const e = element(a.z);
    const n = bondSum(bonds, a.id);
    const fc = formalCharge(e, n);
    if (fc) charges.push({ id: a.id, symbol: e.symbol, charge: fc });
    else if (n < typicalValence(e)) missing.push({ id: a.id, symbol: e.symbol, missing: typicalValence(e) - n });
  }
  const totalCharge = charges.reduce((s, c) => s + c.charge, 0);
  return { missing, charges, totalCharge, complete: missing.length === 0 };
}
