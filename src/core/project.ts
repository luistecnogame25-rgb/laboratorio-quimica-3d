import { DATA_SOURCE } from '../chem/elements';
import { uid } from './format';
import type { AtomInstance, BondInstance, Experiment, FormedStructure, Measurement } from './types';

export const EXPERIMENT_FORMAT = 'quimlab-experiment';
export const EXPERIMENT_VERSION = 2;

export function createExperiment(name = 'Experimento sin título'): Experiment {
  const now = new Date().toISOString();
  return {
    format: EXPERIMENT_FORMAT,
    version: EXPERIMENT_VERSION,
    id: uid('exp'),
    name,
    created: now,
    modified: now,
    atoms: [],
    measurements: [],
    bonds: [],
    structures: [],
    notes: '',
    view: { atomScale: 1, labels: true },
    sources: [`${DATA_SOURCE.name} — ${DATA_SOURCE.url} (obtenido ${DATA_SOURCE.retrieved})`],
  };
}

export function cloneExperiment(e: Experiment): Experiment {
  return JSON.parse(JSON.stringify(e)) as Experiment;
}

/** Elimina mediciones que hacen referencia a átomos que ya no existen. */
export function pruneMeasurements(e: Experiment): void {
  const ids = new Set(e.atoms.map((a) => a.id));
  e.measurements = e.measurements.filter((m) => m.atoms.every((id) => ids.has(id)));
  // Una estructura documentada deja de serlo si se elimina alguno de sus átomos.
  const broken = new Set(e.structures.filter((s) => !s.atoms.every((id) => ids.has(id))).map((s) => s.id));
  e.structures = e.structures.filter((s) => !broken.has(s.id));
  e.bonds = e.bonds.filter((b) => ids.has(b.a) && ids.has(b.b) && (b.manual === true || e.structures.some((s) => s.id === b.structure)));
}

export class ExperimentFormatError extends Error {}

/** Valida y normaliza un experimento importado. */
export function parseExperiment(json: unknown): Experiment {
  if (!json || typeof json !== 'object') throw new ExperimentFormatError('El archivo no contiene un objeto JSON.');
  const o = json as Record<string, unknown>;
  if (o.format !== EXPERIMENT_FORMAT) throw new ExperimentFormatError('No es un experimento del Laboratorio de Química 3D (campo "format").');
  // v1 (Fase 1) no tenía enlaces: se migra añadiendo listas vacías.
  if (o.version !== 1 && o.version !== EXPERIMENT_VERSION) throw new ExperimentFormatError(`Versión de formato no soportada: ${String(o.version)}`);
  if (!Array.isArray(o.atoms)) throw new ExperimentFormatError('Falta la lista "atoms".');
  const atoms: AtomInstance[] = (o.atoms as AtomInstance[]).map((a) => {
    if (typeof a?.id !== 'string') throw new ExperimentFormatError('Átomo sin identificador.');
    if (!Number.isInteger(a.z) || a.z < 1 || a.z > 118) throw new ExperimentFormatError(`Número atómico inválido: ${String(a.z)}`);
    if (!Array.isArray(a.pos) || a.pos.length !== 3 || !a.pos.every(Number.isFinite)) throw new ExperimentFormatError(`Posición inválida en ${a.id}`);
    return { id: a.id, z: a.z, pos: [a.pos[0], a.pos[1], a.pos[2]], group: typeof a.group === 'string' ? a.group : undefined };
  });
  const view = (o.view ?? {}) as Experiment['view'];
  const e: Experiment = {
    format: EXPERIMENT_FORMAT,
    version: EXPERIMENT_VERSION,
    id: typeof o.id === 'string' ? o.id : uid('exp'),
    name: typeof o.name === 'string' ? o.name : 'Experimento importado',
    created: typeof o.created === 'string' ? o.created : new Date().toISOString(),
    modified: typeof o.modified === 'string' ? o.modified : new Date().toISOString(),
    atoms,
    measurements: Array.isArray(o.measurements) ? (o.measurements as Measurement[]).filter((m) => m && (m.kind === 'distance' || m.kind === 'angle') && Array.isArray(m.atoms)) : [],
    bonds: Array.isArray(o.bonds)
      ? (o.bonds as BondInstance[])
          .filter((b) => b && typeof b.a === 'string' && typeof b.b === 'string' && Number.isInteger(b.order) && b.order >= 1 && b.order <= 3 && (typeof b.structure === 'string' || b.manual === true))
          .map((b) => (b.manual === true ? { a: b.a, b: b.b, order: b.order, manual: true } : { a: b.a, b: b.b, order: b.order, structure: b.structure }))
      : [],
    structures: Array.isArray(o.structures) ? (o.structures as FormedStructure[]).filter((s) => s && typeof s.id === 'string' && typeof s.recordId === 'string' && Array.isArray(s.atoms)) : [],
    notes: typeof o.notes === 'string' ? o.notes : '',
    view: { atomScale: Number.isFinite(view.atomScale) ? view.atomScale : 1, labels: view.labels !== false },
    sources: Array.isArray(o.sources) ? (o.sources as unknown[]).filter((s): s is string => typeof s === 'string') : [],
  };
  pruneMeasurements(e);
  return e;
}
