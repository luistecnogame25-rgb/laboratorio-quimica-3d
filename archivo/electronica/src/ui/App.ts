/**
 * Aplicación: navegación por secciones (hash router), gestión del proyecto activo,
 * autoguardado local y vistas (Inicio, Biblioteca, Simulaciones, Robótica, Academia,
 * Proyectos, Configuración).
 */
import { createProject, cloneProject } from '../core/project';
import { allDefs } from '../core/registry';
import { ProjectStore } from '../core/store';
import { CATEGORY_LABELS, type CategoryId, type Project, type WireEnd } from '../core/types';
import { uid } from '../core/format';
import { LESSONS } from '../education/lessons';
import { hasSheet } from '../education/sheets';
import { TEMPLATES, getTemplate } from '../lab/templates';
import { PLANNED } from '../library/catalog';
import { isBoardType } from '../library/breadboards';
import { CircuitBuilder } from '../library/builder';
import { exportProjectFile, importProjectFile, LocalProjectRepository, type ProjectMeta } from '../storage/projectStorage';
import { loadSettings, saveSettings, type AppSettings } from '../settings';
import { clear, h, icon, toast } from './dom';
import { openInfoSheet } from './infoSheet';
import { LabView } from './LabView';

type Route = 'inicio' | 'laboratorio' | 'nuevo' | 'biblioteca' | 'simulaciones' | 'robotica' | 'academia' | 'proyectos' | 'configuracion';

const NAV: [Route, string, string][] = [
  ['inicio', 'home', 'Inicio'],
  ['laboratorio', 'lab', 'Mi laboratorio'],
  ['nuevo', 'plus', 'Nuevo circuito'],
  ['biblioteca', 'library', 'Biblioteca'],
  ['simulaciones', 'sim', 'Simulaciones'],
  ['robotica', 'robot', 'Robótica'],
  ['academia', 'academy', 'Academia'],
  ['proyectos', 'folder', 'Mis proyectos'],
  ['configuracion', 'gear', 'Configuración'],
];

const LAST_KEY = 'lab3d.lastProject';

export class App {
  private repo = new LocalProjectRepository();
  private settings: AppSettings = loadSettings();
  private store: ProjectStore;
  private lab: LabView | null = null;
  private nav!: HTMLElement;
  private main!: HTMLElement;
  private views = new Map<string, HTMLElement>();
  private saveTimer = 0;
  private savedOnce = new Set<string>();

  constructor(private readonly root: HTMLElement) {
    const p = createProject('Mi primer circuito');
    p.simulation = { timeScale: this.settings.defaultTimeScale, dt: this.settings.defaultDt };
    this.store = new ProjectStore(p);
    this.buildShell();
    this.store.subscribe((proj, reason) => {
      if (reason === 'preview' || reason === 'load') return;
      // Autoguardado: solo proyectos con contenido o ya guardados
      if (proj.components.length || this.savedOnce.has(proj.id)) {
        clearTimeout(this.saveTimer);
        this.saveTimer = window.setTimeout(() => this.persist(false), 700);
      }
    });
    window.addEventListener('hashchange', () => this.route());
    void this.restoreLast().then(() => this.route());
  }

  private async restoreLast() {
    const id = localStorage.getItem(LAST_KEY);
    if (!id) return;
    try {
      const p = await this.repo.load(id);
      if (p) {
        this.store.load(p);
        this.savedOnce.add(p.id);
      }
    } catch (e) {
      console.warn('No se pudo recuperar el último proyecto', e);
    }
  }

  private async persist(notify: boolean) {
    try {
      await this.repo.save(this.store.project);
      this.savedOnce.add(this.store.project.id);
      localStorage.setItem(LAST_KEY, this.store.project.id);
      if (notify) toast('Proyecto guardado en este dispositivo', 'ok');
    } catch (e) {
      toast(`No se pudo guardar: ${(e as Error).message}`, 'error');
    }
  }

