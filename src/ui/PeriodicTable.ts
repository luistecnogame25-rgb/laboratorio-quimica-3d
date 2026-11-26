/**
 * Tabla periódica interactiva (118 elementos). Se usa como página completa y como selector
 * compacto dentro del laboratorio. Filtros: texto (nombre/símbolo/Z), familia, estado,
 * bloque, grupo y período. Los elementos que no cumplen el filtro se atenúan (no desaparecen),
 * para conservar la estructura de la tabla.
 */
import { ELEMENTS, FAMILIES, searchElements, stateLabel, type ChemElement, type FamilyId, type StateKey } from '../chem/elements';
import { clear, h, icon } from './dom';

export interface TableOptions {
  compact?: boolean;
  onSelect(e: ChemElement): void;
  onMenu?(e: ChemElement, anchor: HTMLElement): void;
  onPreview?(e: ChemElement | null, anchor?: HTMLElement): void;
}

interface Filters {
  q: string;
  family: FamilyId | null;
  state: StateKey | null;
  block: string | null;
  group: number | null;
  period: number | null;
}

export class PeriodicTable {
  readonly el: HTMLElement;
  private grid: HTMLElement;
  private cells = new Map<number, HTMLElement>();
  private f: Filters = { q: '', family: null, state: null, block: null, group: null, period: null };
  private chips: HTMLElement;
  private count: HTMLElement;
  private selected: number | null = null;
  private hoverTimer = 0;

