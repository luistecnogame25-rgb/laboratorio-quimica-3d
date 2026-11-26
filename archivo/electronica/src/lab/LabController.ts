/**
 * Controlador del laboratorio 3D: sincroniza el proyecto con la escena y gestiona la
 * interacción (selección, arrastre con encaje a perforaciones, rotación, cables, sondas).
 */
import * as THREE from 'three';
import { uid } from '../core/format';
import { rotate, toLocal, toWorld } from '../core/geometry';
import { endKey, sameEnd } from '../core/project';
import { defaultParams, getDef, withDefaults } from '../core/registry';
import type { ProjectStore } from '../core/store';
import type { ComponentInstance, InstanceReport, Params, Project, TerminalKind, WireEnd } from '../core/types';
import { PITCH } from '../core/types';
import { buildNetlist, holeKey, pinKey, terminalsOf, type Netlist } from '../electrical/netlist';
import { classifyNet } from '../electrical/simulator';
import { designators } from '../electrical/designators';
import { boardLayout, holeAt, isBoardType } from '../library/breadboards';
import { buildBoard } from '../render/boardMesh';
import { buildComponentVisual, type ComponentVisual } from '../render/models';
import type { SceneManager } from '../render/SceneManager';
import { AUTO_COLORS, buildWire, highlightMaterial } from '../render/wireMesh';

export type Tool = 'select' | 'wire' | 'probe';

export interface PointRef {
  end: WireEnd;
  pos: THREE.Vector3;
  label: string;
}

interface VisualEntry {
  key: string;
  root: THREE.Group;
  visual: ComponentVisual | null;
}

type Pick =
  | { kind: 'pin'; inst: string; term: string; point: THREE.Vector3 }
  | { kind: 'component'; inst: string; point: THREE.Vector3; boardTop: boolean }
  | { kind: 'wire'; id: string; point: THREE.Vector3 }
  | { kind: 'table'; point: THREE.Vector3 };

const BOARD_TOP = 8.5;

const TERMINAL_COLORS: Partial<Record<TerminalKind, number>> = {
  positive: 0xff453a,
  negative: 0x8e9bb0,
  anode: 0xff9f0a,
  cathode: 0x64d2ff,
  base: 0xffd60a,
  collector: 0x30d158,
  emitter: 0x64d2ff,
  passive: 0x0a84ff,
  switch: 0xbf5af2,
};

export class LabController {
  netlist!: Netlist;
  names = new Map<string, string>();
  tool: Tool = 'select';
  selection = new Set<string>();
  selectedWire: string | null = null;
  hover: PointRef | null = null;
  wireStart: PointRef | null = null;
  probes: { red?: PointRef; black?: PointRef } = {};
  wireColor = 'auto';
  simActive = false;
  pressed: Set<string> | null = null;

  onChange: () => void = () => {};
  onToggleSwitch: (id: string) => void = () => {};
  onMessage: (msg: string, kind: 'info' | 'ok' | 'warn' | 'error') => void = () => {};

  /** Componente en proceso de colocación (vista fantasma que sigue al puntero). */
  placing: {
    type: string;
    params: Params;
    name: string;
    rot: number;
    x: number;
    z: number;
    root: THREE.Group;
    issue: string | null;
    last: { cx: number; cy: number } | null;
  } | null = null;
  private wireDrag = false;
  private terminalMarkers = new THREE.Group();

  private visuals = new Map<string, VisualEntry>();
  private wireMeshes = new Map<string, { key: string; mesh: THREE.Mesh }>();
  private selectionHelpers = new THREE.Group();
  private netMarkers: THREE.InstancedMesh;
  private hoverRing: THREE.Mesh;
  private previewWire: THREE.Mesh | null = null;
  private probeMarkers = new THREE.Group();
  private drag: {
    snapshot: string;
    primary: string;
    start: Map<string, { x: number; z: number }>;
    grab: THREE.Vector3;
    moved: boolean;
  } | null = null;
  private down: { x: number; y: number; pick: Pick | null; shift: boolean } | null = null;
  private pressedButton: string | null = null;
  private disposers: (() => void)[] = [];
  private lastReports: Map<string, InstanceReport> | null = null;