  private buildShell() {
    this.nav = h('nav', { class: 'nav', 'aria-label': 'Secciones' }, h('div', { class: 'brand', title: 'Laboratorio Electrónico 3D' }, h('div', { class: 'brand-mark' }, icon('bolt', 20))));
    for (const [r, ic, label] of NAV) {
      const a = h('a', { href: `#/${r}`, 'data-route': r }, icon(ic, 20), h('span', {}, label));
      a.addEventListener('click', () => this.nav.classList.remove('open'));
      this.nav.append(a);
    }
    this.main = h('main', { class: 'main' });
    const bar = h('div', { class: 'mobile-bar' }, h('button', { class: 'icon-btn', 'aria-label': 'Menú', onclick: () => this.nav.classList.toggle('open') }, icon('menu')), h('b', {}, 'Laboratorio Electrónico 3D'));
    this.root.append(this.nav, h('div', { class: 'shell-body' }, bar, this.main));
  }

  private go(r: Route) {
    location.hash = `#/${r}`;
  }

  private route() {
    const r = (location.hash.replace('#/', '') || 'inicio') as Route;
    if (r === 'nuevo') {
      this.newProject();
      return;
    }
    for (const a of this.nav.querySelectorAll('a')) a.classList.toggle('active', a.dataset.route === r);
    for (const [, v] of this.views) v.classList.add('hidden');
    if (r === 'laboratorio') {
      this.ensureLab();
      this.views.get('laboratorio')!.classList.remove('hidden');
      this.lab!.activate();
      return;
    }
    this.lab?.deactivate();
    const render: Record<string, () => HTMLElement | Promise<HTMLElement>> = {
      inicio: () => this.homeView(),
      biblioteca: () => this.libraryView(),
      simulaciones: () => this.simulationsView(),
      robotica: () => this.roboticsView(),
      academia: () => this.academyView(),
      proyectos: () => this.projectsView(),
      configuracion: () => this.settingsView(),
    };
    const fn = render[r] ?? render.inicio;
    void Promise.resolve(fn()).then((content) => {
      let v = this.views.get(r);
      if (!v) {
        v = h('div', { class: 'view' });
        this.views.set(r, v);
        this.main.append(v);
      }
      clear(v);
      v.append(content);
      v.classList.remove('hidden');
      v.scrollTop = 0;
    });
  }

  private ensureLab() {
    if (this.lab) return;
    this.lab = new LabView(this.store, this.settings, {
      save: () => void this.persist(true),
      exportFile: () => exportProjectFile(this.store.project),
    });
    const v = h('div', { class: 'view' }, this.lab.el);
    this.views.set('laboratorio', v);
    this.main.append(v);
  }

  /** Carga un proyecto en el laboratorio. */
  private openProject(p: Project, probes?: { red: WireEnd; black?: WireEnd }) {
    this.lab?.simc.stop();
    this.store.load(p);
    localStorage.setItem(LAST_KEY, p.id);
    this.ensureLab();
    if (probes && this.lab) {
      const mk = (end: WireEnd) => ({ end, pos: this.lab!.lab.endPosition(end)!, label: this.lab!.lab.endLabel(end) });
      this.lab.lab.probes = { red: mk(probes.red), black: probes.black ? mk(probes.black) : undefined };
      this.lab.lab.sync();
    } else this.lab?.lab.clearProbes();
    this.lab?.requestFrame();
    this.go('laboratorio');
  }

  private newProject() {
    const cb = new CircuitBuilder('Circuito sin título');
    cb.board('breadboard-830');
    cb.project.simulation = { timeScale: this.settings.defaultTimeScale, dt: this.settings.defaultDt };
    this.openProject(cb.project);
    toast('Nuevo circuito con una protoboard de 830 puntos', 'ok');
  }

