/**
 * Sistema de Análisis Nodal Modificado (MNA).
 *
 * Incógnitas: x = [v_1 … v_N, i_b1 … i_bM]  (voltajes de nodo respecto a tierra y
 * corrientes de rama de las fuentes de voltaje). Convención de las filas de nodo:
 *   Σ (corrientes que SALEN del nodo hacia los elementos) = corriente inyectada (b).
 * El nodo de tierra tiene índice −1 y se elimina del sistema.
 */

export interface StepInfo {
  mode: 'dc' | 'tran';
  time: number;
  dt: number;
  /** Conductancia mínima que se añade en paralelo a uniones no lineales. */
  gmin: number;
}

export interface Element {
  readonly name: string;
  /** Número de variables de rama adicionales que necesita (fuentes de voltaje). */
  readonly branches: number;
  /** Índice absoluto de su primera variable de rama (lo asigna el simulador). */
  branchIndex: number;
  readonly nonlinear: boolean;
  /** Escribe su contribución linealizada en el sistema para la estimación x. */
  stamp(sys: MnaSystem, x: Float64Array, info: StepInfo): void;
  /** false si en la última estampa se aplicó limitación de voltaje (aún no converge). */
  converged?(): boolean;
  /** Se llama cuando un paso de tiempo converge (actualiza el estado histórico). */
  accept?(x: Float64Array, info: StepInfo): void;
  /** Reinicia estado histórico (al iniciar una simulación). */
  reset?(): void;
}

export class MnaSystem {
  readonly size: number;
  readonly A: Float64Array;
  readonly b: Float64Array;

  constructor(public readonly nodes: number, public readonly branchCount: number) {
    this.size = nodes + branchCount;
    this.A = new Float64Array(this.size * this.size);
    this.b = new Float64Array(this.size);
  }

  clear(): void {
    this.A.fill(0);
    this.b.fill(0);
  }

  addA(i: number, j: number, v: number): void {
    if (i < 0 || j < 0) return;
    this.A[i * this.size + j] += v;
  }

  addB(i: number, v: number): void {
    if (i < 0) return;
    this.b[i] += v;
  }

  /** Conductancia g entre los nodos a y c. */
  conductance(a: number, c: number, g: number): void {
    this.addA(a, a, g);
    this.addA(c, c, g);
    this.addA(a, c, -g);
    this.addA(c, a, -g);
  }

  /** Fuente de corriente: I sale del nodo `from` y entra al nodo `to` (por fuera de la fuente). */
  currentSource(from: number, to: number, i: number): void {
    this.addB(from, -i);
    this.addB(to, i);
  }

  /**
   * Fuente de voltaje real: v_p − v_n = E − R·i, donde i es la corriente que la fuente
   * entrega por su terminal positivo. k es el índice de la variable de rama.
   */
  voltageSource(p: number, n: number, k: number, emf: number, rint: number): void {
    this.addA(p, k, -1);
    this.addA(n, k, 1);
    this.addA(k, p, 1);
    this.addA(k, n, -1);
    this.addA(k, k, rint);
    this.addB(k, emf);
  }

  /**
   * Resuelve A·x = b por eliminación gaussiana con pivoteo parcial.
   * Devuelve null si la matriz es singular (circuito mal definido).
   */
  solve(): Float64Array | null {
    const n = this.size;
    const M = Float64Array.from(this.A);
    const x = Float64Array.from(this.b);
    for (let col = 0; col < n; col++) {
      let piv = col;
      let best = Math.abs(M[col * n + col]);
      for (let r = col + 1; r < n; r++) {
        const v = Math.abs(M[r * n + col]);
        if (v > best) {
          best = v;
          piv = r;
        }
      }
      if (best < 1e-18) return null;
      if (piv !== col) {
        for (let c = col; c < n; c++) {
          const t = M[col * n + c];
          M[col * n + c] = M[piv * n + c];
          M[piv * n + c] = t;
        }
        const t = x[col];
        x[col] = x[piv];
        x[piv] = t;
      }
      const d = M[col * n + col];
      for (let r = col + 1; r < n; r++) {
        const f = M[r * n + col] / d;
        if (f === 0) continue;
        for (let c = col; c < n; c++) M[r * n + c] -= f * M[col * n + c];
        x[r] -= f * x[col];
      }
    }
    for (let r = n - 1; r >= 0; r--) {
      let s = x[r];
      for (let c = r + 1; c < n; c++) s -= M[r * n + c] * x[c];
      x[r] = s / M[r * n + r];
    }
    for (let i = 0; i < n; i++) if (!Number.isFinite(x[i])) return null;
    return x;
  }
}

/** Voltaje de nodo en la estimación x (tierra = 0). */
export function nodeV(x: Float64Array, node: number): number {
  return node < 0 ? 0 : x[node];
}

export const VT = 0.025852; // kT/q a 27 °C

/**
 * Limitación de voltaje de unión pn (algoritmo pnjlim de SPICE3).
 * Evita que exp() desborde durante Newton-Raphson.
 */
export function pnjlim(vnew: number, vold: number, nvt: number, vcrit: number): { v: number; limited: boolean } {
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * nvt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / nvt;
      return { v: arg > 0 ? vold + nvt * Math.log(arg) : vcrit, limited: true };
    }
    return { v: nvt * Math.log(vnew / nvt), limited: true };
  }
  return { v: vnew, limited: false };
}

export function vcritOf(is: number, nvt: number): number {
  return nvt * Math.log(nvt / (Math.SQRT2 * is));
}

/** exp() con extensión lineal para evitar overflow. */
export function safeExp(x: number): number {
  if (x > 80) return Math.exp(80) * (1 + (x - 80));
  return Math.exp(x);
}
