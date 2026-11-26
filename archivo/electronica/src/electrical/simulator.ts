/**
 * Simulador de circuitos (motor propio MNA, Fase 1).
 *
 *  - Punto de operación DC: Newton-Raphson con escalonamiento de gmin como respaldo.
 *  - Transitorio: Euler implícito con paso fijo (subdivide el paso si no converge).
 *
 * Arquitectura preparada para un backend SPICE (ngspice-WASM) en la Fase 2: el resto de la
 * aplicación solo usa la interfaz pública de esta clase (build/dc/step/reports/voltaje de nodo).
 */
import { getDef, withDefaults } from '../core/registry';
import type { ComponentModel, InstanceReport, Project, RuntimeState, Solution, WireEnd } from '../core/types';
import { isBoardType } from '../library/breadboards';
import { MnaSystem, type Element, type StepInfo } from './mna';
import { buildNetlist, pinKey, terminalsOf, type Netlist } from './netlist';
import { designators } from './designators';

export interface CircuitIssue {
  level: 'info' | 'warn' | 'error';
  message: string;
  instances?: string[];
  nets?: number[];
}

export function createRuntime(): RuntimeState {
  return { pressed: new Set(), damaged: new Set(), capVoltages: new Map() };
}

const NODE_GMIN = 1e-12;
const RELTOL = 1e-6;
const VNTOL = 1e-6;
const ABSTOL = 1e-12;
const MAX_ITER = 150;

export class Simulator {
  netlist!: Netlist;
  readonly models = new Map<string, ComponentModel>();
  /** Índice de nodo MNA de cada net (−1 = tierra). Las nets sin dispositivos no tienen nodo. */
  readonly nodeOfNet = new Map<number, number>();
  groundNet = -1;
  issues: CircuitIssue[] = [];
  elements: Element[] = [];
  nodeCount = 0;
  branchCount = 0;
  time = 0;
  converged = true;
  private sys!: MnaSystem;
  private x: Float64Array<ArrayBufferLike> = new Float64Array(0);
  private hasNonlinear = false;
  readonly names: Map<string, string>;

  constructor(public readonly project: Project, public readonly runtime: RuntimeState = createRuntime()) {
    this.names = designators(project);
    this.build();
  }

  private build(): void {
    const p = this.project;
    this.netlist = buildNetlist(p);
    const electrical = p.components.filter((c) => !isBoardType(c.type) && getDef(c.type).createModel);

    // Referencia de tierra: terminal negativo de la primera fuente.
    for (const c of electrical) {
      const neg = terminalsOf(c).find((t) => t.kind === 'negative');
      if (neg) {
        this.groundNet = this.netlist.pinNet.get(pinKey(c.id, neg.id)) ?? -1;
        break;
      }
    }

    // Nodos para cada net que toca al menos un terminal de dispositivo.
    let next = 0;
    for (const c of electrical) {
      for (const t of terminalsOf(c)) {
        const net = this.netlist.pinNet.get(pinKey(c.id, t.id))!;
        if (this.nodeOfNet.has(net)) continue;
        if (this.groundNet < 0) this.groundNet = net; // sin fuente: referencia arbitraria
        this.nodeOfNet.set(net, net === this.groundNet ? -1 : next++);
      }
    }

    // Modelos de componentes
    const internal: number[] = [];
    for (const c of electrical) {
      const def = getDef(c.type);
      const params = withDefaults(def, c.params);
      const model = def.createModel!({
        id: c.id,
        params,
        runtime: this.runtime,
        node: (term: string) => {
          const net = this.netlist.pinNet.get(pinKey(c.id, term));
          if (net === undefined) throw new Error(`Terminal ${term} inexistente en ${c.type}`);
          return this.nodeOfNet.get(net)!;
        },
        internalNode: () => {
          const idx = next++;
          internal.push(idx);
          return idx;
        },
      });
      this.models.set(c.id, model);
      for (const e of model.elements) this.elements.push(e);
    }
    this.nodeCount = next;
    let b = 0;
    for (const e of this.elements) {
      if (e.branches > 0) {
        e.branchIndex = this.nodeCount + b;
        b += e.branches;
      }
      if (e.nonlinear) this.hasNonlinear = true;
    }
    this.branchCount = b;
    this.sys = new MnaSystem(this.nodeCount, this.branchCount);
    this.x = new Float64Array(this.sys.size);
    this.validate(electrical);
  }

  private validate(electrical: Project['components']): void {
    const issues: CircuitIssue[] = [];
    const name = (id: string) => this.names.get(id) ?? id;
    if (electrical.length === 0) {
      issues.push({ level: 'info', message: 'No hay componentes con modelo eléctrico en el circuito.' });
    }
    const sources = [...this.models.entries()].filter(([, m]) => m.source);
    if (electrical.length > 0 && sources.length === 0) {
      issues.push({ level: 'warn', message: 'No hay fuente de alimentación: no circulará corriente.' });
    }
    for (const [id, m] of sources) {
      const s = m.source!;
      const a = this.netlist.pinNet.get(pinKey(id, s.pos));
      const c = this.netlist.pinNet.get(pinKey(id, s.neg));
      if (a !== undefined && a === c) {
        issues.push({
          level: 'error',
          message: `Cortocircuito directo: los terminales + y − de ${name(id)} están unidos sin carga.`,
          instances: [id],
          nets: [a],
        });
      }
    }
    for (const c of electrical) {
      const terms = terminalsOf(c);
      const nets = terms.map((t) => this.netlist.pinNet.get(pinKey(c.id, t.id))!);
      const isFree = (i: number) => this.netlist.nets[nets[i]].pins.length === 1;
      const floating = terms.filter((t, i) => isFree(i) && !t.optional);
      if (terms.every((_, i) => isFree(i))) {
        issues.push({ level: 'warn', message: `${name(c.id)} no está conectado a nada.`, instances: [c.id] });
      } else if (floating.length) {
        issues.push({
          level: 'warn',
          message: `${name(c.id)}: terminal ${floating.map((t) => t.name).join(', ')} sin conectar (circuito abierto).`,
          instances: [c.id],
        });
      }
      if (terms.length >= 2 && floating.length === 0 && new Set(nets).size === 1 && !this.models.get(c.id)?.source) {
        issues.push({
          level: 'warn',
          message: `${name(c.id)} está puenteado: todos sus terminales están en el mismo nodo.`,
          instances: [c.id],
        });
      }
    }
    this.issues = issues;
  }