  constructor(public readonly sm: SceneManager, public readonly store: ProjectStore) {
    const markerGeo = new THREE.BoxGeometry(1.5, 0.4, 1.5);
    this.netMarkers = new THREE.InstancedMesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0x2bffb0, transparent: true, opacity: 0.85, depthTest: false }), 512);
    this.netMarkers.count = 0;
    this.netMarkers.renderOrder = 20;
    this.netMarkers.frustumCulled = false;
    this.hoverRing = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.28, 8, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
    this.hoverRing.rotation.x = Math.PI / 2;
    this.hoverRing.renderOrder = 21;
    this.hoverRing.visible = false;
    sm.overlay.add(this.netMarkers, this.hoverRing, this.selectionHelpers, this.probeMarkers, this.terminalMarkers);

    const el = sm.renderer.domElement;
    const on = <K extends keyof HTMLElementEventMap>(t: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      el.addEventListener(t, fn as EventListener);
      this.disposers.push(() => el.removeEventListener(t, fn as EventListener));
    };
    on('pointerdown', (e) => this.pointerDown(e));
    on('pointermove', (e) => this.pointerMove(e));
    on('pointerup', (e) => this.pointerUp(e));
    on('pointerleave', () => this.setHover(null));
    on('contextmenu', (e) => {
      e.preventDefault();
      this.cancelWire();
    });
    this.disposers.push(store.subscribe(() => this.sync()));
    this.sync();
  }

  get project(): Project {
    return this.store.project;
  }

  /* ======================= sincronización proyecto → escena ======================= */

  sync(): void {
    const p = this.project;
    this.netlist = buildNetlist(p);
    this.names = designators(p);
    const alive = new Set<string>();
    for (const c of p.components) {
      alive.add(c.id);
      const key = c.type + JSON.stringify(c.params);
      let entry = this.visuals.get(c.id);
      if (!entry || entry.key !== key) {
        if (entry) this.removeVisual(c.id);
        entry = this.createVisual(c, key);
        this.visuals.set(c.id, entry);
      }
      entry.root.position.set(c.x, this.elevation(c), c.z);
      entry.root.rotation.y = (c.rot * Math.PI) / 2;
    }
    for (const id of [...this.visuals.keys()]) if (!alive.has(id)) this.removeVisual(id);
    for (const id of [...this.selection]) if (!alive.has(id)) this.selection.delete(id);
    if (this.selectedWire && !p.wires.some((w) => w.id === this.selectedWire)) this.selectedWire = null;
    this.syncWires();
    this.syncSelection();
    this.syncProbes();
    if (this.lastReports) this.applyReports(this.lastReports);
    this.sm.needsRender = true;
    this.onChange();
  }

  private createVisual(c: ComponentInstance, key: string): VisualEntry {
    const root = new THREE.Group();
    root.userData.instId = c.id;
    let visual: ComponentVisual | null = null;
    if (isBoardType(c.type)) {
      root.add(buildBoard(c.type));
    } else {
      const def = getDef(c.type);
      const params = withDefaults(def, c.params);
      visual = buildComponentVisual(c.type, params, def.terminals(params));
      root.add(visual.root);
    }
    this.sm.content.add(root);
    return { key, root, visual };
  }

  private removeVisual(id: string) {
    const e = this.visuals.get(id);
    if (!e) return;
    this.sm.content.remove(e.root);
    e.visual?.dispose();
    e.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !e.visual) {
        m.geometry.dispose();
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat.userData?.own) {
          mat.map?.dispose();
          mat.dispose();
        }
      }
    });
    this.visuals.delete(id);
  }

  /** Altura de apoyo: sobre la protoboard si alguno de sus pines está insertado. */
  elevation(c: ComponentInstance): number {
    if (isBoardType(c.type)) return 0;
    const def = getDef(c.type);
    if (!def.insertable) return 0;
    const inserted = terminalsOf(c).some((t) => this.netlist.insertion.has(pinKey(c.id, t.id)));
    return inserted ? BOARD_TOP : 2.2;
  }

  endPosition(end: WireEnd): THREE.Vector3 | null {
    const p = this.project;
    if (end.kind === 'hole') {
      const b = p.components.find((c) => c.id === end.board);
      if (!b) return null;
      const h = boardLayout(b.type).byId.get(end.hole);
      if (!h) return null;
      const w = toWorld(h, b);
      return new THREE.Vector3(w.x, BOARD_TOP, w.z);
    }
    const c = p.components.find((k) => k.id === end.inst);
    if (!c) return null;
    const t = terminalsOf(c).find((k) => k.id === end.term);
    if (!t) return null;
    const w = toWorld(t.local, c);
    const def = getDef(c.type);
    return new THREE.Vector3(w.x, this.elevation(c) + (def.insertable ? 0.8 : (t.height ?? 0)), w.z);
  }

  endLabel(end: WireEnd): string {
    if (end.kind === 'hole') {
      const b = this.project.components.find((c) => c.id === end.board);
      const h = b ? boardLayout(b.type).byId.get(end.hole) : undefined;
      return `${this.names.get(end.board) ?? 'PB'} · ${h?.label ?? end.hole}`;
    }
    const c = this.project.components.find((k) => k.id === end.inst);
    const t = c ? terminalsOf(c).find((k) => k.id === end.term) : undefined;
    return `${this.names.get(end.inst) ?? '?'} · ${t?.name ?? end.term}`;
  }

  private isVerticalEnd(end: WireEnd): boolean {
    if (end.kind === 'hole') return true;
    const c = this.project.components.find((k) => k.id === end.inst);
    return c ? getDef(c.type).insertable : true;
  }

  wireColorOf(color: string, a: WireEnd): string {
    if (color !== 'auto') return color;
    const cls = classifyNet(this.project, this.netlist, this.netlist.netOf(a));
    return AUTO_COLORS[cls];
  }

  private syncWires() {
    const alive = new Set<string>();
    for (const w of this.project.wires) {
      alive.add(w.id);
      const a = this.endPosition(w.a);
      const b = this.endPosition(w.b);
      if (!a || !b) continue;
      const color = this.wireColorOf(w.color, w.a);
      const key = `${a.toArray().map((n) => n.toFixed(2))}|${b.toArray().map((n) => n.toFixed(2))}|${color}|${this.selectedWire === w.id}`;
      const cur = this.wireMeshes.get(w.id);
      if (cur && cur.key === key) continue;
      if (cur) {
        this.sm.content.remove(cur.mesh);
        cur.mesh.geometry.dispose();
      }
      const mesh = buildWire(a, b, color, this.isVerticalEnd(w.a), this.isVerticalEnd(w.b));
      if (this.selectedWire === w.id) mesh.material = highlightMaterial(0x34d6ff);
      mesh.userData.wireId = w.id;
      this.sm.content.add(mesh);
      this.wireMeshes.set(w.id, { key, mesh });
    }
    for (const [id, e] of this.wireMeshes) {
      if (!alive.has(id)) {
        this.sm.content.remove(e.mesh);
        e.mesh.geometry.dispose();
        this.wireMeshes.delete(id);
      }
    }
  }

  private syncSelection() {
    for (const c of [...this.selectionHelpers.children]) {
      this.selectionHelpers.remove(c);
      (c as THREE.Box3Helper).geometry.dispose();
    }
    // Indicadores de terminal del componente seleccionado (anillos discretos por tipo).
    for (const c of [...this.terminalMarkers.children]) {
      this.terminalMarkers.remove(c);
      (c as THREE.Mesh).geometry.dispose();
    }
    if (this.selection.size === 1) {
      const inst = this.project.components.find((k) => this.selection.has(k.id));
      if (inst && !isBoardType(inst.type)) {
        const ins = getDef(inst.type).insertable;
        for (const t of terminalsOf(inst)) {
          const pos = this.endPosition({ kind: 'pin', inst: inst.id, term: t.id });
          if (!pos) continue;
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(ins ? 1.25 : 3.2, ins ? 0.22 : 0.4, 8, 28),
            new THREE.MeshBasicMaterial({ color: TERMINAL_COLORS[t.kind] ?? 0x0a84ff, depthTest: false, transparent: true, opacity: 0.95 }),
          );
          if (ins) {
            ring.rotation.x = Math.PI / 2;
            ring.position.copy(pos).setY(BOARD_TOP + 0.35);
          } else {
            ring.position.copy(pos);
            ring.lookAt(this.sm.camera.position);
          }
          ring.renderOrder = 25;
          this.terminalMarkers.add(ring);
        }
      }
    }
    for (const id of this.selection) {
      const e = this.visuals.get(id);
      if (!e) continue;
      const box = this.visibleBox(e.root);
      box.expandByScalar(0.8);
      const helper = new THREE.Box3Helper(box, new THREE.Color(0x34d6ff));
      (helper.material as THREE.LineBasicMaterial).depthTest = false;
      helper.renderOrder = 30;
      this.selectionHelpers.add(helper);
    }
  }

  private syncProbes() {
    for (const c of [...this.probeMarkers.children]) this.probeMarkers.remove(c);
    for (const [k, color] of [['red', 0xff3b3b], ['black', 0x222226]] as const) {
      const pr = this.probes[k];
      if (!pr) continue;
      const pos = this.endPosition(pr.end);
      if (!pos) {
        delete this.probes[k];
        continue;
      }
      pr.pos = pos;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.2, 10, 16), new THREE.MeshStandardMaterial({ color, roughness: 0.3, emissive: color, emissiveIntensity: 0.25 }));
      cone.rotation.x = Math.PI;
      cone.position.copy(pos).add(new THREE.Vector3(0, 6, 0));
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 16, 16), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
      handle.position.copy(pos).add(new THREE.Vector3(0, 19, 0));
      this.probeMarkers.add(cone, handle);
    }
  }

  /** Aplica el estado de simulación a los modelos 3D (null = simulación detenida). */
  applyReports(reports: Map<string, InstanceReport> | null) {
    this.lastReports = reports;
    for (const [id, e] of this.visuals) e.visual?.applyVisual(reports?.get(id)?.visual ?? null);
    this.sm.needsRender = true;
  }

  /* ======================= picking ======================= */

  private pick(e: PointerEvent): Pick | null {
    const ray = this.sm.ray(e.clientX, e.clientY);
    const hits = ray.intersectObjects(this.sm.content.children, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      if (o.userData.wireId) return { kind: 'wire', id: o.userData.wireId, point: h.point };
      let term: string | undefined;
      let boardTop = false;
      while (o) {
        if (o.userData.term) term = o.userData.term;
        if (o.userData.boardTop) boardTop = true;
        if (o.userData.instId) {
          const inst = o.userData.instId as string;
          if (term) return { kind: 'pin', inst, term, point: h.point };
          return { kind: 'component', inst, point: h.point, boardTop };
        }
        o = o.parent;
      }
    }
    const p = this.sm.planeHit(e.clientX, e.clientY, 0);
    return p ? { kind: 'table', point: p } : null;
  }

  /** Punto eléctrico (pin o perforación) bajo el puntero. */
  private pointAt(e: PointerEvent): PointRef | null {
    const pk = this.pick(e);
    if (!pk) return null;
    if (pk.kind === 'pin') return this.ref({ kind: 'pin', inst: pk.inst, term: pk.term });
    if (pk.kind === 'component') {
      const c = this.project.components.find((k) => k.id === pk.inst)!;
      if (isBoardType(c.type)) {
        const local = toLocal({ x: pk.point.x, z: pk.point.z }, c);
        const L = boardLayout(c.type);
        let best: { id: string; d: number } | null = null;
        for (const h of L.holes) {
          const d = Math.hypot(h.x - local.x, h.z - local.z);
          if (d < 1.6 && (!best || d < best.d)) best = { id: h.id, d };
        }
        return best ? this.ref({ kind: 'hole', board: c.id, hole: best.id }) : null;
      }
      // Componente: terminal más cercano al punto tocado
      let best: { term: string; d: number } | null = null;
      for (const t of terminalsOf(c)) {
        const w = toWorld(t.local, c);
        const d = Math.hypot(w.x - pk.point.x, w.z - pk.point.z);
        if (!best || d < best.d) best = { term: t.id, d };
      }
      return best && best.d < 6 ? this.ref({ kind: 'pin', inst: c.id, term: best.term }) : null;
    }
    return null;
  }

  private ref(end: WireEnd): PointRef | null {
    const pos = this.endPosition(end);
    return pos ? { end, pos, label: this.endLabel(end) } : null;
  }

  /* ======================= eventos de puntero ======================= */

  private startWireDrag(pt: PointRef, e: PointerEvent) {
    this.wireStart = pt;
    this.wireDrag = true;
    this.sm.controls.enabled = false;
    this.sm.renderer.domElement.setPointerCapture(e.pointerId);
    this.onChange();
  }

  private pointerDown(e: PointerEvent) {
    if (e.button === 2) return;
    const pick = this.pick(e);
    this.down = { x: e.clientX, y: e.clientY, pick, shift: e.shiftKey || e.ctrlKey || e.metaKey };
    if (this.placing) return; // la cámara puede orbitar; la colocación se resuelve al soltar
    if (this.tool === 'wire') {
      const pt = this.pointAt(e);
      if (pt && !this.wireStart) this.startWireDrag(pt, e);
      else if (pt) this.sm.controls.enabled = false;
      return;
    }
    if (this.tool !== 'select' || !pick) return;
    if (pick.kind === 'component' || pick.kind === 'pin') {
      const inst = this.project.components.find((c) => c.id === pick.inst);
      if (!inst) return;
      // Arrastrar desde un terminal crea un cable (bornes de fuentes siempre; pines de
      // componentes insertables cuando el componente está seleccionado y sus terminales visibles).
      if (pick.kind === 'pin' && !this.simActive && (!getDef(inst.type).insertable || this.selection.has(inst.id))) {
        const pt = this.ref({ kind: 'pin', inst: inst.id, term: pick.term });
        if (pt) {
          this.startWireDrag(pt, e);
          return;
        }
      }
      // Interacción con entradas durante la simulación
      if (this.simActive && inst.type === 'pushbutton' && this.pressed) {
        this.pressed.add(inst.id);
        this.pressedButton = inst.id;
        this.sm.controls.enabled = false;
        this.onChange();
        return;
      }
      if (this.simActive && inst.type === 'slide-switch') {
        this.onToggleSwitch(inst.id);
        return;
      }
      if (!this.selection.has(inst.id)) {
        if (!this.down.shift) this.selection.clear();
        this.selectWithGroup(inst.id);
        this.selectedWire = null;
        this.syncWires();
        this.syncSelection();
        this.onChange();
      }
      this.beginDrag(inst, e);
    }
  }

  private beginDrag(primary: ComponentInstance, e: PointerEvent) {
    const hit = this.sm.planeHit(e.clientX, e.clientY, 0);
    if (!hit) return;
    const start = new Map<string, { x: number; z: number }>();
    const add = (c: ComponentInstance) => start.set(c.id, { x: c.x, z: c.z });
    for (const id of this.selection) {
      const c = this.project.components.find((k) => k.id === id);
      if (!c) continue;
      add(c);
      // Mover una protoboard arrastra los componentes insertados en ella
      if (isBoardType(c.type)) {
        for (const [pk, ins] of this.netlist.insertion) {
          if (ins.board !== c.id) continue;
          const other = this.project.components.find((k) => k.id === pk.split(':')[0]);
          if (other) add(other);
        }
      }
    }
    this.drag = { snapshot: this.store.snapshot(), primary: primary.id, start, grab: hit.clone().sub(new THREE.Vector3(primary.x, 0, primary.z)), moved: false };
    this.sm.controls.enabled = false;
    this.sm.renderer.domElement.setPointerCapture(e.pointerId);
  }

  private pointerMove(e: PointerEvent) {
    if (this.placing) {
      this.movePlacement(e.clientX, e.clientY);
      return;
    }
    if (this.wireDrag) {
      this.setHover(this.pointAt(e));
      this.updatePreview(e);
      return;
    }
    if (this.drag) {
      const hit = this.sm.planeHit(e.clientX, e.clientY, 0);
      if (!hit) return;
      const d = this.drag;
      const primary = this.project.components.find((c) => c.id === d.primary)!;
      const s0 = d.start.get(d.primary)!;
      const target = { x: hit.x - d.grab.x, z: hit.z - d.grab.z };
      const others = new Set(d.start.keys());
      const snapped = this.snapPosition(primary, target.x, target.z, others);
      const dx = snapped.x - s0.x;
      const dz = snapped.z - s0.z;
      if (Math.abs(dx) + Math.abs(dz) > 0.01) d.moved = true;
      this.store.mutateSilently((p) => {
        for (const [id, st] of d.start) {
          const c = p.components.find((k) => k.id === id);
          if (c) {
            c.x = st.x + dx;
            c.z = st.z + dz;
          }
        }
      });
      return;
    }
    if (this.tool === 'wire' || this.tool === 'probe') {
      this.setHover(this.pointAt(e));
      if (this.wireStart) this.updatePreview(e);
    } else {
      const pk = this.pick(e);
      this.sm.renderer.domElement.style.cursor = pk && (pk.kind === 'component' || pk.kind === 'pin' || pk.kind === 'wire') ? 'pointer' : '';
    }
  }

  private pointerUp(e: PointerEvent) {
    if (this.pressedButton && this.pressed) {
      this.pressed.delete(this.pressedButton);
      this.pressedButton = null;
      this.sm.controls.enabled = true;
      this.onChange();
    }
    const down = this.down;
    this.down = null;
    const moved = !!down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6;
    const release = () => {
      this.sm.controls.enabled = true;
      try {
        this.sm.renderer.domElement.releasePointerCapture(e.pointerId);
      } catch {
        /* sin captura */
      }
    };
    if (this.wireDrag) {
      this.wireDrag = false;
      release();
      if (moved) {
        const pt = this.pointAt(e);
        if (pt && this.wireStart && !sameEnd(pt.end, this.wireStart.end)) this.addWire(this.wireStart.end, pt.end);
        this.cancelWire();
      } else if (this.tool !== 'wire') {
        // Clic simple sobre un terminal con la herramienta Seleccionar: selecciona el componente.
        this.cancelWire();
        const pk = down?.pick;
        if (pk && (pk.kind === 'pin' || pk.kind === 'component')) this.select(pk.inst);
      }
      return;
    }
    if (this.placing) {
      release();
      if (moved) return; // gesto de cámara
      this.movePlacement(e.clientX, e.clientY);
      // Ratón: el clic confirma. Táctil: el toque posiciona y se confirma con el botón.
      if (e.pointerType === 'mouse') this.confirmPlacement();
      return;
    }
    if (this.drag) {
      const d = this.drag;
      this.drag = null;
      release();
      if (!d.moved) return;
      const ids = new Set(d.start.keys());
      const issue = [...ids].map((id) => this.project.components.find((c) => c.id === id)).map((c) => c && this.placementIssue(c, ids)).find(Boolean);
      if (issue) {
        this.store.mutateSilently((p) => {
          for (const [id, st] of d.start) {
            const c = p.components.find((k) => k.id === id);
            if (c) Object.assign(c, st);
          }
        });
        this.onMessage(`${issue} Se devolvió a su posición anterior.`, 'warn');
        return;
      }
      this.store.commitFrom(d.snapshot, 'Mover');
      return;
    }
    this.sm.controls.enabled = true;
    if (!down) return;
    if (moved) return; // fue un gesto de cámara
    if (this.tool === 'select') {
      const pk = down.pick;
      if (pk?.kind === 'wire') {
        this.selection.clear();
        this.selectedWire = pk.id;
      } else if (!pk || pk.kind === 'table') {
        this.selection.clear();
        this.selectedWire = null;
      }
      this.syncWires();
      this.syncSelection();
      this.sm.needsRender = true;
      this.onChange();
    } else if (this.tool === 'wire') {
      // Segundo clic del modo "clic en origen, clic en destino".
      const pt = this.pointAt(e);
      if (pt && this.wireStart && !sameEnd(pt.end, this.wireStart.end)) this.addWire(this.wireStart.end, pt.end);
      this.cancelWire();
    } else if (this.tool === 'probe') {
      const pt = this.pointAt(e);
      if (!pt) return;
      if (!this.probes.red || (this.probes.red && this.probes.black)) {
        this.probes = { red: pt };
      } else {
        this.probes.black = pt;
      }
      this.syncProbes();
      this.sm.needsRender = true;
      this.onChange();
    }
  }

  private selectWithGroup(id: string) {
    const c = this.project.components.find((k) => k.id === id);
    if (!c) return;
    this.selection.add(id);
    if (c.group) {
      for (const k of this.project.components) if (k.group === c.group) this.selection.add(k.id);
    }
  }

  /* ======================= encaje (snap) ======================= */

  /**
   * Ajusta la posición: los componentes insertables encajan su primer pin en la perforación
   * más cercana; las protoboards en la rejilla de 2,54 mm; el resto en una rejilla de 1 mm.
   */
  snapPosition(c: ComponentInstance, x: number, z: number, ignore: Set<string> = new Set()): { x: number; z: number } {
    if (isBoardType(c.type)) return { x: Math.round(x / PITCH) * PITCH, z: Math.round(z / PITCH) * PITCH };
    const def = getDef(c.type);
    if (!def.insertable) return { x: Math.round(x), z: Math.round(z) };
    const t0 = def.terminals(withDefaults(def, c.params))[0];
    const r = rotate(t0.local, c.rot);
    const pin = { x: x + r.x, z: z + r.z };
    let best: { x: number; z: number; d: number } | null = null;
    for (const b of this.project.components) {
      if (!isBoardType(b.type) || ignore.has(b.id)) continue;
      const L = boardLayout(b.type);
      const local = toLocal(pin, b);
      if (Math.abs(local.x) > L.width / 2 + 3 || Math.abs(local.z) > L.depth / 2 + 3) continue;
      for (const h of L.holes) {
        const d = Math.hypot(h.x - local.x, h.z - local.z);
        if (d < 5.5 && (!best || d < best.d)) {
          const w = toWorld(h, b);
          best = { x: w.x, z: w.z, d };
        }
      }
    }
    if (best) return { x: best.x - r.x, z: best.z - r.z };
    const g = PITCH / 2;
    return { x: Math.round(pin.x / g) * g - r.x, z: Math.round(pin.z / g) * g - r.z };
  }

  /* ======================= cables y resaltado de nodos ======================= */

  private setHover(p: PointRef | null) {
    const changed = (p && this.hover ? endKey(p.end) !== endKey(this.hover.end) : p !== this.hover);
    this.hover = p;
    if (!changed) return;
    this.hoverRing.visible = !!p;
    if (p) this.hoverRing.position.copy(p.pos).add(new THREE.Vector3(0, 0.6, 0));
    this.highlightNet(p ? this.netlist.netOf(p.end) : undefined);
    this.sm.needsRender = true;
    this.onChange();
  }

  /** Marca todos los puntos eléctricamente unidos al nodo indicado. */
  highlightNet(net: number | undefined) {
    const m = new THREE.Matrix4();
    let n = 0;
    if (net !== undefined) {
      const info = this.netlist.nets[net];
      const pts: THREE.Vector3[] = [];
      for (const hk of info.holes) {
        const [board, hole] = hk.split(':');
        const pos = this.endPosition({ kind: 'hole', board, hole });
        if (pos) pts.push(pos);
      }
      for (const pk of info.pins) {
        const [inst, term] = pk.split(':');
        if (this.netlist.insertion.has(pk)) continue;
        const pos = this.endPosition({ kind: 'pin', inst, term });
        if (pos) pts.push(pos);
      }
      for (const p of pts.slice(0, 512)) {
        m.makeTranslation(p.x, p.y + 0.3, p.z);
        this.netMarkers.setMatrixAt(n++, m);
      }
    }
    this.netMarkers.count = n;
    this.netMarkers.instanceMatrix.needsUpdate = true;
  }

  private updatePreview(e: PointerEvent) {
    if (this.previewWire) {
      this.sm.overlay.remove(this.previewWire);
      this.previewWire.geometry.dispose();
      this.previewWire = null;
    }
    if (!this.wireStart) return;
    const end = this.hover?.pos ?? this.sm.planeHit(e.clientX, e.clientY, BOARD_TOP);
    if (!end) return;
    const color = this.wireColorOf(this.wireColor, this.wireStart.end);
    this.previewWire = buildWire(this.wireStart.pos, end, color, this.isVerticalEnd(this.wireStart.end), true);
    (this.previewWire.material as THREE.Material) = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.6 });
    this.sm.overlay.add(this.previewWire);
    this.sm.needsRender = true;
  }

  cancelWire() {
    this.wireStart = null;
    if (this.previewWire) {
      this.sm.overlay.remove(this.previewWire);
      this.previewWire.geometry.dispose();
      this.previewWire = null;
    }
    this.sm.needsRender = true;
    this.onChange();
  }

  addWire(a: WireEnd, b: WireEnd) {
    const exists = this.project.wires.some((w) => (sameEnd(w.a, a) && sameEnd(w.b, b)) || (sameEnd(w.a, b) && sameEnd(w.b, a)));
    if (exists) return;
    this.store.mutate('Conectar cable', (p) => p.wires.push({ id: uid('w'), a, b, color: this.wireColor }));
  }

  setTool(t: Tool) {
    this.tool = t;
    this.cancelWire();
    this.setHover(null);
    this.sm.renderer.domElement.dataset.tool = t;
    this.onChange();
  }

  clearProbes() {
    this.probes = {};
    this.syncProbes();
    this.sm.needsRender = true;
    this.onChange();
  }

  /* ======================= edición ======================= */

  /** Añade un componente cerca del centro de la vista (encajado si cae sobre una protoboard). */
  addComponent(type: string, at?: { x: number; z: number }): string {
    const def = getDef(type);
    const t = at ?? { x: this.sm.controls.target.x, z: this.sm.controls.target.z };
    const id = uid(def.prefix.toLowerCase());
    const inst: ComponentInstance = { id, type, params: defaultParams(def), x: t.x, z: t.z, rot: 0 };
    if (isBoardType(type) && this.project.components.some((c) => isBoardType(c.type))) {
      // Evita superponer protoboards: la nueva se coloca debajo de la última.
      const maxZ = Math.max(...this.project.components.filter((c) => isBoardType(c.type)).map((c) => c.z + boardLayout(c.type).depth / 2));
      inst.z = maxZ + boardLayout(type).depth / 2 + 10;
      inst.x = 0;
    } else if (!def.insertable && !isBoardType(type)) {
      inst.z = (at?.z ?? -60) - (at ? 0 : def.size.d / 2);
      inst.x = at?.x ?? -60 - this.project.components.filter((c) => !getDef(c.type).insertable && !isBoardType(c.type)).length * 70;
    } else {
      // Busca una posición libre sobre la protoboard: primero en la mitad superior (filas a–e),
      // avanzando por columnas; luego en la mitad inferior.
      const rowsZ = [t.z - 2.5 * PITCH, t.z - 1.5 * PITCH, t.z + 3.5 * PITCH, t.z - 4.5 * PITCH, t.z + 1.5 * PITCH];
      let placed = false;
      const hasBoard = this.project.components.some((c) => isBoardType(c.type));
      for (const z of rowsZ) {
        const order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, -1, -2, -3, -4, -5, -6, -7, -8];
        for (const k of order) {
          if (placed) break;
          const s2 = this.snapPosition(inst, t.x + k * 3 * PITCH, z);
          inst.x = s2.x;
          inst.z = s2.z;
          placed = !this.collides(inst) && (!hasBoard || this.allPinsOnHoles(inst));
        }
        if (placed) break;
      }
    }
    const pos = this.snapPosition(inst, inst.x, inst.z);
    inst.x = pos.x;
    inst.z = pos.z;
    this.store.mutate(`Añadir ${def.name}`, (p) => p.components.push(inst));
    this.selection = new Set([id]);
    this.selectedWire = null;
    this.sync();
    return id;
  }

  /** Huella aproximada (rectángulo que envuelve los pines, con margen) para evitar solapes. */
  private footprint(c: ComponentInstance) {
    const pts = terminalsOf(c).map((t) => toWorld(t.local, c));
    const m = 1.6;
    return {
      x0: Math.min(...pts.map((p) => p.x)) - m,
      x1: Math.max(...pts.map((p) => p.x)) + m,
      z0: Math.min(...pts.map((p) => p.z)) - m,
      z1: Math.max(...pts.map((p) => p.z)) + m,
    };
  }

  /** true si todos los pines caen en perforaciones de alguna protoboard. */
  private allPinsOnHoles(inst: ComponentInstance): boolean {
    const boards = this.project.components.filter((c) => isBoardType(c.type));
    return terminalsOf(inst).every((t) => {
      const w = toWorld(t.local, inst);
      return boards.some((b) => {
        const local = toLocal(w, b);
        return boardLayout(b.type).holes.some((h) => Math.hypot(h.x - local.x, h.z - local.z) < 0.5);
      });
    });
  }

  private collides(inst: ComponentInstance): boolean {
    const a = this.footprint(inst);
    for (const c of this.project.components) {
      if (c.id === inst.id || isBoardType(c.type) || !getDef(c.type).insertable) continue;
      const b = this.footprint(c);
      if (a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1) return true;
    }
    return false;
  }

  rotateSelection() {
    if (!this.selection.size) return;
    this.store.mutate('Rotar', (p) => {
      for (const id of this.selection) {
        const c = p.components.find((k) => k.id === id);
        if (!c) continue;
        if (isBoardType(c.type)) {
          c.rot = (c.rot + 1) % 4;
          continue;
        }
        const t0 = terminalsOf(c)[0];
        const pin = toWorld(t0.local, c);
        c.rot = (c.rot + 1) % 4;
        const r = rotate(t0.local, c.rot);
        c.x = pin.x - r.x;
        c.z = pin.z - r.z;
      }
    });
  }

  deleteSelection() {
    if (this.selectedWire) {
      const id = this.selectedWire;
      this.store.mutate('Eliminar cable', (p) => (p.wires = p.wires.filter((w) => w.id !== id)));
      this.selectedWire = null;
      return;
    }
    if (!this.selection.size) return;
    const ids = new Set(this.selection);
    this.store.mutate('Eliminar', (p) => (p.components = p.components.filter((c) => !ids.has(c.id))));
    this.selection.clear();
  }

  duplicateSelection() {
    if (!this.selection.size) return;
    const map = new Map<string, string>();
    const copies: ComponentInstance[] = [];
    const sel = this.project.components.filter((c) => this.selection.has(c.id));
    const hasBoard = sel.some((c) => isBoardType(c.type));
    const off = hasBoard ? { x: 0, z: 70 } : { x: 5 * PITCH, z: 0 };
    const newGroup = sel.some((c) => c.group) ? uid('g') : undefined;
    for (const c of sel) {
      const id = uid(getDef(c.type).prefix.toLowerCase());
      map.set(c.id, id);
      copies.push({ ...JSON.parse(JSON.stringify(c)), id, x: c.x + off.x, z: c.z + off.z, group: c.group ? newGroup : undefined });
    }
    const wires = this.project.wires
      .filter((w) => [w.a, w.b].every((e) => map.has(e.kind === 'pin' ? e.inst : e.board)))
      .map((w) => ({
        id: uid('w'),
        color: w.color,
        a: remap(w.a, map),
        b: remap(w.b, map),
      }));
    this.store.mutate('Duplicar', (p) => {
      p.components.push(...copies);
      p.wires.push(...wires);
    });
    this.selection = new Set(copies.map((c) => c.id));
    this.sync();
  }

  groupSelection() {
    if (this.selection.size < 2) return;
    const g = uid('g');
    this.store.mutate('Agrupar', (p) => {
      for (const c of p.components) if (this.selection.has(c.id)) c.group = g;
    });
  }

  ungroupSelection() {
    this.store.mutate('Desagrupar', (p) => {
      for (const c of p.components) if (this.selection.has(c.id)) delete c.group;
    });
  }

  selectAll() {
    this.selection = new Set(this.project.components.map((c) => c.id));
    this.syncSelection();
    this.sm.needsRender = true;
    this.onChange();
  }

  select(id: string | null) {
    this.selection = new Set(id ? [id] : []);
    this.selectedWire = null;
    if (id) this.selectWithGroup(id);
    this.syncWires();
    this.syncSelection();
    this.sm.needsRender = true;
    this.onChange();
  }

  /* ======================= colocación desde la biblioteca ======================= */

  /** Inicia la colocación: aparece una vista fantasma que sigue al puntero. */
  beginPlacement(type: string, params: Params = {}, name?: string) {
    this.cancelPlacement();
    this.cancelWire();
    if (this.tool !== 'select') this.setTool('select');
    const def = getDef(type);
    const full = { ...defaultParams(def), ...params };
    const root = new THREE.Group();
    if (isBoardType(type)) root.add(buildBoard(type));
    else {
      const p = withDefaults(def, full);
      root.add(buildComponentVisual(type, p, def.terminals(p)).root);
    }
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (o.userData.term || (o as THREE.Sprite).isSprite) {
        o.visible = false;
        return;
      }
      if (!m.isMesh) return;
      const src = m.material as THREE.MeshStandardMaterial;
      const mat = src.clone();
      mat.transparent = true;
      mat.opacity = 0.62;
      mat.userData = { own: true, ghost: true };
      m.material = mat;
      m.castShadow = false;
    });
    this.sm.overlay.add(root);
    const t = this.sm.controls.target;
    this.placing = { type, params: full, name: name ?? def.name, rot: 0, x: t.x, z: t.z, root, issue: null, last: null };
    this.updatePlacement(t.x, t.z);
    this.select(null);
  }

  private ghostInst(): ComponentInstance {
    const pl = this.placing!;
    return { id: '__ghost__', type: pl.type, params: pl.params, x: pl.x, z: pl.z, rot: pl.rot };
  }

  movePlacement(cx: number, cy: number) {
    if (!this.placing) return;
    this.placing.last = { cx, cy };
    const hit = this.sm.planeHit(cx, cy, 0);
    if (hit) this.updatePlacement(hit.x, hit.z);
  }

  private updatePlacement(x: number, z: number) {
    const pl = this.placing!;
    const g = { ...this.ghostInst(), x, z };
    const s = this.snapPosition(g, x, z);
    pl.x = s.x;
    pl.z = s.z;
    const inst = this.ghostInst();
    pl.issue = this.placementIssue(inst, new Set());
    const def = getDef(pl.type);
    const onBoard = def.insertable && !pl.issue && this.allPinsOnHoles(inst);
    pl.root.position.set(pl.x, isBoardType(pl.type) || !def.insertable ? 0 : onBoard ? BOARD_TOP : 2.2, pl.z);
    pl.root.rotation.y = (pl.rot * Math.PI) / 2;
    pl.root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!m?.userData?.ghost || !('emissive' in m)) return;
      m.emissive.setHex(pl.issue ? 0xff3b30 : 0x0a84ff);
      m.emissiveIntensity = pl.issue ? 0.55 : 0.18;
    });
    this.sm.needsRender = true;
    this.onChange();
  }

  rotatePlacement() {
    const pl = this.placing;
    if (!pl) return;
    pl.rot = (pl.rot + 1) % 4;
    if (pl.last) this.movePlacement(pl.last.cx, pl.last.cy);
    else this.updatePlacement(pl.x, pl.z);
  }

  /** Confirma la colocación. Devuelve false (con mensaje) si la posición no es válida. */
  confirmPlacement(): boolean {
    const pl = this.placing;
    if (!pl) return false;
    if (pl.issue) {
      this.onMessage(pl.issue, 'warn');
      return false;
    }
    const def = getDef(pl.type);
    const id = uid(def.prefix.toLowerCase());
    const inst: ComponentInstance = { id, type: pl.type, params: { ...pl.params }, x: pl.x, z: pl.z, rot: pl.rot };
    this.cancelPlacement();
    this.store.mutate(`Colocar ${def.name}`, (p) => p.components.push(inst));
    this.select(id);
    return true;
  }

  cancelPlacement() {
    const pl = this.placing;
    if (!pl) return;
    this.sm.overlay.remove(pl.root);
    pl.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
    this.placing = null;
    this.sm.needsRender = true;
    this.onChange();
  }

  /**
   * Comprueba si un componente puede quedar en su posición actual. Devuelve un mensaje
   * comprensible o null. `moving` = componentes que se mueven juntos (se ignoran entre sí).
   */
  placementIssue(inst: ComponentInstance, moving: Set<string>): string | null {
    const boards = this.project.components.filter((c) => isBoardType(c.type) && c.id !== inst.id);
    const rectOf = (c: ComponentInstance, w: number, d: number) => {
      const [hw, hd] = c.rot % 2 ? [d / 2, w / 2] : [w / 2, d / 2];
      return { x0: c.x - hw, x1: c.x + hw, z0: c.z - hd, z1: c.z + hd };
    };
    const overlap = (a: ReturnType<typeof rectOf>, b: ReturnType<typeof rectOf>) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
    if (isBoardType(inst.type)) {
      const L = boardLayout(inst.type);
      const me = rectOf(inst, L.width, L.depth);
      for (const b of boards) {
        if (moving.has(b.id)) continue;
        const BL = boardLayout(b.type);
        if (overlap(me, rectOf(b, BL.width, BL.depth))) return 'La protoboard se superpondría con otra.';
      }
      return null;
    }
    const def = getDef(inst.type);
    if (!def.insertable) {
      const me = rectOf(inst, def.size.w, def.size.d);
      for (const b of boards) {
        const BL = boardLayout(b.type);
        if (overlap(me, rectOf(b, BL.width, BL.depth))) return `${def.name} no se inserta en la protoboard: colócalo en la mesa y conéctalo con cables.`;
      }
      return null;
    }
    let onBoard = 0;
    const terms = terminalsOf(inst);
    for (const t of terms) {
      const w = toWorld(t.local, inst);
      const b = boards.find((bb) => {
        const L = boardLayout(bb.type);
        const l = toLocal(w, bb);
        return Math.abs(l.x) <= L.width / 2 && Math.abs(l.z) <= L.depth / 2;
      });
      if (!b) continue;
      onBoard++;
      const l = toLocal(w, b);
      const hole = holeAt(boardLayout(b.type), l.x, l.z, 0.5);
      if (!hole) return `La pata "${t.name}" no coincide con una perforación (¿cruza el canal central o el borde?).`;
      const others = (this.netlist.occupied.get(holeKey(b.id, hole.id)) ?? []).filter((pk) => {
        const owner = pk.split(':')[0];
        return owner !== inst.id && !moving.has(owner);
      });
      if (others.length) return `La perforación ${hole.id} ya está ocupada por ${this.names.get(others[0].split(':')[0]) ?? 'otro componente'}.`;
    }
    if (onBoard > 0 && onBoard < terms.length) return 'Parte de las patas quedaría fuera de la protoboard.';
    return null;
  }

  /** Posiciones en pantalla de los terminales del componente seleccionado (etiquetas). */
  terminalLabels(): { text: string; x: number; y: number }[] {
    if (this.selection.size !== 1) return [];
    const inst = this.project.components.find((k) => this.selection.has(k.id));
    if (!inst || isBoardType(inst.type)) return [];
    const out: { text: string; x: number; y: number }[] = [];
    for (const t of terminalsOf(inst)) {
      const pos = this.endPosition({ kind: 'pin', inst: inst.id, term: t.id });
      if (!pos) continue;
      const s = this.sm.toScreen(pos.clone().setY(Math.max(pos.y, BOARD_TOP) + 0.5));
      if (s.visible) out.push({ text: t.id, x: s.x, y: s.y });
    }
    return out;
  }

  /** Caja envolvente de las piezas visibles (sin halos ni esferas de selección). */
  private visibleBox(root: THREE.Object3D): THREE.Box3 {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || o.userData.term) return;
      box.expandByObject(m);
    });
    return box;
  }

  /** Centro de un componente en pantalla (para etiquetas y avisos HTML). */
  screenPos(id: string, lift = 14): { x: number; y: number; visible: boolean } | null {
    const e = this.visuals.get(id);
    if (!e) return null;
    const box = this.visibleBox(e.root);
    const c = box.getCenter(new THREE.Vector3());
    c.y = box.max.y + lift * 0.2;
    return this.sm.toScreen(c);
  }

  focusOn(id: string) {
    const c = this.project.components.find((k) => k.id === id);
    if (!c) return;
    const delta = new THREE.Vector3(c.x, 0, c.z).sub(this.sm.controls.target);
    this.sm.controls.target.add(delta);
    this.sm.camera.position.add(delta);
    this.sm.needsRender = true;
  }

  netLabel(end: WireEnd): string {
    const n = this.netlist.netOf(end);
    return n === undefined ? '—' : `nodo ${n}`;
  }

  holeKeyOf(board: string, hole: string) {
    return holeKey(board, hole);
  }

  dispose() {
    for (const d of this.disposers) d();
    for (const id of [...this.visuals.keys()]) this.removeVisual(id);
    for (const [, w] of this.wireMeshes) {
      this.sm.content.remove(w.mesh);
      w.mesh.geometry.dispose();
    }
  }
}

function remap(e: WireEnd, map: Map<string, string>): WireEnd {
  return e.kind === 'pin' ? { ...e, inst: map.get(e.inst)! } : { ...e, board: map.get(e.board)! };
}