  private openTemplate(id: string) {
    const t = getTemplate(id);
    if (!t) return;
    const { project, probes } = t.build();
    project.simulation = { timeScale: this.settings.defaultTimeScale, dt: this.settings.defaultDt };
    this.openProject(project, probes);
    toast(`Plantilla "${t.name}" cargada. Pulsa ▶ para simular.`, 'ok');
  }

  /* ============================== vistas ============================== */

  private header(title: string, sub: string, ...actions: HTMLElement[]) {
    return h('div', { class: 'page-header' }, h('div', {}, h('h1', {}, title), h('p', {}, sub)), h('div', { class: 'row' }, ...actions));
  }

  private async homeView(): Promise<HTMLElement> {
    const recent = (await this.repo.list()).slice(0, 4);
    const defs = allDefs().filter((d) => !isBoardType(d.type));
    const art = `<svg viewBox="0 0 320 220" fill="none" stroke-linecap="round">
      <defs><linearGradient id="g1" x1="0" x2="1"><stop offset="0" stop-color="#34d6ff"/><stop offset="1" stop-color="#2a6bff"/></linearGradient></defs>
      <rect x="20" y="60" width="280" height="110" rx="10" fill="#e9e9e2" opacity=".95"/>
      ${Array.from({ length: 22 }, (_, i) => Array.from({ length: 5 }, (_, j) => `<rect x="${34 + i * 12}" y="${84 + j * 9}" width="4" height="4" fill="#2b2b30"/>`).join('')).join('')}
      <path d="M20 74h280M20 156h280" stroke="#d8343c" stroke-width="2" opacity=".7"/>
      <path d="M70 92c0-40 60-40 60 0" stroke="#e02b2b" stroke-width="4"/>
      <path d="M190 128c0 40 70 40 70 0" stroke="#2f6cf6" stroke-width="4"/>
      <rect x="120" y="96" width="44" height="12" rx="6" fill="#d8c08f"/><rect x="128" y="96" width="4" height="12" fill="#d22020"/><rect x="136" y="96" width="4" height="12" fill="#d22020"/><rect x="144" y="96" width="4" height="12" fill="#6b3a1e"/>
      <circle cx="210" cy="96" r="12" fill="#ff2a2a"/><circle cx="210" cy="96" r="30" fill="#ff2a2a" opacity=".18"/>
      <path d="M40 40l18-18 18 18" stroke="url(#g1)" stroke-width="3"/><path d="M250 40c10-14 30-14 40 0" stroke="url(#g1)" stroke-width="3"/>
    </svg>`;
    return h(
      'div',
      { class: 'page' },
      h(
        'section',
        { class: 'hero' },
        h(
          'div',
          {},
          h('span', { class: 'badge accent' }, 'Fase 1 · Prototipo funcional'),
          h('h1', { style: 'margin-top:12px' }, 'Construye, simula y ', h('span', {}, 'entiende'), ' la electrónica en 3D'),
          h('p', {}, 'Coloca componentes reales sobre la protoboard, conéctalos con cables y observa cómo se comporta el circuito según un motor de simulación eléctrica (análisis nodal modificado), no una animación.'),
          h(
            'div',
            { class: 'row' },
            h('button', { class: 'btn primary', onclick: () => this.go('nuevo') }, icon('plus', 16), 'Nuevo circuito'),
            h('button', { class: 'btn', onclick: () => this.go('laboratorio') }, icon('lab', 16), 'Abrir laboratorio'),
            h('button', { class: 'btn ghost', onclick: () => this.openTemplate('led-basico') }, 'Probar: LED con resistencia'),
          ),
        ),
        h('div', { class: 'hero-art', html: art }),
      ),
      h(
        'div',
        { class: 'stat-row' },
        h('div', { class: 'stat' }, h('b', {}, String(defs.length)), h('span', {}, 'componentes simulados')),
        h('div', { class: 'stat' }, h('b', {}, '3'), h('span', {}, 'protoboards (170, 400, 830)')),
        h('div', { class: 'stat' }, h('b', {}, String(TEMPLATES.length)), h('span', {}, 'circuitos de referencia')),
        h('div', { class: 'stat' }, h('b', {}, String(LESSONS.filter((l) => l.status === 'disponible').length)), h('span', {}, 'lecciones disponibles')),
      ),
      h('div', { class: 'section-title' }, 'Proyectos recientes'),
      recent.length ? h('div', { class: 'grid' }, ...recent.map((m) => this.projectCard(m))) : h('div', { class: 'empty' }, 'Aún no hay proyectos guardados. Crea un circuito nuevo o abre una plantilla.'),
      h('div', { class: 'section-title' }, 'Empieza con una plantilla'),
      h('div', { class: 'grid' }, ...TEMPLATES.slice(0, 6).map((t) => this.templateCard(t.id))),
    );
  }

