/**
 * Miniaturas 3D de la biblioteca: se renderizan los MISMOS modelos que en el laboratorio
 * con un renderizador pequeño fuera de pantalla, de forma diferida y con caché.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { getDef, withDefaults } from '../core/registry';
import type { Params } from '../core/types';
import { isBoardType } from '../library/breadboards';
import { buildBoard } from './boardMesh';
import { buildComponentVisual } from './models';

const W = 240;
const H = 180;
const cache = new Map<string, string>();
const waiting = new Map<string, ((url: string) => void)[]>();
const queue: { key: string; type: string; params: Params }[] = [];
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let busy = false;

function init() {
  const canvas = document.createElement('canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.7;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x30343a, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(60, 120, 80);
  scene.add(key);
  camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 5000);
}

function renderOne(type: string, params: Params): string {
  if (!renderer) init();
  const obj = isBoardType(type)
    ? buildBoard(type)
    : (() => {
        const def = getDef(type);
        const p = withDefaults(def, params);
        const v = buildComponentVisual(type, p, def.terminals(p));
        // Vista "encendida" para LEDs y fuentes: más reconocible.
        v.applyVisual(type === 'led' ? { brightness: 0.35 } : null);
        return v.root;
      })();
  obj.traverse((o) => {
    if (o.userData.term) o.visible = false;
    if ((o as THREE.Sprite).isSprite) o.visible = false;
  });
  scene.add(obj);
  const box = new THREE.Box3();
  obj.updateMatrixWorld(true);
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.visible) box.expandByObject(o);
  });
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).length();
  const dir = new THREE.Vector3(0.75, 0.75, 1).normalize();
  const dist = (size / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 0.92;
  camera.position.copy(center).addScaledVector(dir, dist);
  camera.near = dist / 50;
  camera.far = dist * 10;
  camera.updateProjectionMatrix();
  camera.lookAt(center);
  renderer!.render(scene, camera);
  const url = renderer!.domElement.toDataURL('image/png');
  scene.remove(obj);
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      const mat = m.material as THREE.Material & { map?: THREE.Texture };
      if (mat.userData?.own) {
        mat.map?.dispose();
        mat.dispose();
      }
    }
  });
  return url;
}

function pump() {
  if (busy) return;
  const job = queue.shift();
  if (!job) return;
  busy = true;
  const run = () => {
    let url = '';
    try {
      url = renderOne(job.type, job.params);
    } catch (e) {
      console.warn('Miniatura fallida', job.type, e);
    }
    cache.set(job.key, url);
    for (const cb of waiting.get(job.key) ?? []) cb(url);
    waiting.delete(job.key);
    busy = false;
    pump();
  };
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (ric) ric(run);
  else setTimeout(run, 16);
}

/** Devuelve (asíncronamente) una imagen PNG de la miniatura. */
export function thumbnail(type: string, params: Params = {}, cb: (url: string) => void): void {
  const key = type + JSON.stringify(params);
  const hit = cache.get(key);
  if (hit !== undefined) return cb(hit);
  const list = waiting.get(key);
  if (list) {
    list.push(cb);
    return;
  }
  waiting.set(key, [cb]);
  queue.push({ key, type, params });
  pump();
}
