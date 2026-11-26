/**
 * Laboratorio 3D (Fase 1): colocar, seleccionar, mover, rotar, duplicar, agrupar y eliminar
 * átomos; medir distancias y ángulos; guardar el experimento.
 *
 * Enlaces: la proximidad o el arrastre NUNCA crean uniones químicas. Los enlaces aparecen solo:
 *  - al formar o insertar una estructura documentada (enlaces y órdenes de la fuente), o
 *  - con la herramienta «Enlazar», tras validar reglas de valencia (src/chem/bonding.ts). Esos
 *    enlaces se marcan como propuesta del usuario hasta que la molécula coincide con una
 *    estructura documentada; entonces se adopta la geometría de la fuente.
 */
import * as THREE from 'three';
import { element, FAMILIES, type ChemElement } from '../chem/elements';
import { angle, distance, hillFormula, subscript } from '../chem/formula';
import { uid } from '../core/format';
import type { ProjectStore } from '../core/store';
import type { AtomInstance, Measurement } from '../core/types';
import { buildLabAtom, disposeObject, visualRadius } from '../render/atomModels';
import { analyzeCombination } from '../chem/combination';
import { bondKind, checkBond, components, recognize, valenceReport } from '../chem/bonding';
import { describeLooseAtom, describeStructure, type SubstanceDescription } from '../chem/description';
import { structure as structureRecord, type StructureRecord } from '../chem/structures';
import { SceneManager } from '../render/SceneManager';
import { qualityOf, type AppSettings } from '../settings';
import { clear, h, icon, iconBtn, toast } from './dom';
import { PeriodicTable } from './PeriodicTable';
import { swipeToClose } from './swipe';
import { analyzeBond } from '../chem/bondAnalysis';
import { bondAnalysisCard } from './BondAnalysisView';

type Tool = 'select' | 'bond' | 'distance' | 'angle';
const JOIN = ['', '–', '=', '≡'];
/** Pantalla estrecha (teléfono): los paneles flotantes se muestran de uno en uno. */
const compact = () => window.innerWidth < 860;

export interface LabCallbacks {
  save(): void;
  exportFile(): void;
  openSheet(e: ChemElement): void;
  viewAtom(e: ChemElement): void;
  toggleNav(): void;
}

interface Entry {
  key: string;
  root: THREE.Group;
}

export class LabView {
  readonly el: HTMLElement;
  readonly sm: SceneManager;
  private entries = new Map<string, Entry>();
  selection = new Set<string>();
  private tool: Tool = 'select';
  private measurePick: string[] = [];
  private bondPick: string[] = [];
  private bondOrder = 1;
  private multi = false;
  private multiBtn!: HTMLButtonElement;
  private bondBar!: HTMLElement;
  private placing: { z: number; ghost: THREE.Group; y: number; touchPos: boolean } | null = null;
  private drag: { snapshot: string; start: Map<string, [number, number, number]>; plane: THREE.Plane; grab: THREE.Vector3; vertical: boolean; moved: boolean } | null = null;
  private down: { x: number; y: number; atom: string | null; shift: boolean; wasSelected: boolean } | null = null;
  private selHelpers = new THREE.Group();
  private measureGroup = new THREE.Group();
  private bondGroup = new THREE.Group();
  private anim: { t: number; dur: number; from: Map<string, THREE.Vector3>; to: Map<string, THREE.Vector3>; done: () => void } | null = null;
  private overlay!: HTMLElement;
  private props!: HTMLElement;
  private picker!: HTMLElement;
  private table: PeriodicTable | null = null;
  private analysis!: HTMLElement;
  private analysisOpen = false;
  /** El usuario cerró el panel de propiedades (o lo tapó otro panel) hasta la próxima selección. */
  private propsDismissed = false;
  private atomActions!: HTMLElement;
  /** Panel «Análisis del enlace» (mismo sitio que el panel del átomo). */
  private bondInfo!: HTMLElement;
  private placeBar!: HTMLElement;
  private toolBtns = new Map<Tool, HTMLButtonElement>();
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private nameInput!: HTMLInputElement;
  private status!: HTMLElement;
  private active = false;
  private pendingFrame = true;

  constructor(
    private readonly store: ProjectStore,
    private settings: AppSettings,
    private readonly cb: LabCallbacks,
  ) {
    const stage = h('div', { class: 'stage' });
    this.el = h('div', { class: 'lab' }, this.buildBar(), stage);
    this.sm = new SceneManager(stage, qualityOf(settings), { floor: true });
    this.sm.overlay.add(this.selHelpers, this.measureGroup);
    this.sm.content.add(this.bondGroup);
    this.overlay = h('div', { class: 'overlay' });
    this.props = h('aside', { class: 'lab-props floating-glass hidden', 'aria-label': 'Propiedades' });
    this.picker = h('aside', { class: 'lab-picker floating-glass hidden', 'aria-label': 'Elementos' });
    this.substances = h('aside', { class: 'lab-subst floating-glass hidden', 'aria-label': 'Sustancias en el laboratorio' });
    this.placeBar = h('div', { class: 'place-bar floating-glass hidden' });
    this.bondBar = h('div', { class: 'place-bar bond-bar floating-glass hidden' });
    this.barMenu = h('div', { class: 'bar-menu floating-glass hidden', role: 'menu' });
    this.analysis = h('section', { class: 'analysis floating-glass' });
    this.status = h('div', { class: 'lab-status' });
    this.atomActions = h('div', { class: 'atom-actions hidden' });
    this.bondInfo = h('aside', { class: 'lab-props lab-bondinfo floating-glass hidden', 'aria-label': 'Análisis del enlace' });
    stage.append(
      this.bondInfo,
      this.overlay,
      this.picker,
      this.substances,
      this.props,
      this.placeBar,
      this.bondBar,
      this.barMenu,
      this.analysis,
      this.status,
      this.atomActions,
      h('div', { class: 'cam-ctrl floating-glass' }, iconBtn('zoomIn', 'Acercar', () => this.sm.zoom(0.8)), iconBtn('zoomOut', 'Alejar', () => this.sm.zoom(1.25)), iconBtn('top', 'Vista superior', () => this.sm.setView('top', this.sm.controls.target.clone())), iconBtn('reset', 'Encuadrar todo', () => this.sm.frameContent())),
    );
    const c = this.sm.renderer.domElement;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('contextmenu', (e) => (e.preventDefault(), this.cancelPlacement()));
    window.addEventListener('keydown', (e) => this.onKey(e));
    store.subscribe(() => this.sync());
    // Paneles que se cierran deslizándolos con el dedo (hacia abajo o hacia arriba).
    swipeToClose(this.props, { onClose: () => ((this.propsDismissed = true), this.renderProps()) });
    swipeToClose(this.substances, { onClose: () => this.toggleSubstances(false) });
    swipeToClose(this.picker, { onClose: () => this.togglePicker(false) });
    swipeToClose(this.barMenu, { onClose: () => this.toggleBarMenu(false) });
    swipeToClose(this.analysis, { dirs: ['down'], onClose: () => this.setAnalysis(false) });
    swipeToClose(this.bondInfo, { onClose: () => this.hideBondInfo() });
    this.sm.onFrame((dt) => {
      this.stepAnimation(dt);
      this.updateOverlay();
    });
    this.sync();
  }

  /* ============================ ciclo de vida ============================ */

  activate() {
    this.active = true;
    this.sm.start();
    this.sm.resize();
    if (this.pendingFrame) {
      this.pendingFrame = false;
      this.sm.frameContent();
    }
  }
  deactivate() {
    this.active = false;
    this.sm.stop();
    this.cancelPlacement();
  }
  requestFrame() {
    if (this.active) this.sm.frameContent();
    else this.pendingFrame = true;
  }
  applySettings(s: AppSettings) {
    this.settings = s;
    this.sm.setQuality(qualityOf(s));
  }

  /* ============================ barra superior ============================ */

  private buildBar(): HTMLElement {
    this.nameInput = h('input', { class: 'exp-name', 'aria-label': 'Nombre del experimento' }) as HTMLInputElement;
    this.nameInput.addEventListener('change', () => this.store.mutate('Renombrar', (p) => (p.name = this.nameInput.value.trim() || 'Experimento sin título')));
    this.undoBtn = iconBtn('undo', 'Deshacer (Ctrl+Z)', () => this.store.undo());
    this.redoBtn = iconBtn('redo', 'Rehacer (Ctrl+Y)', () => this.store.redo());
    const tool = (t: Tool, ic: string, tip: string) => {
      const b = iconBtn(ic, tip, () => this.setTool(t));
      this.toolBtns.set(t, b);
      return b;
    };
    const add = h('button', { class: 'btn primary add-btn', type: 'button', 'data-tip': 'Añadir elemento (E)', onclick: () => this.togglePicker() }, icon('plus', 16), h('span', {}, 'Elemento'));
    this.multiBtn = iconBtn('group', 'Selección múltiple: toca varios átomos para seleccionarlos juntos', () => this.toggleMulti());
    this.multiBtn.classList.add('multi-btn');
    // En el teléfono, lo marcado como secundario pasa al menú «Más» (la barra no se desplaza).
    const sec = <T extends HTMLElement>(el: T) => (el.classList.add('bar-secondary'), el);
    const more = iconBtn('more', 'Más herramientas', () => this.toggleBarMenu());
    more.classList.add('bar-more');
    this.barMoreBtn = more;
    return h(
      'header',
      { class: 'lab-bar' },
      sec(iconBtn('sidebar', 'Mostrar u ocultar navegación', () => this.cb.toggleNav())),
      add,
      tool('select', 'cursor', 'Seleccionar y mover (V) · Alt+arrastrar: altura'),
      tool('bond', 'bond', 'Enlazar dos átomos (B): toca el primero y luego el segundo'),
      this.multiBtn,
      h('span', { class: 'sep' }),
      this.undoBtn,
      sec(this.redoBtn),
      sec(h('span', { class: 'sep' })),
      sec(this.nameInput),
      sec(h('span', { class: 'sep' })),
      sec(tool('distance', 'ruler', 'Medir distancia entre dos átomos (D)')),
      sec(tool('angle', 'angle', 'Medir ángulo entre tres átomos (A)')),
      sec(h('span', { class: 'sep' })),
      sec(iconBtn('rotate', 'Girar selección 15° (R)', () => this.rotateSelection())),
      sec(iconBtn('copy', 'Duplicar (Ctrl+D)', () => this.duplicate())),
      sec(iconBtn('group', 'Agrupar / desagrupar (Ctrl+G)', () => this.toggleGroup())),
      sec(iconBtn('trash', 'Eliminar (Supr)', () => this.deleteSelection())),
      h('span', { class: 'grow' }),
      sec((this.substBtn = iconBtn('molecule', 'Sustancias del laboratorio: enlaces y tipo de material', () => this.toggleSubstances()))),
      sec(iconBtn('eye', 'Mostrar u ocultar símbolos', () => this.store.mutate('Etiquetas', (p) => (p.view.labels = !p.view.labels)))),
      sec(iconBtn('save', 'Guardar (Ctrl+S)', () => this.cb.save())),
      sec(iconBtn('download', 'Exportar experimento', () => this.cb.exportFile())),
      more,
    );
  }

