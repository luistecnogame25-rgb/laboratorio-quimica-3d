/**
 * Representaciones 3D del átomo. Cada una declara qué es y qué NO es:
 *  - Bohr: modelo didáctico de niveles (no son órbitas reales; las distancias no están a escala).
 *  - Núcleo: Z protones + N neutrones empaquetados en una esfera de radio R ≈ r₀·A^(1/3)
 *    (fórmula empírica, r₀ ≈ 1,2 fm). La disposición interna es ilustrativa.
 *  - Orbital: superficie polar |Y_lm(θ,φ)| (parte angular hidrogenoide), coloreada por signo.
 */
import * as THREE from 'three';
import type { ChemElement } from '../chem/elements';
import { realSphericalHarmonic } from '../chem/orbitals';

export const PROTON_COLOR = 0xff6a5c;
export const NEUTRON_COLOR = 0xbfc4cc;
export const ELECTRON_COLOR = 0x5ac8fa;

/** Generador pseudoaleatorio determinista (misma disposición en cada visualización). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Posiciones de A nucleones empaquetados en una esfera (radio de nucleón = 1). */
export function packNucleons(count: number, seed: number): THREE.Vector3[] {
  // Red cúbica centrada en las caras (empaquetado compacto) con distancia entre vecinos 2,
  // recortada a los `count` puntos más cercanos al centro, con un leve desplazamiento aleatorio.
  const rand = rng(seed);
  const n = Math.ceil(Math.cbrt(count)) + 2;
  const a = 2 * Math.SQRT2; // arista de la celda para vecinos a distancia 2
  const pts: THREE.Vector3[] = [];
  const basis = [
    [0, 0, 0],
    [0.5, 0.5, 0],
    [0.5, 0, 0.5],
    [0, 0.5, 0.5],
  ];
  const off = new THREE.Vector3((rand() - 0.5) * 0.6, (rand() - 0.5) * 0.6, (rand() - 0.5) * 0.6);
  for (let i = -n; i <= n; i++)
    for (let j = -n; j <= n; j++)
      for (let k = -n; k <= n; k++)
        for (const b of basis) pts.push(new THREE.Vector3((i + b[0]) * a, (j + b[1]) * a, (k + b[2]) * a).add(off));
  pts.sort((p, q) => p.lengthSq() - q.lengthSq());
  return pts.slice(0, count).map((p) => p.multiplyScalar(0.5).add(new THREE.Vector3((rand() - 0.5) * 0.08, (rand() - 0.5) * 0.08, (rand() - 0.5) * 0.08)));
}

export function buildNucleus(protons: number, neutrons: number, radius: number): THREE.Group {
  const g = new THREE.Group();
  const A = protons + neutrons;
  const pts = packNucleons(A, protons * 131 + neutrons);
  const R = Math.max(...pts.map((p) => p.length())) + 0.5;
  const s = radius / R;
  const geo = new THREE.SphereGeometry(s * 0.5, 18, 14);
  const rand = rng(protons * 7 + 3);
  const kinds: number[] = pts.map((_, i) => (i < protons ? 1 : 0));
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  const mk = (color: number, n: number) => {
    const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.05 }), Math.max(1, n));
    m.count = n;
    m.castShadow = true;
    return m;
  };
  const pm = mk(PROTON_COLOR, protons);
  const nm = mk(NEUTRON_COLOR, neutrons);
  let ip = 0;
  let iN = 0;
  const mat = new THREE.Matrix4();
  pts.forEach((p, i) => {
    mat.makeTranslation(p.x * s, p.y * s, p.z * s);
    if (kinds[i]) pm.setMatrixAt(ip++, mat);
    else nm.setMatrixAt(iN++, mat);
  });
  pm.userData.part = 'protons';
  nm.userData.part = 'neutrons';
  g.add(pm, nm);
  return g;
}

/* ----------------------------- Bohr ----------------------------- */

export interface BohrModel {
  root: THREE.Group;
  shells: THREE.Group[];
  nucleus: THREE.Group;
  tick(dt: number): void;
  highlight(n: number | null): void;
}

export function buildBohr(e: ChemElement, neutrons: number): BohrModel {
  const root = new THREE.Group();
  const nucleusRadius = 0.55 + Math.cbrt(e.z + neutrons) * 0.09;
  const nucleus = buildNucleus(e.z, neutrons, nucleusRadius);
  root.add(nucleus);
  const shells: THREE.Group[] = [];
  const eGeo = new THREE.SphereGeometry(0.11, 16, 12);
  const ringMat = () => new THREE.MeshBasicMaterial({ color: 0x9aa3b2, transparent: true, opacity: 0.35 });
  e.shells.forEach((count, i) => {
    const n = i + 1;
    const r = nucleusRadius + 0.9 + i * 0.95;
    const shell = new THREE.Group();
    shell.userData = { n, count, r };
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 6, 128), ringMat());
    ring.rotation.x = Math.PI / 2;
    ring.userData.part = 'ring';
    shell.add(ring);
    const em = new THREE.InstancedMesh(eGeo, new THREE.MeshStandardMaterial({ color: ELECTRON_COLOR, emissive: ELECTRON_COLOR, emissiveIntensity: 0.6, roughness: 0.3 }), Math.max(1, count));
    em.count = count;
    const m = new THREE.Matrix4();
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2;
      m.makeTranslation(Math.cos(a) * r, 0, Math.sin(a) * r);
      em.setMatrixAt(k, m);
    }
    em.userData.part = 'electrons';
    shell.add(em);
    // Inclinación leve alterna para dar profundidad (decorativa, declarada en la interfaz).
    shell.rotation.z = (i % 2 ? 1 : -1) * 0.12 * Math.min(i, 3);
    shells.push(shell);
    root.add(shell);
  });
  return {
    root,
    shells,
    nucleus,
    tick(dt) {
      shells.forEach((s, i) => (s.children[1].rotation.y += dt * (0.6 / (i + 1))));
    },
    highlight(n) {
      shells.forEach((s) => {
        const on = n === null || s.userData.n === n;
        const ring = s.children[0] as THREE.Mesh;
        const mat = ring.material as THREE.MeshBasicMaterial;
        mat.opacity = n === null ? 0.35 : on ? 0.95 : 0.1;
        mat.color.setHex(on && n !== null ? 0x5ac8fa : 0x9aa3b2);
        const em = s.children[1] as THREE.InstancedMesh;
        (em.material as THREE.MeshStandardMaterial).opacity = on ? 1 : 0.2;
        (em.material as THREE.MeshStandardMaterial).transparent = !on;
      });
    },
  };
}

