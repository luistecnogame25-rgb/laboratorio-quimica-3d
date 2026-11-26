import * as THREE from 'three';

export const WIRE_COLORS: { value: string; label: string }[] = [
  { value: 'auto', label: 'Automático (rojo +, negro GND, azul señal)' },
  { value: '#e02b2b', label: 'Rojo' },
  { value: '#1b1b1f', label: 'Negro' },
  { value: '#2f6cf6', label: 'Azul' },
  { value: '#2fbf5a', label: 'Verde' },
  { value: '#f2c230', label: 'Amarillo' },
  { value: '#f08a24', label: 'Naranja' },
  { value: '#f3f3f3', label: 'Blanco' },
  { value: '#9b59d6', label: 'Violeta' },
];

export const AUTO_COLORS = { power: '#e02b2b', gnd: '#1b1b1f', signal: '#2f6cf6' };

/**
 * Cable flexible: tramo vertical en cada extremo (entra en la perforación o borne) y un arco
 * Bézier cuya altura crece con la distancia, de modo que se adapta a la posición de los extremos.
 */
export function wireCurve(a: THREE.Vector3, b: THREE.Vector3, aVertical = true, bVertical = true): THREE.CurvePath<THREE.Vector3> {
  const d = a.distanceTo(b);
  const lift = 4 + Math.min(40, d * 0.22);
  const a1 = aVertical ? a.clone().add(new THREE.Vector3(0, 3, 0)) : a.clone();
  const b1 = bVertical ? b.clone().add(new THREE.Vector3(0, 3, 0)) : b.clone();
  const path = new THREE.CurvePath<THREE.Vector3>();
  if (aVertical) path.add(new THREE.LineCurve3(a.clone().add(new THREE.Vector3(0, -2, 0)), a1));
  const c1 = a1.clone().add(new THREE.Vector3(0, lift, 0));
  const c2 = b1.clone().add(new THREE.Vector3(0, lift, 0));
  path.add(new THREE.CubicBezierCurve3(a1, c1, c2, b1));
  if (bVertical) path.add(new THREE.LineCurve3(b1, b.clone().add(new THREE.Vector3(0, -2, 0))));
  return path;
}

const insulation = new Map<string, THREE.MeshStandardMaterial>();
function insulationMat(color: string): THREE.MeshStandardMaterial {
  let m = insulation.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.05 });
    insulation.set(color, m);
  }
  return m;
}

export function buildWire(a: THREE.Vector3, b: THREE.Vector3, color: string, aVertical: boolean, bVertical: boolean): THREE.Mesh {
  const curve = wireCurve(a, b, aVertical, bVertical);
  const geo = new THREE.TubeGeometry(curve, Math.max(24, Math.round(a.distanceTo(b) / 2)), 0.55, 8, false);
  const mesh = new THREE.Mesh(geo, insulationMat(color));
  mesh.castShadow = true;
  return mesh;
}

/** Material de resaltado (selección / cortocircuito). */
export function highlightMaterial(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.4 });
}
