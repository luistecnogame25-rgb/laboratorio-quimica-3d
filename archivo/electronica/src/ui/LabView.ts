/**
 * Espacio de trabajo 3D: barra de herramientas, paleta de componentes, escena, panel de
 * propiedades y panel de simulación (multímetro + registro de la sonda + avisos).
 */
import { eng, parseEng } from '../core/format';
import { allDefs, getDef, withDefaults } from '../core/registry';
import type { ProjectStore } from '../core/store';
import { CATEGORY_LABELS, type CategoryId, type ComponentDef, type InstanceReport, type ParamDef } from '../core/types';
import { pinKey, terminalsOf } from '../electrical/netlist';
import { SYMBOLS } from '../education/symbols';
import { LabController, type Tool } from '../lab/LabController';
import { SimulationController } from '../lab/SimulationController';
import { isBoardType } from '../library/breadboards';
import { PLANNED } from '../library/catalog';
import { SceneManager } from '../render/SceneManager';
import { WIRE_COLORS } from '../render/wireMesh';
import { qualityOf, type AppSettings } from '../settings';
import { clear, h, icon, iconBtn, toast } from './dom';
import { openInfoSheet } from './infoSheet';

export interface LabCallbacks {
  save(): void;
  exportFile(): void;
}

const LEVEL_BADGE = { fisico: ['Modelo físico', 'ok'], ideal: ['Modelo ideal', 'accent'], ninguno: ['Sin modelo', 'warn'] } as const;

const THUMBS: Record<string, string> = {
  resistor: 'resistor',
  'capacitor-ceramic': 'capacitor',
  'capacitor-electrolytic': 'capacitor-electrolytic',
  led: 'led',
  diode: 'diode',
  npn: 'npn',
  pnp: 'pnp',
  'battery-9v': 'battery',
  'dc-supply': 'dc-supply',
  pushbutton: 'pushbutton',
  'slide-switch': 'switch',
};

export class LabView {
  readonly el: HTMLElement;
  readonly sm: SceneManager;
  readonly lab: LabController;
  readonly simc: SimulationController;
  private toolbar!: HTMLElement;
  private palette!: HTMLElement;
  private props!: HTMLElement;
  private propsStatic!: HTMLElement;
  private propsLive!: HTMLElement;
  private simpanel!: HTMLElement;
  private overlay!: HTMLElement;
  private hint!: HTMLElement;
  private scopeCanvas!: HTMLCanvasElement;
  private dmm!: HTMLElement;
  private simIssues!: HTMLElement;
  private propsKey = '';
  private active = false;
  private toolButtons = new Map<Tool, HTMLButtonElement>();
  private runBtn!: HTMLButtonElement;
  private stateLabel!: HTMLElement;
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private nameInput!: HTMLInputElement;
  private wireColorSel!: HTMLSelectElement;
  private paletteFilter = '';

  constructor(
    private readonly store: ProjectStore,
    settings: AppSettings,
    private readonly cb: LabCallbacks,
  ) {
    this.el = h('div', { class: 'lab' });
    const stage = h('div', { class: 'stage' });
    this.buildToolbar();
    this.buildPalette();
    this.props = h('aside', { class: 'panel props', 'aria-label': 'Propiedades' });
    this.propsStatic = h('div');
    this.propsLive = h('div');
    this.props.append(this.propsStatic, this.propsLive);
    this.buildSimPanel();
    this.overlay = h('div', { class: 'overlay' });
    this.hint = h('div', { class: 'stage-hint' });
    this.el.append(this.toolbar, this.palette, stage, this.props, this.simpanel);

    this.sm = new SceneManager(stage, qualityOf(settings));
    stage.append(this.overlay, this.hint, this.buildCameraControls());
    this.lab = new LabController(this.sm, store);
    this.lab.wireColor = settings.defaultWireColor;
    this.simc = new SimulationController(store);

    this.lab.onChange = () => this.onLabChange();
    this.lab.onToggleSwitch = (id) =>
      store.mutate('Cambiar interruptor', (p) => {
        const c = p.components.find((k) => k.id === id);
        if (c) c.params.position = c.params.position === 'B' ? 'A' : 'B';
      });
    this.simc.onUpdate = () => this.onSimUpdate();
    store.subscribe((_p, reason) => {
      if (reason !== 'preview') this.refreshToolbar();
    });
    this.sm.onFrame((dt) => {
      this.simc.frame(dt);
      if (this.simc.state === 'running') this.lab.applyReports(this.simc.reports);
      this.updateOverlay();
    });
    this.stageDrop(stage);
    window.addEventListener('keydown', (e) => this.onKey(e));
    this.onLabChange();
    this.onSimUpdate();
    this.refreshToolbar();
  }

