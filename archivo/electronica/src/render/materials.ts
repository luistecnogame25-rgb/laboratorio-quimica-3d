import * as THREE from 'three';

/** Materiales compartidos (se reutilizan para ahorrar memoria en móviles). */
const cache = new Map<string, THREE.Material>();

export function std(key: string, opts: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  const k = 'std:' + key;
  let m = cache.get(k) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial(opts);
    cache.set(k, m);
  }
  return m;
}

export const MAT = {
  lead: () => std('lead', { color: 0xc8ccd2, metalness: 0.9, roughness: 0.28 }),
  tin: () => std('tin', { color: 0xdfe3e8, metalness: 0.95, roughness: 0.2 }),
  blackPlastic: () => std('blackPlastic', { color: 0x1a1b1e, roughness: 0.55, metalness: 0.05 }),
  darkPlastic: () => std('darkPlastic', { color: 0x2a2d33, roughness: 0.6 }),
  gold: () => std('gold', { color: 0xd4a640, metalness: 1, roughness: 0.3 }),
  steel: () => std('steel', { color: 0xa9b0b9, metalness: 0.9, roughness: 0.35 }),
  red: () => std('redPlastic', { color: 0xc8202a, roughness: 0.4 }),
  black: () => std('blackKnob', { color: 0x111214, roughness: 0.35 }),
};

/** Colores del código de resistencias (dígitos 0–9, oro −1, plata −2). */
export const BAND_COLORS: Record<string, number> = {
  '0': 0x111111,
  '1': 0x6b3a1e,
  '2': 0xd22020,
  '3': 0xf07a10,
  '4': 0xf2d21a,
  '5': 0x1e9e3a,
  '6': 0x1f55d6,
  '7': 0x8a3fd0,
  '8': 0x8a8a8a,
  '9': 0xf4f4f4,
  '-1': 0xc9a23a,
  '-2': 0xc7ccd2,
};

export const BAND_NAMES: Record<string, string> = {
  '0': 'negro',
  '1': 'marrón',
  '2': 'rojo',
  '3': 'naranja',
  '4': 'amarillo',
  '5': 'verde',
  '6': 'azul',
  '7': 'violeta',
  '8': 'gris',
  '9': 'blanco',
  '-1': 'dorado',
  '-2': 'plateado',
};

/** Bandas para 4 bandas (2 dígitos + multiplicador + tolerancia). */
export function resistorBands(ohms: number, tolerance: string): string[] {
  if (ohms <= 0) return ['0', '0', '0', '-1'];
  let exp = Math.floor(Math.log10(ohms)) - 1;
  let mant = Math.round(ohms / Math.pow(10, exp));
  if (mant >= 100) {
    mant = Math.round(mant / 10);
    exp += 1;
  }
  const d1 = Math.floor(mant / 10);
  const d2 = mant % 10;
  const tol = tolerance === '1' ? '1' : '-1';
  return [String(d1), String(d2), String(Math.max(-2, exp)), tol];
}

/** Textura de texto para serigrafías y pantallas. */
export function textTexture(
  lines: string[],
  opts: { w?: number; h?: number; bg?: string; fg?: string; font?: string; align?: CanvasTextAlign } = {},
): THREE.CanvasTexture {
  const w = opts.w ?? 256;
  const h = opts.h ?? 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  drawText(tex, lines, opts);
  return tex;
}

export function drawText(
  tex: THREE.CanvasTexture,
  lines: string[],
  opts: { bg?: string; fg?: string; font?: string; align?: CanvasTextAlign } = {},
): void {
  const canvas = tex.image as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const { width: w, height: h } = canvas;
  ctx.fillStyle = opts.bg ?? '#000000';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = opts.fg ?? '#ffffff';
  ctx.font = opts.font ?? `bold ${Math.floor(h / (lines.length + 0.6))}px "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = opts.align ?? 'center';
  ctx.textBaseline = 'middle';
  const step = h / lines.length;
  lines.forEach((l, i) => ctx.fillText(l, opts.align === 'left' ? 12 : w / 2, step * (i + 0.5)));
  tex.needsUpdate = true;
}

let glowTex: THREE.Texture | null = null;
export function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}