  private barMenu!: HTMLElement;
  private barMoreBtn!: HTMLButtonElement;

  /** Menú «Más» del teléfono: herramientas que no caben en la barra. */
  private toggleBarMenu(force?: boolean) {
    const open = force ?? this.barMenu.classList.contains('hidden');
    this.barMenu.classList.toggle('hidden', !open);
    this.barMoreBtn.classList.toggle('active', open);
    if (!open) return;
    this.togglePicker(false);
    clear(this.barMenu);
    const item = (ic: string, label: string, fn: () => void, opts: { disabled?: boolean; active?: boolean } = {}) => {
      const b = h('button', { class: `menu-item ${opts.active ? 'active' : ''}`, type: 'button', onclick: () => (this.toggleBarMenu(false), fn()) }, icon(ic, 18), h('span', {}, label)) as HTMLButtonElement;
      b.disabled = !!opts.disabled;
      return b;
    };
    const name = h('input', { class: 'exp-name menu-name', value: this.store.project.name, 'aria-label': 'Nombre del experimento' }) as HTMLInputElement;
    name.addEventListener('change', () => this.store.mutate('Renombrar', (p) => (p.name = name.value.trim() || 'Experimento sin título')));
    const noSel = this.selection.size === 0;
    this.barMenu.append(
      name,
      item('molecule', 'Sustancias: enlaces y material', () => this.toggleSubstances(true), { active: !this.substances.classList.contains('hidden') }),
      item('redo', 'Rehacer', () => this.store.redo(), { disabled: !this.store.canRedo() }),
      h('div', { class: 'menu-sep' }),
      item('ruler', 'Medir distancia', () => this.setTool('distance'), { active: this.tool === 'distance' }),
      item('angle', 'Medir ángulo', () => this.setTool('angle'), { active: this.tool === 'angle' }),
      h('div', { class: 'menu-sep' }),
      item('rotate', 'Girar selección 15°', () => this.rotateSelection(), { disabled: this.selection.size < 2 }),
      item('copy', 'Duplicar selección', () => this.duplicate(), { disabled: noSel }),
      item('group', 'Agrupar / desagrupar', () => this.toggleGroup(), { disabled: noSel }),
      item('trash', 'Eliminar selección', () => this.deleteSelection(), { disabled: noSel }),
      h('div', { class: 'menu-sep' }),
      item('eye', 'Mostrar u ocultar símbolos', () => this.store.mutate('Etiquetas', (p) => (p.view.labels = !p.view.labels))),
      item('save', 'Guardar', () => this.cb.save()),
      item('download', 'Exportar experimento', () => this.cb.exportFile()),
    );
  }

  private refreshBar() {
    this.undoBtn.disabled = !this.store.canUndo();
    this.redoBtn.disabled = !this.store.canRedo();
    if (document.activeElement !== this.nameInput) this.nameInput.value = this.store.project.name;
    for (const [t, b] of this.toolBtns) b.classList.toggle('active', t === this.tool);
    this.multiBtn.classList.toggle('active', this.multi);
  }

  setTool(t: Tool) {
    this.tool = t;
    this.measurePick = [];
    this.bondPick = [];
    if (t === 'bond') {
      this.togglePicker(false);
      if (this.selection.size) this.select([]); // que el panel de propiedades no tape los átomos
    }
    this.refreshBar();
    this.renderStatus();
    this.renderBondBar();
    this.renderProps();
    this.syncSelectionVisuals();
  }

  private toggleMulti() {
    this.multi = !this.multi;
    if (this.multi && this.tool !== 'select') this.setTool('select');
    this.refreshBar();
    toast(this.multi ? 'Selección múltiple activada: toca los átomos que quieras añadir o quitar' : 'Selección múltiple desactivada', 'info');
  }

  /* ============================ herramienta «Enlazar» ============================ */

  private renderBondBar() {
    clear(this.bondBar);
    const show = this.tool === 'bond' && !this.placing;
    this.bondBar.classList.toggle('hidden', !show);
    this.bondBar.parentElement?.classList.toggle('bonding', show);
    if (!show) return;
    const orders: [number, string][] = [
      [1, 'Simple'],
      [2, 'Doble'],
      [3, 'Triple'],
    ];
    const first = this.bondPick[0] ? this.atom(this.bondPick[0]) : null;
    this.bondBar.append(
      h('span', { class: 'bond-hint' }, h('b', {}, 'Enlazar'), h('small', {}, first ? ` · ${element(first.z).symbol} elegido: toca el segundo átomo` : ' · toca dos átomos')),
      h('div', { class: 'seg' }, ...orders.map(([o, label]) => h('button', { class: `seg-btn ${o === this.bondOrder ? 'active' : ''}`, type: 'button', 'aria-pressed': String(o === this.bondOrder), onclick: () => ((this.bondOrder = o), this.renderBondBar()) }, h('span', { class: 'bond-glyph' }, JOIN[o]), label))),
      iconBtn('close', 'Terminar (Esc)', () => this.setTool('select')),
    );
  }

  private bondsAsSimple() {
    return this.store.project.bonds.map((b) => ({ a: b.a, b: b.b, order: b.order }));
  }

  /** Intenta crear (o cambiar/quitar) un enlace entre dos átomos con el orden elegido. */
  private tryBond(idA: string, idB: string) {
    const A = this.atom(idA);
    const B = this.atom(idB);
    if (!A || !B) return;
    const sa = this.structureOf(idA);
    const sb = this.structureOf(idB);
    if (sa || sb) {
      const rec = structureRecord((sa ?? sb)!.recordId);
      toast(`${rec?.name ?? 'Esa estructura'} ya está formada con los enlaces de la fuente. Usa «Separar» si quieres construirla tú.`, 'warn');
      return;
    }
    const existing = this.store.project.bonds.find((b) => (b.a === idA && b.b === idB) || (b.a === idB && b.b === idA));
    if (existing && existing.order === this.bondOrder) {
      this.store.mutate('Quitar enlace', (p) => (p.bonds = p.bonds.filter((x) => !((x.a === idA && x.b === idB) || (x.a === idB && x.b === idA)))));
      toast(`Enlace ${element(A.z).symbol}${JOIN[this.bondOrder]}${element(B.z).symbol} quitado`, 'info');
      return;
    }
    const chk = checkBond(A.z, B.z, idA, idB, this.bondOrder, this.bondsAsSimple());
    if (!chk.ok) {
      toast(chk.reason, 'warn');
      return;
    }
    // Acerca el átomo que aún no tiene enlaces para que la barra se vea (posición visual, no calculada).
    const scale = this.store.project.view.atomScale * this.settings.atomScale;
    const free = (id: string) => !this.store.project.bonds.some((b) => b.a === id || b.b === id);
    const pa = new THREE.Vector3(...A.pos);
    const pb = new THREE.Vector3(...B.pos);
    const want = (visualRadius(element(A.z), scale) + visualRadius(element(B.z), scale)) * 1.9;
    const d = pa.distanceTo(pb);
    let move: { id: string; to: THREE.Vector3 } | null = null;
    if (d > want * 1.6 || d < want * 0.6) {
      const dir = d > 1e-3 ? pb.clone().sub(pa).normalize() : new THREE.Vector3(1, 0, 0);
      if (free(idB)) move = { id: idB, to: pa.clone().addScaledVector(dir, want) };
      else if (free(idA)) move = { id: idA, to: pb.clone().addScaledVector(dir, -want) };
      if (move) move.to.y = Math.max(move.to.y, visualRadius(element(this.atom(move.id)!.z), scale) + 0.02);
    }
    this.store.mutate(existing ? 'Cambiar enlace' : 'Enlazar', (p) => {
      if (existing) {
        const e = p.bonds.find((x) => (x.a === idA && x.b === idB) || (x.a === idB && x.b === idA));
        if (e) e.order = this.bondOrder;
      } else p.bonds.push({ a: idA, b: idB, order: this.bondOrder, manual: true });
      if (move) {
        const t = p.atoms.find((x) => x.id === move!.id);
        if (t) t.pos = [round(move.to.x), round(move.to.y), round(move.to.z)];
      }
    });
    // ¿Coincide la molécula construida con una estructura documentada?
    const comp = this.manualComponents().find((c) => c.includes(idA));
    const atoms = (comp ?? []).map((id) => this.atom(id)!);
    const bonds = this.store.project.bonds.filter((b) => b.manual && comp?.includes(b.a));
    const hit = recognize(atoms, bonds);
    if (hit) {
      toast(`¡Has construido ${hit.record.name}! Coincide con PubChem (CID ${hit.record.cid}): se adopta su geometría real`, 'ok');
      this.applyStructure(hit.record, hit.map, 'Reconocer ' + hit.record.name);
    } else toast(`Enlace ${element(A.z).symbol}${JOIN[this.bondOrder]}${element(B.z).symbol}: ${chk.kind}`, 'ok');
    this.showBondInfo(A.z, B.z, this.bondOrder, hit ? `Enlace creado · ${hit.record.name}` : 'Enlace que acabas de crear');
  }

