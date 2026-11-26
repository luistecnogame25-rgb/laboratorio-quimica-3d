/**
 * Cerrar paneles con el dedo: se arrastra el panel hacia abajo (o hacia arriba) y, pasado un umbral
 * o con un gesto rápido, sale de la pantalla y se cierra. Si se suelta antes, vuelve a su sitio.
 *
 * Si el gesto empieza sobre contenido con desplazamiento propio, primero se desplaza ese contenido:
 * el panel solo empieza a moverse cuando el contenido ya está en el tope en esa dirección.
 */
export type SwipeDir = 'down' | 'up';

export interface SwipeOptions {
  onClose: (dir: SwipeDir) => void;
  /** Direcciones que cierran el panel (por defecto, las dos). */
  dirs?: SwipeDir[];
  /** Solo en pantallas estrechas (táctiles); por defecto, true. */
  phoneOnly?: boolean;
}

const THRESHOLD = 90; // px arrastrados para cerrar
const FLICK = 0.55; // px/ms: un gesto rápido cierra aunque sea corto

function scrollableBetween(target: HTMLElement, root: HTMLElement): HTMLElement | null {
  let n: HTMLElement | null = target;
  while (n) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n;
    if (n === root) break;
    n = n.parentElement;
  }
  return null;
}

export function swipeToClose(el: HTMLElement, o: SwipeOptions) {
  const dirs = o.dirs ?? ['down', 'up'];
  const phoneOnly = o.phoneOnly ?? true;
  el.classList.add('swipeable');
  let x0 = 0;
  let y0 = 0;
  let t0 = 0;
  let dy = 0;
  let state: 'idle' | 'pending' | 'drag' | 'off' = 'idle';
  let dir: SwipeDir = 'down';

  const reset = () => {
    el.style.transition = '';
    el.style.transform = '';
    el.style.opacity = '';
  };

  el.addEventListener(
    'touchstart',
    (e) => {
      state = 'off';
      if (e.touches.length !== 1) return;
      if (phoneOnly && window.innerWidth >= 860) return;
      if ((e.target as HTMLElement).closest('input, textarea, select, .no-swipe')) return;
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      t0 = performance.now();
      dy = 0;
      state = 'pending';
    },
    { passive: true },
  );

  el.addEventListener(
    'touchmove',
    (e) => {
      if (state === 'off' || state === 'idle') return;
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      if (state === 'pending') {
        const d = y - y0;
        const dx = x - x0;
        if (Math.abs(d) < 8 && Math.abs(dx) < 8) return;
        // Gestos horizontales (tablas, carruseles): no son para cerrar.
        if (Math.abs(dx) > Math.abs(d)) return void (state = 'off');
        dir = d > 0 ? 'down' : 'up';
        if (!dirs.includes(dir)) return void (state = 'off');
        const sc = scrollableBetween(e.target as HTMLElement, el);
        if (sc) {
          const atTop = sc.scrollTop <= 0;
          const atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1;
          if ((dir === 'down' && !atTop) || (dir === 'up' && !atBottom)) return void (state = 'off');
        }
        state = 'drag';
        y0 = y;
        t0 = performance.now();
        el.style.transition = 'none';
      }
      e.preventDefault();
      dy = y - y0;
      dy = dir === 'down' ? Math.max(0, dy) : Math.min(0, dy);
      el.style.transform = `translateY(${dy}px)`;
      el.style.opacity = String(Math.max(0.25, 1 - Math.abs(dy) / 420));
    },
    { passive: false },
  );

  const end = () => {
    if (state !== 'drag') return void (state = 'idle');
    state = 'idle';
    const v = Math.abs(dy) / Math.max(1, performance.now() - t0);
    if (Math.abs(dy) > THRESHOLD || (v > FLICK && Math.abs(dy) > 30)) {
      const off = (el.getBoundingClientRect().height + window.innerHeight) * (dir === 'down' ? 1 : -1);
      el.style.transition = 'transform 0.22s ease-in, opacity 0.22s ease-in';
      el.style.transform = `translateY(${off}px)`;
      el.style.opacity = '0';
      setTimeout(() => {
        o.onClose(dir);
        reset();
      }, 220);
    } else {
      el.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
      el.style.transform = '';
      el.style.opacity = '';
      setTimeout(reset, 220);
    }
  };
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', end);
}
