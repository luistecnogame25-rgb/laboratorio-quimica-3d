/**
 * Biblioteca de componentes: navegación jerárquica (categoría → subcategoría → artículo),
 * búsqueda, miniaturas 3D, vista previa al pasar el cursor (o pulsación larga) y menú ⋯
 * con información bajo demanda. Se usa como panel flotante del laboratorio y como página.
 */
import { getDef, hasDef, withDefaults } from '../core/registry';
import { getSheet } from '../education/sheets';
import { thumbnail } from '../render/thumbnails';
import {
  CATEGORIES,
  categoryOf,
  isAvailable,
  itemsIn,
  searchCatalog,
  siblingsOf,
  subcategoryOf,
  type CatalogItem,
} from '../library/taxonomy';
import { clear, h, icon } from './dom';
import { openInfoSheet } from './infoSheet';

export interface LibraryOptions {
  mode: 'panel' | 'page';
  onPlace(item: CatalogItem): void;
  onClose?(): void;
}

const LEVEL = { fisico: 'Modelo físico', ideal: 'Modelo ideal', ninguno: 'Sin modelo eléctrico' } as const;

export class LibraryBrowser {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private search: HTMLInputElement;
  private cat: string | null = null;
  private sub: string | null = null;
  private query = '';
  private floating: HTMLElement | null = null;
  private previewTimer = 0;

