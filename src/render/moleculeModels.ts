/**
 * Modelos 3D de estructuras documentadas: bolas y varillas, espacio lleno y redes cristalinas.
 * Las coordenadas provienen sin modificar de la fuente (PubChem o COD).
 */
import * as THREE from 'three';
import { element } from '../chem/elements';
import { cellMatrix, crystalBlock, hasGeometry, type StructureRecord } from '../chem/structures';

export type MolMode = 'bolas' | 'espacio' | 'estructural';

const sphereGeo = new Map<string, THREE.SphereGeometry>();
function sphere(r: number, detail: number) {
  const k = `${r.toFixed(3)}|${detail}`;
  let g = sphereGeo.get(k);
  if (!g) {
    g = new THREE.SphereGeometry(r, detail * 2, detail);
    g.userData.shared = true;
    sphereGeo.set(k, g);
  }
  return g;
}

const matCache = new Map<string, THREE.MeshPhysicalMaterial>();
function atomMat(color: string) {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.3 });
    m.userData.shared = true;
    matCache.set(color, m);
  }
  return m;
}
const bondMat = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.35, metalness: 0.1 });
bondMat.userData.shared = true;

export function atomRadius(z: number, mode: MolMode): number {
  const r = (element(z).atomicRadius.value ?? 200) / 100;
  return mode === 'espacio' ? r : 0.22 * r + 0.06;
}

/** Calidad (segmentos) según el número de átomos: nivel de detalle para móviles. */
export function detailFor(count: number) {
  return count > 300 ? 8 : count > 80 ? 12 : 20;
}

function cylinder(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) {
  const d = b.clone().sub(a);
  const geo = new THREE.CylinderGeometry(r, r, d.length(), 14, 1);
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.castShadow = true;
  return m;
}

/** Vector perpendicular al enlace, contenido (si es posible) en el plano de un vecino: para dibujar enlaces múltiples. */
function bondPlaneOffset(rec: StructureRecord, a: number, b: number, pos: THREE.Vector3[]): THREE.Vector3 {
  const axis = pos[b].clone().sub(pos[a]).normalize();
  const nb = rec.bonds.flatMap(([x, y]) => (x === a && y !== b ? [y] : y === a && x !== b ? [x] : x === b && y !== a ? [y] : y === b && x !== a ? [x] : []));
  let ref = nb.length ? pos[nb[0]].clone().sub(pos[a]) : new THREE.Vector3(0, 1, 0);
  if (Math.abs(ref.clone().normalize().dot(axis)) > 0.95) ref = new THREE.Vector3(1, 0, 0);
  return ref.sub(axis.clone().multiplyScalar(ref.dot(axis))).normalize();
}

export interface BuiltStructure {
  group: THREE.Group;
  /** Posiciones de los átomos en escena (para etiquetas). */
  atoms: { z: number; p: THREE.Vector3 }[];
  bonds: { a: number; b: number; order: number }[];
}

/** Molécula (convención química: se usa el sistema de coordenadas de la fuente). */
export function buildMolecule(rec: StructureRecord, mode: MolMode): BuiltStructure {
  const g = new THREE.Group();
  if (!hasGeometry(rec)) return { group: g, atoms: [], bonds: [] };
  const pos = rec.atoms.map((a) => new THREE.Vector3(...a.p!));
  const c = pos.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / pos.length);
  pos.forEach((p) => p.sub(c));
  const detail = detailFor(pos.length);
  rec.atoms.forEach((a, i) => {
    const m = new THREE.Mesh(sphere(atomRadius(a.z, mode), detail), atomMat(element(a.z).cpk ?? '#b4b8c0'));
    m.position.copy(pos[i]);
    m.castShadow = true;
    m.userData.atomIndex = i;
    g.add(m);
  });
  if (mode !== 'espacio') {
    for (const [a, b, order] of rec.bonds) {
      const r = order > 1 ? 0.055 : 0.085;
      const off = order > 1 ? bondPlaneOffset(rec, a, b, pos).multiplyScalar(0.13) : new THREE.Vector3();
      const shifts = order === 2 ? [-0.5, 0.5] : order === 3 ? [-1, 0, 1] : [0];
      for (const k of shifts) g.add(cylinder(pos[a].clone().addScaledVector(off, k), pos[b].clone().addScaledVector(off, k), r, bondMat));
    }
  }
  return { group: g, atoms: rec.atoms.map((a, i) => ({ z: a.z, p: pos[i] })), bonds: rec.bonds.map(([a, b, order]) => ({ a, b, order })) };
}

