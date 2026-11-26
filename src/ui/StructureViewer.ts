/**
 * Visor de estructuras documentadas (Biblioteca molecular / Tipos de enlaces).
 * Modos: bolas y varillas, espacio lleno, estructural (etiquetas y longitudes); cristales con
 * bloque de 1–3 celdas. Toda cifra mostrada procede de la geometría de la fuente.
 */
import * as THREE from 'three';
import { element } from '../chem/elements';
import { subscript } from '../chem/formula';
import { bondAngles, bondInfo, centralGeometries, coordination, displayFormula, hasGeometry, KIND_LABEL, KNOWN_DEVIATIONS, polarityEstimate, structure, type StructureRecord } from '../chem/structures';
import { buildCrystal, buildMolecule, disposeStructure, type BuiltStructure, type MolMode } from '../render/moleculeModels';
import { SceneManager } from '../render/SceneManager';
import { qualityOf, type AppSettings } from '../settings';
import { clear, h, icon, iconBtn } from './dom';
import { openBondSheet } from './BondAnalysisView';

export interface StructureViewerActions {
  back(): void;
}

export class StructureViewer {
  readonly el: HTMLElement;
  readonly sm: SceneManager;
  private rec!: StructureRecord;
  private mode: MolMode = 'bolas';
  private cells = 2;
  private contacts = true;
  private built: BuiltStructure | null = null;
  private head: HTMLElement;
  private seg: HTMLElement;
  private side: HTMLElement;
  private overlay: HTMLElement;
  private tab: 'info' | 'enlaces' | 'geometria' = 'info';
  private active = false;

  constructor(settings: AppSettings, private readonly actions: StructureViewerActions) {
    const stage = h('div', { class: 'stage' });
    this.head = h('div', { class: 'viewer-head floating-glass' });
    this.seg = h('div', { class: 'segmented viewer-modes floating-glass' });
    this.side = h('aside', { class: 'viewer-side floating-glass' });
    this.overlay = h('div', { class: 'overlay' });
    this.el = h('div', { class: 'viewer' }, stage);
    this.sm = new SceneManager(stage, qualityOf(settings), { floor: false });
    stage.append(this.overlay, this.head, this.seg, this.side, h('div', { class: 'cam-ctrl floating-glass' }, iconBtn('zoomIn', 'Acercar', () => this.sm.zoom(0.8)), iconBtn('zoomOut', 'Alejar', () => this.sm.zoom(1.25)), iconBtn('reset', 'Encuadrar', () => this.frame())));
    this.sm.onFrame(() => this.updateLabels());
  }