  constructor(private readonly opts: LibraryOptions) {
    this.search = h('input', { class: 'lib-search', type: 'search', placeholder: 'Buscar: resistencia 10 kΩ, MOSFET, 2N2222…', 'aria-label': 'Buscar componentes' }) as HTMLInputElement;
    this.search.addEventListener('input', () => {
      this.query = this.search.value;
      this.renderBody();
    });
    this.search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.search.value = this.query = '';
        this.renderBody();
      }
    });
    this.body = h('div', { class: 'lib-body' });
    this.el = h(
      'div',
      { class: `library ${opts.mode}` },
      h(
        'div',
        { class: 'lib-head' },
        opts.mode === 'panel' ? h('div', { class: 'lib-title' }, h('span', {}, 'Componentes'), opts.onClose ? h('button', { class: 'icon-btn sm', 'data-tip': 'Cerrar', onclick: () => opts.onClose!() }, icon('close', 16)) : null) : null,
        h('label', { class: 'lib-search-wrap' }, icon('search', 16), this.search),
      ),
      this.body,
    );
    this.renderBody();
    document.addEventListener('pointerdown', (e) => {
      if (this.floating && !this.floating.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('.tile-more')) this.closeFloating();
    });
  }

  focusSearch() {
    this.search.focus();
  }

  /** Abre directamente una categoría/subcategoría (enlaces desde otras vistas). */
  open(cat: string | null, sub: string | null = null) {
    this.cat = cat;
    this.sub = sub;
    this.renderBody();
  }

  private renderBody() {
    this.closeFloating();
    const b = this.body;
    clear(b);
    if (this.query.trim()) {
      const res = searchCatalog(this.query);
      b.append(h('div', { class: 'lib-crumb muted' }, `${res.length} resultado${res.length === 1 ? '' : 's'}`));
      b.append(res.length ? this.grid(res, true) : h('div', { class: 'lib-empty' }, 'Sin coincidencias. Prueba con el tipo, la referencia o el valor.'));
      return;
    }
    if (!this.cat) {
      const list = h('div', { class: 'lib-list' });
      for (const c of CATEGORIES) {
        const all = itemsIn(c.id);
        const av = all.filter(isAvailable).length;
        list.append(
          this.row(c.icon, c.name, av ? `${av} disponibles` : 'Próximamente', () => {
            this.cat = c.id;
            this.renderBody();
          }, av === 0),
        );
      }
      b.append(list);
      return;
    }
    const cat = categoryOf(this.cat);
    if (!this.sub) {
      b.append(this.back('Categorías', () => ((this.cat = null), this.renderBody())), h('h3', { class: 'lib-h' }, cat.name));
      const list = h('div', { class: 'lib-list' });
      for (const s of cat.subcategories) {
        const all = itemsIn(cat.id, s.id);
        const av = all.filter(isAvailable).length;
        list.append(this.row(null, s.name, av ? `${av}` : all.length ? 'Próximamente' : '—', () => ((this.sub = s.id), this.renderBody()), av === 0));
      }
      b.append(list);
      return;
    }
    const sub = subcategoryOf(cat.id, this.sub);
    b.append(this.back(cat.name, () => ((this.sub = null), this.renderBody())), h('h3', { class: 'lib-h' }, sub.name));
    const items = itemsIn(cat.id, sub.id);
    b.append(items.length ? this.grid(items, false) : h('div', { class: 'lib-empty' }, 'Aún no hay referencias en esta subcategoría.'));
  }

  private row(ic: string | null, name: string, meta: string, onClick: () => void, dim: boolean) {
    return h(
      'button',
      { class: `lib-row ${dim ? 'dim' : ''}`, type: 'button', onclick: onClick },
      ic ? h('span', { class: 'lib-row-icon' }, icon(ic, 18)) : null,
      h('span', { class: 'lib-row-name' }, name),
      h('span', { class: 'lib-row-meta' }, meta),
      icon('chevronRight', 16),
    );
  }

  private back(label: string, fn: () => void) {
    return h('button', { class: 'lib-back', type: 'button', onclick: fn }, icon('chevronLeft', 16), label);
  }

  private grid(items: CatalogItem[], showPath: boolean) {
    const g = h('div', { class: 'lib-grid' });
    for (const it of items) g.append(this.tile(it, showPath));
    return g;
  }

  private tile(it: CatalogItem, showPath: boolean): HTMLElement {
    const ok = isAvailable(it);
    const img = h('div', { class: 'tile-img' });
    if (it.type) {
      img.classList.add('loading');
      thumbnail(it.type, it.params ?? {}, (url) => {
        img.classList.remove('loading');
        if (url) img.append(h('img', { src: url, alt: '', draggable: 'false' }));
      });
    } else img.append(icon(it.action ? (it.action === 'tool:wire' ? 'wire' : 'probe') : categoryOf(it.category).icon, 28));
    const more = h('button', { class: 'tile-more', type: 'button', 'aria-label': `Más información de ${it.name}`, 'data-tip': 'Información' }, icon('more', 16));
    more.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openMenu(it, more);
    });
    const tile = h(
      'div',
      { class: `tile ${ok ? '' : 'planned'}`, role: 'button', tabindex: '0', 'aria-label': it.name },
      img,
      h('div', { class: 'tile-name' }, it.name),
      h('div', { class: 'tile-ref' }, showPath ? `${subcategoryOf(it.category, it.subcategory).name} · ${it.reference}` : it.reference),
      ok ? null : h('span', { class: 'tile-badge' }, `Fase ${it.phase}`),
      more,
    );
    let longPressed = false;
    const activate = () => {
      if (longPressed) return;
      if (ok) this.opts.onPlace(it);
      else this.openMenu(it, more);
    };
    tile.addEventListener('click', activate);
    tile.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), activate()));
    // Vista previa: cursor (retardo breve) o pulsación larga en táctil.
    tile.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(this.previewTimer);
      this.previewTimer = window.setTimeout(() => this.showPreview(it, tile), 450);
    });
    tile.addEventListener('pointerleave', () => {
      clearTimeout(this.previewTimer);
      if (this.floating?.classList.contains('preview')) this.closeFloating();
    });
    tile.addEventListener('pointerdown', (e) => {
      longPressed = false;
      if (e.pointerType === 'mouse') return;
      clearTimeout(this.previewTimer);
      this.previewTimer = window.setTimeout(() => {
        longPressed = true;
        this.showPreview(it, tile);
      }, 450);
    });
    tile.addEventListener('pointerup', () => clearTimeout(this.previewTimer));
    return tile;
  }

  /* -------------------- paneles flotantes -------------------- */

  private closeFloating() {
    this.floating?.remove();
    this.floating = null;
  }

  private place(el: HTMLElement, anchor: HTMLElement, width: number) {
    const r = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = r.right + 10;
    if (left + width > vw - 8) left = Math.max(8, r.left - width - 10);
    if (left < 8) left = Math.max(8, Math.min(vw - width - 8, r.left));
    el.style.left = `${left}px`;
    el.style.width = `${Math.min(width, vw - 16)}px`;
    document.body.append(el);
    const hgt = el.offsetHeight;
    el.style.top = `${Math.max(8, Math.min(r.top, vh - hgt - 8))}px`;
  }

  private showPreview(it: CatalogItem, anchor: HTMLElement) {
    this.closeFloating();
    const img = h('div', { class: 'pv-img' });
    if (it.type) thumbnail(it.type, it.params ?? {}, (u) => u && img.append(h('img', { src: u, alt: '' })));
    else img.append(icon(categoryOf(it.category).icon, 40));
    const el = h(
      'div',
      { class: 'floating preview' },
      img,
      h('div', { class: 'pv-name' }, it.name),
      h('div', { class: 'pv-ref' }, it.reference),
      h('div', { class: 'pv-specs' }, ...(it.specs ?? []).slice(0, 4).map(([k, v]) => h('div', {}, h('span', {}, k), h('b', {}, v)))),
      h('div', { class: 'pv-foot' }, isAvailable(it) ? (it.action ? 'Clic para activar la herramienta' : 'Clic para colocar en el laboratorio') : `Planificado · Fase ${it.phase}`),
    );
    this.floating = el;
    this.place(el, anchor, 250);
  }

  private openMenu(it: CatalogItem, anchor: HTMLElement) {
    this.closeFloating();
    const def = it.type && hasDef(it.type) ? getDef(it.type) : null;
    const tabs: [string, () => HTMLElement][] = [
      ['Información', () => this.infoTab(it)],
      ['Características', () => this.featuresTab(it)],
      ['Funcionamiento', () => this.howTab(it)],
      ['Especificaciones', () => this.specsTab(it)],
      ['Modelos', () => this.modelsTab(it)],
    ];
    const content = h('div', { class: 'pop-content' });
    const seg = h('div', { class: 'segmented', role: 'tablist' });
    const show = (i: number) => {
      seg.querySelectorAll('button').forEach((b, k) => b.classList.toggle('on', k === i));
      clear(content);
      content.append(tabs[i][1]());
    };
    tabs.forEach(([t], i) => seg.append(h('button', { type: 'button', role: 'tab', onclick: () => show(i) }, t)));
    const el = h(
      'div',
      { class: 'floating popover', role: 'dialog', 'aria-label': it.name },
      h('div', { class: 'pop-head' }, h('div', {}, h('div', { class: 'pv-name' }, it.name), h('div', { class: 'pv-ref' }, it.reference)), h('button', { class: 'icon-btn sm', onclick: () => this.closeFloating(), 'aria-label': 'Cerrar' }, icon('close', 15))),
      seg,
      content,
      h(
        'div',
        { class: 'pop-foot' },
        isAvailable(it) ? h('button', { class: 'btn primary small', onclick: () => (this.closeFloating(), this.opts.onPlace(it)) }, it.action ? 'Usar herramienta' : 'Colocar') : h('span', { class: 'muted' }, `Disponible en la Fase ${it.phase}`),
        def ? h('button', { class: 'btn small ghost', onclick: () => (this.closeFloating(), openInfoSheet(def.eduId, { type: def.type, params: withDefaults(def, it.params ?? {}) })) }, 'Ficha completa') : null,
      ),
    );
    this.floating = el;
    show(0);
    this.place(el, anchor, 330);
  }

  private infoTab(it: CatalogItem) {
    const def = it.type && hasDef(it.type) ? getDef(it.type) : null;
    return h(
      'div',
      {},
      h('p', {}, def?.summary ?? it.summary),
      h('div', { class: 'kv' }, h('span', {}, 'Categoría'), h('span', {}, categoryOf(it.category).name), h('span', {}, 'Subcategoría'), h('span', {}, subcategoryOf(it.category, it.subcategory).name), h('span', {}, 'Estado'), h('span', {}, isAvailable(it) ? 'Disponible' : `Planificado (Fase ${it.phase})`), def ? h('span', {}, 'Simulación') : null, def ? h('span', {}, LEVEL[def.modelLevel]) : null),
    );
  }

  private featuresTab(it: CatalogItem) {
    const def = it.type && hasDef(it.type) ? getDef(it.type) : null;
    if (!def) return h('p', { class: 'muted' }, it.summary);
    const p = withDefaults(def, it.params ?? {});
    const kv = h('div', { class: 'kv' });
    for (const pd of def.params) {
      const v = p[pd.key];
      const shown = pd.type === 'select' ? (pd.options?.find((o) => o.value === String(v))?.label ?? String(v)) : `${v}${pd.unit ? ' ' + pd.unit : ''}`;
      kv.append(h('span', {}, pd.label), h('span', {}, shown));
    }
    return h('div', {}, def.params.length ? kv : h('p', { class: 'muted' }, 'Sin parámetros configurables.'), h('p', { class: 'small' }, 'Todos los parámetros se pueden editar después de colocarlo.'));
  }

  private howTab(it: CatalogItem) {
    const def = it.type && hasDef(it.type) ? getDef(it.type) : null;
    if (!def) return h('p', { class: 'muted' }, it.action ? it.summary : `Su modelo eléctrico y 3D se incorporará en la Fase ${it.phase}.`);
    const sheet = getSheet(def.eduId);
    const sec = sheet?.sections.find((s) => /cómo funciona|funcionamiento|regiones/i.test(s.title)) ?? sheet?.sections[0];
    return h('div', { class: 'pop-html' }, sec ? h('div', { html: sec.html }) : null, h('div', { class: 'model-box' }, def.modelDoc));
  }

  private specsTab(it: CatalogItem) {
    const kv = h('div', { class: 'kv' });
    for (const [k, v] of it.specs ?? []) kv.append(h('span', {}, k), h('span', {}, v));
    const def = it.type && hasDef(it.type) ? getDef(it.type) : null;
    const terms = def ? def.terminals(withDefaults(def, it.params ?? {})) : [];
    return h(
      'div',
      {},
      (it.specs ?? []).length ? kv : h('p', { class: 'muted' }, it.summary),
      terms.length ? h('div', { class: 'pop-sub' }, 'Terminales') : null,
      terms.length ? h('div', { class: 'kv' }, ...terms.flatMap((t) => [h('span', {}, t.name), h('span', {}, t.func)])) : null,
    );
  }

  private modelsTab(it: CatalogItem) {
    const sib = siblingsOf(it);
    if (!sib.length) return h('p', { class: 'muted' }, 'No hay otras referencias en esta subcategoría.');
    return h(
      'div',
      { class: 'pop-models' },
      ...sib.map((s) =>
        h(
          'button',
          { class: `pop-model ${isAvailable(s) ? '' : 'dim'}`, type: 'button', onclick: () => (isAvailable(s) ? (this.closeFloating(), this.opts.onPlace(s)) : undefined) },
          h('span', {}, s.reference),
          h('small', {}, isAvailable(s) ? s.summary : `Fase ${s.phase}`),
        ),
      ),
    );
  }
}
