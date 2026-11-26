/**
 * Descripción química de lo que hay en el laboratorio: tipo de material, clasificación de cada
 * tipo de enlace y propiedades moleculares. Se basa en estructuras documentadas (enlaces y órdenes
 * de la fuente, geometría de la fuente) y en datos de los elementos (electronegatividad).
 *
 * Términos derivados con reglas de libro de texto y etiquetados como tales:
 *  - polaridad del enlace por Δχ (< 0,4 no polar), con δ⁻ en el átomo más electronegativo;
 *  - enlaces σ/π a partir del orden de enlace (simple 1σ; doble 1σ+1π; triple 1σ+2π);
 *  - fuerzas intermoleculares ESPERADAS a partir de la estructura (cualitativo).
 */
import { element, FAMILIES, type ChemElement } from './elements';
import { bondInfo, centralGeometries, displayFormula, hasGeometry, polarityEstimate, type StructureRecord } from './structures';

export interface BondTypeDescription {
  label: string; // "O–H", "O=C", "N≡N" (más electronegativo primero)
  /** Números atómicos y orden de enlace, para abrir el análisis del enlace. */
  za: number;
  zb: number;
  orderN: number;
  count: number;
  bondType: string; // covalente, covalente coordinado…
  order: string; // simple / doble / triple / deslocalizado
  sigmaPi: string; // 1 σ + 1 π
  polarity: string; // polar / no polar
  dChi: number | null;
  negativeEnd: string | null; // átomo con δ⁻
  length: number | null; // Å (geometría de la fuente)
  note?: string;
}

export interface SubstanceDescription {
  name: string;
  formula: string;
  material: string;
  materialDetail: string;
  organic: boolean | null;
  bonds: BondTypeDescription[];
  geometry: string[];
  polarity: string;
  intermolecular: string[];
  geometrySource: string;
}

const ORDER = ['', 'simple', 'doble', 'triple'];
const SIGMA_PI = ['', '1 σ', '1 σ + 1 π', '1 σ + 2 π'];
const JOIN = ['', '–', '=', '≡'];

