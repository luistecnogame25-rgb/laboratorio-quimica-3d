/**
 * Transformaciones 2D (plano XZ de la mesa). Coinciden con la rotación Y de Three.js:
 * x' = x·cosθ + z·sinθ ; z' = −x·sinθ + z·cosθ, con θ = rot·90°.
 */
export interface P2 {
  x: number;
  z: number;
}

const COS = [1, 0, -1, 0];
const SIN = [0, 1, 0, -1];

export function normRot(rot: number): number {
  return ((Math.round(rot) % 4) + 4) % 4;
}

export function rotate(p: P2, rot: number): P2 {
  const r = normRot(rot);
  const c = COS[r];
  const s = SIN[r];
  return { x: p.x * c + p.z * s, z: -p.x * s + p.z * c };
}

export function toWorld(local: P2, origin: P2 & { rot: number }): P2 {
  const r = rotate(local, origin.rot);
  return { x: origin.x + r.x, z: origin.z + r.z };
}

export function toLocal(world: P2, origin: P2 & { rot: number }): P2 {
  return rotate({ x: world.x - origin.x, z: world.z - origin.z }, -origin.rot);
}

export function dist(a: P2, b: P2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
