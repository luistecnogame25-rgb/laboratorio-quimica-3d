/**
 * Tarjeta «Análisis del enlace»: la misma presentación en el laboratorio, en «Sustancias», en la
 * biblioteca y en el analizador de la página «Tipos de enlaces». Cada dato lleva su procedencia:
 * Fuente (PubChem), Calculado (p. ej. Δχ) o Predicción (reglas de libro de texto).
 */
import { analyzeBond, elementCard, type BondAnalysis, type BondAnalysisResult } from '../chem/bondAnalysis';
import { subscript } from '../chem/formula';
import { FAMILIES } from '../chem/elements';
import { h, icon } from './dom';
import { swipeToClose } from './swipe';

const JOIN = ['', '–', '=', '≡'];
const tag = (k: 'fuente' | 'calculado' | 'prediccion') => h('span', { class: `prov ${k}` }, { fuente: 'Fuente', calculado: 'Calculado', prediccion: 'Predicción' }[k]);

function section(title: string, open: boolean, provenance: 'fuente' | 'calculado' | 'prediccion' | null, ...body: (Node | string | null | false)[]) {
  const d = h('details', { class: 'ba-sec' }) as HTMLDetailsElement;
  d.open = open;
  d.append(h('summary', {}, h('span', { class: 'grow' }, title), provenance ? tag(provenance) : null), h('div', { class: 'ba-body' }, ...body));
  return d;
}

export interface BondCardOptions {
  /** Botones extra al pie (p. ej. «Llevar al laboratorio»). */
  actions?: HTMLElement[];
  /** Encabezado alternativo (p. ej. «Enlace que acabas de crear»). */
  kicker?: string;
}

