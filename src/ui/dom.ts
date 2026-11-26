type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | undefined | null>;

/** Creador de elementos mínimo (sin framework: menos peso para el WebView de Android). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k === 'class') el.className = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

const P: Record<string, string> = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  lab: 'M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 006 21h12a1.7 1.7 0 001.5-2.5L14 9V3M7.5 14h9',
  plus: 'M12 5v14M5 12h14',
  library: 'M4 4h4v16H4zM10 4h4v16h-4zM16 5l3.5-.8 3 15.6-3.5.8z',
  sim: 'M3 12h4l3-8 4 16 3-8h4',
  robot: 'M8 4h8v5H8zM12 2v2M5 9h14v9H5zM9 13h.01M15 13h.01M3 12v4M21 12v4M8 18v3M16 18v3',
  academy: 'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5M22 9v6',
  folder: 'M3 6h6l2 2h10v11H3z',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3',
  redo: 'M15 14l5-5-5-5M20 9H9a5 5 0 000 10h3',
  cursor: 'M5 3l14 7-6 2-2 6z',
  wire: 'M4 20c0-8 4-8 8-8s8 0 8-8M4 20h.01M20 4h.01',
  probe: 'M14 3l7 7-9 9-4 1 1-4zM3 21l4-4',
  rotate: 'M20 11a8 8 0 10-2.3 5.7M20 4v7h-7',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  group: 'M3 3h7v7H3zM14 14h7v7h-7zM10 6.5h4v11',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h4v16H7zM14 4h4v16h-4z',
  stop: 'M6 6h12v12H6z',
  dc: 'M4 9h16M4 15h3M10 15h4M17 15h3',
  save: 'M5 3h11l4 4v14H5zM8 3v6h8M8 21v-7h8v7',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  upload: 'M12 21V9M7 14l5-5 5 5M5 3h14',
  info: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 16v-5M12 8h.01',
  top: 'M12 4v16M4 12h16M8 8l4-4 4 4',
  cube: 'M12 2l9 5v10l-9 5-9-5V7zM12 22V12M21 7l-9 5-9-5',
  front: 'M4 5h16v14H4zM4 15h16',
  reset: 'M3 12a9 9 0 109-9M3 4v5h5',
  zoomIn: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5M8 11h6M11 8v6',
  zoomOut: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5M8 11h6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 6l12 12M18 6L6 18',
  panelLeft: 'M3 4h18v16H3zM9 4v16',
  panelRight: 'M3 4h18v16H3zM15 4v16',
  warn: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  check: 'M4 12l5 5L20 6',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  record: 'M12 17a5 5 0 100-10 5 5 0 000 10z',
  resistor: 'M2 12h4l1.5-3 3 6 3-6 3 6 1.5-3h4',
  capacitor: 'M2 12h8M14 12h8M10 6v12M14 6v12',
  diode: 'M2 12h6M16 12h6M8 6v12l8-6zM16 6v12',
  transistor: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h6M9 7v10M9 10l6-4M9 14l6 4',
  chip: 'M7 4h10v16H7zM4 7h3M4 11h3M4 15h3M17 7h3M17 11h3M17 15h3',
  battery: 'M3 8h15v8H3zM18 11h2v2h-2M6 11h4M8 9v4',
  cpu: 'M6 6h12v12H6zM9 9h6v6H9zM9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4',
  sensor: 'M12 12h.01M8.5 8.5a5 5 0 000 7M15.5 8.5a5 5 0 010 7M5.6 5.6a9 9 0 000 12.8M18.4 5.6a9 9 0 010 12.8',
  motor: 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 12h.01M2 12h5M17 12h5',
  gauge: 'M12 21a9 9 0 110-18 9 9 0 010 18zM12 12l4-4M7 16h10',
  switch: 'M3 12h5M16 12h5M8 12l7-5M15 12h.01',
  display: 'M3 5h18v12H3zM8 21h8M12 17v4',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  chevronRight: 'M9 6l6 6-6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronUp: 'M6 15l6-6 6 6',
  chevronDown: 'M6 9l6 6 6-6',
  sidebar: 'M3 4h18v16H3zM9 4v16M5 8h2M5 11h2',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  scope: 'M3 5h18v14H3zM5 14l3-5 3 7 3-9 3 7 2-2',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  calc: 'M6 3h12a1 1 0 011 1v16a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1zM8 7h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 18h.01M12 18h.01M16 18h.01',
atom: 'M12 13a1 1 0 100-2 1 1 0 000 2zM12 21c4.4 0 8-4 8-9s-3.6-9-8-9-8 4-8 9 3.6 9 8 9zM3.5 7.5c2.2-3.8 9.5-1.8 14 3.5s5 10.5 2.8 11M20.5 7.5c-2.2-3.8-9.5-1.8-14 3.5S1.5 21.5 3.7 22',  table: 'M3 4h4v4H3zM17 4h4v4h-4zM3 10h4v4H3zM8.5 10h3.5v4H8.5zM13 10h3.5v4H13zM17 10h4v4h-4zM6 17h12v3H6z',  flask: 'M9 3h6M10 3v6L4.6 18.4A1.7 1.7 0 006 21h12a1.7 1.7 0 001.4-2.6L14 9V3M7 15h10',  molecule: 'M7 7a2 2 0 100-4 2 2 0 000 4zM17 12a2 2 0 100-4 2 2 0 000 4zM8 21a2 2 0 100-4 2 2 0 000 4zM8.7 6l6.6 3.2M15.6 11.6L9.4 17.6',  bond: 'M6 15a3 3 0 100-6 3 3 0 000 6zM18 15a3 3 0 100-6 3 3 0 000 6zM9 11h6M9 13h6',  ruler: 'M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',  angle: 'M4 20h16M4 20L14 6M9 20a5 5 0 00-2.2-4.1',  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',  plusCircle: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 8v8M8 12h8',
};

export function icon(name: string, size = 18): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', P[name] ?? P.info);
  svg.appendChild(path);
  return svg;
}

export function iconBtn(name: string, title: string, onClick: () => void, extra = ''): HTMLButtonElement {
  const b = h('button', { class: `icon-btn ${extra}`, 'data-tip': title, 'aria-label': title, type: 'button' }, icon(name));
  b.addEventListener('click', onClick);
  return b;
}

let toastTimer = 0;
export function toast(msg: string, kind: 'info' | 'ok' | 'warn' | 'error' = 'info') {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status' });
    document.body.append(el);
  }
  el.className = `toast show ${kind}`;
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), 3200);
}

export function clear(el: Element) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Trazado SVG de un icono (para componentes React). */
export function iconPath(name: string): string {
  return P[name] ?? P.info;
}
