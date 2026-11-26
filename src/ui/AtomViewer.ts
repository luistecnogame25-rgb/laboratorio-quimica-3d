/**
 * Visor atómico 3D. Cuatro modos claramente identificados:
 *  - Bohr (didáctico), Configuración electrónica, Orbitales (forma angular hidrogenoide), Núcleo.
 */
import * as THREE from 'three';
import { element, estimatedNeutrons, FAMILIES, L_LETTER, subshellLabel, type ChemElement, type Subshell } from '../chem/elements';
import { mValues, ORBITAL_NAMES } from '../chem/orbitals';
import { buildAxes, buildBohr, buildNucleus, buildOrbital, disposeObject, ELECTRON_COLOR, NEUTRON_COLOR, PROTON_COLOR, type BohrModel } from '../render/atomModels';
import { SceneManager } from '../render/SceneManager';
import { qualityOf, type AppSettings } from '../settings';
import { boxDiagram } from './ElementSheet';
import { clear, h, icon, iconBtn } from './dom';

export type ViewMode = 'bohr' | 'configuracion' | 'orbitales' | 'nucleo';

const MODES: [ViewMode, string, string][] = [
  ['bohr', 'Bohr', 'Modelo didáctico de Bohr: niveles de energía como anillos. No describe trayectorias reales de los electrones ni distancias a escala.'],
  ['configuracion', 'Configuración', 'Ocupación de subniveles y orbitales según la configuración del estado fundamental indicada por la fuente (Pauli y Hund).'],
  ['orbitales', 'Orbitales', 'Forma angular |Yₗₘ| de orbitales hidrogenoides: indica la orientación de la probabilidad, no una trayectoria. No incluye la parte radial ni efectos multielectrónicos. Colores = signo de la función.'],
  ['nucleo', 'Núcleo', 'Protones y neutrones (N estimado = A − Z con A redondeada). La disposición interna es ilustrativa; el tamaño del núcleo no está a escala respecto a los electrones.'],
];

export interface ViewerActions {
  openSheet(e: ChemElement): void;
  addToLab(e: ChemElement): void;
  navigate(z: number, mode: ViewMode): void;
}

export class AtomViewer {
  readonly el: HTMLElement;
  readonly sm: SceneManager;
  private e!: ChemElement;
  private mode: ViewMode = 'bohr';
  private model: THREE.Object3D | null = null;
  private bohr: BohrModel | null = null;
  private header: HTMLElement;
  private seg: HTMLElement;
  private side: HTMLElement;
  private caption: HTMLElement;
  private layers = { nucleo: true, niveles: true, electrones: true, animacion: true };
  private shellSel: number | null = null;
  private orbital: { sub: Subshell | null; m: number | 'all' } = { sub: null, m: 0 };
  private active = false;

  constructor(
    private settings: AppSettings,
    private readonly actions: ViewerActions,
  ) {
    const stage = h('div', { class: 'stage' });
    this.header = h('div', { class: 'viewer-head floating-glass' });
    this.seg = h('div', { class: 'segmented viewer-modes floating-glass', role: 'tablist' });
    for (const [m, label] of MODES) this.seg.append(h('button', { type: 'button', 'data-mode': m, onclick: () => this.actions.navigate(this.e.z, m) }, label));
    this.side = h('aside', { class: 'viewer-side floating-glass' });
    this.caption = h('div', { class: 'viewer-caption' });
    this.el = h('div', { class: 'viewer' }, stage);
    this.sm = new SceneManager(stage, qualityOf(settings), { floor: false });
    this.sm.camera.position.set(0, 4, 13);
    this.sm.controls.target.set(0, 0, 0);
    stage.append(this.header, this.seg, this.side, this.caption, h('div', { class: 'cam-ctrl floating-glass' }, iconBtn('zoomIn', 'Acercar', () => this.sm.zoom(0.8)), iconBtn('zoomOut', 'Alejar', () => this.sm.zoom(1.25)), iconBtn('reset', 'Encuadrar', () => this.frame())));
    this.sm.onFrame((dt) => {
      if (this.bohr && this.layers.animacion && !this.settings.reduceMotion && this.mode !== 'nucleo') {
        this.bohr.tick(dt);
        this.sm.needsRender = true;
      }
    });
  }

  applySettings(s: AppSettings) {
    this.settings = s;
    this.sm.setQuality(qualityOf(s));
  }

  activate() {
    this.active = true;
    this.sm.start();
    this.sm.resize();
  }
  deactivate() {
    this.active = false;
    this.sm.stop();
  }