export function bondAnalysisCard(r: BondAnalysisResult, opts: BondCardOptions = {}): HTMLElement {
  const { a, b } = r;
  const head = (title: string, chip: HTMLElement | null) =>
    h(
      'div',
      { class: 'ba-head' },
      h('div', { class: 'ba-pair' }, ...[a, b].map((e) => h('span', { class: 'sym', style: `--fam:${FAMILIES[e.family].color}` }, e.symbol))),
      h('div', { class: 'grow' }, opts.kicker ? h('small', { class: 'muted' }, opts.kicker) : null, h('b', {}, title)),
      chip,
    );
  if (!r.ok) {
    return h(
      'div',
      { class: 'bond-analysis error' },
      head(`${a.name} + ${b.name}`, h('span', { class: 'ba-type t-error' }, 'Sin enlace')),
      h('p', {}, h('b', {}, 'No se puede formar el enlace. '), r.reason),
      ...r.notes.map((n) => h('p', { class: 'small muted' }, n)),
      opts.actions?.length ? h('div', { class: 'row gap mt' }, ...opts.actions) : null,
    );
  }
  const x: BondAnalysis = r;
  const order = x.order ?? 1;
  const label = x.same ? `${a.symbol}${x.type === 'metalico' ? '' : JOIN[order]}${x.type === 'metalico' ? ` (${a.name.toLowerCase()} metálico)` : a.symbol}` : `${a.symbol}${x.type === 'ionico' || x.type === 'metalico' ? ' + ' : JOIN[order]}${b.symbol}`;
  const cls = { ionico: 't-ionic', 'covalente-polar': 't-cov', 'covalente-no-polar': 't-cov', metalico: 't-metal', 'sin-dato': 't-error' }[x.type];

  const kv = h('div', { class: 'kv' });
  const row = (k: string, v: string | Node) => kv.append(h('span', {}, k), h('span', {}, v));
  if (x.dChi !== null) row('Δχ (diferencia de electronegatividad)', x.dChi.toFixed(2));
  if (x.negativeEnd) row('Extremo negativo (δ⁻)', x.negativeEnd.symbol);
  if (x.ionicPercent !== null) row('Carácter iónico (Pauling)', `${Math.round(x.ionicPercent)} %`);
  if (x.sigmaPi) row('Orden y enlaces σ/π', x.sigmaPi);
  if (x.semiconductor.kind !== 'no') row('Semiconductor', x.semiconductor.label.replace('Semiconductor ', ''));

  const formulas = x.formulas.length
    ? h(
        'div',
        { class: 'ba-formulas' },
        ...x.formulas.map((f) => h('div', { class: 'ba-formula' }, h('b', {}, subscript(f.formula)), h('span', {}, f.name), f.documented ? h('span', { class: 'prov fuente' }, 'Documentado') : h('span', { class: 'prov prediccion' }, 'Predicción'))),
      )
    : null;

  const ficha = h(
    'div',
    { class: 'ba-cards' },
    ...(x.same ? [a] : [a, b]).map((e) =>
      h('div', { class: 'ba-el' }, h('b', {}, `${e.name} (${e.symbol})`), h('div', { class: 'kv' }, ...elementCard(e).flatMap(([k, v]) => [h('span', {}, k), h('span', {}, v)]))),
    ),
  );

  return h(
    'div',
    { class: 'bond-analysis' },
    head(label, h('span', { class: `ba-type ${cls}` }, x.typeLabel)),
    h('p', { class: 'small ba-func' }, h('b', {}, x.func.name), x.formulas[0] ? ` · ${subscript(x.formulas[0].formula)}` : ''),
    kv,
    section('Justificación', true, 'calculado', ...x.justification.map((l) => h('p', { class: 'small' }, l))),
    section('Función química, fórmula y nombre', true, 'prediccion', h('p', { class: 'small' }, x.func.detail), formulas, h('p', { class: 'small muted' }, x.formulaNote)),
    section(
      'Comportamiento eléctrico y semiconductores',
      x.semiconductor.kind !== 'no',
      'prediccion',
      h('p', { class: 'small' }, h('b', {}, x.electrical.name), '. ', x.electrical.detail),
      x.semiconductor.kind !== 'no' ? h('p', { class: 'small' }, h('b', {}, `Clasificación: ${x.semiconductor.kind === 'intrinseco' ? 'intrínseco' : 'extrínseco'}`), x.semiconductor.family ? ` · ${x.semiconductor.family}` : '', x.semiconductor.pn ? ` · tipo ${x.semiconductor.pn} (${x.semiconductor.pn === 'N' ? 'donador' : 'aceptor'})` : '') : h('p', { class: 'small muted' }, x.semiconductor.detail),
    ),
    section('Tipo de sólido o sustancia', false, 'prediccion', h('p', { class: 'small' }, h('b', {}, x.solid.name), '. ', x.solid.detail), x.alloy ? h('p', { class: 'small' }, h('b', {}, x.alloy.name), '. ', x.alloy.detail) : null),
    section('Octeto y estructura de Lewis', false, 'prediccion', ...x.octet.map((l) => h('p', { class: 'small' }, l)), x.coordinate ? h('p', { class: 'small' }, h('b', {}, 'Enlace coordinado (dativo). '), x.coordinate) : null),
    x.intermolecular.length ? section('Fuerzas intermoleculares esperadas', false, 'prediccion', h('ul', { class: 'small inter' }, ...x.intermolecular.map((t) => h('li', {}, t)))) : null,
    section('Ficha de los elementos', false, 'fuente', ficha),
    ...x.notes.map((n) => h('p', { class: 'small muted' }, n)),
    h('p', { class: 'small muted ba-foot' }, 'Clasificación por reglas de libro de texto con datos de PubChem. No crea enlaces ni confirma que un compuesto exista.'),
    opts.actions?.length ? h('div', { class: 'row gap mt' }, ...opts.actions) : null,
  );
}

/* ------------------------------ hoja lateral (biblioteca) ------------------------------ */

let current: HTMLElement | null = null;

export function closeBondSheet() {
  current?.classList.remove('open');
  const c = current;
  current = null;
  setTimeout(() => c?.remove(), 220);
}

/** Abre el análisis en una hoja lateral (pantalla completa en el teléfono, se cierra deslizando). */
export function openBondSheet(za: number, zb: number, order: number | null = null, opts: BondCardOptions = {}) {
  current?.remove();
  const r = analyzeBond(za, zb, order);
  const panel = h(
    'aside',
    { class: 'sheet bond-sheet', role: 'dialog', 'aria-label': 'Análisis del enlace' },
    h('header', {}, icon('bond', 20), h('div', { class: 'grow' }, h('h2', {}, 'Análisis del enlace')), h('button', { class: 'icon-btn', 'aria-label': 'Cerrar', onclick: closeBondSheet }, icon('close'))),
    h('div', { class: 'sheet-body' }, bondAnalysisCard(r, opts)),
  );
  document.body.append(panel);
  current = panel;
  swipeToClose(panel, {
    onClose: () => {
      panel.remove();
      if (current === panel) current = null;
    },
  });
  requestAnimationFrame(() => panel.classList.add('open'));
}
