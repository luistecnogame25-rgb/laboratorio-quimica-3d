import { getDef, hasDef } from '../core/registry';
import type { Params } from '../core/types';
import { getSheet } from '../education/sheets';
import { h, icon } from './dom';

const LEVEL_TEXT = {
  fisico: ['Modelo físico', 'ok', 'Ecuaciones del dispositivo resueltas por el motor de simulación.'],
  ideal: ['Modelo ideal', 'accent', 'Elemento lineal ideal resuelto por el motor de simulación.'],
  ninguno: ['Sin modelo eléctrico', 'warn', 'Solo representación visual.'],
} as const;

/** Muestra la ficha educativa de un componente (o de un tema) en una ventana modal. */
export function openInfoSheet(eduId: string, opts: { type?: string; params?: Params; onPractice?: () => void } = {}) {
  const sheet = getSheet(eduId, opts.params);
  if (!sheet) return;
  const def = opts.type && hasDef(opts.type) ? getDef(opts.type) : null;
  const close = () => back.remove();
  const sections = sheet.sections.map((s, i) => {
    const d = h('details', { class: 'edu-sec' }, h('summary', {}, s.title), h('div', { html: s.html }));
    if (i < 2) d.open = true;
    return d;
  });
  const modelBox = def
    ? h(
        'details',
        { class: 'edu-sec', open: true },
        h('summary', {}, 'Modelo en este simulador'),
        h(
          'div',
          {},
          h('span', { class: `badge ${LEVEL_TEXT[def.modelLevel][1]}` }, LEVEL_TEXT[def.modelLevel][0]),
          h('p', {}, LEVEL_TEXT[def.modelLevel][2]),
          h('div', { class: 'model-box' }, def.modelDoc),
        ),
      )
    : null;
  const back = h(
    'div',
    { class: 'modal-back', onclick: (e: Event) => e.target === back && close() },
    h(
      'div',
      { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': sheet.title },
      h(
        'header',
        {},
        h('span', { class: 'brand-mark', style: 'width:32px;height:32px' }, icon('info', 18)),
        h('h2', {}, sheet.title),
        opts.onPractice
          ? h('button', { class: 'btn small primary', onclick: () => (close(), opts.onPractice!()) }, icon('lab', 16), 'Practicar')
          : null,
        h('button', { class: 'icon-btn', title: 'Cerrar', onclick: close }, icon('close')),
      ),
      h('div', { class: 'body' }, h('p', { class: 'intro' }, sheet.intro), modelBox, ...sections),
    ),
  );
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      close();
      window.removeEventListener('keydown', onKey);
    }
  };
  window.addEventListener('keydown', onKey);
  document.body.append(back);
}