  /** Grupos de átomos unidos por enlaces manuales (2 o más átomos). */
  private manualComponents(): string[][] {
    const manual = this.store.project.bonds.filter((b) => b.manual);
    const ids = [...new Set(manual.flatMap((b) => [b.a, b.b]))];
    return components(ids, manual);
  }

  private removeManualBonds(ids: string[]) {
    const set = new Set(ids);
    this.store.mutate('Quitar enlaces', (p) => (p.bonds = p.bonds.filter((b) => !(b.manual && (set.has(b.a) || set.has(b.b))))));
    toast('Enlaces quitados: los átomos quedan sueltos', 'ok');
  }

  /* ============================ selector de elementos ============================ */

  /* ============================ sustancias ============================ */

  private substances!: HTMLElement;
  private substBtn!: HTMLButtonElement;
  private openSubst = new Set<string>();

  toggleSubstances(force?: boolean) {
    const open = force ?? this.substances.classList.contains('hidden');
    this.substances.classList.toggle('hidden', !open);
    this.substBtn.classList.toggle('active', open);
    if (open) {
      this.togglePicker(false);
      this.exclusive('subst');
      this.renderSubstances();
    }
  }

  /** Lista de todo lo que hay en la escena: sustancias formadas y átomos sueltos, con su descripción química. */
  private renderSubstances() {
    if (this.substances.classList.contains('hidden')) return;
    const box = this.substances;
    clear(box);
    const p = this.store.project;
    box.append(h('div', { class: 'picker-head' }, h('b', {}, 'Sustancias en el laboratorio'), iconBtn('close', 'Cerrar', () => this.toggleSubstances(false))));
    if (!p.atoms.length) {
      box.append(h('p', { class: 'small muted' }, 'El laboratorio está vacío. Añade elementos o lleva una estructura desde la calculadora o la biblioteca.'));
      return;
    }
    const list = h('div', { class: 'subst-list' });
    for (const st of p.structures) {
      const rec = structureRecord(st.recordId);
      if (!rec) continue;
      list.append(this.substanceCard(st.id, st.atoms, describeStructure(rec), rec.id));
    }
    const built = this.manualComponents();
    for (const comp of built) list.append(this.builtCard(comp));
    const inBuilt = new Set(built.flat());
    const loose = p.atoms.filter((a) => !this.structureOf(a.id) && !inBuilt.has(a.id));
    if (loose.length) {
      const byZ = new Map<number, string[]>();
      for (const a of loose) byZ.set(a.z, [...(byZ.get(a.z) ?? []), a.id]);
      const sec = h('div', { class: 'subst-card' }, h('div', { class: 'subst-head' }, h('b', {}, 'Átomos sin enlazar'), h('span', { class: 'badge' }, String(loose.length))));
      for (const [z, ids] of byZ) {
        const e = element(z);
        const dl = describeLooseAtom(e);
        sec.append(
          h(
            'button',
            { class: 'loose-row', type: 'button', onclick: () => this.select(ids) },
            h('span', { class: 'sym', style: `--fam:${FAMILIES[e.family].color}` }, e.symbol),
            h('span', { class: 'grow' }, h('b', {}, `${e.name} ×${ids.length}`), h('small', {}, `${dl.material} · ${FAMILIES[e.family].name}`)),
          ),
        );
      }
      sec.append(h('p', { class: 'small muted' }, 'Usa la herramienta «Enlazar» para unirlos, o selecciónalos y abre «Análisis» para comprobar si forman un compuesto documentado.'));
      list.append(sec);
    }
    box.append(list);
  }

  private substanceCard(sid: string, atomIds: string[], d: SubstanceDescription, recId: string): HTMLElement {
    const open = this.openSubst.has(sid) || this.store.project.structures.length === 1;
    const det = h('details', { class: 'subst-card' }) as HTMLDetailsElement;
    det.open = open;
    det.addEventListener('toggle', () => (det.open ? this.openSubst.add(sid) : this.openSubst.delete(sid)));
    const bondRows = d.bonds.map((b) =>
      h(
        'div',
        { class: 'bond-row' },
        h('div', { class: 'bond-label' }, h('b', {}, b.label), h('span', { class: 'muted' }, ` ×${b.count}`)),
        h(
          'div',
          { class: 'bond-terms' },
          h('span', { class: 'term' }, b.bondType),
          h('span', { class: 'term' }, b.order),
          h('span', { class: 'term' }, b.sigmaPi),
          h('span', { class: `term ${b.polarity === 'polar' ? 'polar' : ''}` }, b.polarity + (b.dChi !== null ? ` · Δχ ${b.dChi.toFixed(2)}` : '') + (b.negativeEnd ? ` · δ⁻ en ${b.negativeEnd}` : '')),
          b.length !== null ? h('span', { class: 'term' }, `${b.length.toFixed(3)} Å`) : '',
        ),
        b.note ? h('p', { class: 'small muted' }, b.note) : '',
        h('button', { class: 'btn small ghost ba-open', type: 'button', onclick: () => this.showBondInfo(b.za, b.zb, b.orderN, `Enlace ${b.label} · ${d.name}`) }, icon('bond', 14), 'Ver análisis'),
      ),
    );
    det.append(
      h(
        'summary',
        { class: 'subst-head' },
        h('div', { class: 'grow' }, h('b', {}, d.name), h('small', {}, `${subscript(d.formula)} · ${d.material}`)),
        d.organic === null ? '' : h('span', { class: 'badge' }, d.organic ? 'Orgánico' : 'Inorgánico'),
      ),
      h('div', { class: 'subst-body' },
        h('h4', {}, 'Tipo de material'),
        h('p', { class: 'small' }, h('b', {}, d.material), '. ', d.materialDetail),
        h('h4', {}, 'Enlaces'),
        ...bondRows,
        h('h4', {}, 'Molécula'),
        h('div', { class: 'kv' },
          h('span', {}, 'Geometría (VSEPR)'), h('span', {}, d.geometry.length ? d.geometry.join(' · ') : 'Lineal o diatómica (sin átomo central)'),
          h('span', {}, 'Polaridad'), h('span', {}, d.polarity),
        ),
        h('h4', {}, 'Fuerzas intermoleculares esperadas'),
        h('ul', { class: 'small inter' }, ...d.intermolecular.map((t) => h('li', {}, t))),
        h('p', { class: 'small muted' }, d.geometrySource, '. Polaridad de enlace por Δχ (< 0,4: no polar); σ/π según el orden de enlace; fuerzas intermoleculares deducidas de la estructura (cualitativo).'),
        h('div', { class: 'row gap mt' },
          h('button', { class: 'btn small', onclick: () => this.select(atomIds) }, 'Seleccionar'),
          h('button', { class: 'btn small', onclick: () => this.separateStructure(sid) }, 'Separar'),
          h('a', { class: 'btn small', href: `#/calculadora/formula/${encodeURIComponent(hillFormula(atomIds.map((id) => this.atom(id)!.z)))}` }, icon('calc', 14), 'Calculadora'),
          h('a', { class: 'btn small ghost', href: `#/molecula/${recId}` }, 'Biblioteca'),
        ),
      ),
    );
    return det;
  }

  /** Tarjeta de una molécula construida con «Enlazar» que no coincide con ninguna estructura documentada. */
  private builtCard(ids: string[]): HTMLElement {
    const atoms = ids.map((id) => this.atom(id)!).filter(Boolean);
    const bonds = this.store.project.bonds.filter((b) => b.manual && ids.includes(b.a));
    const formula = hillFormula(atoms.map((a) => a.z));
    const rep = valenceReport(atoms, bonds);
    const groups = new Map<string, { label: string; kind: string; count: number; za: number; zb: number; order: number }>();
    for (const b of bonds) {
      const A = element(this.atom(b.a)!.z);
      const B = element(this.atom(b.b)!.z);
      const [x, y] = (A.electronegativity.value ?? 0) >= (B.electronegativity.value ?? 0) ? [A, B] : [B, A];
      const label = `${x.symbol}${JOIN[b.order]}${y.symbol}`;
      const g = groups.get(label) ?? { label, kind: bondKind(A.z, B.z), count: 0, za: x.z, zb: y.z, order: b.order };
      g.count++;
      groups.set(label, g);
    }
    const charge = rep.totalCharge ? ` · carga ${rep.totalCharge > 0 ? '+' : '−'}${Math.abs(rep.totalCharge) > 1 ? Math.abs(rep.totalCharge) : ''}` : '';
    const det = h('details', { class: 'subst-card built' }) as HTMLDetailsElement;
    det.open = true;
    det.append(
      h('summary', { class: 'subst-head' }, h('div', { class: 'grow' }, h('b', {}, 'Construida por ti'), h('small', {}, `${subscript(formula)}${charge} · ${atoms.length} átomos`)), h('span', { class: 'prov prediccion' }, 'No validada')),
      h(
        'div',
        { class: 'subst-body' },
        h('h4', {}, 'Enlaces'),
        ...[...groups.values()].map((g) =>
          h(
            'div',
            { class: 'bond-row' },
            h('div', { class: 'bond-label' }, h('b', {}, g.label), h('span', { class: 'muted' }, ` ×${g.count}`)),
            h('div', { class: 'bond-terms' }, h('span', { class: 'term' }, g.kind)),
            h('button', { class: 'btn small ghost ba-open', type: 'button', onclick: () => this.showBondInfo(g.za, g.zb, g.order, `Enlace ${g.label} · construida por ti`) }, icon('bond', 14), 'Ver análisis'),
          ),
        ),
        h('h4', {}, 'Valencias'),
        h(
          'p',
          { class: 'small' },
          rep.complete
            ? 'Todas las valencias están completas: es una estructura de Lewis posible (predicción por reglas de valencia).'
            : `Faltan enlaces: ${rep.missing.map((m) => `${m.symbol} (${m.missing})`).join(', ')}.`,
          rep.charges.length ? ` Carga formal: ${rep.charges.map((c) => `${c.symbol}${c.charge > 0 ? '⁺' : '⁻'}`).join(', ')} (enlace coordinado).` : '',
        ),
        h(
          'p',
          { class: 'small muted' },
          'No coincide con ninguna molécula documentada de la biblioteca, así que no se muestra como compuesto real. Las posiciones son las que tú has colocado: no son una geometría calculada. Si completas una molécula de la biblioteca (agua, metano, etanol…), la app la reconoce y adopta su geometría de PubChem.',
        ),
        h(
          'div',
          { class: 'row gap mt' },
          h('button', { class: 'btn small', onclick: () => this.select(ids) }, 'Seleccionar'),
          h('button', { class: 'btn small', onclick: () => this.removeManualBonds(ids) }, 'Quitar enlaces'),
          h('a', { class: 'btn small', href: `#/calculadora/formula/${encodeURIComponent(formula)}` }, icon('calc', 14), 'Calculadora'),
        ),
      ),
    );
    return det;
  }