export function describeStructure(rec: StructureRecord): SubstanceDescription {
  const sym = (i: number) => element(rec.atoms[i].z).symbol;
  const info = bondInfo(rec);
  const groups = new Map<string, BondTypeDescription & { lengths: number[] }>();
  const aromatic = rec.id === 'benceno';
  for (const b of info) {
    const [x, y] = [b.a, b.b].sort((p, q) => element(rec.atoms[q].z).electronegativity.value! - element(rec.atoms[p].z).electronegativity.value! || 0);
    const isAromaticCC = aromatic && sym(b.a) === 'C' && sym(b.b) === 'C';
    const key = `${[sym(b.a), sym(b.b)].sort().join('-')}|${isAromaticCC ? 'ar' : b.order}`;
    let g = groups.get(key);
    if (!g) {
      const ex = element(rec.atoms[x].z).electronegativity.value;
      const ey = element(rec.atoms[y].z).electronegativity.value;
      const polar = b.dChi !== null && b.dChi >= 0.4;
      g = {
        za: rec.atoms[x].z,
        zb: rec.atoms[y].z,
        orderN: b.order,
        label: `${sym(x)}${isAromaticCC ? '⋯' : JOIN[b.order] ?? '–'}${sym(y)}`,
        count: 0,
        bondType: 'Covalente',
        order: isAromaticCC ? 'deslocalizado (aromático, intermedio entre simple y doble)' : ORDER[b.order] ?? String(b.order),
        sigmaPi: isAromaticCC ? '1 σ + π deslocalizado en el anillo' : SIGMA_PI[b.order] ?? '',
        polarity: b.dChi === null ? 'sin dato de χ' : polar ? 'polar' : 'no polar',
        dChi: b.dChi,
        negativeEnd: polar && ex !== null && ey !== null ? (ex > ey ? sym(x) : sym(y)) : null,
        length: null,
        lengths: [],
      };
      groups.set(key, g);
    }
    g.count++;
    if (Number.isFinite(b.length)) g.lengths.push(b.length);
  }
  const bonds: BondTypeDescription[] = [...groups.values()].map(({ lengths, ...g }) => ({ ...g, length: lengths.length ? lengths.reduce((s, v) => s + v, 0) / lengths.length : null }));
  // Matices documentados de compuestos concretos
  if (rec.id === 'ion-amonio') for (const b of bonds) if (b.label.includes('N')) {
    b.bondType = 'Covalente (uno de ellos coordinado o dativo)';
    b.note = 'Al formarse, el N cede su par libre al H⁺; después los cuatro N–H son equivalentes.';
  }
  if (rec.id === 'monoxido-carbono') for (const b of bonds) {
    b.bondType = 'Covalente triple con componente dativa';
    b.note = 'Uno de los tres pares lo aporta solo el oxígeno.';
  }
  if (rec.id === 'cisplatino') for (const b of bonds) if (b.label.includes('Pt')) b.bondType = 'Coordinado (dativo), ligando → Pt';

  const hasCH = info.some((b) => [sym(b.a), sym(b.b)].sort().join('') === 'CH');
  const organic = rec.kind === 'molecular' ? hasCH : rec.kind === 'ion' ? false : null;
  const material =
    rec.kind === 'molecular' ? 'Sustancia molecular (covalente)' : rec.kind === 'ion' ? 'Ion poliatómico' : rec.kind === 'coordinacion' ? 'Compuesto de coordinación' : rec.kind === 'ionico' ? 'Sólido iónico (red cristalina)' : 'Sólido metálico';
  const materialDetail =
    rec.kind === 'molecular'
      ? `Formada por moléculas discretas unidas internamente por enlaces covalentes; ${hasCH ? 'compuesto orgánico (contiene enlaces C–H)' : 'compuesto inorgánico'}.`
      : rec.kind === 'ion'
        ? 'Grupo de átomos unidos covalentemente con carga neta; existe en disolución o formando sales con iones de carga opuesta, no como sustancia aislada.'
        : rec.kind === 'coordinacion'
          ? 'Un ion metálico central unido a ligandos mediante enlaces coordinados (dativos).'
          : rec.bonding;

  const geos = centralGeometries(rec).map((g) => `${sym(g.atom)}: ${g.geometry.toLowerCase()} (${g.bonded} enlazados, ${g.lonePairs} pares libres)`);
  const uniqueGeos = [...new Set(geos)];
  const pol = polarityEstimate(rec);
  const polarity = pol ? (pol.polar ? 'Molécula polar' : 'Molécula apolar') + ' (estimación por suma de dipolos de enlace)' : 'No estimable (falta la geometría de la fuente)';

  const inter: string[] = [];
  if (rec.kind === 'ion') inter.push('Interacciones ion-dipolo con disolventes polares como el agua');
  else {
    inter.push('Fuerzas de dispersión de London (presentes en todas las moléculas)');
    if (pol?.polar) inter.push('Fuerzas dipolo-dipolo (molécula polar)');
    const donor = info.some((b) => {
      const s = [sym(b.a), sym(b.b)];
      return s.includes('H') && (s.includes('N') || s.includes('O') || s.includes('F'));
    });
    const acceptor = rec.atoms.some((a) => [7, 8, 9].includes(a.z));
    if (donor) inter.push('Puentes de hidrógeno entre sus moléculas (H unido a N, O o F)');
    else if (acceptor) inter.push('Puede aceptar puentes de hidrógeno de otras moléculas (p. ej. del agua), pero no los forma consigo misma');
  }

  return {
    name: rec.name,
    formula: displayFormula(rec),
    material,
    materialDetail,
    organic,
    bonds,
    geometry: uniqueGeos,
    polarity,
    intermolecular: inter,
    geometrySource: hasGeometry(rec) ? 'Geometría: conformero 3D de PubChem (calculado, MMFF94s)' : 'Sin geometría 3D en la fuente',
  };
}

/** Tipo de elemento de un átomo suelto (sin enlazar). */
export function describeLooseAtom(e: ChemElement): { material: string; detail: string } {
  const fam = e.family;
  const material =
    fam === 'noble-gas' ? 'Gas noble' : fam === 'metalloid' ? 'Metaloide' : fam === 'nonmetal' || fam === 'halogen' ? 'No metal' : 'Metal';
  return { material, detail: `${FAMILIES[fam].name}. Átomo sin enlazar: en el laboratorio no forma parte de ninguna estructura documentada.` };
}
