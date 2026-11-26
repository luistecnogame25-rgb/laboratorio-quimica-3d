import type { ComponentInstance, Project, Wire, WireEnd } from './types';
import { uid } from './format';
import { hasDef } from './registry';

export const PROJECT_FORMAT = 'lab3d-project';
export const PROJECT_VERSION = 1;

export function createProject(name = 'Circuito sin título'): Project {
  const now = new Date().toISOString();
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    id: uid('prj'),
    name,
    created: now,
    modified: now,
    components: [],
    wires: [],
    simulation: { timeScale: 1, dt: 2e-4 },
  };
}

export function cloneProject(p: Project): Project {
  return JSON.parse(JSON.stringify(p)) as Project;
}

export function endKey(e: WireEnd): string {
  return e.kind === 'pin' ? `pin:${e.inst}:${e.term}` : `hole:${e.board}:${e.hole}`;
}

export function sameEnd(a: WireEnd, b: WireEnd): boolean {
  return endKey(a) === endKey(b);
}

/** Quita cables que apuntan a componentes inexistentes. */
export function pruneWires(p: Project): void {
  const ids = new Set(p.components.map((c) => c.id));
  p.wires = p.wires.filter((w) => endAlive(w.a, ids) && endAlive(w.b, ids));
}

function endAlive(e: WireEnd, ids: Set<string>): boolean {
  return e.kind === 'pin' ? ids.has(e.inst) : ids.has(e.board);
}

export class ProjectFormatError extends Error {}

/** Valida y normaliza un JSON importado. Lanza ProjectFormatError con un mensaje claro. */
export function parseProject(json: unknown): Project {
  if (!json || typeof json !== 'object') throw new ProjectFormatError('El archivo no contiene un objeto JSON.');
  const o = json as Record<string, unknown>;
  if (o.format !== PROJECT_FORMAT) throw new ProjectFormatError('No es un proyecto del Laboratorio 3D (campo "format").');
  if (o.version !== PROJECT_VERSION) throw new ProjectFormatError(`Versión de formato no soportada: ${String(o.version)}`);
  if (!Array.isArray(o.components) || !Array.isArray(o.wires)) throw new ProjectFormatError('Faltan "components" o "wires".');
  const components: ComponentInstance[] = [];
  for (const c of o.components as ComponentInstance[]) {
    if (typeof c?.id !== 'string' || typeof c.type !== 'string') throw new ProjectFormatError('Componente sin id o tipo.');
    if (!hasDef(c.type)) throw new ProjectFormatError(`Componente desconocido: ${c.type}`);
    if (!Number.isFinite(c.x) || !Number.isFinite(c.z)) throw new ProjectFormatError(`Posición inválida en ${c.id}`);
    components.push({ id: c.id, type: c.type, params: { ...(c.params ?? {}) }, x: c.x, z: c.z, rot: c.rot | 0, group: c.group });
  }
  const wires: Wire[] = [];
  for (const w of o.wires as Wire[]) {
    if (typeof w?.id !== 'string' || !validEnd(w.a) || !validEnd(w.b)) throw new ProjectFormatError('Cable mal formado.');
    wires.push({ id: w.id, a: w.a, b: w.b, color: typeof w.color === 'string' ? w.color : 'auto' });
  }
  const sim = (o.simulation ?? {}) as Project['simulation'];
  const p: Project = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    id: typeof o.id === 'string' ? o.id : uid('prj'),
    name: typeof o.name === 'string' ? o.name : 'Proyecto importado',
    created: typeof o.created === 'string' ? o.created : new Date().toISOString(),
    modified: typeof o.modified === 'string' ? o.modified : new Date().toISOString(),
    components,
    wires,
    simulation: {
      timeScale: Number.isFinite(sim.timeScale) ? sim.timeScale : 1,
      dt: Number.isFinite(sim.dt) && sim.dt > 0 ? sim.dt : 2e-4,
    },
    camera: o.camera as Project['camera'],
    notes: typeof o.notes === 'string' ? o.notes : undefined,
    measurements: Array.isArray(o.measurements) ? (o.measurements as Project['measurements']) : undefined,
  };
  pruneWires(p);
  return p;
}

function validEnd(e: unknown): e is WireEnd {
  if (!e || typeof e !== 'object') return false;
  const o = e as Record<string, unknown>;
  if (o.kind === 'pin') return typeof o.inst === 'string' && typeof o.term === 'string';
  if (o.kind === 'hole') return typeof o.board === 'string' && typeof o.hole === 'string';
  return false;
}