  /** En el teléfono solo cabe un panel: al abrir uno se cierran los demás. */
  private exclusive(keep: 'props' | 'analysis' | 'subst' | 'picker' | 'bond') {
    // El análisis del enlace ocupa el sitio del panel del átomo también en pantallas grandes.
    if (keep !== 'bond') this.hideBondInfo();
    else if (!this.props.classList.contains('hidden')) {
      this.propsDismissed = true;
      this.props.classList.add('hidden');
    }
    if (!compact()) return;
    if (keep !== 'picker' && !this.picker.classList.contains('hidden')) this.togglePicker(false);
    if (keep !== 'subst' && !this.substances.classList.contains('hidden')) this.toggleSubstances(false);
    if (keep !== 'analysis' && this.analysisOpen) {
      this.analysisOpen = false;
      this.renderAnalysis();
    }
    if (keep !== 'props' && !this.props.classList.contains('hidden')) {
      this.propsDismissed = true;
      this.props.classList.add('hidden');
    }
    if (!this.barMenu.classList.contains('hidden')) this.toggleBarMenu(false);
  }

  /** Muestra el «Análisis del enlace» entre dos elementos (orden opcional) en el panel del laboratorio. */
  showBondInfo(za: number, zb: number, order: number | null, kicker = 'Análisis del enlace') {
    clear(this.bondInfo);
    this.bondInfo.append(
      h('div', { class: 'picker-head' }, h('b', {}, kicker), iconBtn('close', 'Cerrar', () => this.hideBondInfo())),
      bondAnalysisCard(analyzeBond(za, zb, order)),
    );
    this.bondInfo.scrollTop = 0;
    this.bondInfo.classList.remove('hidden');
    this.exclusive('bond');
    this.shiftForPanel();
  }

  /** En el teléfono, sube la vista 3D para que lo analizado se vea por encima del panel inferior. */
  private shiftForPanel() {
    const open = !this.bondInfo.classList.contains('hidden');
    const stageH = this.sm.renderer.domElement.clientHeight || 1;
    const top = this.bondInfo.offsetTop; // borde superior del panel dentro del escenario
    const shift = open && compact() && top > 0 ? Math.min(0.35, Math.max(0, (stageH - top) / (2 * stageH))) : 0;
    if (shift === this.sm.verticalShift) return;
    this.sm.verticalShift = shift;
    this.sm.resize();
  }

  private hideBondInfo() {
    if (this.bondInfo.classList.contains('hidden')) return;
    this.bondInfo.classList.add('hidden');
    clear(this.bondInfo);
    this.shiftForPanel();
  }

  /**
   * Lleva un análisis al laboratorio 3D. Si la pareja forma una molécula documentada con geometría
   * de PubChem, se inserta esa molécula real; si no, se colocan los dos átomos listos para enlazar.
   * En ambos casos se abre el «Análisis del enlace».
   */
  openAnalysisInLab(za: number, zb: number, rec: StructureRecord | null) {
    const A = element(za);
    const B = element(zb);
    if (rec && rec.geometry === 'pubchem3d') {
      this.insertStructure(rec);
      const bond = rec.bonds.find(([x, y]) => (rec.atoms[x].z === za && rec.atoms[y].z === zb) || (rec.atoms[x].z === zb && rec.atoms[y].z === za));
      this.showBondInfo(za, zb, bond?.[2] ?? null, `Análisis ${A.symbol}–${B.symbol} · ${rec.name} (PubChem)`);
    } else {
      this.addPairForBond(za, zb);
      this.showBondInfo(za, zb, null, `Análisis ${A.symbol} + ${B.symbol} · tócalos para enlazarlos`);
    }
  }

  /** Coloca dos átomos juntos y activa «Enlazar» (desde el analizador de la página de enlaces). */
  addPairForBond(za: number, zb: number) {
    this.cancelPlacement();
    const scale = this.store.project.view.atomScale * this.settings.atomScale;
    const t = this.sm.controls.target;
    const ra = visualRadius(element(za), scale);
    const rb = visualRadius(element(zb), scale);
    const half = (ra + rb) * 1.6;
    const a: AtomInstance = { id: uid('at'), z: za, pos: [round(t.x - half), round(ra + 0.02), round(t.z)] };
    const b: AtomInstance = { id: uid('at'), z: zb, pos: [round(t.x + half), round(rb + 0.02), round(t.z)] };
    this.store.mutate(`Añadir ${element(za).symbol} y ${element(zb).symbol}`, (p) => p.atoms.push(a, b));
    this.setTool('bond');
    this.requestFrame();
    toast('Elige simple, doble o triple y toca los dos átomos para enlazarlos', 'info');
  }

  private setAnalysis(open: boolean) {
    this.analysisOpen = open;
    if (open) this.exclusive('analysis');
    this.renderAnalysis();
  }

  togglePicker(force?: boolean) {
    const open = force ?? this.picker.classList.contains('hidden');
    if (open && this.substances && !this.substances.classList.contains('hidden')) this.toggleSubstances(false);
    if (open) this.exclusive('picker');
    this.picker.classList.toggle('hidden', !open);
    if (open && !this.table) {
      this.table = new PeriodicTable({ compact: true, onSelect: (e) => this.beginPlacement(e.z) });
      this.picker.append(h('div', { class: 'picker-head' }, h('b', {}, 'Elementos'), iconBtn('close', 'Cerrar', () => this.togglePicker(false))), this.table.el);
    }
    if (open) (this.picker.querySelector('input') as HTMLInputElement | null)?.focus();
  }