  show(z: number, mode: ViewMode) {
    const changed = !this.e || this.e.z !== z;
    this.e = element(z);
    this.mode = mode;
    if (changed) {
      this.shellSel = null;
      const subs = this.e.configuration.subshells;
      this.orbital = { sub: subs[subs.length - 1] ?? null, m: 0 };
      // Preferir el último subnivel con l más alto para que se vean p/d/f.
      const last = [...subs].sort((a, b) => b.n + b.l * 0.9 - (a.n + a.l * 0.9))[0];
      if (last) this.orbital.sub = last;
    }
    this.renderHeader();
    this.seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.mode === mode));
    this.caption.textContent = MODES.find((m) => m[0] === mode)![2];
    this.rebuild();
    this.renderSide();
    if (changed || true) this.frame();
    if (this.active) this.sm.resize();
  }

  private renderHeader() {
    const e = this.e;
    const fam = FAMILIES[e.family];
    clear(this.header);
    this.header.style.setProperty('--fam', fam.color);
    this.header.append(
      iconBtn('chevronLeft', 'Elemento anterior', () => e.z > 1 && this.actions.navigate(e.z - 1, this.mode)),
      h('div', { class: 'tile-sm' }, h('span', { class: 'z' }, String(e.z)), h('span', { class: 'sym' }, e.symbol)),
      h('div', { class: 'vh-text' }, h('b', {}, e.name), h('span', {}, fam.name)),
      iconBtn('chevronRight', 'Elemento siguiente', () => e.z < 118 && this.actions.navigate(e.z + 1, this.mode)),
      h('span', { class: 'sep' }),
      iconBtn('info', 'Ficha del elemento', () => this.actions.openSheet(e)),
      iconBtn('flask', 'Llevar al laboratorio', () => this.actions.addToLab(e)),
    );
  }

  private clearModel() {
    if (this.model) {
      this.sm.content.remove(this.model);
      disposeObject(this.model);
    }
    this.model = null;
    this.bohr = null;
  }

  private rebuild() {
    this.clearModel();
    const e = this.e;
    const N = estimatedNeutrons(e) ?? 0;
    const g = new THREE.Group();
    if (this.mode === 'bohr' || this.mode === 'configuracion') {
      this.bohr = buildBohr(e, N);
      g.add(this.bohr.root);
      this.bohr.nucleus.visible = this.layers.nucleo;
      for (const s of this.bohr.shells) {
        s.children[0].visible = this.layers.niveles;
        s.children[1].visible = this.layers.electrones;
      }
      this.bohr.highlight(this.shellSel);
    } else if (this.mode === 'orbitales') {
      const sub = this.orbital.sub;
      g.add(buildAxes(3.4));
      if (sub) {
        const ms = this.orbital.m === 'all' ? mValues(sub.l) : [this.orbital.m];
        const spacing = 3.2;
        ms.forEach((m, i) => {
          const o = buildOrbital(sub.l, m, 2.4);
          o.position.x = (i - (ms.length - 1) / 2) * (ms.length > 1 ? spacing : 0);
          g.add(o);
        });
      }
      const nuc = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      g.add(nuc);
    } else {
      const nuc = buildNucleus(e.z, N, 1.2 + Math.cbrt(e.z + N) * 0.32);
      g.add(nuc);
    }
    this.model = g;
    this.sm.content.add(g);
    this.sm.needsRender = true;
  }

  private frame() {
    if (this.el.clientWidth === 0) {
      requestAnimationFrame(() => this.el.isConnected && this.frame());
      return;
    }
    // En teléfonos, el panel ocupa la parte inferior: se desplaza la imagen hacia arriba.
    this.sm.verticalShift = this.el.clientWidth > 0 && this.el.clientWidth < 760 ? 0.2 : 0;
    this.sm.resize();
    this.sm.frameContent();
  }

  private renderSide() {
    const e = this.e;
    const s = this.side;
    clear(s);
    if (this.mode === 'bohr') {
      s.append(h('h4', {}, 'Niveles de energía'));
      const list = h('div', { class: 'shell-list' });
      e.shells.forEach((c, i) => {
        const n = i + 1;
        const b = h('button', { class: `shell ${this.shellSel === n ? 'on' : ''}`, type: 'button' }, h('span', {}, `n = ${n}`), h('span', { class: 'muted' }, ['K', 'L', 'M', 'N', 'O', 'P', 'Q'][i] ?? ''), h('b', {}, `${c} e⁻`));
        b.addEventListener('click', () => {
          this.shellSel = this.shellSel === n ? null : n;
          this.bohr?.highlight(this.shellSel);
          this.sm.needsRender = true;
          this.renderSide();
        });
        list.append(b);
      });
      s.append(list);
      if (this.shellSel) {
        const subs = e.configuration.subshells.filter((x) => x.n === this.shellSel);
        s.append(h('p', { class: 'small muted' }, `Subniveles del nivel ${this.shellSel}: `, subs.map((x) => `${subshellLabel(x)}${x.electrons}`).join(' ')));
      }
      s.append(this.layerToggles());
    } else if (this.mode === 'configuracion') {
      s.append(h('h4', {}, 'Configuración electrónica'), h('div', { class: 'config-big' }, e.configuration.short), boxDiagram(e));
      if (e.configuration.status !== 'fuente') s.append(h('div', { class: 'note' }, icon('info', 15), h('span', {}, `Configuración ${e.configuration.status} según la fuente.`)));
    } else if (this.mode === 'orbitales') {
      s.append(h('h4', {}, 'Subnivel ocupado'));
      const subs = h('div', { class: 'chips' });
      for (const sub of e.configuration.subshells) {
        const on = this.orbital.sub?.n === sub.n && this.orbital.sub?.l === sub.l;
        subs.append(h('button', { class: `chip ${on ? 'on' : ''}`, type: 'button', onclick: () => ((this.orbital = { sub, m: 0 }), this.rebuild(), this.renderSide(), this.frame()) }, `${subshellLabel(sub)}`, h('sup', {}, String(sub.electrons))));
      }
      s.append(subs);
      const sub = this.orbital.sub;
      if (sub) {
        s.append(h('h4', {}, `Orbitales ${L_LETTER[sub.l]} (l = ${sub.l})`));
        const ms = h('div', { class: 'chips' });
        for (const m of mValues(sub.l)) ms.append(h('button', { class: `chip ${this.orbital.m === m ? 'on' : ''}`, type: 'button', onclick: () => ((this.orbital.m = m), this.rebuild(), this.renderSide()) }, ORBITAL_NAMES[sub.l][m]));
        if (sub.l > 0) ms.append(h('button', { class: `chip ${this.orbital.m === 'all' ? 'on' : ''}`, type: 'button', onclick: () => ((this.orbital.m = 'all'), this.rebuild(), this.renderSide(), this.frame()) }, `Todos (${2 * sub.l + 1})`));
        s.append(ms, h('p', { class: 'small muted' }, `El subnivel ${subshellLabel(sub)} contiene ${sub.electrons} de ${2 * (2 * sub.l + 1)} electrones posibles. La forma angular es la misma para cualquier n con el mismo l.`));
        s.append(h('div', { class: 'legend' }, h('span', {}, h('i', { style: 'background:#5ac8fa' }), 'Signo +'), h('span', {}, h('i', { style: 'background:#ff9f0a' }), 'Signo −'), h('span', { class: 'muted' }, 'Ejes: x rojo · y verde · z azul')));
      }
    } else {
      const N = estimatedNeutrons(e);
      s.append(
        h('h4', {}, 'Núcleo'),
        h('div', { class: 'facts' }, h('div', {}, h('small', {}, 'Protones (Z)'), h('b', {}, String(e.z))), h('div', {}, h('small', {}, 'Neutrones (≈)'), h('b', {}, N === null ? '—' : String(N))), h('div', {}, h('small', {}, 'A (≈)'), h('b', {}, N === null ? '—' : String(N + e.z)))),
        h('div', { class: 'legend' }, h('span', {}, h('i', { style: `background:#${PROTON_COLOR.toString(16)}` }), 'Protón'), h('span', {}, h('i', { style: `background:#${NEUTRON_COLOR.toString(16)}` }), 'Neutrón')),
        h('p', { class: 'small muted' }, 'El radio nuclear real es del orden de 1,2·A^(1/3) fm, unas 10⁴–10⁵ veces menor que el átomo. Los isótopos concretos no se representan todavía.'),
      );
    }
    void ELECTRON_COLOR;
  }

  private layerToggles(): HTMLElement {
    const box = h('div', {}, h('h4', {}, 'Capas'));
    const t = (key: keyof AtomViewer['layers'], label: string) => {
      const input = h('input', { type: 'checkbox', checked: this.layers[key] }) as HTMLInputElement;
      input.addEventListener('change', () => {
        this.layers[key] = input.checked;
        this.rebuild();
      });
      return h('label', { class: 'toggle' }, h('span', {}, label), input);
    };
    box.append(t('nucleo', 'Núcleo'), t('niveles', 'Niveles'), t('electrones', 'Electrones'), t('animacion', 'Animación (decorativa)'));
    return box;
  }
}