  constructor(private readonly opts: TableOptions) {
    const search = h('input', { type: 'search', class: 'pt-search', placeholder: 'Nombre, símbolo o número atómico', 'aria-label': 'Buscar elemento' }) as HTMLInputElement;
    search.addEventListener('input', () => {
      this.f.q = search.value;
      this.apply();
    });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = searchElements(search.value)[0];
        if (first) this.opts.onSelect(first);
      }
    });
    this.count = h('span', { class: 'pt-count' });
    this.chips = h('div', { class: 'pt-chips' });
    const sel = (label: string, values: [string, string][], on: (v: string) => void) => {
      const s = h('select', { class: 'pt-select', 'aria-label': label }, h('option', { value: '' }, label), ...values.map(([v, t]) => h('option', { value: v }, t))) as HTMLSelectElement;
      s.addEventListener('change', () => on(s.value));
      return s;
    };
    const filters = h(
      'div',
      { class: 'pt-filters' },
      sel('Estado', [['solid', 'Sólido'], ['liquid', 'Líquido'], ['gas', 'Gas']], (v) => ((this.f.state = (v || null) as StateKey | null), this.apply())),
      sel('Bloque', [['s', 'Bloque s'], ['p', 'Bloque p'], ['d', 'Bloque d'], ['f', 'Bloque f']], (v) => ((this.f.block = v || null), this.apply())),
      sel('Grupo', Array.from({ length: 18 }, (_, i) => [String(i + 1), `Grupo ${i + 1}`] as [string, string]), (v) => ((this.f.group = v ? Number(v) : null), this.apply())),
      sel('Período', Array.from({ length: 7 }, (_, i) => [String(i + 1), `Período ${i + 1}`] as [string, string]), (v) => ((this.f.period = v ? Number(v) : null), this.apply())),
    );
    this.grid = h('div', { class: `pt-grid ${opts.compact ? 'compact' : ''}`, role: 'grid', 'aria-label': 'Tabla periódica' });
    this.buildGrid();
    this.el = h(
      'div',
      { class: `ptable ${opts.compact ? 'compact' : ''}` },
      h(
        'div',
        { class: 'pt-bar' },
        h('label', { class: 'search-wrap' }, icon('search', 15), search),
        opts.compact ? null : h('button', { class: 'btn small filters-toggle', type: 'button', onclick: () => this.el.classList.toggle('show-filters') }, icon('list', 14), 'Filtros'),
        opts.compact ? null : filters,
        this.count,
      ),
      opts.compact ? null : this.chips,
      h('div', { class: 'pt-scroll' }, this.grid),
    );
    this.renderChips();
    this.apply();
  }

  private buildGrid() {
    for (const e of ELEMENTS) {
      const fam = FAMILIES[e.family];
      const cell = h(
        'button',
        {
          class: 'pt-cell',
          type: 'button',
          style: `grid-row:${e.pos.row};grid-column:${e.pos.col};--fam:${fam.color}`,
          'aria-label': `${e.name}, ${e.symbol}, número atómico ${e.z}`,
        },
        h('span', { class: 'z' }, String(e.z)),
        h('span', { class: 'sym' }, e.symbol),
        this.opts.compact ? null : h('span', { class: 'nm' }, e.name),
      );
      if (!this.opts.compact && this.opts.onMenu) {
        const more = h('span', { class: 'pt-more', role: 'button', 'aria-label': `Opciones de ${e.name}` }, icon('more', 13));
        more.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.opts.onMenu!(e, cell);
        });
        cell.append(more);
      }
      cell.addEventListener('click', () => {
        clearTimeout(this.hoverTimer);
        this.opts.onPreview?.(null);
        this.opts.onSelect(e);
      });
      cell.addEventListener('pointerenter', (ev) => {
        if (ev.pointerType !== 'mouse' || !this.opts.onPreview) return;
        clearTimeout(this.hoverTimer);
        this.hoverTimer = window.setTimeout(() => this.opts.onPreview!(e, cell), 380);
      });
      cell.addEventListener('pointerleave', () => {
        clearTimeout(this.hoverTimer);
        this.opts.onPreview?.(null);
      });
      // Pulsación larga en táctil → menú contextual
      let lp = 0;
      cell.addEventListener('pointerdown', (ev) => {
        if (ev.pointerType === 'mouse' || !this.opts.onMenu) return;
        lp = window.setTimeout(() => this.opts.onMenu!(e, cell), 480);
      });
      cell.addEventListener('pointerup', () => clearTimeout(lp));
      cell.addEventListener('pointercancel', () => clearTimeout(lp));
      this.cells.set(e.z, cell);
      this.grid.append(cell);
    }
    // Rótulos de la serie f (La–Yb y Ac–No), a la izquierda de sus filas
    for (const [row, txt] of [[9, 'La–Yb'], [10, 'Ac–No']] as const) this.grid.append(h('div', { class: 'pt-ref', style: `grid-row:${row};grid-column:1 / span 2` }, txt));
    this.grid.append(h('div', { class: 'pt-gap', style: 'grid-row:8;grid-column:1 / span 18' }));
  }

  private renderChips() {
    clear(this.chips);
    const chip = (id: FamilyId | null, label: string, color?: string) => {
      const b = h('button', { class: `chip ${this.f.family === id ? 'on' : ''}`, type: 'button' }, color ? h('span', { class: 'dot', style: `background:${color}` }) : null, label);
      b.addEventListener('click', () => {
        this.f.family = this.f.family === id ? null : id;
        this.renderChips();
        this.apply();
      });
      return b;
    };
    this.chips.append(chip(null, 'Todas'));
    for (const [id, fam] of Object.entries(FAMILIES) as [FamilyId, (typeof FAMILIES)[FamilyId]][]) this.chips.append(chip(id, fam.name, fam.color));
  }

  private matches(e: ChemElement): boolean {
    const f = this.f;
    if (f.family && e.family !== f.family) return false;
    if (f.state && e.state.key !== f.state) return false;
    if (f.block && e.block !== f.block) return false;
    if (f.group && e.group !== f.group) return false;
    if (f.period && e.period !== f.period) return false;
    return true;
  }

  private apply() {
    const textHits = this.f.q.trim() ? new Set(searchElements(this.f.q).map((e) => e.z)) : null;
    let n = 0;
    for (const e of ELEMENTS) {
      const ok = this.matches(e) && (!textHits || textHits.has(e.z));
      if (ok) n++;
      this.cells.get(e.z)!.classList.toggle('dim', !ok);
    }
    this.count.textContent = n === 118 ? '118 elementos' : `${n} de 118`;
  }

  select(z: number | null) {
    if (this.selected) this.cells.get(this.selected)?.classList.remove('sel');
    this.selected = z;
    if (z) this.cells.get(z)?.classList.add('sel');
  }
}

/** Breve vista previa flotante (cursor o pulsación). */
export function previewCard(e: ChemElement): HTMLElement {
  const fam = FAMILIES[e.family];
  return h(
    'div',
    { class: 'pv-card', style: `--fam:${fam.color}` },
    h('div', { class: 'pv-top' }, h('span', { class: 'pv-sym' }, e.symbol), h('div', {}, h('b', {}, e.name), h('span', {}, `${fam.name} · Z = ${e.z}`))),
    h(
      'div',
      { class: 'kv' },
      h('span', {}, 'Masa atómica'),
      h('span', {}, e.mass.text || '—'),
      h('span', {}, 'Configuración'),
      h('span', {}, e.configuration.short),
      h('span', {}, 'Estado (fuente)'),
      h('span', {}, stateLabel(e)),
    ),
  );
}
