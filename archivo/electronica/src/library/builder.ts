import { uid } from '../core/format';
import { rotate, toWorld } from '../core/geometry';
import { createProject } from '../core/project';
import { defaultParams, getDef, withDefaults } from '../core/registry';
import type { Params, Project, WireEnd } from '../core/types';
import { boardLayout } from './breadboards';

/**
 * Construcción programática de circuitos: coloca componentes de forma que su primer
 * terminal caiga exactamente en una perforación. Se usa en plantillas, retos y pruebas.
 */
export class CircuitBuilder {
  readonly project: Project;
  constructor(name = 'Circuito') {
    this.project = createProject(name);
  }

  board(type = 'breadboard-830', x = 0, z = 0): string {
    const id = uid('pb');
    this.project.components.push({ id, type, params: {}, x, z, rot: 0 });
    return id;
  }

  holeWorld(boardId: string, hole: string) {
    const b = this.project.components.find((c) => c.id === boardId)!;
    const h = boardLayout(b.type).byId.get(hole);
    if (!h) throw new Error(`Perforación inexistente: ${hole}`);
    return toWorld(h, b);
  }

  /** Inserta un componente con su primer terminal en `hole`. */
  place(type: string, params: Params, boardId: string, hole: string, rot = 0): string {
    const def = getDef(type);
    const full = withDefaults(def, params);
    const t0 = def.terminals(full)[0];
    const w = this.holeWorld(boardId, hole);
    const r = rotate(t0.local, rot);
    const id = uid(def.prefix.toLowerCase());
    this.project.components.push({ id, type, params: { ...defaultParams(def), ...params }, x: w.x - r.x, z: w.z - r.z, rot });
    return id;
  }

  free(type: string, params: Params, x: number, z: number, rot = 0): string {
    const def = getDef(type);
    const id = uid(def.prefix.toLowerCase());
    this.project.components.push({ id, type, params: { ...defaultParams(def), ...params }, x, z, rot });
    return id;
  }

  wire(a: WireEnd, b: WireEnd, color = 'auto'): string {
    const id = uid('w');
    this.project.wires.push({ id, a, b, color });
    return id;
  }
}

export const pin = (inst: string, term: string): WireEnd => ({ kind: 'pin', inst, term });
export const hole = (board: string, h: string): WireEnd => ({ kind: 'hole', board, hole: h });
