/**
 * Ficha de elemento (panel lateral contextual) y menú "⋯".
 * Cada valor indica su procedencia: "Fuente" (PubChem, sin modificar), "Calculado" (derivado
 * aquí a partir de la estructura de la tabla o de la configuración) o "Predicción".
 */
import { DATA_SOURCE, FAMILIES, L_LETTER, estimatedNeutrons, kToC, stateLabel, subshellLabel, type ChemElement, type Measured } from '../chem/elements';
import { hundBoxes, unpaired } from '../chem/orbitals';
import { clear, h, icon } from './dom';
import { swipeToClose } from './swipe';

export type SheetTab = 'resumen' | 'propiedades' | 'configuracion' | 'clasificacion' | 'fuentes';

export interface SheetActions {
  onViewAtom(e: ChemElement, mode?: string): void;
  onAddToLab(e: ChemElement): void;
}

const pubchemUrl = (e: ChemElement) => `https://pubchem.ncbi.nlm.nih.gov/element/${e.z}`;

let current: HTMLElement | null = null;

export function closeSheet() {
  current?.classList.remove('open');
  const c = current;
  current = null;
  setTimeout(() => c?.remove(), 220);
}

const tag = (kind: 'fuente' | 'calculado' | 'prediccion' | 'aprox') =>
  h('span', { class: `prov ${kind}` }, { fuente: 'Fuente', calculado: 'Calculado', prediccion: 'Predicción', aprox: 'Aproximación' }[kind]);

function row(label: string, value: string | HTMLElement, prov: ReturnType<typeof tag> | null, note?: string) {
  return h('div', { class: 'prop-row' }, h('div', { class: 'prop-l' }, label, note ? h('small', {}, note) : null), h('div', { class: 'prop-v' }, value, prov));
}

function m(v: Measured, unit: string, digits?: number): string {
  if (v.value === null) return v.text ? v.text : 'Sin dato en la fuente';
  return `${digits !== undefined ? v.value.toFixed(digits) : v.text} ${unit}`.trim();
}

function tempRow(label: string, v: Measured, predicted: boolean) {
  if (v.value === null) return row(label, 'Sin dato en la fuente', null);
  return row(label, `${v.text} K (${kToC(v.value).toFixed(2)} °C)`, tag(predicted ? 'prediccion' : 'fuente'), 'Presión no especificada por la fuente');
}

/** Diagrama de cajas (Pauli + Hund) de todos los subniveles ocupados. */
export function boxDiagram(e: ChemElement): HTMLElement {
  const wrap = h('div', { class: 'boxes' });
  for (const s of [...e.configuration.subshells].reverse()) {
    const boxes = hundBoxes(s.l, s.electrons).map((n) => h('span', { class: 'box' }, n >= 1 ? h('i', { class: 'up' }, '↑') : '', n === 2 ? h('i', { class: 'down' }, '↓') : ''));
    wrap.append(h('div', { class: 'box-row' }, h('span', { class: 'box-lbl' }, subshellLabel(s)), h('span', { class: 'box-set' }, ...boxes), h('span', { class: 'box-e' }, `${s.electrons} e⁻`)));
  }
  return wrap;
}

function summary(e: ChemElement, a: SheetActions) {
  const fam = FAMILIES[e.family];
  return h(
    'div',
    {},
    h(
      'div',
      { class: 'facts' },
      h('div', {}, h('small', {}, 'Número atómico'), h('b', {}, String(e.z))),
      h('div', {}, h('small', {}, 'Masa atómica'), h('b', {}, e.mass.text || '—')),
      h('div', {}, h('small', {}, 'Grupo · Período'), h('b', {}, `${e.group ?? '—'} · ${e.period}`)),
      h('div', {}, h('small', {}, 'Bloque'), h('b', {}, e.block)),
    ),
    h('p', { class: 'lead' }, `${fam.name}. Configuración ${e.configuration.short}`, e.configuration.status !== 'fuente' ? ` (${e.configuration.status} según la fuente)` : '', '.'),
    h(
      'div',
      { class: 'row gap' },
      h('button', { class: 'btn primary', onclick: () => a.onViewAtom(e) }, icon('atom', 16), 'Ver en 3D'),
      h('button', { class: 'btn', onclick: () => a.onAddToLab(e) }, icon('flask', 16), 'Llevar al laboratorio'),
    ),
    e.classificationNotes.length ? h('div', { class: 'note' }, icon('info', 15), h('span', {}, e.classificationNotes[0])) : null,
  );
}