  private projectCard(m: ProjectMeta) {
    return h(
      'div',
      { class: 'card clickable', onclick: () => void this.openById(m.id) },
      h('h3', {}, m.name),
      h('p', {}, `${m.components} elementos · ${m.wires} cables`),
      h('p', { class: 'muted' }, `Modificado: ${new Date(m.modified).toLocaleString('es')}`),
    );
  }

  private templateCard(id: string) {
    const t = getTemplate(id)!;
    return h(
      'div',
      { class: 'card' },
      h('span', { class: 'badge' }, t.level),
      h('h3', {}, t.name),
      h('p', {}, t.summary),
      h('div', { class: 'actions' }, h('button', { class: 'btn small primary', onclick: () => this.openTemplate(t.id) }, icon('lab', 15), 'Abrir en el laboratorio')),
    );
  }

  private async openById(id: string) {
    try {
      const p = await this.repo.load(id);
      if (!p) return toast('No se encontró el proyecto', 'error');
      this.savedOnce.add(p.id);
      this.openProject(p);
    } catch (e) {
      toast(`Proyecto dañado: ${(e as Error).message}`, 'error');
    }
  }

  private libraryView(): HTMLElement {
    let filter: CategoryId | 'all' = 'all';
    const grid = h('div', { class: 'grid' });
    const plannedBox = h('div');
    const render = () => {
      clear(grid);
      clear(plannedBox);
      for (const d of allDefs()) {
        if (filter !== 'all' && d.category !== filter) continue;
        const lvl = d.modelLevel === 'fisico' ? ['Modelo físico', 'ok'] : d.modelLevel === 'ideal' ? ['Modelo ideal', 'accent'] : ['Sin modelo', 'warn'];
        grid.append(
          h(
            'div',
            { class: 'card' },
            h('div', { class: 'row' }, h('span', { class: 'badge' }, CATEGORY_LABELS[d.category]), h('span', { class: `badge ${lvl[1]}` }, lvl[0])),
            h('h3', {}, d.name),
            h('p', {}, d.summary),
            h(
              'div',
              { class: 'actions' },
              h('button', { class: 'btn small primary', onclick: () => this.addToLab(d.type) }, icon('plus', 15), 'Añadir al laboratorio'),
              hasSheet(d.eduId) ? h('button', { class: 'btn small', onclick: () => openInfoSheet(d.eduId, { type: d.type }) }, icon('info', 15), 'Ficha') : null,
            ),
          ),
        );
      }
      const planned = PLANNED.filter((p) => filter === 'all' || p.category === filter);
      if (planned.length) {
        plannedBox.append(
          h('div', { class: 'section-title' }, `Planificados (${planned.length}) — aún sin modelo eléctrico ni 3D`),
          h(
            'div',
            { class: 'table-wrap' },
            h(
              'table',
              { class: 'data' },
              h('tr', {}, h('th', {}, 'Componente'), h('th', {}, 'Categoría'), h('th', {}, 'Fase'), h('th', {}, 'Nota')),
              ...planned.map((p) => h('tr', {}, h('td', {}, p.name), h('td', {}, CATEGORY_LABELS[p.category]), h('td', {}, h('span', { class: 'badge' }, `Fase ${p.phase}`)), h('td', { class: 'muted' }, p.note ?? ''))),
            ),
          ),
        );
      }
    };
    const cats = ['all', ...Object.keys(CATEGORY_LABELS)] as (CategoryId | 'all')[];
    const chips = h('div', { class: 'chips' });
    const renderChips = () => {
      clear(chips);
      for (const c of cats) chips.append(h('button', { class: `chip ${c === filter ? 'active' : ''}`, onclick: () => ((filter = c), renderChips(), render()) }, c === 'all' ? 'Todos' : CATEGORY_LABELS[c]));
    };
    renderChips();
    render();
    return h(
      'div',
      { class: 'page' },
      this.header('Biblioteca de componentes', 'Cada componente declara sus terminales, parámetros, límites, modelo eléctrico y ficha educativa. Los marcados como planificados aún no pueden usarse.'),
      chips,
      h('div', { style: 'height:16px' }),
      grid,
      plannedBox,
    );
  }

