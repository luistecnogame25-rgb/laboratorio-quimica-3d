/**
 * Construcción de la lista de nodos (nets) a partir del proyecto:
 *  1. Conexiones internas de cada protoboard (tiras y rieles).
 *  2. Pines de componentes insertados en perforaciones (por posición geométrica).
 *  3. Cables entre terminales y/o perforaciones.
 * Se usa una estructura union-find: el resultado es la conectividad eléctrica REAL que
 * consume el simulador, no una representación visual.
 */
import { getDef, withDefaults } from '../core/registry';
import { toLocal, toWorld, type P2 } from '../core/geometry';
import type { ComponentInstance, Project, TerminalDef, WireEnd } from '../core/types';
import { boardLayout, holeAt, isBoardType } from '../library/breadboards';

export interface Net {
  id: number;
  pins: string[]; // "inst:term"
  holes: string[]; // "board:hole"
}

export interface Netlist {
  nets: Net[];
  pinNet: Map<string, number>;
  holeNet: Map<string, number>;
  /** Pin → perforación donde está insertado. */
  insertion: Map<string, { board: string; hole: string }>;
  /** Perforación → pines insertados. */
  occupied: Map<string, string[]>;
  netOf(end: WireEnd): number | undefined;
}

class UnionFind {
  parent = new Map<string, string>();
  add(k: string) {
    if (!this.parent.has(k)) this.parent.set(k, k);
  }
  find(k: string): string {
    this.add(k);
    let r = k;
    while (this.parent.get(r) !== r) r = this.parent.get(r)!;
    let c = k;
    while (this.parent.get(c) !== r) {
      const n = this.parent.get(c)!;
      this.parent.set(c, r);
      c = n;
    }
    return r;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export function terminalsOf(inst: ComponentInstance): TerminalDef[] {
  const def = getDef(inst.type);
  return def.terminals(withDefaults(def, inst.params));
}

export function pinWorld(inst: ComponentInstance, term: TerminalDef): P2 {
  return toWorld(term.local, inst);
}

export function pinKey(inst: string, term: string) {
  return `${inst}:${term}`;
}
export function holeKey(board: string, hole: string) {
  return `${board}:${hole}`;
}

export function buildNetlist(project: Project): Netlist {
  const uf = new UnionFind();
  const boards = project.components.filter((c) => isBoardType(c.type));
  const insertion = new Map<string, { board: string; hole: string }>();
  const occupied = new Map<string, string[]>();

  // 1. Tiras internas de protoboard
  for (const b of boards) {
    const layout = boardLayout(b.type);
    const stripRoot = new Map<string, string>();
    for (const h of layout.holes) {
      const k = 'h:' + holeKey(b.id, h.id);
      uf.add(k);
      const root = stripRoot.get(h.strip);
      if (root) uf.union(k, root);
      else stripRoot.set(h.strip, k);
    }
  }

  // 2. Pines de componentes y su inserción en perforaciones
  for (const inst of project.components) {
    if (isBoardType(inst.type)) continue;
    const def = getDef(inst.type);
    for (const t of terminalsOf(inst)) {
      const pk = pinKey(inst.id, t.id);
      uf.add('p:' + pk);
      if (!def.insertable) continue;
      const w = pinWorld(inst, t);
      for (const b of boards) {
        const local = toLocal(w, b);
        const h = holeAt(boardLayout(b.type), local.x, local.z);
        if (h) {
          insertion.set(pk, { board: b.id, hole: h.id });
          const hk = holeKey(b.id, h.id);
          occupied.set(hk, [...(occupied.get(hk) ?? []), pk]);
          uf.union('p:' + pk, 'h:' + hk);
          break;
        }
      }
    }
  }

  // 3. Cables
  const endNode = (e: WireEnd) => (e.kind === 'pin' ? 'p:' + pinKey(e.inst, e.term) : 'h:' + holeKey(e.board, e.hole));
  for (const w of project.wires) uf.union(endNode(w.a), endNode(w.b));

  // Agrupar
  const rootToNet = new Map<string, Net>();
  const nets: Net[] = [];
  const pinNet = new Map<string, number>();
  const holeNet = new Map<string, number>();
  for (const k of uf.parent.keys()) {
    const r = uf.find(k);
    let net = rootToNet.get(r);
    if (!net) {
      net = { id: nets.length, pins: [], holes: [] };
      nets.push(net);
      rootToNet.set(r, net);
    }
    const key = k.slice(2);
    if (k.startsWith('p:')) {
      net.pins.push(key);
      pinNet.set(key, net.id);
    } else {
      net.holes.push(key);
      holeNet.set(key, net.id);
    }
  }

  return {
    nets,
    pinNet,
    holeNet,
    insertion,
    occupied,
    netOf(end: WireEnd) {
      return end.kind === 'pin' ? pinNet.get(pinKey(end.inst, end.term)) : holeNet.get(holeKey(end.board, end.hole));
    },
  };
}