  private info(mode: 'dc' | 'tran', dt: number, gmin = 1e-12): StepInfo {
    return { mode, time: this.time, dt, gmin };
  }

  private newton(info: StepInfo): boolean {
    const sys = this.sys;
    if (sys.size === 0) return true;
    for (let it = 0; it < MAX_ITER; it++) {
      sys.clear();
      for (const e of this.elements) e.stamp(sys, this.x, info);
      for (let i = 0; i < this.nodeCount; i++) sys.addA(i, i, NODE_GMIN);
      const xn = sys.solve();
      if (!xn) return false;
      let ok = true;
      if (this.hasNonlinear) {
        if (it === 0) ok = false;
        for (let i = 0; i < xn.length && ok; i++) {
          const tol = RELTOL * Math.max(Math.abs(xn[i]), Math.abs(this.x[i])) + (i < this.nodeCount ? VNTOL : ABSTOL);
          if (Math.abs(xn[i] - this.x[i]) > tol) ok = false;
        }
        if (ok) for (const e of this.elements) if (e.converged && !e.converged()) ok = false;
      }
      this.x = xn;
      if (ok) return true;
    }
    return false;
  }

  /** Reinicia estado y tiempo. Los capacitores toman su voltaje inicial. */
  reset(): void {
    this.time = 0;
    this.x.fill(0);
    for (const e of this.elements) e.reset?.();
  }

  /** Punto de operación DC (capacitores abiertos). */
  dcOperatingPoint(): boolean {
    this.x.fill(0);
    for (const e of this.elements) e.reset?.();
    let ok = this.newton(this.info('dc', 1));
    if (!ok) {
      // Escalonamiento de gmin: resuelve un circuito "suavizado" y lo va relajando.
      ok = true;
      for (let g = 1e-2; g >= 1e-12 && ok; g /= 10) ok = this.newton(this.info('dc', 1, g));
    }
    this.converged = ok;
    if (ok) for (const e of this.elements) e.accept?.(this.x, this.info('dc', 1));
    return ok;
  }

  /** Avanza un paso de tiempo transitorio. */
  step(dt: number): boolean {
    let remaining = dt;
    let h = dt;
    let tries = 0;
    while (remaining > 1e-15) {
      const stepH = Math.min(h, remaining);
      const backup = Float64Array.from(this.x);
      this.time += stepH;
      const ok = this.newton(this.info('tran', stepH));
      if (ok) {
        for (const e of this.elements) e.accept?.(this.x, this.info('tran', stepH));
        remaining -= stepH;
      } else {
        this.time -= stepH;
        this.x = backup;
        h /= 4;
        if (++tries > 6) {
          this.converged = false;
          return false;
        }
      }
    }
    this.converged = true;
    return true;
  }

  solution(): Solution {
    const x = this.x;
    return {
      v: (node: number) => (node < 0 ? 0 : x[node] ?? 0),
      branch: (i: number) => x[i] ?? 0,
      time: this.time,
    };
  }

  reports(): Map<string, InstanceReport> {
    const sol = this.solution();
    const out = new Map<string, InstanceReport>();
    for (const [id, m] of this.models) out.set(id, m.report(sol));
    return out;
  }

  /** Voltaje (respecto a la referencia) de una net; null si la net no toca ningún dispositivo. */
  netVoltage(net: number | undefined): number | null {
    if (net === undefined) return null;
    const node = this.nodeOfNet.get(net);
    if (node === undefined) return null;
    return node < 0 ? 0 : this.x[node];
  }

  endVoltage(end: WireEnd): number | null {
    return this.netVoltage(this.netlist.netOf(end));
  }

  /** Voltajes de capacitores para conservar continuidad si el circuito se reconstruye. */
  saveState(): void {
    for (const [id, m] of this.models) {
      const cap = m.elements.find((e) => 'vPrev' in e) as { vPrev: number } | undefined;
      if (cap) this.runtime.capVoltages.set(id, cap.vPrev);
    }
  }

  /** Resumen de nets clasificadas para colorear cables automáticamente. */
  netClass(net: number | undefined): 'power' | 'gnd' | 'signal' {
    return classifyNet(this.project, this.netlist, net);
  }
}

export function classifyNet(project: Project, netlist: Netlist, net: number | undefined): 'power' | 'gnd' | 'signal' {
  if (net === undefined) return 'signal';
  for (const pk of netlist.nets[net]?.pins ?? []) {
    const [inst, term] = pk.split(':');
    const c = project.components.find((k) => k.id === inst);
    if (!c) continue;
    const def = getDef(c.type);
    const t = def.terminals(withDefaults(def, c.params)).find((tt) => tt.id === term);
    if (t?.kind === 'positive') return 'power';
    if (t?.kind === 'negative') return 'gnd';
  }
  for (const hk of netlist.nets[net]?.holes ?? []) {
    const hole = hk.split(':')[1];
    if (hole.startsWith('T+') || hole.startsWith('B+')) return 'power';
    if (hole.startsWith('T-') || hole.startsWith('B-')) return 'gnd';
  }
  return 'signal';
}
