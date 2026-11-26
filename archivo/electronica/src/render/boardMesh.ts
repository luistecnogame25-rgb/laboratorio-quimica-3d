import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { boardLayout, RAILS, ROWS } from '../library/breadboards';
import { PITCH } from '../core/types';
import { std } from './materials';

const PX_PER_MM = 12;

/**
 * Protoboard: cuerpo redondeado + textura de la cara superior dibujada por código
 * (perforaciones, numeración, rieles rojo/azul). Una sola malla para la cara superior
 * mantiene bajo el número de draw calls en móviles.
 */
export function buildBoard(type: string): THREE.Group {
  const L = boardLayout(type);
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new RoundedBoxGeometry(L.width, L.height, L.depth, 3, 1.2),
    std('boardBody', { color: 0xeeeee8, roughness: 0.85 }),
  );
  body.position.y = L.height / 2;
  body.receiveShadow = true;
  body.castShadow = true;
  g.add(body);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(L.width * PX_PER_MM);
  canvas.height = Math.round(L.depth * PX_PER_MM);
  const ctx = canvas.getContext('2d')!;
  const toPx = (x: number, z: number) => [(x + L.width / 2) * PX_PER_MM, (z + L.depth / 2) * PX_PER_MM];
  ctx.fillStyle = '#f1f1eb';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Canal central
  ctx.fillStyle = '#d9d9d2';
  ctx.fillRect(0, canvas.height / 2 - 0.9 * PX_PER_MM, canvas.width, 1.8 * PX_PER_MM);
  ctx.fillStyle = '#c9c9c1';
  ctx.fillRect(0, canvas.height / 2 - 0.25 * PX_PER_MM, canvas.width, 0.5 * PX_PER_MM);
  // Líneas de rieles
  if (L.rails) {
    for (const r of RAILS) {
      const off = r.id.startsWith('T') ? (r.polarity === '-' ? -1 : 1) : r.polarity === '+' ? -1 : 1;
      const [, y] = toPx(0, r.z * PITCH + off * 1.25);
      ctx.strokeStyle = r.polarity === '+' ? '#d8343c' : '#2f62d8';
      ctx.lineWidth = 0.35 * PX_PER_MM;
      ctx.beginPath();
      ctx.moveTo(2 * PX_PER_MM, y);
      ctx.lineTo(canvas.width - 2 * PX_PER_MM, y);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = `bold ${2.6 * PX_PER_MM}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const [, ty] = toPx(0, r.z * PITCH);
      ctx.fillText(r.polarity === '+' ? '+' : '−', 1.6 * PX_PER_MM, ty);
      ctx.fillText(r.polarity === '+' ? '+' : '−', canvas.width - 1.6 * PX_PER_MM, ty);
    }
  }
  // Perforaciones
  const hs = 1.05 * PX_PER_MM;
  for (const h of L.holes) {
    const [x, y] = toPx(h.x, h.z);
    ctx.fillStyle = '#b8b8b0';
    ctx.fillRect(x - hs / 2 - 1.5, y - hs / 2 - 1.5, hs + 3, hs + 3);
    ctx.fillStyle = '#26262a';
    ctx.fillRect(x - hs / 2, y - hs / 2, hs, hs);
    ctx.fillStyle = '#4a4a50';
    ctx.fillRect(x - hs / 2, y - hs / 2, hs, hs * 0.25);
  }
  // Numeración de columnas y letras de filas
  ctx.fillStyle = '#6c6c70';
  ctx.font = `${1.5 * PX_PER_MM}px "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let c = 1; c <= L.columns; c++) {
    if (c !== 1 && c % 5 !== 0) continue;
    const top = L.byId.get(`${c}a`)!;
    const bot = L.byId.get(`${c}j`)!;
    const [x, y1] = toPx(top.x, top.z - 1.9);
    const [, y2] = toPx(bot.x, bot.z + 1.9);
    ctx.fillText(String(c), x, y1);
    ctx.fillText(String(c), x, y2);
  }
  for (const r of ROWS) {
    const h1 = L.byId.get(`1${r}`)!;
    const hn = L.byId.get(`${L.columns}${r}`)!;
    const [x1, y] = toPx(h1.x - 1.8, h1.z);
    const [x2] = toPx(hn.x + 1.8, hn.z);
    ctx.fillText(r, x1, y);
    ctx.fillText(r, x2, y);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const topMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
  topMat.userData.own = true;
  const top = new THREE.Mesh(new THREE.PlaneGeometry(L.width - 0.6, L.depth - 0.6), topMat);
  top.rotation.x = -Math.PI / 2;
  top.position.y = L.height + 0.02;
  top.receiveShadow = true;
  top.userData.boardTop = true;
  g.add(top);
  return g;
}