  private addToLab(type: string) {
    this.ensureLab();
    if (!this.store.project.components.some((c) => isBoardType(c.type)) && !isBoardType(type)) {
      this.store.mutate('Protoboard', (p) => p.components.push({ id: uid('pb'), type: 'breadboard-830', params: {}, x: 0, z: 0, rot: 0 }));
    }
    this.lab!.lab.addComponent(type);
    this.go('laboratorio');
  }

  private simulationsView(): HTMLElement {
    const cap = (name: string, status: string, cls: string, note: string) => h('tr', {}, h('td', {}, name), h('td', {}, h('span', { class: `badge ${cls}` }, status)), h('td', { class: 'muted' }, note));
    return h(
      'div',
      { class: 'page' },
      this.header('Simulaciones', 'Circuitos de referencia con su resultado teórico calculado de forma independiente, para contrastarlo con el simulador.'),
      h(
        'div',
        { class: 'grid' },
        ...TEMPLATES.map((t) =>
          h(
            'div',
            { class: 'card' },
            h('span', { class: 'badge' }, t.level),
            h('h3', {}, t.name),
            h('p', {}, t.summary),
            h('div', { class: 'formula', style: 'font-size:12.5px', html: `Teórico: ${t.expected}` }),
            h('div', { class: 'actions' }, h('button', { class: 'btn small primary', onclick: () => this.openTemplate(t.id) }, icon('play', 15), 'Abrir y simular')),
          ),
        ),
      ),
      h('div', { class: 'section-title' }, 'Capacidades del motor de simulación'),
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'data' },
          h('tr', {}, h('th', {}, 'Análisis'), h('th', {}, 'Estado'), h('th', {}, 'Detalle')),
          cap('Punto de operación DC', 'Implementado', 'ok', 'Newton-Raphson con limitación de unión (pnjlim) y escalonamiento de gmin.'),
          cap('Transitorio (respuesta temporal)', 'Implementado', 'ok', 'Euler implícito, paso fijo configurable (subdivide si no converge), en tiempo real con escala ajustable.'),
          cap('Voltaje, corriente y potencia por componente', 'Implementado', 'ok', 'Lecturas en el panel de propiedades y etiquetas 3D.'),
          cap('Carga y descarga de capacitores', 'Implementado', 'ok', 'Verificado contra V(τ) = 63,2 % en las pruebas automáticas.'),
          cap('Diodos, LEDs y BJT', 'Implementado', 'ok', 'Shockley y Ebers-Moll de transporte (sin capacitancias ni efecto Early).'),
          cap('Multímetro (voltímetro de sondas)', 'Implementado', 'ok', 'Voltaje DC entre dos puntos o respecto a GND, con registro V(t).'),
          cap('Amperímetro / ohmímetro como instrumentos', 'Parcial', 'warn', 'Corriente y resistencia se leen por componente; instrumentos dedicados en Fase 2.'),
          cap('Análisis AC (barrido de frecuencia)', 'Planificado', '', 'Fase 2: integración de ngspice compilado a WebAssembly (BSD-3).'),
          cap('Fuentes AC y generador de señales', 'Planificado', '', 'Fase 2.'),
          cap('Osciloscopio de 2 canales y analizador lógico', 'Planificado', '', 'Fase 2 (el registro de la sonda es el precursor).'),
          cap('Circuitos integrados y modelos SPICE de fabricante', 'Planificado', '', 'Fase 2 con backend ngspice.'),
        ),
      ),
    );
  }

  private roboticsView(): HTMLElement {
    const models = ['Carrito seguidor de línea', 'Carrito controlado por Bluetooth', 'Carrito con sensor ultrasónico', 'Brazo robótico', 'Sistema de ventilación automático', 'Iluminación inteligente', 'Estación meteorológica', 'Riego automático', 'Robot evita obstáculos', 'Robot controlado por Arduino', 'Control de servomotores', 'Vehículos con motores independientes'];
    return h(
      'div',
      { class: 'page' },
      this.header('Laboratorio de robótica', 'Planificado para la Fase 4. Esta sección todavía no simula robots: aquí se documenta lo que se construirá y sobre qué base.'),
      h(
        'div',
        { class: 'card', style: 'margin-bottom:18px' },
        h('span', { class: 'badge warn' }, 'No disponible en esta versión'),
        h('h3', {}, 'Arquitectura prevista'),
        h(
          'ul',
          { style: 'color:var(--text-2);line-height:1.7;margin:4px 0 0;padding-left:18px' },
          h('li', {}, 'Motor de física rígida: Rapier (Apache-2.0, WebAssembly) para chasis, ruedas, colisiones y fricción.'),
          h('li', {}, 'Acoplamiento electromecánico: el motor DC se modelará como V = I·R + k·ω y τ = k·I, resuelto junto al circuito MNA en cada paso.'),
          h('li', {}, 'Sensores físicos (línea, ultrasonido, IR) mediante raycasting contra el escenario 3D.'),
          h('li', {}, 'Control por el microcontrolador simulado (Fase 3, avr8js): el comportamiento dependerá del código y de las conexiones, no de animaciones predefinidas.'),
        ),
      ),
      h('div', { class: 'section-title' }, 'Modelos iniciales previstos'),
      h('div', { class: 'grid' }, ...models.map((m) => h('div', { class: 'card' }, h('span', { class: 'badge' }, 'Fase 4'), h('h3', {}, m)))),
    );
  }

  private academyView(): HTMLElement {
    const list = h('div');
    for (const l of LESSONS) {
      const body = h(
        'div',
        { class: 'lesson-body' },
        l.html ? h('div', { html: l.html }) : null,
        l.challenge ? h('div', { class: 'challenge' }, h('b', {}, 'Reto práctico: '), l.challenge.prompt, h('details', { class: 'exercise', style: 'margin-top:8px' }, h('summary', {}, 'Ver solución'), h('div', { html: l.challenge.answer }))) : null,
        h(
          'div',
          { class: 'row', style: 'margin-top:12px' },
          l.template ? h('button', { class: 'btn small primary', onclick: () => this.openTemplate(l.template!) }, icon('lab', 15), 'Practicar en el laboratorio 3D') : null,
          l.sheet ? h('button', { class: 'btn small', onclick: () => openInfoSheet(l.sheet!) }, icon('info', 15), 'Ficha relacionada') : null,
        ),
      );
      const item = h(
        'div',
        { class: `lesson ${l.status === 'planificado' ? 'planned' : ''}` },
        h('div', { class: 'num' }, String(l.level)),
        h('div', {}, h('h3', { style: 'font-size:16px' }, l.title), h('p', { style: 'margin:4px 0 0;font-size:13px' }, l.summary)),
        l.status === 'disponible' ? h('button', { class: 'btn small', onclick: () => item.classList.toggle('open') }, 'Abrir') : h('span', { class: 'badge' }, `Fase ${l.phase}`),
        body,
      );
      list.append(item);
    }
    return h('div', { class: 'page' }, this.header('Academia', 'Ruta de 15 niveles. Aprende un concepto y pruébalo de inmediato en el laboratorio 3D.'), list);
  }

  private async projectsView(): Promise<HTMLElement> {
    const metas = await this.repo.list();
    const rows = metas.map((m) =>
      h(
        'tr',
        {},
        h('td', {}, h('b', {}, m.name)),
        h('td', { class: 'muted' }, `${m.components} elementos · ${m.wires} cables`),
        h('td', { class: 'muted' }, new Date(m.modified).toLocaleString('es')),
        h(
          'td',
          {},
          h(
            'div',
            { class: 'row' },
            h('button', { class: 'btn small primary', onclick: () => void this.openById(m.id) }, 'Abrir'),
            h('button', { class: 'btn small', onclick: () => void this.duplicateProject(m.id) }, 'Duplicar'),
            h('button', { class: 'btn small', onclick: () => void this.renameProject(m) }, 'Renombrar'),
            h('button', { class: 'btn small', title: 'Exportar JSON', onclick: () => void this.repo.load(m.id).then((p) => p && exportProjectFile(p)) }, icon('download', 14)),
            h('button', { class: 'btn small danger', title: 'Eliminar', onclick: () => void this.deleteProject(m) }, icon('trash', 14)),
          ),
        ),
      ),
    );
    return h(
      'div',
      { class: 'page' },
      this.header(
        'Mis proyectos',
        'Guardados localmente en este dispositivo (sin cuenta ni servidor). Exporta a archivo .lab3d.json para copias de seguridad o para compartir.',
        h('button', { class: 'btn', onclick: () => void this.importProject() }, icon('upload', 16), 'Importar'),
        h('button', { class: 'btn primary', onclick: () => this.go('nuevo') }, icon('plus', 16), 'Nuevo'),
      ),
      metas.length
        ? h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, h('tr', {}, h('th', {}, 'Nombre'), h('th', {}, 'Contenido'), h('th', {}, 'Modificado'), h('th', {}, 'Acciones')), ...rows))
        : h('div', { class: 'empty' }, 'No hay proyectos guardados todavía.'),
    );
  }

  private async duplicateProject(id: string) {
    const p = await this.repo.load(id);
    if (!p) return;
    const copy = cloneProject(p);
    copy.id = uid('prj');
    copy.name = `${p.name} (copia)`;
    copy.created = copy.modified = new Date().toISOString();
    await this.repo.save(copy);
    toast('Proyecto duplicado', 'ok');
    this.route();
  }

  private async renameProject(m: ProjectMeta) {
    const name = prompt('Nuevo nombre del proyecto', m.name)?.trim();
    if (!name) return;
    const p = await this.repo.load(m.id);
    if (!p) return;
    p.name = name;
    await this.repo.save(p);
    if (this.store.project.id === p.id) this.store.mutate('Renombrar', (pp) => (pp.name = name));
    this.route();
  }

  private async deleteProject(m: ProjectMeta) {
    if (!confirm(`¿Eliminar definitivamente "${m.name}" de este dispositivo? Esta acción no se puede deshacer.`)) return;
    await this.repo.remove(m.id);
    this.savedOnce.delete(m.id);
    toast('Proyecto eliminado', 'ok');
    this.route();
  }

  private async importProject() {
    try {
      const p = await importProjectFile();
      if ((await this.repo.load(p.id).catch(() => null)) && !confirm('Ya existe un proyecto con el mismo identificador. ¿Importarlo como copia?')) return;
      if (await this.repo.load(p.id).catch(() => null)) p.id = uid('prj');
      await this.repo.save(p);
      this.savedOnce.add(p.id);
      toast(`Importado: ${p.name}`, 'ok');
      this.openProject(p);
    } catch (e) {
      toast(`No se pudo importar: ${(e as Error).message}`, 'error');
    }
  }

  private settingsView(): HTMLElement {
    const s = this.settings;
    const update = (patch: Partial<AppSettings>) => {
      Object.assign(s, patch);
      saveSettings(s);
      this.lab?.applySettings(s);
      if (this.lab && patch.defaultWireColor) this.lab.lab.wireColor = patch.defaultWireColor;
      toast('Configuración guardada', 'ok');
    };
    const sel = (value: string, opts: [string, string][], on: (v: string) => void) => {
      const el = h('select', {}, ...opts.map(([v, l]) => h('option', { value: v, selected: v === value }, l))) as HTMLSelectElement;
      el.addEventListener('change', () => on(el.value));
      return el;
    };
    const row = (title: string, desc: string, ctl: HTMLElement) => h('div', { class: 'settings-row' }, h('div', {}, h('b', {}, title), h('p', { style: 'margin:2px 0 0;font-size:12.5px' }, desc)), ctl);
    return h(
      'div',
      { class: 'page', style: 'max-width:820px' },
      this.header('Configuración', 'Preferencias guardadas en este dispositivo.'),
      row('Calidad gráfica', 'Baja desactiva sombras y reduce la resolución: recomendada para teléfonos de gama media.', sel(s.quality, [['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja']], (v) => update({ quality: v as AppSettings['quality'] }))),
      row('Color de cable predeterminado', 'Automático: rojo para +, negro para GND y azul para señales.', sel(s.defaultWireColor, [['auto', 'Automático'], ['#e02b2b', 'Rojo'], ['#1b1b1f', 'Negro'], ['#2f6cf6', 'Azul'], ['#2fbf5a', 'Verde'], ['#f2c230', 'Amarillo']], (v) => update({ defaultWireColor: v }))),
      row('Paso de integración (nuevos proyectos)', 'Pasos más pequeños son más precisos en transitorios rápidos pero consumen más CPU.', sel(String(s.defaultDt), [['0.0001', '0,1 ms'], ['0.0002', '0,2 ms'], ['0.0005', '0,5 ms'], ['0.001', '1 ms']], (v) => {
        update({ defaultDt: Number(v) });
        this.store.mutate('Paso de integración', (p) => (p.simulation.dt = Number(v)));
      })),
      row('Escala de tiempo predeterminada', 'Relación entre tiempo simulado y tiempo real.', sel(String(s.defaultTimeScale), [['0.1', '0,1×'], ['1', '1× (tiempo real)'], ['10', '10×']], (v) => update({ defaultTimeScale: Number(v) }))),
      row(
        'Borrar datos locales',
        'Elimina todos los proyectos y preferencias guardados en este dispositivo.',
        h('button', {
          class: 'btn danger',
          onclick: () => {
            if (!confirm('¿Borrar TODOS los proyectos y preferencias de este dispositivo? No se puede deshacer.')) return;
            Object.keys(localStorage).filter((k) => k.startsWith('lab3d.')).forEach((k) => localStorage.removeItem(k));
            toast('Datos locales borrados', 'ok');
            location.reload();
          },
        }, 'Borrar todo'),
      ),
      h('div', { class: 'section-title' }, 'Acerca de'),
      h('p', {}, 'Laboratorio Electrónico 3D · versión 0.1.0 (Fase 1). Funciona sin conexión, sin cuenta, sin publicidad y sin compras integradas.'),
      h('p', {}, 'Software de terceros: Three.js (MIT), Vite (MIT), Capacitor (MIT), Vitest (MIT), TypeScript (Apache-2.0). Los modelos 3D y los contenidos educativos se generan en el propio proyecto.'),
    );
  }
}