function properties(e: ChemElement) {
  const pred = e.superheavy;
  const N = estimatedNeutrons(e);
  return h(
    'div',
    { class: 'props' },
    h('h4', {}, 'Identidad'),
    row('Nombre', `${e.name} (${e.nameEn})`, null),
    row('Masa atómica relativa', e.mass.text ? `${e.mass.text} u` : 'Sin dato', tag('fuente'), e.massNote ?? undefined),
    row('Grupo', e.group === null ? 'Serie f (fuera de los 18 grupos en esta disposición)' : String(e.group), tag('calculado')),
    row('Período', String(e.period), tag('calculado')),
    row('Bloque', e.block, tag('calculado')),
    row('Familia', FAMILIES[e.family].name, tag('fuente')),
    h('h4', {}, 'Estructura electrónica'),
    row('Configuración', e.configuration.short, tag(e.configuration.status === 'fuente' ? 'fuente' : 'prediccion'), e.configuration.status !== 'fuente' ? `Marcada como "${e.configuration.status}" en la fuente` : undefined),
    row('Electrones por nivel', e.shells.join(', '), tag('calculado')),
    row('Electrones de valencia', e.valenceElectrons === null ? 'Depende del contexto (bloques d/f)' : String(e.valenceElectrons), e.valenceElectrons === null ? null : tag('calculado')),
    row('Estados de oxidación', e.oxidationStates.length ? e.oxidationStates.join(', ') : 'Sin dato', tag(pred ? 'prediccion' : 'fuente')),
    h('h4', {}, 'Propiedades atómicas'),
    row('Electronegatividad', m(e.electronegativity, ''), e.electronegativity.value === null ? null : tag('fuente'), 'Escala no declarada en el conjunto; los valores coinciden con la escala de Pauling'),
    row('Radio atómico', m(e.atomicRadius, 'pm'), e.atomicRadius.value === null ? null : tag('fuente'), 'Definición de radio no especificada por la fuente'),
    row('Energía de ionización (primera)', m(e.ionizationEnergy, 'eV'), e.ionizationEnergy.value === null ? null : tag('fuente')),
    row('Afinidad electrónica', m(e.electronAffinity, 'eV'), e.electronAffinity.value === null ? null : tag('fuente')),
    h('h4', {}, 'Propiedades físicas'),
    row('Estado estándar', stateLabel(e), tag(e.state.predicted ? 'prediccion' : 'fuente')),
    tempRow('Punto de fusión', e.meltingK, pred),
    tempRow('Punto de ebullición', e.boilingK, pred),
    row('Densidad', m(e.density, 'g/cm³'), e.density.value === null ? null : tag(pred ? 'prediccion' : 'fuente'), 'Para gases, referida a 0 °C y 1 atm (según el cuaderno IUPAC sobre este conjunto)'),
    h('h4', {}, 'Núcleo (visualización)'),
    row('Protones', String(e.z), tag('fuente')),
    row('Neutrones (estimado)', N === null ? 'Sin dato' : String(N), tag('aprox'), 'N = A − Z con A = masa atómica redondeada; no corresponde necesariamente al isótopo más abundante'),
    h('h4', {}, 'Historia'),
    row('Descubrimiento', e.discovered, tag('fuente')),
    h('h4', {}, 'Aplicaciones, reactividad, compuestos y riesgos'),
    h('p', { class: 'muted small' }, 'Todavía no se han incorporado datos verificados para estos apartados. Para no inventar información, se enlaza la página oficial del elemento en PubChem.'),
    h('a', { class: 'btn small', href: pubchemUrl(e), target: '_blank', rel: 'noopener' }, icon('external', 14), `${e.name} en PubChem`),
  );
}

function configuration(e: ChemElement, a: SheetActions) {
  const valenceSub = e.configuration.subshells.filter((s) => s.electrons < [2, 6, 10, 14][s.l]);
  const unp = e.configuration.subshells.reduce((acc, s) => acc + unpaired(s.l, s.electrons), 0);
  return h(
    'div',
    {},
    h('div', { class: 'config-big' }, e.configuration.short),
    h('p', { class: 'muted small' }, `Notación de la fuente: ${e.configuration.raw}`),
    h(
      'div',
      { class: 'facts' },
      h('div', {}, h('small', {}, 'Electrones'), h('b', {}, String(e.z))),
      h('div', {}, h('small', {}, 'Niveles ocupados'), h('b', {}, String(e.shells.length))),
      h('div', {}, h('small', {}, 'Desapareados (Hund)'), h('b', {}, String(unp))),
      h('div', {}, h('small', {}, 'Subniveles incompletos'), h('b', {}, valenceSub.map((s) => subshellLabel(s)).join(' ') || '—')),
    ),
    boxDiagram(e),
    h('p', { class: 'muted small' }, 'Cada caja es un orbital; ↑↓ indica dos electrones con espín opuesto (principio de exclusión de Pauli). Los electrones desapareados se reparten según la regla de Hund. El recuento de desapareados se deduce de la configuración del estado fundamental indicada por la fuente.'),
    h('button', { class: 'btn', onclick: () => a.onViewAtom(e, 'orbitales') }, icon('atom', 16), `Orbitales ${[...new Set(e.configuration.subshells.map((s) => L_LETTER[s.l]))].join(', ')} en 3D`),
  );
}

function classification(e: ChemElement) {
  return h(
    'div',
    {},
    row('Familia (fuente)', FAMILIES[e.family].name, tag('fuente')),
    row('Bloque', e.block, tag('calculado')),
    e.classificationNotes.length ? h('div', {}, ...e.classificationNotes.map((n) => h('div', { class: 'note' }, icon('info', 15), h('span', {}, n)))) : h('p', { class: 'muted small' }, 'No se conocen discrepancias habituales en la clasificación de este elemento.'),
  );
}