/** Bloque cristalino n×n×n con aristas de la celda unidad y contactos a vecinos más próximos. */
export function buildCrystal(rec: StructureRecord, n: number, mode: MolMode, contacts: boolean): BuiltStructure {
  const g = new THREE.Group();
  const atoms = crystalBlock(rec, n).map((a) => ({ z: a.z, p: new THREE.Vector3(...a.p) }));
  const m = cellMatrix(rec.cell!);
  const center = new THREE.Vector3(...m[0]).add(new THREE.Vector3(...m[1])).add(new THREE.Vector3(...m[2])).multiplyScalar(n / 2);
  atoms.forEach((a) => a.p.sub(center));
  const detail = detailFor(atoms.length);
  const scale = mode === 'espacio' ? 0.75 : 0.32;
  // Instanciado por elemento (rendimiento en móviles)
  for (const z of [...new Set(atoms.map((a) => a.z))]) {
    const list = atoms.filter((a) => a.z === z);
    const r = ((element(z).atomicRadius.value ?? 200) / 100) * scale;
    const im = new THREE.InstancedMesh(sphere(r, detail), atomMat(element(z).cpk ?? '#b4b8c0'), list.length);
    const mx = new THREE.Matrix4();
    list.forEach((a, i) => im.setMatrixAt(i, mx.makeTranslation(a.p.x, a.p.y, a.p.z)));
    im.castShadow = true;
    g.add(im);
  }
  // Aristas de la celda unidad
  const o = center.clone().negate();
  const [A, B, C] = m.map((v) => new THREE.Vector3(...v));
  const corners = [0, 1].flatMap((i) => [0, 1].flatMap((j) => [0, 1].map((k) => o.clone().addScaledVector(A, i).addScaledVector(B, j).addScaledVector(C, k))));
  const edges = [[0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]];
  const pts = edges.flatMap(([x, y]) => [corners[x], corners[y]]);
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffd60a, transparent: true, opacity: 0.8 })));
  if (contacts) {
    // Contactos a la distancia mínima entre especies distintas (o iguales en metales)
    let dmin = Infinity;
    for (let i = 0; i < atoms.length; i++)
      for (let j = i + 1; j < atoms.length; j++) {
        if (rec.kind !== 'metalico' && atoms[i].z === atoms[j].z) continue;
        dmin = Math.min(dmin, atoms[i].p.distanceTo(atoms[j].p));
      }
    const seg: THREE.Vector3[] = [];
    for (let i = 0; i < atoms.length; i++)
      for (let j = i + 1; j < atoms.length; j++) {
        if (rec.kind !== 'metalico' && atoms[i].z === atoms[j].z) continue;
        if (atoms[i].p.distanceTo(atoms[j].p) < dmin * 1.05) seg.push(atoms[i].p, atoms[j].p);
      }
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(seg), new THREE.LineBasicMaterial({ color: 0x9aa3b2, transparent: true, opacity: 0.45 })));
  }
  return { group: g, atoms, bonds: [] };
}

/** Libera geometrías y materiales propios (los compartidos en caché se conservan). */
export function disposeStructure(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.geometry) return;
    if (!m.geometry.userData.shared) m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) if (mat && !(mat as THREE.Material).userData.shared) (mat as THREE.Material).dispose();
  });
}