  private pendingFrame = true;

  activate() {
    this.active = true;
    this.sm.start();
    this.sm.resize();
    if (this.pendingFrame) {
      this.pendingFrame = false;
      this.sm.frameContent();
    }
  }

  /** Encuadra la cámara al contenido la próxima vez que la vista sea visible. */
  requestFrame() {
    if (this.active) this.sm.frameContent();
    else this.pendingFrame = true;
  }

  deactivate() {
    this.active = false;
    this.sm.stop();
  }

  applySettings(s: AppSettings) {
    this.sm.setQuality(qualityOf(s));
  }

  /* =========================== barra de herramientas =========================== */

  private buildToolbar() {
    const tb = h('div', { class: 'toolbar', role: 'toolbar' });
    const toggle = (panel: () => HTMLElement) => () => panel().classList.toggle('open');
    tb.append(iconBtn('panelLeft', 'Componentes', toggle(() => this.palette), 'only-mobile'));
    this.nameInput = h('input', { class: 'proj-name', 'aria-label': 'Nombre del proyecto' }) as HTMLInputElement;
    this.nameInput.addEventListener('change', () => this.store.mutate('Renombrar', (p) => (p.name = this.nameInput.value.trim() || 'Circuito sin título')));
    tb.append(this.nameInput);
    this.undoBtn = iconBtn('undo', 'Deshacer (Ctrl+Z)', () => this.store.undo());
    this.redoBtn = iconBtn('redo', 'Rehacer (Ctrl+Y)', () => this.store.redo());
    tb.append(this.undoBtn, this.redoBtn, h('span', { class: 'sep' }));
    const tools: [Tool, string, string][] = [
      ['select', 'cursor', 'Seleccionar y mover (V)'],
      ['wire', 'wire', 'Cable: clic en dos puntos (W)'],
      ['probe', 'probe', 'Sonda / multímetro: punta roja y negra (M)'],
    ];
    for (const [t, ic, title] of tools) {
      const b = iconBtn(ic, title, () => this.lab.setTool(t));
      this.toolButtons.set(t, b);
      tb.append(b);
    }
    this.wireColorSel = h('select', { title: 'Color del cable', 'aria-label': 'Color del cable' }, ...WIRE_COLORS.map((c) => h('option', { value: c.value }, c.value === 'auto' ? 'Color: automático' : c.label))) as HTMLSelectElement;
    this.wireColorSel.addEventListener('change', () => (this.lab.wireColor = this.wireColorSel.value));
    tb.append(this.wireColorSel, h('span', { class: 'sep' }));
    tb.append(
      iconBtn('rotate', 'Rotar 90° (R)', () => this.lab.rotateSelection()),
      iconBtn('copy', 'Duplicar (Ctrl+D)', () => this.lab.duplicateSelection()),
      iconBtn('group', 'Agrupar selección (Ctrl+G)', () => this.lab.groupSelection()),
      iconBtn('trash', 'Eliminar (Supr)', () => this.lab.deleteSelection()),
      h('span', { class: 'sep' }),
    );
    this.runBtn = iconBtn('play', 'Ejecutar simulación (Espacio)', () => this.toggleRun(), 'run');
    tb.append(
      this.runBtn,
      iconBtn('stop', 'Detener y reiniciar', () => this.simc.stop(), 'stop'),
      iconBtn('dc', 'Punto de operación DC (régimen permanente)', () => this.simc.runDC()),
    );
    this.stateLabel = h('span', { class: 'sim-state' });
    tb.append(this.stateLabel, h('span', { class: 'grow' }));
    tb.append(
      iconBtn('save', 'Guardar (Ctrl+S)', () => this.cb.save()),
      iconBtn('download', 'Exportar archivo .lab3d.json', () => this.cb.exportFile()),
      iconBtn('panelRight', 'Propiedades', toggle(() => this.props), 'only-mobile'),
    );
    this.toolbar = tb;
  }

  private buildCameraControls(): HTMLElement {
    return h(
      'div',
      { class: 'cam-ctrl', role: 'group', 'aria-label': 'Cámara' },
      iconBtn('zoomIn', 'Acercar', () => this.sm.zoom(0.8)),
      iconBtn('zoomOut', 'Alejar', () => this.sm.zoom(1.25)),
      iconBtn('top', 'Vista superior', () => this.sm.setView('top', this.sm.controls.target.clone())),
      iconBtn('front', 'Vista frontal', () => this.sm.setView('front', this.sm.controls.target.clone())),
      iconBtn('cube', 'Vista isométrica', () => this.sm.setView('iso', this.sm.controls.target.clone())),
      iconBtn('reset', 'Encuadrar todo', () => this.sm.frameContent()),
    );
  }

