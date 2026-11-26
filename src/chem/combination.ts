/**
 * Análisis de combinaciones de átomos (Fase 2).
 *
 * Regla: una combinación solo se presenta como compuesto si coincide con una estructura
 * documentada de la biblioteca. Todo lo demás se informa como "no validado" y, como mucho,
 * se ofrecen PREDICCIONES identificadas (proporciones compatibles con estados de oxidación),
 * que no confirman la existencia de ningún compuesto.
 */
import { bySymbol, element } from './elements';
import { hillFormula } from './formula';
import { findByComposition, reduceHill, STRUCTURES, type StructureRecord, KIND_LABEL } from './structures';

export type Verdict = 'conocido' | 'conocido-sin-geometria' | 'red-cristalina' | 'no-validado' | 'incompatible' | 'insuficiente';

export interface CombinationResult {
  formula: string;
  verdict: Verdict;
  record?: StructureRecord;
  title: string;
  lines: string[];
  predictions: string[];
}

const NOBLE_INERT = new Set([2, 10]); // He, Ne: sin compuestos neutros estables conocidos en condiciones ordinarias

function ox(z: number): number[] {
  return element(z)
    .oxidationStates.map((s) => Number(s.replace('+', '')))
    .filter((n) => Number.isInteger(n) && n !== 0);
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));

/** Proporciones AₘBₙ con carga total cero usando estados de oxidación de la fuente (predicción). */
export function chargeBalancedRatios(za: number, zb: number): string[] {
  const ea = element(za);
  const eb = element(zb);
  const [cat, an] = (ea.electronegativity.value ?? 0) <= (eb.electronegativity.value ?? 0) ? [ea, eb] : [eb, ea];
  const out = new Set<string>();
  for (const p of ox(cat.z).filter((v) => v > 0))
    for (const q of ox(an.z).filter((v) => v < 0)) {
      const l = (p * -q) / gcd(p, -q);
      const m = l / p;
      const n = l / -q;
      out.add(`${cat.symbol}${m > 1 ? m : ''}${an.symbol}${n > 1 ? n : ''}`);
    }
  return [...out].slice(0, 6);
}

export function analyzeCombination(zs: number[]): CombinationResult {
  const formula = zs.length ? hillFormula(zs) : '';
  const base = { formula, predictions: [] as string[] };
  if (zs.length < 2) {
    return { ...base, verdict: 'insuficiente', title: 'Selecciona al menos dos átomos', lines: ['El análisis compara la composición de los átomos seleccionados con estructuras documentadas.'] };
  }
  const unique = [...new Set(zs)];
  if (unique.some((z) => NOBLE_INERT.has(z)) && unique.length > 1) {
    return {
      ...base,
      verdict: 'incompatible',
      title: 'Combinación químicamente incompatible en condiciones ordinarias',
      lines: ['El helio y el neón no forman compuestos neutros estables conocidos en condiciones ordinarias: su capa de valencia está completa.'],
    };
  }
  const { exact, empirical } = findByComposition(formula);
  const mol = exact[0];
  if (mol) {
    const has3d = mol.geometry === 'pubchem3d';
    return {
      ...base,
      verdict: has3d ? 'conocido' : 'conocido-sin-geometria',
      record: mol,
      title: `Compuesto conocido y documentado: ${mol.name}`,
      lines: [
        `${KIND_LABEL[mol.kind]} · ${mol.bonding}.`,
        `Fuente: PubChem CID ${mol.cid}.`,
        has3d
          ? 'Geometría disponible: conformero 3D calculado por PubChem (MMFF94s), no experimental.'
          : 'La fuente no ofrece geometría 3D: no se puede formar la estructura en el laboratorio sin inventar posiciones.',
      ],
    };
  }
  const cry = empirical[0];
  if (cry) {
    return {
      ...base,
      verdict: 'red-cristalina',
      record: cry,
      title: `Coincide con la fórmula empírica de ${cry.name}`,
      lines: [
        `${KIND_LABEL[cry.kind]}: ${cry.bonding}.`,
        'Este sólido no está formado por moléculas aisladas sino por una red cristalina periódica; un grupo pequeño de átomos no lo representa.',
        `Estructura experimental de la COD (entrada ${cry.source.cod}).`,
      ],
    };
  }
  const predictions: string[] = [];
  const lines = [
    `No hay en la biblioteca ninguna estructura documentada con la composición ${formula} (${STRUCTURES.length} estructuras de PubChem y la COD).`,
    'Para confirmarla se necesita un registro experimental o calculado con su referencia (por ejemplo, un CID de PubChem o una entrada de la COD).',
  ];
  if (unique.length === 2) {
    const ratios = chargeBalancedRatios(unique[0], unique[1]);
    if (ratios.length) {
      predictions.push(...ratios);
      const reduced = reduceHill(formula);
      const match = ratios.some((r) => hillFormula(parseSimple(r)) === reduced);
      lines.push(match ? 'La proporción seleccionada coincide con una combinación de estados de oxidación de la fuente, lo que por sí solo no demuestra que el compuesto exista.' : 'La proporción seleccionada no equilibra las cargas con los estados de oxidación de la fuente.');
    }
  }
  if (unique.some((z) => [36, 54, 86].includes(z))) lines.push('Kr, Xe y Rn forman algunos compuestos en condiciones especiales, pero ninguno está en la biblioteca.');
  return { ...base, verdict: 'no-validado', title: 'Combinación no validada', lines, predictions };
}

/** "Na2O" → [11, 11, 8] (fórmulas simples de dos elementos). */
function parseSimple(f: string): number[] {
  const out: number[] = [];
  for (const m of f.matchAll(/([A-Z][a-z]?)(\d*)/g)) for (let i = 0; i < Number(m[2] || 1); i++) out.push(bySymbol(m[1])!.z);
  return out;
}