  applySettings(s: AppSettings) {
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

  show(id: string) {
    const rec = structure(id);
    if (!rec) return;
    const changed = this.rec?.id !== id;
    this.rec = rec;
    if (changed) {
      this.mode = 'bolas';
      this.tab = 'info';
    }
    this.renderHead();
    this.renderSeg();
    this.rebuild();
    this.renderSide();
    this.frame();
  }

  private frame() {
    if (this.el.clientWidth === 0) {
      requestAnimationFrame(() => this.el.isConnected && this.frame());
      return;
    }
    this.sm.verticalShift = this.el.clientWidth < 760 ? 0.2 : 0;
    this.sm.resize();
    this.sm.frameContent();
  }

  private renderHead() {
    const r = this.rec;
    clear(this.head);
    this.head.append(
      iconBtn('chevronLeft', 'Volver a la biblioteca', () => this.actions.back()),
      h('div', { class: 'vh-text' }, h('b', {}, r.name), h('span', {}, `${subscript(displayFormula(r))} · ${KIND_LABEL[r.kind]}`)),
    );
  }

  private renderSeg() {
    clear(this.seg);
    const modes: [MolMode, string][] = [
      ['bolas', 'Bolas y varillas'],
      ['espacio', 'Espacio lleno'],
      ['estructural', 'Estructural'],
    ];
    for (const [m, l] of modes) this.seg.append(h('button', { type: 'button', class: this.mode === m ? 'on' : '', onclick: () => ((this.mode = m), this.renderSeg(), this.rebuild()) }, l));
  }

  private rebuild() {
    if (this.built) {
      this.sm.content.remove(this.built.group);
      disposeStructure(this.built.group);
    }
    const r = this.rec;
    this.built = r.geometry === 'cod' ? buildCrystal(r, this.cells, this.mode, this.contacts) : buildMolecule(r, this.mode);
    this.sm.content.add(this.built.group);
    this.sm.needsRender = true;
  }

  private renderSide() {
    const r = this.rec;
    const s = this.side;
    clear(s);
    const tabs = h('div', { class: 'segmented small-seg' });
    const t = (id: StructureViewer['tab'], l: string) => tabs.append(h('button', { type: 'button', class: this.tab === id ? 'on' : '', onclick: () => ((this.tab = id), this.renderSide()) }, l));
    t('info', 'Información');
    t('enlaces', r.geometry === 'cod' ? 'Red' : 'Enlaces');
    if (r.geometry !== 'cod') t('geometria', 'Geometría');
    s.append(tabs);

    if (this.tab === 'info') {
      const dev = KNOWN_DEVIATIONS[r.id];
      s.append(
        h(
          'div',
          { class: 'kv mt' },
          h('span', {}, 'Fórmula'),
          h('span', {}, subscript(displayFormula(r))),
          h('span', {}, 'Tipo'),
          h('span', {}, KIND_LABEL[r.kind]),
          h('span', {}, 'Enlace'),
          h('span', {}, r.bonding),
          ...(r.mw ? [h('span', {}, 'Masa molar'), h('span', {}, `${r.mw} g/mol`)] : []),
          ...(r.iupac ? [h('span', {}, 'Nombre IUPAC'), h('span', {}, r.iupac)] : []),
          ...(r.cell ? [h('span', {}, 'Grupo espacial'), h('span', {}, r.cell.spaceGroup), h('span', {}, 'Celda (Å)'), h('span', {}, `a=${r.cell.a} b=${r.cell.b} c=${r.cell.c}`), h('span', {}, 'Ángulos'), h('span', {}, `${r.cell.alpha}° ${r.cell.beta}° ${r.cell.gamma}°`)] : []),
        ),
        h('h4', {}, 'Procedencia'),
        h('span', { class: `prov ${r.geometry === 'cod' ? 'fuente' : r.geometry === 'pubchem3d' ? 'calculado' : 'prediccion'}` }, r.geometry === 'cod' ? 'Estructura experimental' : r.geometry === 'pubchem3d' ? 'Geometría calculada' : 'Sin geometría 3D en la fuente'),
        h('p', { class: 'small muted mt' }, r.source.detail),
        h('div', { class: 'row gap mt' }, h('a', { class: 'btn small', href: r.source.url, target: '_blank', rel: 'noopener' }, icon('external', 14), r.cid ? `PubChem CID ${r.cid}` : `COD ${r.source.cod}`), h('a', { class: 'btn small', href: `#/calculadora/formula/${encodeURIComponent(r.formula ?? displayFormula(r))}` }, icon('calc', 14), 'Calculadora')),
        dev ? h('div', { class: 'note' }, icon('info', 15), h('span', {}, h('b', {}, 'Discrepancia documentada. '), dev.note, ` Referencia: ${dev.reference}.`)) : '',
        !hasGeometry(r) && r.geometry !== 'cod'
          ? h('div', { class: 'note' }, icon('info', 15), h('span', {}, 'PubChem no ofrece un conformero 3D para este compuesto. Se muestra la conectividad en la pestaña Enlaces, pero no se dibuja ninguna geometría para no inventarla.'))
          : '',
        h('p', { class: 'small muted mt' }, 'Propiedades, aplicaciones y seguridad: consulta la ficha de la fuente (incluye la información GHS de peligros cuando existe).'),
      );
    } else if (this.tab === 'enlaces' && r.geometry === 'cod') {
      const co = coordination(r);
      s.append(
        h('h4', {}, 'Coordinación (calculada de la celda)'),
        h('table', { class: 'an-table' }, h('tr', {}, h('th', {}, 'Centro'), h('th', {}, 'Vecinos'), h('th', {}, 'Nº'), h('th', {}, 'd (Å)')), ...co.map((c) => h('tr', {}, h('td', {}, c.center), h('td', {}, c.neighbor), h('td', {}, String(c.count)), h('td', {}, c.distance.toFixed(3))))),
        h('h4', {}, 'Bloque'),
      );
      const cells = h('div', { class: 'chips' });
      for (const n of [1, 2, 3]) cells.append(h('button', { class: `chip ${this.cells === n ? 'on' : ''}`, onclick: () => ((this.cells = n), this.rebuild(), this.renderSide(), this.frame()) }, `${n}×${n}×${n}`));
      const ct = h('input', { type: 'checkbox', checked: this.contacts }) as HTMLInputElement;
      ct.addEventListener('change', () => ((this.contacts = ct.checked), this.rebuild()));
      s.append(cells, h('label', { class: 'toggle' }, h('span', {}, 'Contactos más próximos'), ct), h('p', { class: 'small muted' }, r.kind === 'metalico' ? 'En el enlace metálico los electrones de valencia están deslocalizados en toda la red: las líneas indican vecinos más próximos, no enlaces direccionales.' : 'En un sólido iónico no hay moléculas aisladas: cada ion está rodeado por iones de carga opuesta. Las líneas indican las distancias más cortas, no enlaces covalentes. La arista amarilla delimita la celda unidad.'));
    } else if (this.tab === 'enlaces') {
      const bi = bondInfo(r);
      const sym = (i: number) => element(r.atoms[i].z).symbol;
      s.append(
        h('h4', {}, `Enlaces (${bi.length})`),
        h(
          'table',
          { class: 'an-table' },
          h('tr', {}, h('th', {}, 'Enlace'), h('th', {}, 'Orden'), h('th', {}, 'd (Å)'), h('th', {}, 'Δχ'), h('th', {}, '')),
          ...bi.slice(0, 40).map((b) => h('tr', {}, h('td', {}, `${sym(b.a)}${b.a + 1}–${sym(b.b)}${b.b + 1}`), h('td', {}, ['', 'simple', 'doble', 'triple'][b.order] ?? String(b.order)), h('td', {}, Number.isFinite(b.length) ? b.length.toFixed(3) : '—'), h('td', {}, b.dChi === null ? '—' : b.dChi.toFixed(2)), h('td', {}, h('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'Ver análisis del enlace', onclick: () => openBondSheet(r.atoms[b.a].z, r.atoms[b.b].z, b.order) }, 'Análisis')))),
        ),
        h('p', { class: 'small muted' }, 'Longitudes medidas sobre la geometría de la fuente. Δχ orienta sobre la polaridad del enlace, pero no determina por sí sola su tipo.'),
        r.id === 'benceno' ? h('div', { class: 'note' }, icon('info', 15), h('span', {}, 'PubChem describe el benceno con enlaces simples y dobles alternos (estructura de Kekulé). Las seis distancias C–C de su geometría son iguales: los electrones π están deslocalizados en el anillo (sistema aromático).')) : '',
        r.id === 'ion-amonio' ? h('div', { class: 'note' }, icon('info', 15), h('span', {}, 'Uno de los cuatro enlaces N–H se forma cuando el par libre del NH₃ se une a un H⁺ (enlace coordinado o dativo). Una vez formado, los cuatro enlaces son equivalentes.')) : '',
      );
    } else {
      const g = centralGeometries(r);
      const ang = bondAngles(r);
      const pol = polarityEstimate(r);
      const sym = (i: number) => element(r.atoms[i].z).symbol;
      s.append(
        h('h4', {}, 'Geometría (VSEPR)'),
        g.length
          ? h('table', { class: 'an-table' }, h('tr', {}, h('th', {}, 'Átomo'), h('th', {}, 'Enlazados'), h('th', {}, 'Pares libres'), h('th', {}, 'Geometría')), ...g.slice(0, 12).map((x) => h('tr', {}, h('td', {}, `${sym(x.atom)}${x.atom + 1}`), h('td', {}, String(x.bonded)), h('td', {}, String(x.lonePairs)), h('td', {}, x.geometry))))
          : h('p', { class: 'small muted' }, 'Ningún átomo con dos o más vecinos (molécula diatómica) o elemento fuera de los bloques s y p.'),
        h('h4', {}, 'Ángulos de enlace'),
        ang.length ? h('div', { class: 'kv' }, ...ang.slice(0, 12).flatMap((a) => [h('span', {}, `${sym(a.a)}–${sym(a.vertex)}–${sym(a.b)}`), h('span', {}, `${a.value.toFixed(1)}°`)])) : h('p', { class: 'small muted' }, '—'),
        h('h4', {}, 'Polaridad'),
        pol ? h('p', { class: 'small' }, pol.polar ? 'Molécula polar' : 'Molécula apolar', h('span', { class: 'muted' }, ` (estimación: suma vectorial de dipolos de enlace ∝ Δχ = ${pol.magnitude.toFixed(2)}).`)) : h('p', { class: 'small muted' }, 'No estimable sin geometría o sin electronegatividades.'),
      );
    }
  }

  private updateLabels() {
    if (!this.active || !this.built) return;
    if (this.mode !== 'estructural' || this.rec.geometry === 'cod') {
      if (this.overlay.childElementCount) this.overlay.replaceChildren();
      return;
    }
    const tags: HTMLElement[] = [];
    const b = this.built;
    for (const a of b.atoms.slice(0, 40)) {
      const s = this.sm.toScreen(a.p);
      if (!s.visible) continue;
      const t = h('div', { class: 'atom-tag' }, element(a.z).symbol);
      t.style.left = `${s.x}px`;
      t.style.top = `${s.y}px`;
      tags.push(t);
    }
    for (const bd of b.bonds.slice(0, 40)) {
      const mid = new THREE.Vector3().addVectors(b.atoms[bd.a].p, b.atoms[bd.b].p).multiplyScalar(0.5);
      const s = this.sm.toScreen(mid);
      if (!s.visible) continue;
      const t = h('div', { class: 'tag' }, b.atoms[bd.a].p.distanceTo(b.atoms[bd.b].p).toFixed(2));
      t.style.left = `${s.x}px`;
      t.style.top = `${s.y}px`;
      tags.push(t);
    }
    this.overlay.replaceChildren(...tags);
  }
}