  private refreshToolbar() {
    this.undoBtn.disabled = !this.store.canUndo();
    this.redoBtn.disabled = !this.store.canRedo();
    if (document.activeElement !== this.nameInput) this.nameInput.value = this.store.project.name;
    for (const [t, b] of this.toolButtons) b.classList.toggle('active', this.lab?.tool === t);
    if (this.wireColorSel) this.wireColorSel.style.display = this.lab?.tool === 'wire' ? '' : 'none';
  }

  private toggleRun() {
    if (this.simc.state === 'running') this.simc.pause();
    else this.simc.start();
    if (this.simc.error) toast(this.simc.error, 'error');
  }

  /* =========================== paleta =========================== */

  private buildPalette() {
    this.palette = h('aside', { class: 'panel palette', 'aria-label': 'Componentes' });
    this.renderPalette();
  }

  private renderPalette() {
    clear(this.palette);
    const search = h('input', { class: 'search', placeholder: 'Buscar componente…', value: this.paletteFilter, type: 'search' }) as HTMLInputElement;
    search.addEventListener('input', () => {
      this.paletteFilter = search.value;
      const pos = search.selectionStart;
      this.renderPalette();
      const s = this.palette.querySelector('input') as HTMLInputElement;
      s.focus();
      s.setSelectionRange(pos, pos);
    });
    this.palette.append(search);
    const q = this.paletteFilter.toLowerCase();
    const defs = allDefs().filter((d) => !q || d.name.toLowerCase().includes(q) || d.summary.toLowerCase().includes(q));
    const cats = new Map<CategoryId, ComponentDef[]>();
    for (const d of defs) cats.set(d.category, [...(cats.get(d.category) ?? []), d]);
    for (const [cat, list] of cats) {
      this.palette.append(h('h4', {}, CATEGORY_LABELS[cat]));
      for (const d of list) {
        const thumb = h('span', { class: 'thumb', html: THUMBS[d.type] ? SYMBOLS[THUMBS[d.type]].split('</svg>')[0] + '</svg>' : '' });
        if (!THUMBS[d.type]) thumb.append(icon(isBoardType(d.type) ? 'library' : 'cube'));
        const item = h(
          'button',
          { class: 'pal-item', draggable: 'true', title: d.summary, type: 'button' },
          thumb,
          h('span', {}, d.name, h('small', {}, d.summary)),
        );
        item.addEventListener('click', () => {
          this.lab.addComponent(d.type);
          this.palette.classList.remove('open');
        });
        item.addEventListener('dragstart', (e) => e.dataTransfer?.setData('text/lab-component', d.type));
        this.palette.append(item);
      }
    }
    const planned = PLANNED.filter((p) => !q || p.name.toLowerCase().includes(q));
    if (planned.length && q) {
      this.palette.append(h('h4', {}, 'Planificados'));
      for (const p of planned.slice(0, 12))
        this.palette.append(h('div', { class: 'pal-item planned' }, h('span', { class: 'thumb' }, icon('cube')), h('span', {}, p.name, h('small', {}, `Fase ${p.phase} · aún no disponible`))));
    }
  }

  private stageDrop(stage: HTMLElement) {
    stage.addEventListener('dragover', (e) => e.preventDefault());
    stage.addEventListener('drop', (e) => {
      e.preventDefault();
      const type = e.dataTransfer?.getData('text/lab-component');
      if (!type) return;
      const p = this.sm.planeHit(e.clientX, e.clientY, 0);
      this.lab.addComponent(type, p ? { x: p.x, z: p.z } : undefined);
    });
  }

  /* =========================== propiedades =========================== */

  private onLabChange() {
    this.refreshToolbar();
    this.lab.simActive = this.simc.state === 'running' || this.simc.state === 'paused';
    this.lab.pressed = this.simc.runtime.pressed;
    this.simc.setProbes(this.lab.probes.red?.end, this.lab.probes.black?.end);
    this.updateHint();
    const key = [...this.lab.selection].join(',') + '|' + this.lab.selectedWire + '|' + this.store.project.modified + '|' + this.simc.state + '|' + this.lab.tool;
    if (key !== this.propsKey) {
      this.propsKey = key;
      this.renderPropsStatic();
    }
    this.renderPropsLive();
    this.renderDmm();
  }