/* ----------------------------- Orbitales ----------------------------- */

/**
 * Superficie polar r(θ,φ) = |Y_lm| escalada para que su extensión máxima sea `size`.
 * Los colores indican el signo de la función (fase), no la carga.
 */
export function buildOrbital(l: number, m: number, size: number): THREE.Mesh {
  const segT = 96;
  const segP = 128;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const cPos = new THREE.Color(0x5ac8fa);
  const cNeg = new THREE.Color(0xff9f0a);
  let max = 0;
  const vals: number[] = [];
  for (let i = 0; i <= segT; i++) {
    const th = (i / segT) * Math.PI;
    for (let j = 0; j <= segP; j++) {
      const ph = (j / segP) * Math.PI * 2;
      const y = realSphericalHarmonic(l, m, th, ph);
      vals.push(y);
      max = Math.max(max, Math.abs(y));
    }
  }
  let k = 0;
  for (let i = 0; i <= segT; i++) {
    const th = (i / segT) * Math.PI;
    for (let j = 0; j <= segP; j++) {
      const ph = (j / segP) * Math.PI * 2;
      const y = vals[k++];
      const r = (Math.abs(y) / max) * size;
      // Convención química: z vertical → eje Y de la escena.
      const x = r * Math.sin(th) * Math.cos(ph);
      const zc = r * Math.sin(th) * Math.sin(ph);
      const yv = r * Math.cos(th);
      pos.push(x, yv, -zc);
      const c = y >= 0 ? cPos : cNeg;
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < segT; i++)
    for (let j = 0; j < segP; j++) {
      const a = i * (segP + 1) + j;
      const b = a + segP + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.25, metalness: 0, transparent: true, opacity: 0.82, side: THREE.DoubleSide, clearcoat: 0.6 });
  return new THREE.Mesh(geo, mat);
}

/** Ejes x, y, z (convención química: z vertical) con etiquetas. */
export function buildAxes(len: number): THREE.Group {
  const g = new THREE.Group();
  const mk = (dir: THREE.Vector3, color: number) => {
    const geo = new THREE.BufferGeometry().setFromPoints([dir.clone().multiplyScalar(-len), dir.clone().multiplyScalar(len)]);
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 }));
  };
  g.add(mk(new THREE.Vector3(1, 0, 0), 0xff6a5c), mk(new THREE.Vector3(0, 0, -1), 0x30d158), mk(new THREE.Vector3(0, 1, 0), 0x5ac8fa));
  return g;
}

/* ----------------------------- Átomos del laboratorio ----------------------------- */

export const DEFAULT_RADIUS_PM = 200;

/** Radio visual (Å): 0,22 × radio de la fuente + 0,06 Å (convención de bolas y varillas, igual que la biblioteca). */
export function visualRadius(e: ChemElement, scale: number): number {
  return (0.22 * ((e.atomicRadius.value ?? DEFAULT_RADIUS_PM) / 100) + 0.06) * scale;
}

function luminance(hex: string) {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

const labelCache = new Map<string, THREE.Texture>();
function labelTexture(symbol: string, dark: boolean) {
  const key = symbol + dark;
  const hit = labelCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.font = '600 64px -apple-system, "SF Pro Display", "Segoe UI", Roboto, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = dark ? '#111' : '#fff';
  g.fillText(symbol, 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  labelCache.set(key, t);
  return t;
}

export function buildLabAtom(e: ChemElement, scale: number, showLabel: boolean): THREE.Group {
  const g = new THREE.Group();
  const r = visualRadius(e, scale);
  const color = e.cpk ?? '#b4b8c0';
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(r, 48, 32),
    new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
  );
  sphere.castShadow = true;
  sphere.userData.atomBody = true;
  g.add(sphere);
  if (showLabel) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(e.symbol, luminance(color) > 0.6), depthTest: false, transparent: true }));
    sp.scale.setScalar(Math.max(0.5, r * 1.1));
    sp.renderOrder = 10;
    sp.userData.label = true;
    g.add(sp);
  }
  return g;
}

export function disposeObject(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh || (c as THREE.Sprite).isSprite) {
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) (mat as THREE.Material).dispose();
    }
  });
}