function sources(e: ChemElement) {
  return h(
    'div',
    { class: 'small' },
    h('p', {}, h('b', {}, DATA_SOURCE.name), ' — datos obtenidos el ', DATA_SOURCE.retrieved, ' de ', h('a', { href: DATA_SOURCE.url, target: '_blank', rel: 'noopener' }, 'PUG-REST'), '.'),
    h('p', { class: 'muted' }, 'Cita recomendada: ', DATA_SOURCE.citation),
    h('p', { class: 'muted' }, 'PubChem agrega datos de fuentes autorizadas; el conjunto descargado no indica la referencia original de cada valor. Consulta la página del elemento para ver las referencias individuales.'),
    h('a', { class: 'btn small', href: pubchemUrl(e), target: '_blank', rel: 'noopener' }, icon('external', 14), 'Referencias en PubChem'),
    h('p', { class: 'muted' }, 'Calculado en esta aplicación: grupo, período, bloque, configuración expandida, electrones por nivel y de valencia, diagrama de orbitales y neutrones estimados.'),
  );
}

export function openElementSheet(e: ChemElement, a: SheetActions, tab: SheetTab = 'resumen') {
  if (current) current.remove();
  const fam = FAMILIES[e.family];
  const body = h('div', { class: 'sheet-body' });
  const tabs: [SheetTab, string][] = [
    ['resumen', 'Resumen'],
    ['propiedades', 'Propiedades'],
    ['configuracion', 'Configuración'],
    ['clasificacion', 'Clasificación'],
    ['fuentes', 'Fuentes'],
  ];
  const seg = h('div', { class: 'segmented', role: 'tablist' });
  const show = (t: SheetTab) => {
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    clear(body);
    body.append(t === 'resumen' ? summary(e, a) : t === 'propiedades' ? properties(e) : t === 'configuracion' ? configuration(e, a) : t === 'clasificacion' ? classification(e) : sources(e));
    body.scrollTop = 0;
  };
  for (const [t, l] of tabs) seg.append(h('button', { type: 'button', role: 'tab', 'data-tab': t, onclick: () => show(t) }, l));
  const panel = h(
    'aside',
    { class: 'sheet', role: 'dialog', 'aria-label': `Ficha de ${e.name}`, style: `--fam:${fam.color}` },
    h(
      'header',
      {},
      h('div', { class: 'tile-lg' }, h('span', { class: 'z' }, String(e.z)), h('span', { class: 'sym' }, e.symbol)),
      h('div', { class: 'grow' }, h('h2', {}, e.name), h('span', { class: 'muted' }, fam.name)),
      h('button', { class: 'icon-btn', 'aria-label': 'Cerrar', 'data-tip': 'Cerrar', onclick: closeSheet }, icon('close')),
    ),
    seg,
    body,
  );
  document.body.append(panel);
  current = panel;
  // En el teléfono, la ficha también se cierra deslizándola hacia abajo o hacia arriba.
  swipeToClose(panel, {
    onClose: () => {
      panel.remove();
      if (current === panel) current = null;
    },
  });
  show(tab);
  requestAnimationFrame(() => panel.classList.add('open'));
}

/** Menú contextual "⋯" de un elemento. */
export function openElementMenu(e: ChemElement, anchor: HTMLElement, a: SheetActions) {
  document.querySelector('.ctx-menu')?.remove();
  const item = (ic: string, label: string, fn: () => void, hint?: string) =>
    h('button', { class: 'ctx-item', type: 'button', onclick: () => (menu.remove(), fn()) }, icon(ic, 16), h('span', {}, label), hint ? h('small', {}, hint) : null);
  const menu = h(
    'div',
    { class: 'ctx-menu', role: 'menu' },
    h('div', { class: 'ctx-head' }, `${e.symbol} · ${e.name}`),
    item('info', 'Información', () => openElementSheet(e, a, 'resumen')),
    item('list', 'Propiedades', () => openElementSheet(e, a, 'propiedades')),
    item('atom', 'Estructura atómica', () => a.onViewAtom(e)),
    item('layers', 'Configuración electrónica', () => openElementSheet(e, a, 'configuracion')),
    item('flask', 'Llevar al laboratorio', () => a.onAddToLab(e)),
    h('div', { class: 'ctx-sep' }),
    item('bond', 'Tipos de enlaces', () => (location.hash = '#/enlaces')),
    item('external', 'Reactividad y aplicaciones', () => window.open(pubchemUrl(e), '_blank', 'noopener'), 'PubChem'),
  );
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  const w = 250;
  menu.style.left = `${Math.min(window.innerWidth - w - 8, Math.max(8, r.left))}px`;
  const top = r.bottom + 6;
  menu.style.top = `${top + 320 > window.innerHeight ? Math.max(8, r.top - 330) : top}px`;
  const off = (ev: PointerEvent) => {
    if (!menu.contains(ev.target as Node)) {
      menu.remove();
      document.removeEventListener('pointerdown', off, true);
    }
  };
  setTimeout(() => document.addEventListener('pointerdown', off, true));
}