  private updateHint() {
    const t = this.lab.tool;
    const sim = this.simc.state === 'running';
    let html = '';
    if (t === 'select') html = sim ? '<b>Simulando.</b> Mantén presionado un pulsador o haz clic en un interruptor para accionarlo.' : '<b>Seleccionar:</b> arrastra componentes (encajan en las perforaciones). Arrastra el fondo para girar la cámara; rueda o pellizco para zoom; clic derecho o dos dedos para desplazar.';
    if (t === 'wire') html = this.lab.wireStart ? `<b>Cable:</b> desde ${this.lab.wireStart.label}. Haz clic en el destino (Esc para cancelar).` : '<b>Cable:</b> haz clic en un terminal o perforación de origen. Los puntos conectados se resaltan en verde.';
    if (t === 'probe') html = !this.lab.probes.red || this.lab.probes.black ? '<b>Sonda:</b> haz clic para colocar la punta <span style="color:#ff5a5a">roja</span>.' : '<b>Sonda:</b> haz clic para colocar la punta negra (o deja solo la roja para medir respecto a GND).';
    this.hint.innerHTML = html;
  }

  private renderPropsStatic() {
    const root = this.propsStatic;
    clear(root);
    const p = this.store.project;
    if (this.lab.selectedWire) {
      const w = p.wires.find((k) => k.id === this.lab.selectedWire);
      if (!w) return;
      const sel = h('select', {}, ...WIRE_COLORS.map((c) => h('option', { value: c.value, selected: c.value === w.color }, c.label))) as HTMLSelectElement;
      sel.addEventListener('change', () => this.store.mutate('Color de cable', (pp) => {
        const ww = pp.wires.find((k) => k.id === w.id);
        if (ww) ww.color = sel.value;
      }));
      root.append(
        h('div', { class: 'prop-head' }, h('div', {}, h('h3', {}, 'Cable'), h('span', { class: 'muted' }, this.lab.netLabel(w.a)))),
        h('h4', {}, 'Extremos'),
        h('div', { class: 'term-list' }, h('div', {}, h('span', {}, 'A'), h('span', {}, this.lab.endLabel(w.a))), h('div', {}, h('span', {}, 'B'), h('span', {}, this.lab.endLabel(w.b)))),
        h('h4', {}, 'Color'),
        h('div', { class: 'field' }, sel),
        h('button', { class: 'btn danger small', onclick: () => this.lab.deleteSelection() }, icon('trash', 16), 'Eliminar cable'),
      );
      return;
    }
    const sel = p.components.filter((c) => this.lab.selection.has(c.id));
    if (sel.length > 1) {
      root.append(
        h('h3', {}, `${sel.length} elementos seleccionados`),
        h('p', {}, sel.map((c) => this.lab.names.get(c.id)).join(', ')),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn small', onclick: () => this.lab.groupSelection() }, icon('group', 16), 'Agrupar'),
          h('button', { class: 'btn small', onclick: () => this.lab.ungroupSelection() }, 'Desagrupar'),
          h('button', { class: 'btn small', onclick: () => this.lab.rotateSelection() }, icon('rotate', 16), 'Rotar'),
          h('button', { class: 'btn small danger', onclick: () => this.lab.deleteSelection() }, icon('trash', 16), 'Eliminar'),
        ),
      );
      return;
    }
    if (sel.length === 1) {
      this.renderComponentProps(root, sel[0].id);
      return;
    }
    // Sin selección: resumen del circuito
    const n = p.components.filter((c) => !isBoardType(c.type)).length;
    root.append(
      h('h3', {}, 'Circuito'),
      h('div', { class: 'kv', style: 'margin-top:8px' }, h('span', {}, 'Componentes'), h('span', {}, String(n)), h('span', {}, 'Protoboards'), h('span', {}, String(p.components.length - n)), h('span', {}, 'Cables'), h('span', {}, String(p.wires.length)), h('span', {}, 'Nodos eléctricos'), h('span', {}, String(this.simc.sim?.nodeCount ?? '—'))),
      h('h4', {}, 'Cómo empezar'),
      h(
        'ol',
        { style: 'padding-left:18px;margin:0;color:var(--text-2);line-height:1.6;font-size:13px' },
        h('li', {}, 'Añade una protoboard y componentes desde el panel izquierdo.'),
        h('li', {}, 'Arrástralos: sus patas encajan en las perforaciones.'),
        h('li', {}, 'Usa la herramienta Cable para unir terminales, rieles y perforaciones.'),
        h('li', {}, 'Pulsa ▶ para simular y la herramienta Sonda para medir.'),
      ),
      h('h4', {}, 'Atajos'),
      h('div', { class: 'kv' }, ...['V', 'Seleccionar', 'W', 'Cable', 'M', 'Sonda', 'R', 'Rotar', 'Supr', 'Eliminar', 'Ctrl+D', 'Duplicar', 'Ctrl+Z / Y', 'Deshacer / rehacer', 'Espacio', 'Ejecutar / pausar', 'Esc', 'Cancelar'].map((t) => h('span', {}, t))),
    );
  }

  private renderComponentProps(root: HTMLElement, id: string) {
    const inst = this.store.project.components.find((c) => c.id === id)!;
    const def = getDef(inst.type);
    const params = withDefaults(def, inst.params);
    const [lvl, cls] = LEVEL_BADGE[def.modelLevel];
    root.append(
      h(
        'div',
        { class: 'prop-head' },
        h('div', { style: 'flex:1' }, h('span', { class: 'des' }, this.lab.names.get(id) ?? ''), h('h3', {}, def.name), h('span', { class: 'muted' }, def.label(params))),
        iconBtn('info', 'Ficha educativa', () => openInfoSheet(def.eduId, { type: def.type, params })),
      ),
      h('div', { class: 'row', style: 'margin:10px 0 4px' }, h('span', { class: `badge ${cls}`, title: def.modelDoc }, lvl), inst.group ? h('span', { class: 'badge' }, 'Agrupado') : null),
      h('p', { style: 'font-size:12.5px;margin:6px 0' }, def.summary),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn small', onclick: () => this.lab.rotateSelection() }, icon('rotate', 15), 'Rotar'),
        h('button', { class: 'btn small', onclick: () => this.lab.duplicateSelection() }, icon('copy', 15), 'Duplicar'),
        h('button', { class: 'btn small danger', onclick: () => this.lab.deleteSelection() }, icon('trash', 15)),
      ),
    );
    if (def.params.length) {
      root.append(h('h4', {}, 'Parámetros'));
      for (const pd of def.params) root.append(this.paramField(id, pd, params[pd.key]));
    }
    const terms = terminalsOf(inst);
    if (terms.length) {
      root.append(h('h4', {}, 'Terminales'));
      const list = h('div', { class: 'term-list' });
      for (const t of terms) {
        const pk = pinKey(id, t.id);
        const ins = this.lab.netlist.insertion.get(pk);
        const net = this.lab.netlist.pinNet.get(pk);
        const others = net !== undefined ? this.lab.netlist.nets[net].pins.filter((k) => k !== pk).length : 0;
        const status = ins ? `perforación ${ins.hole}` : others ? 'cableado' : 'sin conectar';
        list.append(h('div', { title: t.func }, h('span', {}, t.name), h('span', { class: others ? 'ok' : 'off' }, `${status}${others ? ` · ${others} conex.` : ''}`)));
      }
      root.append(list);
    }
    root.append(h('h4', {}, 'Modelo de simulación'), h('div', { class: 'model-box' }, def.modelDoc));
  }

  private paramField(id: string, pd: ParamDef, value: unknown): HTMLElement {
    const commit = (v: number | string) =>
      this.store.mutate(`Cambiar ${pd.label}`, (p) => {
        const c = p.components.find((k) => k.id === id);
        if (c) c.params[pd.key] = v;
      });
    const field = h('div', { class: 'field' }, h('label', {}, pd.label));
    const ctl = h('div', { class: 'ctl' });
    if (pd.type === 'select') {
      const sel = h('select', {}, ...(pd.options ?? []).map((o) => h('option', { value: o.value, selected: String(value) === o.value }, o.label))) as HTMLSelectElement;
      sel.addEventListener('change', () => commit(sel.value));
      ctl.append(sel);
    } else {
      const num = Number(value);
      const input = h('input', { type: 'text', value: pd.unit && pd.unit.length <= 2 && Math.abs(num) >= 1e-3 && (num >= 1000 || num < 1) ? eng(num, '').replace(' ', '') : String(num), inputmode: 'decimal' }) as HTMLInputElement;
      input.addEventListener('change', () => {
        const v = parseEng(input.value);
        if (v === null || !Number.isFinite(v)) {
          toast(`Valor no válido: "${input.value}". Ejemplos: 220, 4.7k, 100n, 1M`, 'warn');
          input.value = String(num);
          return;
        }
        const clamped = Math.min(pd.max ?? Infinity, Math.max(pd.min ?? -Infinity, v));
        if (clamped !== v) toast(`${pd.label} limitado a ${eng(clamped, pd.unit ?? '')}`, 'warn');
        commit(pd.step && pd.step >= 1 ? Math.round(clamped) : clamped);
      });
      ctl.append(input, h('span', { class: 'unit' }, pd.unit ?? ''));
      if (pd.presets) {
        const sel = h('select', { style: 'width:auto' }, h('option', { value: '' }, 'Estándar…'), ...pd.presets.map((v) => h('option', { value: String(v) }, eng(v, pd.unit ?? '')))) as HTMLSelectElement;
        sel.addEventListener('change', () => sel.value && commit(Number(sel.value)));
        ctl.append(sel);
      }
      field.append(ctl);
      if (pd.step && pd.min !== undefined && pd.max !== undefined && (pd.max - pd.min) / pd.step <= 2000) {
        const range = h('input', { type: 'range', min: pd.min, max: pd.max, step: pd.step, value: num }) as HTMLInputElement;
        range.addEventListener('input', () => (input.value = range.value));
        range.addEventListener('change', () => commit(Number(range.value)));
        field.append(range);
      }
      if (pd.help) field.append(h('span', { class: 'help' }, pd.help));
      return field;
    }
    field.append(ctl);
    if (pd.help) field.append(h('span', { class: 'help' }, pd.help));
    return field;
  }

  private renderPropsLive() {
    const root = this.propsLive;
    clear(root);
    const sel = [...this.lab.selection];
    const reports = this.simc.reports;
    if (sel.length === 1 && reports) {
      const r = reports.get(sel[0]);
      if (r) {
        root.append(h('h4', {}, this.simc.state === 'dc' ? 'Resultados (DC)' : `Mediciones · t = ${eng(this.simc.time, 's')}`));
        root.append(this.valuesTable(r));
        if (r.visual.region) root.append(h('p', { style: 'font-size:12.5px;margin:6px 0' }, 'Región de trabajo: ', h('b', {}, r.visual.region)));
        if (r.warnings.length) root.append(h('div', { class: 'issues', style: 'margin-top:8px' }, ...r.warnings.map((w) => this.issueEl(w.level, w.message))));
      }
    }
    if (!sel.length && !this.lab.selectedWire) {
      const issues = this.allIssues();
      root.append(h('h4', {}, 'Verificación del circuito'));
      root.append(issues.length ? h('div', { class: 'issues' }, ...issues) : h('div', { class: 'issue info' }, icon('check', 16), 'Sin problemas detectados.'));
    }
  }

  private valuesTable(r: InstanceReport): HTMLElement {
    const kv = h('div', { class: 'kv' });
    for (const v of r.values) {
      let text: string;
      if (v.label === 'Estado') text = v.value ? 'presionado' : 'abierto';
      else if (v.unit === 'h') text = Number.isFinite(v.value) ? `${v.value.toFixed(1)} h` : '—';
      else if (v.unit === '') text = v.value.toFixed(1);
      else text = eng(v.value, v.unit, 4);
      kv.append(h('span', {}, v.label), h('span', {}, text));
    }
    return kv;
  }

  private issueEl(level: 'info' | 'warn' | 'error', message: string, inst?: string): HTMLElement {
    const el = h('div', { class: `issue ${level}`, 'data-inst': inst }, icon(level === 'info' ? 'info' : 'warn', 16), h('span', {}, message));
    if (inst) el.addEventListener('click', () => {
      this.lab.select(inst);
      this.lab.focusOn(inst);
    });
    return el;
  }

  private allIssues(): HTMLElement[] {
    const out: HTMLElement[] = [];
    if (this.simc.error) out.push(this.issueEl('error', this.simc.error));
    for (const i of this.simc.issues) out.push(this.issueEl(i.level, i.message, i.instances?.[0]));
    if (this.simc.reports) {
      for (const [id, r] of this.simc.reports)
        for (const w of r.warnings) if (w.level !== 'info') out.push(this.issueEl(w.level, `${this.lab.names.get(id)}: ${w.message}`, id));
    }
    return out;
  }

  /* =========================== panel de simulación =========================== */

  private buildSimPanel() {
    this.dmm = h('div', { class: 'dmm' });
    this.scopeCanvas = h('canvas') as HTMLCanvasElement;
    const scope = h('div', { class: 'scope' }, this.scopeCanvas, h('span', { class: 'label' }, 'Registro de la sonda · V(t)'));
    this.simIssues = h('div', { class: 'sim-issues' });
    this.simpanel = h('section', { class: 'simpanel', 'aria-label': 'Simulación' }, this.dmm, scope, this.simIssues);
  }

  private onSimUpdate() {
    const s = this.simc.state;
    this.runBtn.replaceChildren(icon(s === 'running' ? 'pause' : 'play'));
    this.runBtn.title = s === 'running' ? 'Pausar (Espacio)' : 'Ejecutar simulación (Espacio)';
    this.runBtn.classList.toggle('active', s === 'running');
    const label = { stopped: 'Detenido', running: 'Simulando', paused: 'En pausa', dc: 'Análisis DC' }[s];
    const speed = s === 'running' && this.simc.achievedSpeed < this.simc.timeScale * 0.8 ? ` · ${this.simc.achievedSpeed.toFixed(2)}× real` : '';
    this.stateLabel.textContent = s === 'stopped' || s === 'dc' ? label : `${label} · t = ${this.simc.time.toFixed(3)} s${speed}`;
    this.stateLabel.classList.toggle('running', s === 'running');
    if (s === 'stopped' || s === 'dc') this.lab.applyReports(s === 'dc' ? this.simc.reports : null);
    this.lab.simActive = s === 'running' || s === 'paused';
    this.lab.pressed = this.simc.runtime.pressed;
    this.renderPropsLive();
    this.renderDmm();
    this.drawScope();
    clear(this.simIssues);
    const issues = this.allIssues();
    const speedSel = h(
      'select',
      { title: 'Escala de tiempo', style: 'background:var(--surface);border:1px solid var(--border-2);border-radius:7px;padding:4px 6px' },
      ...[0.01, 0.1, 0.5, 1, 2, 5, 10].map((v) => h('option', { value: String(v), selected: v === this.simc.timeScale }, `${v}× tiempo real`)),
    ) as HTMLSelectElement;
    speedSel.addEventListener('change', () => this.store.mutate('Escala de tiempo', (p) => (p.simulation.timeScale = Number(speedSel.value))));
    this.simIssues.append(h('div', { class: 'row', style: 'margin-bottom:6px' }, speedSel), ...(issues.length ? issues.slice(0, 8) : [h('div', { class: 'issue info' }, icon('check', 16), s === 'stopped' ? 'Circuito listo. Pulsa ▶ para simular.' : 'Sin advertencias.')]));
    if (this.propsKey.split('|')[3] !== s) this.onLabChange();
  }

  private renderDmm() {
    const v = this.simc.probeVoltage();
    const pr = this.lab.probes;
    clear(this.dmm);
    const save = h('button', { class: 'btn small', disabled: v === null, title: 'Guardar la lectura en el proyecto' }, icon('record', 14), 'Guardar lectura');
    save.addEventListener('click', () => {
      if (v === null) return;
      this.store.mutate('Guardar medición', (p) => {
        p.measurements = [...(p.measurements ?? []), { label: `${pr.red?.label ?? ''}${pr.black ? ' − ' + pr.black.label : ' (vs GND)'}`, value: v, unit: 'V', time: this.simc.time }].slice(-50);
      });
      toast('Medición guardada en el proyecto', 'ok');
    });
    this.dmm.append(
      h('small', {}, 'MULTÍMETRO · VOLTAJE DC'),
      h('div', { class: `reading ${v === null ? 'off' : ''}` }, v === null ? '--.---  V' : eng(v, 'V', 4)),
      h('small', {}, pr.red ? `● Roja: ${pr.red.label}` : 'Usa la herramienta Sonda para medir.'),
      pr.red ? h('small', {}, pr.black ? `● Negra: ${pr.black.label}` : '● Negra: GND (referencia)') : '',
      h('div', { class: 'row', style: 'margin-top:auto' }, save, pr.red ? h('button', { class: 'btn small ghost', onclick: () => this.lab.clearProbes() }, 'Quitar') : null),
    );
  }

  private drawScope() {
    const c = this.scopeCanvas;
    const rect = c.getBoundingClientRect();
    if (!rect.width) return;
    const dpr = Math.min(2, window.devicePixelRatio);
    if (c.width !== Math.round(rect.width * dpr)) {
      c.width = Math.round(rect.width * dpr);
      c.height = Math.round(rect.height * dpr);
    }
    const g = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    g.clearRect(0, 0, W, H);
    g.strokeStyle = 'rgba(80,120,170,0.18)';
    g.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      g.beginPath();
      g.moveTo((W * i) / 10, 0);
      g.lineTo((W * i) / 10, H);
      g.stroke();
    }
    for (let i = 1; i < 6; i++) {
      g.beginPath();
      g.moveTo(0, (H * i) / 6);
      g.lineTo(W, (H * i) / 6);
      g.stroke();
    }
    const data = this.simc.recorder;
    if (data.length < 2) {
      g.fillStyle = '#4b5d73';
      g.font = `${12 * dpr}px sans-serif`;
      g.textAlign = 'center';
      g.fillText(this.lab.probes.red ? 'Ejecuta la simulación para registrar' : 'Coloca la sonda para registrar voltaje', W / 2, H / 2);
      return;
    }
    let lo = Math.min(...data.map((d) => d.v));
    let hi = Math.max(...data.map((d) => d.v));
    if (hi - lo < 0.1) {
      const m = (hi + lo) / 2;
      lo = m - 0.05;
      hi = m + 0.05;
    }
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;
    const t0 = data[0].t;
    const t1 = data[data.length - 1].t;
    g.strokeStyle = '#7dffb0';
    g.lineWidth = 1.6 * dpr;
    g.shadowColor = 'rgba(125,255,176,0.5)';
    g.shadowBlur = 6;
    g.beginPath();
    data.forEach((d, i) => {
      const x = ((d.t - t0) / Math.max(1e-9, t1 - t0)) * W;
      const y = H - ((d.v - lo) / (hi - lo)) * H;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.stroke();
    g.shadowBlur = 0;
    g.fillStyle = '#8fa3bb';
    g.font = `${10.5 * dpr}px monospace`;
    g.textAlign = 'right';
    g.fillText(eng(hi, 'V', 3), W - 6, 14 * dpr);
    g.fillText(eng(lo, 'V', 3), W - 6, H - 6);
    g.textAlign = 'left';
    g.fillText(`${eng(t1 - t0, 's', 3)} de registro`, 8, H - 6);
  }

  /* =========================== etiquetas sobre la escena =========================== */

  private updateOverlay() {
    if (!this.active) return;
    const tags: HTMLElement[] = [];
    const reports = this.simc.reports;
    if (reports && this.simc.state !== 'stopped') {
      for (const [id, r] of reports) {
        const worst = r.warnings.find((w) => w.level === 'error') ?? r.warnings.find((w) => w.level === 'warn');
        const selected = this.lab.selection.has(id);
        if (!worst && !selected) continue;
        const pos = this.lab.screenPos(id);
        if (!pos?.visible) continue;
        const main = r.values.find((v) => v.unit === 'A') ?? r.values[0];
        const text = `${worst ? '⚠ ' : ''}${this.lab.names.get(id)}${main ? ' · ' + eng(main.value, main.unit, 3) : ''}`;
        const tag = h('div', { class: `tag ${worst?.level ?? ''}` }, text);
        tag.style.left = `${pos.x}px`;
        tag.style.top = `${pos.y}px`;
        tags.push(tag);
      }
    }
    const hv = this.lab.hover;
    if (hv && this.lab.tool !== 'select') {
      const s = this.sm.toScreen(hv.pos);
      if (s.visible) {
        const v = this.simc.sim?.endVoltage(hv.end);
        const tag = h('div', { class: 'tag hover' }, hv.label + (v !== undefined && v !== null && this.simc.state !== 'stopped' ? ` · ${eng(v, 'V', 4)}` : ''));
        tag.style.left = `${s.x}px`;
        tag.style.top = `${s.y}px`;
        tags.push(tag);
      }
    }
    this.overlay.replaceChildren(...tags);
  }

  /* =========================== teclado =========================== */

  private onKey(e: KeyboardEvent) {
    if (!this.active) return;
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    if (document.querySelector('.modal-back')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (ctrl && k === 'z' && !e.shiftKey) this.store.undo();
    else if ((ctrl && k === 'y') || (ctrl && e.shiftKey && k === 'z')) this.store.redo();
    else if (ctrl && k === 'd') this.lab.duplicateSelection();
    else if (ctrl && k === 'g') e.shiftKey ? this.lab.ungroupSelection() : this.lab.groupSelection();
    else if (ctrl && k === 's') this.cb.save();
    else if (ctrl && k === 'a') this.lab.selectAll();
    else if (ctrl) return;
    else if (k === 'delete' || k === 'backspace') this.lab.deleteSelection();
    else if (k === 'r') this.lab.rotateSelection();
    else if (k === 'w') this.lab.setTool('wire');
    else if (k === 'v') this.lab.setTool('select');
    else if (k === 'm') this.lab.setTool('probe');
    else if (k === ' ') this.toggleRun();
    else if (k === 'escape') {
      if (this.lab.wireStart) this.lab.cancelWire();
      else this.lab.select(null);
    } else return;
    e.preventDefault();
  }
}