  /** Coloca un elemento: la vista previa sigue al puntero; clic para soltar. */
  beginPlacement(z: number) {
    this.cancelPlacement();
    const e = element(z);
    const ghost = buildLabAtom(e, this.store.project.view.atomScale * this.settings.atomScale, true);
    ghost.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        const mat = (m.material as THREE.MeshPhysicalMaterial).clone();
        mat.transparent = true;
        mat.opacity = 0.55;
        m.material = mat;
      }
    });
    const y = visualRadius(e, this.store.project.view.atomScale * this.settings.atomScale) + 0.02;
    const t = this.sm.controls.target;
    ghost.position.set(t.x, y, t.z);
    this.sm.overlay.add(ghost);
    this.placing = { z, ghost, y, touchPos: false };
    if (window.innerWidth < 860) this.togglePicker(false);
    this.renderPlaceBar();
    this.renderProps();
    this.sm.needsRender = true;
  }

  private renderPlaceBar() {
    clear(this.placeBar);
    const pl = this.placing;
    this.placeBar.classList.toggle('hidden', !pl);
    this.renderBondBar();
    if (!pl) return;
    const e = element(pl.z);
    this.placeBar.append(
      h('span', { class: 'dot', style: `background:${FAMILIES[e.family].color}` }),
      h('span', {}, h('b', {}, e.name), h('small', {}, ' · clic para colocar · Mayús: varios · Esc: cancelar')),
      h('button', { class: 'btn small primary', onclick: () => this.confirmPlacement(false) }, icon('check', 15), 'Colocar'),
      iconBtn('close', 'Cancelar (Esc)', () => this.cancelPlacement()),
    );
  }

  private confirmPlacement(keep: boolean) {
    const pl = this.placing;
    if (!pl) return;
    const p = pl.ghost.position;
    const atom: AtomInstance = { id: uid('at'), z: pl.z, pos: [round(p.x), round(p.y), round(p.z)] };
    this.store.mutate(`Añadir ${element(pl.z).name}`, (x) => x.atoms.push(atom));
    if (!keep) {
      this.cancelPlacement();
      this.select([atom.id]);
    }
  }

  cancelPlacement() {
    if (!this.placing) return;
    this.sm.overlay.remove(this.placing.ghost);
    disposeObject(this.placing.ghost);
    this.placing = null;
    this.renderPlaceBar();
    this.renderProps();
    this.sm.needsRender = true;
  }

  /* ============================ sincronización ============================ */

  private sync() {
    const p = this.store.project;
    const alive = new Set<string>();
    const scale = p.view.atomScale * this.settings.atomScale;
    for (const a of p.atoms) {
      alive.add(a.id);
      const key = `${a.z}|${scale}|${p.view.labels}`;
      let en = this.entries.get(a.id);
      if (!en || en.key !== key) {
        if (en) this.removeEntry(a.id);
        const root = buildLabAtom(element(a.z), scale, p.view.labels);
        root.userData.atomId = a.id;
        this.sm.content.add(root);
        en = { key, root };
        this.entries.set(a.id, en);
      }
      en.root.position.set(a.pos[0], a.pos[1], a.pos[2]);
    }
    for (const id of [...this.entries.keys()]) if (!alive.has(id)) this.removeEntry(id);
    for (const id of [...this.selection]) if (!alive.has(id)) this.selection.delete(id);
    this.bondPick = this.bondPick.filter((id) => alive.has(id));
    this.refreshMeasurements();
    this.refreshBonds();
    this.renderSubstances();
    this.syncSelectionVisuals();
    this.refreshBar();
    this.renderProps();
    this.renderAnalysis();
    this.renderStatus();
    this.sm.needsRender = true;
  }

  private removeEntry(id: string) {
    const en = this.entries.get(id);
    if (!en) return;
    this.sm.content.remove(en.root);
    disposeObject(en.root);
    this.entries.delete(id);
  }

  private atom(id: string) {
    return this.store.project.atoms.find((a) => a.id === id);
  }

  private syncSelectionVisuals() {
    for (const c of [...this.selHelpers.children]) {
      this.selHelpers.remove(c);
      disposeObject(c);
    }
    const scale = this.store.project.view.atomScale * this.settings.atomScale;
    const picks = [...this.measurePick, ...this.bondPick];
    const ids = [...(this.tool === 'bond' ? [] : this.selection), ...picks];
    for (const id of ids) {
      const a = this.atom(id);
      if (!a) continue;
      const r = visualRadius(element(a.z), scale);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.25, Math.max(0.02, r * 0.05), 8, 64), new THREE.MeshBasicMaterial({ color: picks.includes(id) ? 0xff9f0a : 0x0a84ff, depthTest: false, transparent: true }));
      ring.position.set(...a.pos);
      ring.renderOrder = 20;
      ring.userData.billboard = true;
      this.selHelpers.add(ring);
    }
    this.sm.needsRender = true;
  }

  /* ============================ puntero ============================ */

  private pickAtom(e: PointerEvent): string | null {
    const hits = this.sm.ray(e.clientX, e.clientY).intersectObjects(this.sm.content.children, true);
    for (const hit of hits) {
      let o: THREE.Object3D | null = hit.object;
      while (o) {
        if (o.userData.atomId) return o.userData.atomId as string;
        o = o.parent;
      }
    }
    return null;
  }

  private onDown(e: PointerEvent) {
    if (e.button === 2) return;
    if (!this.barMenu.classList.contains('hidden')) this.toggleBarMenu(false);
    const atom = this.placing ? null : this.pickAtom(e);
    this.down = { x: e.clientX, y: e.clientY, atom, shift: e.shiftKey || e.ctrlKey || e.metaKey || this.multi, wasSelected: !!atom && this.selection.has(atom) };
    if (this.placing || this.tool !== 'select' || !atom) return;
    if (!this.selection.has(atom)) {
      const a = this.atom(atom)!;
      const groupIds = a.group ? this.store.project.atoms.filter((k) => k.group === a.group).map((k) => k.id) : [atom];
      if (!this.down.shift) this.selection.clear();
      groupIds.forEach((id) => this.selection.add(id));
      if (this.selection.size >= 2 && !compact()) this.analysisOpen = true;
      this.propsDismissed = false;
      this.syncSelectionVisuals();
      this.renderProps();
      this.renderAnalysis();
    }
    // Inicio de arrastre
    const a = this.atom(atom)!;
    const vertical = e.altKey;
    const normal = vertical ? this.sm.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize().negate() : new THREE.Vector3(0, 1, 0);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(...a.pos));
    const hit = new THREE.Vector3();
    if (!this.sm.ray(e.clientX, e.clientY).ray.intersectPlane(plane, hit)) return;
    const start = new Map<string, [number, number, number]>();
    for (const id of this.selection) start.set(id, [...this.atom(id)!.pos] as [number, number, number]);
    this.drag = { snapshot: this.store.snapshot(), start, plane, grab: hit, vertical, moved: false };
    this.sm.controls.enabled = false;
    this.sm.renderer.domElement.setPointerCapture(e.pointerId);
  }

  private onMove(e: PointerEvent) {
    if (this.placing) {
      const p = this.sm.planeHit(e.clientX, e.clientY, this.placing.y);
      if (p) {
        this.placing.ghost.position.set(p.x, this.placing.y, p.z);
        this.sm.needsRender = true;
      }
      return;
    }
    if (!this.drag) {
      if (this.tool === 'select') this.sm.renderer.domElement.style.cursor = this.pickAtom(e) ? 'grab' : '';
      return;
    }
    const d = this.drag;
    const hit = new THREE.Vector3();
    if (!this.sm.ray(e.clientX, e.clientY).ray.intersectPlane(d.plane, hit)) return;
    const delta = hit.sub(d.grab);
    if (d.vertical) delta.set(0, delta.y, 0);
    else delta.y = 0;
    if (delta.lengthSq() > 1e-6) d.moved = true;
    this.store.mutateSilently((p) => {
      for (const [id, st] of d.start) {
        const a = p.atoms.find((k) => k.id === id);
        if (a) a.pos = [round(st[0] + delta.x), round(Math.max(0, st[1] + delta.y)), round(st[2] + delta.z)];
      }
    });
  }

  private onUp(e: PointerEvent) {
    const down = this.down;
    this.down = null;
    const moved = !!down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6;
    if (this.drag) {
      const d = this.drag;
      this.drag = null;
      this.sm.controls.enabled = true;
      try {
        this.sm.renderer.domElement.releasePointerCapture(e.pointerId);
      } catch {
        /* sin captura */
      }
      if (d.moved) this.store.commitFrom(d.snapshot, 'Mover');
      // Selección múltiple: tocar un átomo ya seleccionado lo quita de la selección.
      else if (down && down.shift && down.wasSelected && down.atom && !moved) {
        const a = this.atom(down.atom);
        const ids = a?.group ? this.store.project.atoms.filter((k) => k.group === a.group).map((k) => k.id) : [down.atom];
        this.select([...this.selection].filter((id) => !ids.includes(id)));
      }
      return;
    }
    if (!down || moved) return;
    if (this.tool === 'bond') {
      if (!down.atom) return;
      if (this.bondPick[0] === down.atom) {
        this.bondPick = [];
      } else if (!this.bondPick.length) {
        this.bondPick = [down.atom];
        this.hideBondInfo(); // que el análisis anterior no tape el siguiente átomo
      } else {
        const first = this.bondPick[0];
        this.bondPick = [];
        this.tryBond(first, down.atom);
      }
      this.syncSelectionVisuals();
      this.renderBondBar();
      this.renderStatus();
      return;
    }
    if (this.placing) {
      const p = this.sm.planeHit(e.clientX, e.clientY, this.placing.y);
      if (p) this.placing.ghost.position.set(p.x, this.placing.y, p.z);
      if (e.pointerType === 'mouse') this.confirmPlacement(e.shiftKey);
      return;
    }
    if (this.tool === 'distance' || this.tool === 'angle') {
      if (!down.atom) return;
      if (this.measurePick.includes(down.atom)) return;
      this.measurePick.push(down.atom);
      const need = this.tool === 'distance' ? 2 : 3;
      if (this.measurePick.length === need) {
        const ids = [...this.measurePick];
        this.measurePick = [];
        const m: Measurement = { id: uid('m'), kind: this.tool, atoms: ids, value: 0, unit: this.tool === 'distance' ? 'Å' : '°' };
        m.value = Math.round(this.measureValue(m) * 1000) / 1000;
        this.setAnalysis(true);
        this.store.mutate('Medir', (p) => p.measurements.push(m));
      }
      this.syncSelectionVisuals();
      this.renderStatus();
      return;
    }
    // En selección múltiple, un toque en el vacío no borra lo seleccionado (evita perderlo por error).
    if (!down.atom && !this.multi) {
      this.select([]);
    }
  }

  select(ids: string[]) {
    this.selection = new Set(ids);
    this.propsDismissed = false;
    this.syncSelectionVisuals();
    this.renderProps();
    this.renderAnalysis();
  }

  /* ============================ edición ============================ */

  deleteSelection() {
    if (!this.selection.size) return;
    const ids = new Set(this.selection);
    const n = ids.size;
    this.store.mutate('Eliminar', (p) => (p.atoms = p.atoms.filter((a) => !ids.has(a.id))));
    this.select([]);
    toast(`${n === 1 ? 'Átomo eliminado' : `${n} átomos eliminados`} · puedes recuperarlo con «Deshacer»`, 'ok');
  }

  duplicate() {
    if (!this.selection.size) return;
    const src = this.store.project.atoms.filter((a) => this.selection.has(a.id));
    const g = src.some((a) => a.group) ? uid('g') : undefined;
    const copies = src.map((a) => ({ ...a, id: uid('at'), pos: [round(a.pos[0] + 1.5), a.pos[1], round(a.pos[2] + 1.5)] as [number, number, number], group: a.group ? g : undefined }));
    this.store.mutate('Duplicar', (p) => p.atoms.push(...copies));
    this.select(copies.map((c) => c.id));
  }

  toggleGroup() {
    if (this.selection.size < 1) return;
    const sel = this.store.project.atoms.filter((a) => this.selection.has(a.id));
    const grouped = sel.length > 1 && sel.every((a) => a.group && a.group === sel[0].group);
    const g = uid('g');
    this.store.mutate(grouped ? 'Desagrupar' : 'Agrupar', (p) => {
      for (const a of p.atoms) if (this.selection.has(a.id)) a.group = grouped ? undefined : g;
    });
    toast(grouped ? 'Grupo deshecho' : 'Átomos agrupados (agrupación visual, no implica enlace)', 'ok');
  }

  /** Gira la selección 15° alrededor del eje vertical que pasa por su centro. */
  rotateSelection() {
    const sel = this.store.project.atoms.filter((a) => this.selection.has(a.id));
    if (sel.length < 2) return;
    const cx = sel.reduce((s, a) => s + a.pos[0], 0) / sel.length;
    const cz = sel.reduce((s, a) => s + a.pos[2], 0) / sel.length;
    const t = Math.PI / 12;
    this.store.mutate('Girar', (p) => {
      for (const a of p.atoms) {
        if (!this.selection.has(a.id)) continue;
        const x = a.pos[0] - cx;
        const z = a.pos[2] - cz;
        a.pos = [round(cx + x * Math.cos(t) - z * Math.sin(t)), a.pos[1], round(cz + x * Math.sin(t) + z * Math.cos(t))];
      }
    });
  }

  /* ============================ mediciones ============================ */

  private measureValue(m: Measurement): number {
    const pts = m.atoms.map((id) => this.atom(id)?.pos);
    if (pts.some((p) => !p)) return NaN;
    return m.kind === 'distance' ? distance(pts[0]!, pts[1]!) : angle(pts[0]!, pts[1]!, pts[2]!);
  }

  /* ============================ enlaces (Fase 2) ============================ */

  private refreshBonds(positions?: Map<string, THREE.Vector3>) {
    for (const c of [...this.bondGroup.children]) {
      this.bondGroup.remove(c);
      (c as THREE.Mesh).geometry.dispose();
    }
    const p = this.store.project;
    const pos = (id: string) => positions?.get(id) ?? new THREE.Vector3(...this.atom(id)!.pos);
    for (const b of p.bonds) {
      const a = pos(b.a);
      const c = pos(b.b);
      const axis = c.clone().sub(a);
      const len = axis.length();
      if (len < 1e-3) continue;
      const dir = axis.clone().normalize();
      let perp = new THREE.Vector3(0, 1, 0).cross(dir);
      if (perp.lengthSq() < 1e-6) perp = new THREE.Vector3(1, 0, 0);
      perp.normalize().multiplyScalar(0.12);
      const shifts = b.order === 2 ? [-0.5, 0.5] : b.order === 3 ? [-1, 0, 1] : [0];
      for (const k of shifts) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(b.order > 1 ? 0.05 : 0.08, b.order > 1 ? 0.05 : 0.08, len, 12), b.manual ? MANUAL_BOND_MAT : BOND_MAT);
        m.position.copy(a).addScaledVector(axis, 0.5).addScaledVector(perp, k);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        m.castShadow = true;
        this.bondGroup.add(m);
      }
    }
    this.sm.needsRender = true;
  }

  /**
   * Forma una estructura documentada con los átomos seleccionados: cada átomo se asigna a un
   * átomo de la estructura del mismo elemento y se desplaza (animación) a su posición; los
   * enlaces y órdenes de enlace son los de la fuente.
   */
  formStructure(rec: StructureRecord) {
    const sel = this.store.project.atoms.filter((a) => this.selection.size ? this.selection.has(a.id) : true);
    if (rec.geometry !== 'pubchem3d' || sel.length !== rec.atoms.length) return;
    const centroid = sel.reduce((s, a) => s.add(new THREE.Vector3(...a.pos)), new THREE.Vector3()).multiplyScalar(1 / sel.length);
    const src = rec.atoms.map((a) => new THREE.Vector3(...a.p!));
    const sc = src.reduce((s, v) => s.add(v), new THREE.Vector3()).multiplyScalar(1 / src.length);
    const targets = src.map((v) => v.clone().sub(sc).add(centroid));
    const scale = this.store.project.view.atomScale * this.settings.atomScale;
    const minY = Math.min(...targets.map((t, i) => t.y - visualRadius(element(rec.atoms[i].z), scale)));
    if (minY < 0.05) targets.forEach((t) => (t.y += 0.05 - minY));
    // Asignación codiciosa por proximidad, respetando el elemento.
    const free = new Set(sel.map((a) => a.id));
    const mapIdx: string[] = [];
    rec.atoms.forEach((ra, i) => {
      let best: string | null = null;
      let bd = Infinity;
      for (const id of free) {
        const a = this.atom(id)!;
        if (a.z !== ra.z) continue;
        const d = targets[i].distanceTo(new THREE.Vector3(...a.pos));
        if (d < bd) {
          bd = d;
          best = id;
        }
      }
      if (best) {
        mapIdx[i] = best;
        free.delete(best);
      }
    });
    if (mapIdx.length !== rec.atoms.length || mapIdx.some((x) => !x)) return;
    this.applyStructure(rec, mapIdx, `Formar ${rec.name}`, targets);
    toast(`${rec.name}: geometría y enlaces de PubChem (CID ${rec.cid})`, 'ok');
  }

  /**
   * Convierte los átomos `mapIdx` (índice de la fuente → id de átomo) en la estructura documentada:
   * se mueven (con animación) a la geometría de la fuente y reciben sus enlaces. Si había enlaces
   * manuales entre ellos, se sustituyen por los de la fuente.
   */
  private applyStructure(rec: StructureRecord, mapIdx: string[], label: string, targets?: THREE.Vector3[]) {
    if (!targets) {
      const atoms = mapIdx.map((id) => this.atom(id)!);
      const centroid = atoms.reduce((s, a) => s.add(new THREE.Vector3(...a.pos)), new THREE.Vector3()).multiplyScalar(1 / atoms.length);
      const src = rec.atoms.map((a) => new THREE.Vector3(...a.p!));
      const sc = src.reduce((s, v) => s.add(v), new THREE.Vector3()).multiplyScalar(1 / src.length);
      targets = src.map((v) => v.clone().sub(sc).add(centroid));
      const scale = this.store.project.view.atomScale * this.settings.atomScale;
      const minY = Math.min(...targets.map((t, i) => t.y - visualRadius(element(rec.atoms[i].z), scale)));
      if (minY < 0.05) targets.forEach((t) => (t.y += 0.05 - minY));
    }
    const from = new Map(mapIdx.map((id) => [id, new THREE.Vector3(...this.atom(id)!.pos)]));
    const to = new Map(mapIdx.map((id, i) => [id, targets![i]]));
    const ids = new Set(mapIdx);
    const sid = uid('st');
    const commit = () =>
      this.store.mutate(label, (p) => {
        const g = uid('g');
        for (const a of p.atoms) {
          const t = to.get(a.id);
          if (!t) continue;
          a.pos = [round(t.x), round(t.y), round(t.z)];
          a.group = g;
        }
        p.bonds = p.bonds.filter((b) => !(b.manual && (ids.has(b.a) || ids.has(b.b))));
        p.structures.push({ id: sid, recordId: rec.id, atoms: mapIdx });
        for (const [x, y, order] of rec.bonds) p.bonds.push({ a: mapIdx[x], b: mapIdx[y], order, structure: sid });
      });
    if (this.settings.reduceMotion) commit();
    else this.anim = { t: 0, dur: 0.9, from, to, done: commit };
  }

  /** Inserta una estructura documentada completa (con sus enlaces) frente a la cámara. */
  insertStructure(rec: StructureRecord) {
    if (rec.geometry !== 'pubchem3d') return;
    const src = rec.atoms.map((a) => new THREE.Vector3(...a.p!));
    const c = src.reduce((s, v) => s.add(v), new THREE.Vector3()).multiplyScalar(1 / src.length);
    const t = this.sm.controls.target;
    const scale = this.store.project.view.atomScale * this.settings.atomScale;
    const pts = src.map((v) => v.clone().sub(c).add(new THREE.Vector3(t.x, 0, t.z)));
    const minY = Math.min(...pts.map((p, i) => p.y - visualRadius(element(rec.atoms[i].z), scale)));
    pts.forEach((p) => (p.y += 0.05 - minY));
    // Si se solapa con átomos existentes, se coloca a la derecha de todo lo que hay.
    const existing = this.store.project.atoms.map((a) => new THREE.Vector3(...a.pos));
    if (existing.some((e) => pts.some((p) => p.distanceTo(e) < 2.5))) {
      const maxX = Math.max(...existing.map((e) => e.x));
      const minNew = Math.min(...pts.map((p) => p.x));
      pts.forEach((p) => (p.x += maxX - minNew + 3));
    }
    const ids = rec.atoms.map(() => uid('at'));
    const sid = uid('st');
    const g = uid('g');
    this.store.mutate(`Añadir ${rec.name}`, (p) => {
      rec.atoms.forEach((a, i) => p.atoms.push({ id: ids[i], z: a.z, pos: [round(pts[i].x), round(pts[i].y), round(pts[i].z)], group: g }));
      p.structures.push({ id: sid, recordId: rec.id, atoms: ids });
      for (const [x, y, order] of rec.bonds) p.bonds.push({ a: ids[x], b: ids[y], order, structure: sid });
    });
    this.select(ids);
    this.requestFrame();
    toast(`${rec.name}: estructura de PubChem (CID ${rec.cid})`, 'ok');
  }

  private stepAnimation(dt: number) {
    const an = this.anim;
    if (!an) return;
    an.t = Math.min(an.dur, an.t + dt);
    const k = an.t / an.dur;
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // easeInOutCubic
    const cur = new Map<string, THREE.Vector3>();
    for (const [id, f] of an.from) {
      const t = an.to.get(id)!;
      const v = f.clone().lerp(t, e);
      cur.set(id, v);
      this.entries.get(id)?.root.position.copy(v);
    }
    this.refreshBonds(cur);
    this.sm.needsRender = true;
    if (an.t >= an.dur) {
      this.anim = null;
      an.done();
    }
  }

  /** Separa una estructura formada: se eliminan sus enlaces; los átomos permanecen. */
  separateStructure(sid: string) {
    const st = this.store.project.structures.find((s) => s.id === sid);
    if (!st) return;
    this.store.mutate('Separar', (p) => {
      p.bonds = p.bonds.filter((b) => b.structure !== sid);
      p.structures = p.structures.filter((s) => s.id !== sid);
      for (const a of p.atoms) if (st.atoms.includes(a.id)) {
        a.group = undefined;
        // Pequeña separación radial para que se aprecie que ya no están unidos.
        const c = st.atoms.map((id) => p.atoms.find((x) => x.id === id)!.pos).reduce((s, v) => [s[0] + v[0] / st.atoms.length, s[1] + v[1] / st.atoms.length, s[2] + v[2] / st.atoms.length], [0, 0, 0]);
        const d = [a.pos[0] - c[0], a.pos[2] - c[2]];
        const l = Math.hypot(d[0], d[1]) || 1;
        a.pos = [round(a.pos[0] + (d[0] / l) * 0.8), a.pos[1], round(a.pos[2] + (d[1] / l) * 0.8)];
      }
    });
    toast('Estructura separada: los átomos ya no están enlazados', 'ok');
  }

  private structureOf(atomId: string) {
    return this.store.project.structures.find((s) => s.atoms.includes(atomId));
  }

  private refreshMeasurements() {
    for (const c of [...this.measureGroup.children]) {
      this.measureGroup.remove(c);
      disposeObject(c);
    }
    for (const m of this.store.project.measurements) {
      const pts = m.atoms.map((id) => new THREE.Vector3(...this.atom(id)!.pos));
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: m.kind === 'distance' ? 0xffd60a : 0x64d2ff, dashSize: 0.12, gapSize: 0.08, depthTest: false, transparent: true }));
      line.computeLineDistances();
      line.renderOrder = 15;
      this.measureGroup.add(line);
    }
  }

  /* ============================ paneles ============================ */

  private renderProps() {
    const p = this.props;
    clear(p);
    const sel = this.store.project.atoms.filter((a) => this.selection.has(a.id));
    // Mientras se coloca un átomo o se enlaza, el panel no debe tapar la escena (sobre todo en el teléfono).
    const hide = sel.length === 0 || !!this.placing || this.tool === 'bond' || this.propsDismissed;
    const wasHidden = p.classList.contains('hidden');
    p.classList.toggle('hidden', hide);
    if (hide) return;
    if (wasHidden) this.exclusive('props');
    if (sel.length === 1) {
      const a = sel[0];
      const e = element(a.z);
      const fam = FAMILIES[e.family];
      const coord = (i: 0 | 1 | 2, label: string) => {
        const input = h('input', { type: 'number', step: '0.1', value: String(a.pos[i]), 'aria-label': label }) as HTMLInputElement;
        input.addEventListener('change', () => {
          const v = Number(input.value);
          if (!Number.isFinite(v)) return;
          this.store.mutate('Posición', (x) => {
            const t = x.atoms.find((k) => k.id === a.id);
            if (t) t.pos[i] = i === 1 ? Math.max(0, v) : v;
          });
        });
        return h('label', { class: 'coord' }, h('span', {}, label), input);
      };
      p.append(
        h('div', { class: 'pp-head', style: `--fam:${fam.color}` }, h('div', { class: 'tile-sm' }, h('span', { class: 'z' }, String(e.z)), h('span', { class: 'sym' }, e.symbol)), h('div', {}, h('b', {}, e.name), h('span', { class: 'muted' }, fam.name))),
        h(
          'div',
          { class: 'kv' },
          h('span', {}, 'Configuración'),
          h('span', {}, e.configuration.short),
          h('span', {}, 'Electronegatividad'),
          h('span', {}, e.electronegativity.text || '—'),
          h('span', {}, 'Radio (fuente)'),
          h('span', {}, e.atomicRadius.text ? `${e.atomicRadius.text} pm` : '—'),
        ),
        h('details', { class: 'sec' }, h('summary', {}, 'Posición (Å)'), h('div', { class: 'coords' }, coord(0, 'x'), coord(1, 'y'), coord(2, 'z'))),
        h(
          'div',
          { class: 'row gap' },
          h('button', { class: 'btn small', onclick: () => this.cb.openSheet(e) }, icon('info', 14), 'Ficha'),
          h('button', { class: 'btn small', onclick: () => this.cb.viewAtom(e) }, icon('atom', 14), 'Ver en 3D'),
          h('button', { class: 'btn small danger', onclick: () => this.deleteSelection() }, icon('trash', 14), 'Eliminar'),
        ),
        h('p', { class: 'small muted' }, e.atomicRadius.value === null ? 'Sin radio en la fuente: tamaño visual por defecto.' : 'Tamaño visual: 0,22 × radio de la fuente + 0,06 Å (bolas y varillas).'),
        this.structurePanel(a.id),
      );
    } else {
      p.append(
        h('div', { class: 'pp-head' }, h('div', {}, h('b', {}, `${sel.length} átomos`), h('span', { class: 'muted' }, subscript(hillFormula(sel.map((a) => a.z)))))),
        h('p', { class: 'small muted' }, 'La fórmula indica solo el recuento de átomos seleccionados; no implica un compuesto.'),
        h(
          'div',
          { class: 'row gap' },
          h('button', { class: 'btn small', onclick: () => this.toggleGroup() }, icon('group', 14), 'Agrupar'),
          h('button', { class: 'btn small', onclick: () => this.rotateSelection() }, icon('rotate', 14), 'Girar'),
          h('button', { class: 'btn small danger', onclick: () => this.deleteSelection() }, icon('trash', 14), 'Eliminar'),
        ),
      );
    }
  }

  private structurePanel(atomId: string): HTMLElement | string {
    const st = this.structureOf(atomId);
    if (!st) {
      const comp = this.manualComponents().find((c) => c.includes(atomId));
      if (!comp) return '';
      const mine = this.store.project.bonds.filter((b) => b.manual && (b.a === atomId || b.b === atomId));
      const sym = element(this.atom(atomId)!.z).symbol;
      return h(
        'div',
        { class: 'note col' },
        h('span', {}, icon('bond', 15), ' Enlazado por ti: ', mine.map((b) => `${sym}${JOIN[b.order]}${element(this.atom(b.a === atomId ? b.b : b.a)!.z).symbol}`).join(', ')),
        h('span', { class: 'small muted' }, 'Molécula no validada: no coincide con ninguna estructura documentada.'),
        h('span', {}, h('button', { class: 'btn small', onclick: () => this.toggleSubstances(true) }, 'Ver detalles'), ' ', h('button', { class: 'btn small', onclick: () => this.removeManualBonds(comp) }, 'Quitar enlaces')),
      );
    }
    const rec = structureRecord(st.recordId);
    const d = rec ? describeStructure(rec) : null;
    return h(
      'div',
      { class: 'note col' },
      h('span', {}, icon('bond', 15), ' Forma parte de ', h('b', {}, rec?.name ?? st.recordId), d ? ` · ${d.material}` : ''),
      d ? h('span', { class: 'small' }, d.bonds.map((b) => `${b.label}: ${b.bondType.toLowerCase()} ${b.order}, ${b.polarity}`).join(' · ')) : '',
      h('span', {}, h('button', { class: 'btn small', onclick: () => this.toggleSubstances(true) }, 'Ver detalles'), ' ', h('button', { class: 'btn small', onclick: () => this.separateStructure(st.id) }, 'Separar')),
    );
  }

  private renderAnalysis() {
    const box = this.analysis;
    clear(box);
    const exp = this.store.project;
    const atoms = this.selection.size ? exp.atoms.filter((a) => this.selection.has(a.id)) : exp.atoms;
    const head = h(
      'button',
      { class: 'an-head', type: 'button', onclick: () => this.setAnalysis(!this.analysisOpen) },
      icon('layers', 15),
      h('b', {}, 'Análisis'),
      h('span', { class: 'muted' }, atoms.length ? `Recuento ${subscript(hillFormula(atoms.map((a) => a.z)))} · ${atoms.length} átomo${atoms.length === 1 ? '' : 's'}${this.selection.size ? (atoms.length === 1 ? ' seleccionado' : ' seleccionados') : ''}` : 'Sin átomos'),
      exp.measurements.length ? h('span', { class: 'badge' }, `${exp.measurements.length} medición${exp.measurements.length === 1 ? '' : 'es'}`) : null,
      icon(this.analysisOpen ? 'chevronDown' : 'chevronUp', 15),
    );
    box.append(head);
    box.classList.toggle('open', this.analysisOpen);
    if (!this.analysisOpen) return;
    const body = h('div', { class: 'an-body' });
    const uniq = [...new Set(atoms.map((a) => a.z))].sort((a, b) => a - b).map(element);
    if (uniq.length) {
      const t = h('table', { class: 'an-table' }, h('tr', {}, h('th', {}, 'Elemento'), h('th', {}, 'Átomos'), h('th', {}, 'e⁻ valencia'), h('th', {}, 'χ'), h('th', {}, 'Estados de oxidación (fuente)')));
      for (const e of uniq)
        t.append(
          h('tr', {}, h('td', {}, `${e.symbol} · ${e.name}`), h('td', {}, String(atoms.filter((a) => a.z === e.z).length)), h('td', {}, e.valenceElectrons === null ? '—' : String(e.valenceElectrons)), h('td', {}, e.electronegativity.text || '—'), h('td', {}, e.oxidationStates.join(', ') || '—')),
        );
      body.append(t);
      const chis = uniq.map((e) => e.electronegativity.value).filter((v): v is number => v !== null);
      if (uniq.length >= 2 && chis.length >= 2)
        body.append(h('p', { class: 'small' }, `Diferencia máxima de electronegatividad: Δχ = ${(Math.max(...chis) - Math.min(...chis)).toFixed(2)}. `, h('span', { class: 'muted' }, 'Es solo una orientación: no determina por sí sola el tipo de enlace ni si existe un compuesto.')));
    }
    if (atoms.length === 2) body.append(this.pairBlock(atoms[0], atoms[1]));
    body.append(this.combinationBlock(atoms));
    if (exp.measurements.length) {
      const list = h('div', { class: 'measures' });
      for (const m of exp.measurements) {
        const v = this.measureValue(m);
        const names = m.atoms.map((id) => element(this.atom(id)!.z).symbol).join(m.kind === 'distance' ? '–' : '–');
        list.append(h('div', { class: 'measure' }, icon(m.kind === 'distance' ? 'ruler' : 'angle', 14), h('span', {}, names), h('b', {}, `${v.toFixed(m.kind === 'distance' ? 3 : 1)} ${m.unit}`), iconBtn('close', 'Quitar medición', () => this.store.mutate('Quitar medición', (p) => (p.measurements = p.measurements.filter((k) => k.id !== m.id))))));
      }
      body.append(h('h4', {}, 'Mediciones (entre posiciones colocadas por el usuario)'), list);
    }
    box.append(body);
  }

  /** Dos átomos seleccionados: análisis del par (si ya están enlazados, de ese enlace). */
  private pairBlock(a: { id: string; z: number }, b: { id: string; z: number }): HTMLElement {
    const bond = this.store.project.bonds.find((x) => (x.a === a.id && x.b === b.id) || (x.a === b.id && x.b === a.id));
    const r = analyzeBond(a.z, b.z, bond?.order ?? null);
    const A = element(a.z);
    const B = element(b.z);
    const title = bond ? `Enlace ${A.symbol}${JOIN[bond.order]}${B.symbol}` : '¿Qué pasaría si se unen?';
    const box = h('div', { class: 'combo' }, h('h4', {}, title));
    if (!r.ok) box.append(h('p', { class: 'small' }, r.reason));
    else
      box.append(
        h('p', { class: 'small' }, h('b', {}, r.typeLabel), r.dChi !== null && !r.same ? ` · Δχ ${r.dChi.toFixed(2)}` : '', ` · ${r.func.name}`, r.formulas[0] ? ` · ${subscript(r.formulas[0].formula)}` : ''),
        r.semiconductor.kind !== 'no' ? h('p', { class: 'small' }, r.semiconductor.label, r.semiconductor.family ? ` (${r.semiconductor.family})` : '') : '',
        bond ? '' : h('p', { class: 'small muted' }, 'Predicción: los átomos no están enlazados. Usa «Enlazar» para unirlos.'),
      );
    box.append(h('div', { class: 'row gap mt' }, h('button', { class: 'btn small primary', onclick: () => this.showBondInfo(a.z, b.z, bond?.order ?? null, title) }, icon('bond', 14), 'Ver análisis completo')));
    return box;
  }

  private combinationBlock(atoms: { id: string; z: number }[]): HTMLElement {
    const free = atoms.filter((a) => !this.structureOf(a.id));
    if (atoms.length && !free.length) {
      const ids = [...new Set(atoms.map((a) => this.structureOf(a.id)!.recordId))];
      return h('div', { class: 'combo' }, h('h4', {}, 'Análisis de la combinación'), h('p', { class: 'small' }, 'Los átomos seleccionados ya forman estructuras documentadas: ', ids.map((i) => structureRecord(i)?.name ?? i).join(', '), '. Usa «Separar» en el panel del átomo para deshacer los enlaces.'), h('div', { class: 'row gap mt' }, h('a', { class: 'btn small', href: `#/calculadora/formula/${encodeURIComponent(hillFormula(atoms.map((a) => a.z)))}` }, icon('calc', 14), 'Enviar a la calculadora')));
    }
    const r = analyzeCombination(free.map((a) => a.z));
    const cls = { conocido: 'fuente', 'conocido-sin-geometria': 'calculado', 'red-cristalina': 'fuente', 'no-validado': 'prediccion', incompatible: 'prediccion', insuficiente: 'calculado' }[r.verdict];
    const box = h('div', { class: 'combo' }, h('h4', {}, 'Análisis de la combinación'), h('div', { class: 'combo-title' }, h('span', { class: `prov ${cls}` }, { conocido: 'Documentado', 'conocido-sin-geometria': 'Documentado sin 3D', 'red-cristalina': 'Red cristalina', 'no-validado': 'No validado', incompatible: 'Incompatible', insuficiente: 'Selección' }[r.verdict]), h('b', {}, r.title)));
    for (const l of r.lines) box.append(h('p', { class: 'small' }, l));
    if (r.predictions.length)
      box.append(h('p', { class: 'small muted' }, 'Proporciones compatibles con estados de oxidación de la fuente (predicción, no confirma que el compuesto exista): ', r.predictions.join(', '), '.'));
    const actions = h('div', { class: 'row gap mt' });
    if (atoms.length) actions.append(h('a', { class: 'btn small', href: `#/calculadora/formula/${encodeURIComponent(hillFormula(atoms.map((a) => a.z)))}` }, icon('calc', 14), 'Enviar a la calculadora'));
    if (r.verdict === 'conocido' && r.record) actions.append(h('button', { class: 'btn small primary', onclick: () => this.formStructure(r.record!) }, icon('bond', 14), 'Formar estructura'));
    if (r.record) actions.append(h('a', { class: 'btn small', href: `#/molecula/${r.record.id}` }, 'Ver en la biblioteca'));
    if (actions.childElementCount) box.append(actions);
    if (atoms.length !== free.length) box.append(h('p', { class: 'small muted' }, 'Los átomos que ya forman una estructura no se incluyen en el análisis.'));
    return box;
  }

  private renderStatus() {
    const msg =
      this.tool === 'bond'
        ? this.store.project.atoms.length < 2
          ? 'Coloca al menos dos átomos con «Elemento» para poder enlazarlos'
          : ''
        : this.tool === 'distance'
        ? `Distancia: selecciona ${2 - this.measurePick.length} átomo${2 - this.measurePick.length === 1 ? '' : 's'}`
        : this.tool === 'angle'
          ? `Ángulo: selecciona ${3 - this.measurePick.length} átomo(s); el segundo es el vértice`
          : this.store.project.atoms.length === 0
            ? 'Pulsa «Elemento» para colocar el primer átomo'
            : '';
    this.status.textContent = msg;
    this.status.classList.toggle('hidden', !msg);
  }

  private updateOverlay() {
    if (!this.active) return;
    // Anillos de selección orientados a la cámara
    for (const c of this.selHelpers.children) c.quaternion.copy(this.sm.camera.quaternion);
    const tags: HTMLElement[] = [];
    for (const m of this.store.project.measurements) {
      const pts = m.atoms.map((id) => this.atom(id)?.pos);
      if (pts.some((p) => !p)) continue;
      const mid = m.kind === 'distance' ? new THREE.Vector3(...pts[0]!).add(new THREE.Vector3(...pts[1]!)).multiplyScalar(0.5) : new THREE.Vector3(...pts[1]!);
      const s = this.sm.toScreen(mid);
      if (!s.visible) continue;
      const v = this.measureValue(m);
      const t = h('div', { class: `tag ${m.kind}` }, `${v.toFixed(m.kind === 'distance' ? 2 : 1)} ${m.unit}`);
      t.style.left = `${s.x}px`;
      t.style.top = `${s.y}px`;
      tags.push(t);
    }
    this.overlay.replaceChildren(...tags);
    this.placeAtomActions();
  }

  /** Botón flotante junto al átomo (o grupo) seleccionado: eliminar sin buscar en menús. */
  private atomActionsKey = '';
  private placeAtomActions() {
    const box = this.atomActions;
    const ids = [...this.selection];
    const show = ids.length > 0 && !this.placing && this.tool === 'select' && !this.drag?.moved && (this.bondInfo.classList.contains('hidden') || !compact());
    if (!show) {
      if (!box.classList.contains('hidden')) box.classList.add('hidden');
      this.atomActionsKey = '';
      return;
    }
    const atoms = ids.map((id) => this.atom(id)).filter((a): a is AtomInstance => !!a);
    if (!atoms.length) return;
    const key = ids.join(',');
    if (key !== this.atomActionsKey) {
      this.atomActionsKey = key;
      clear(box);
      box.append(h('button', { class: 'aa-btn', type: 'button', onclick: () => this.deleteSelection() }, icon('trash', 16), h('span', {}, atoms.length === 1 ? 'Eliminar' : `Eliminar ${atoms.length}`)));
    }
    // Centro y radio en pantalla de lo seleccionado
    const c = new THREE.Vector3();
    for (const a of atoms) c.add(new THREE.Vector3(...a.pos));
    c.multiplyScalar(1 / atoms.length);
    const scale = this.store.project.view.atomScale * this.settings.atomScale;
    let r = 0;
    for (const a of atoms) r = Math.max(r, new THREE.Vector3(...a.pos).distanceTo(c) + visualRadius(element(a.z), scale));
    const s = this.sm.toScreen(c);
    if (!s.visible) return void box.classList.add('hidden');
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(this.sm.camera.quaternion).multiplyScalar(r);
    const s2 = this.sm.toScreen(c.clone().add(side));
    const rpx = Math.hypot(s2.x - s.x, s2.y - s.y);
    box.classList.remove('hidden');
    const stage = box.parentElement!.getBoundingClientRect();
    const w = box.offsetWidth;
    const hh = box.offsetHeight;
    let top = s.y - rpx * 1.2 - hh - 6;
    if (top < 8) top = s.y + rpx * 1.2 + 6;
    const left = Math.min(stage.width - w - 8, Math.max(8, s.x - w / 2));
    box.style.transform = `translate(${Math.round(left)}px, ${Math.round(Math.min(stage.height - hh - 8, top))}px)`;
  }

  /* ============================ teclado ============================ */

  private onKey(e: KeyboardEvent) {
    if (!this.active) return;
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    if (document.querySelector('.sheet.open')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (ctrl && k === 'z' && !e.shiftKey) this.store.undo();
    else if ((ctrl && k === 'y') || (ctrl && e.shiftKey && k === 'z')) this.store.redo();
    else if (ctrl && k === 'd') this.duplicate();
    else if (ctrl && k === 'g') this.toggleGroup();
    else if (ctrl && k === 's') this.cb.save();
    else if (ctrl && k === 'a') this.select(this.store.project.atoms.map((a) => a.id));
    else if (ctrl) return;
    else if (k === 'delete' || k === 'backspace') this.deleteSelection();
    else if (k === 'escape') {
      if (this.placing) this.cancelPlacement();
      else if (this.bondPick.length) {
        this.bondPick = [];
        this.syncSelectionVisuals();
        this.renderBondBar();
      } else if (this.tool !== 'select') this.setTool('select');
      else this.select([]);
    } else if (k === 'v') this.setTool('select');
    else if (k === 'b') this.setTool('bond');
    else if (k === 'd') this.setTool('distance');
    else if (k === 'a') this.setTool('angle');
    else if (k === 'r') this.rotateSelection();
    else if (k === 'e') this.togglePicker();
    else return;
    e.preventDefault();
  }
}

const BOND_MAT = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.35, metalness: 0.1 });
/** Enlaces propuestos por el usuario (aún no reconocidos como estructura documentada). */
const MANUAL_BOND_MAT = new THREE.MeshStandardMaterial({ color: 0xffb340, roughness: 0.4, metalness: 0.05, emissive: 0x3a2200 });

function round(v: number) {
  return Math.round(v * 1000) / 1000;
}
