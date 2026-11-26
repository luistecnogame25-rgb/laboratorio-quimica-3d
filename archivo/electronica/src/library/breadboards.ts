/**
 * Geometría y conexiones internas de las protoboards.
 * Cada perforación pertenece a una "tira" (strip): todas las perforaciones de una tira
 * están unidas eléctricamente por el clip metálico interno.
 *
 *  - Tiras de terminales: cada columna tiene dos tiras de 5 perforaciones (a–e y f–j),
 *    separadas por el canal central (apto para circuitos DIP).
 *  - Rieles de alimentación: cada riel es una tira continua a lo largo de la placa.
 */
import { PITCH } from '../core/types';

export interface Hole {
  id: string;
  x: number; // local, mm
  z: number;
  strip: string;
  label: string;
}

export interface BoardLayout {
  type: string;
  columns: number;
  rails: boolean;
  width: number;
  depth: number;
  height: number;
  holes: Hole[];
  byId: Map<string, Hole>;
  /** Búsqueda rápida por coordenadas en medios pasos. */
  grid: Map<string, Hole>;
}

export const ROWS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
/** z de cada fila en pasos (canal central en z = 0). */
const ROW_Z = [-5.5, -4.5, -3.5, -2.5, -1.5, 1.5, 2.5, 3.5, 4.5, 5.5];

export const RAILS = [
  { id: 'T-', z: -9.5, label: 'riel superior −', polarity: '-' },
  { id: 'T+', z: -8.5, label: 'riel superior +', polarity: '+' },
  { id: 'B+', z: 8.5, label: 'riel inferior +', polarity: '+' },
  { id: 'B-', z: 9.5, label: 'riel inferior −', polarity: '-' },
] as const;

export interface BoardSpec {
  columns: number;
  rails: boolean;
  railHoles: number;
  name: string;
  points: number;
}

export const BOARD_SPECS: Record<string, BoardSpec> = {
  'breadboard-830': { columns: 63, rails: true, railHoles: 50, name: 'Protoboard 830 puntos', points: 830 },
  'breadboard-400': { columns: 30, rails: true, railHoles: 25, name: 'Protoboard media (400 puntos)', points: 400 },
  'breadboard-170': { columns: 17, rails: false, railHoles: 0, name: 'Protoboard mini (170 puntos)', points: 170 },
};

const cache = new Map<string, BoardLayout>();

export function gridKey(x: number, z: number): string {
  return `${Math.round((x / PITCH) * 2)},${Math.round((z / PITCH) * 2)}`;
}

export function boardLayout(type: string): BoardLayout {
  const hit = cache.get(type);
  if (hit) return hit;
  const spec = BOARD_SPECS[type];
  if (!spec) throw new Error(`Protoboard desconocida: ${type}`);
  const holes: Hole[] = [];
  const half = (spec.columns - 1) / 2;
  for (let c = 0; c < spec.columns; c++) {
    const x = (c - half) * PITCH;
    for (let r = 0; r < ROWS.length; r++) {
      const strip = `col${c + 1}${r < 5 ? 'top' : 'bot'}`;
      holes.push({
        id: `${c + 1}${ROWS[r]}`,
        x,
        z: ROW_Z[r] * PITCH,
        strip,
        label: `columna ${c + 1}, fila ${ROWS[r]}`,
      });
    }
  }
  if (spec.rails) {
    // Grupos de 5 con un hueco de un paso entre grupos.
    const span = spec.railHoles + Math.floor((spec.railHoles - 1) / 5);
    const start = Math.round((spec.columns - span) / 2);
    for (const rail of RAILS) {
      for (let k = 0; k < spec.railHoles; k++) {
        const col = start + k + Math.floor(k / 5);
        holes.push({
          id: `${rail.id}${k + 1}`,
          x: (col - half) * PITCH,
          z: rail.z * PITCH,
          strip: `rail${rail.id}`,
          label: `${rail.label}, posición ${k + 1}`,
        });
      }
    }
  }
  const width = spec.columns * PITCH + 6;
  const depth = spec.rails ? 21.5 * PITCH : 14 * PITCH;
  const layout: BoardLayout = {
    type,
    columns: spec.columns,
    rails: spec.rails,
    width,
    depth,
    height: 8.5,
    holes,
    byId: new Map(holes.map((h) => [h.id, h])),
    grid: new Map(holes.map((h) => [gridKey(h.x, h.z), h])),
  };
  cache.set(type, layout);
  return layout;
}

export function isBoardType(type: string): boolean {
  return type in BOARD_SPECS;
}

/** Perforación más cercana a un punto local (tolerancia en mm). */
export function holeAt(layout: BoardLayout, x: number, z: number, tol = 0.9): Hole | null {
  const h = layout.grid.get(gridKey(x, z));
  if (!h) return null;
  return Math.hypot(h.x - x, h.z - z) <= tol ? h : null;
}
