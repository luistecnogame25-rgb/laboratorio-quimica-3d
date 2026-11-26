/**
 * Elementos de circuito primitivos con su "estampa" MNA.
 * Cada componente de la biblioteca se construye combinando estos elementos.
 *
 * Modelos:
 *  - Resistor: ley de Ohm (lineal, ideal).
 *  - Capacitor: integración de Euler implícito (backward Euler), modelo compañero G = C/Δt.
 *  - Diodo: ecuación de Shockley I = Is·(e^(V/(n·Vt)) − 1) con limitación pnjlim.
 *  - BJT: modelo de Ebers-Moll de transporte (sin efecto Early ni capacitancias).
 *  - Fuente de voltaje con resistencia interna y, opcionalmente, límite de corriente (CV/CC).
 */
import { type Element, MnaSystem, type StepInfo, nodeV, pnjlim, safeExp, vcritOf, VT } from './mna';

abstract class Base implements Element {
  branches = 0;
  branchIndex = -1;
  nonlinear = false;
  constructor(public readonly name: string) {}
  abstract stamp(sys: MnaSystem, x: Float64Array, info: StepInfo): void;
}

export class Resistor extends Base {
  constructor(name: string, public a: number, public c: number, public resistance: number) {
    super(name);
  }
  stamp(sys: MnaSystem): void {
    sys.conductance(this.a, this.c, 1 / Math.max(this.resistance, 1e-6));
  }
  current(x: Float64Array): number {
    return (nodeV(x, this.a) - nodeV(x, this.c)) / Math.max(this.resistance, 1e-6);
  }
}

/** Resistencia cuyo valor se consulta en cada estampa (interruptores, pulsadores). */
export class VariableResistor extends Base {
  constructor(name: string, public a: number, public c: number, public getR: () => number) {
    super(name);
  }
  stamp(sys: MnaSystem): void {
    sys.conductance(this.a, this.c, 1 / Math.max(this.getR(), 1e-6));
  }
  current(x: Float64Array): number {
    return (nodeV(x, this.a) - nodeV(x, this.c)) / Math.max(this.getR(), 1e-6);
  }
}

export class Capacitor extends Base {
  /** Voltaje en el paso anterior (estado). */
  vPrev: number;
  iLast = 0;
  private g = 0;
  constructor(name: string, public a: number, public c: number, public capacitance: number, public v0 = 0) {
    super(name);
    this.vPrev = v0;
  }
  reset(): void {
    this.vPrev = this.v0;
    this.iLast = 0;
  }
  stamp(sys: MnaSystem, _x: Float64Array, info: StepInfo): void {
    if (info.mode === 'dc') {
      sys.conductance(this.a, this.c, 1e-12);
      return;
    }
    this.g = this.capacitance / info.dt;
    sys.conductance(this.a, this.c, this.g);
    // i = g·v − g·vPrev → fuente equivalente −g·vPrev (de a hacia c)
    sys.currentSource(this.a, this.c, -this.g * this.vPrev);
  }
  accept(x: Float64Array, info: StepInfo): void {
    const v = nodeV(x, this.a) - nodeV(x, this.c);
    this.iLast = info.mode === 'dc' ? 0 : this.g * (v - this.vPrev);
    this.vPrev = v;
  }
}

export interface DiodeParams {
  is: number; // corriente de saturación (A)
  n: number; // factor de idealidad
}

export class Diode extends Base {
  nonlinear = true;
  vd = 0;
  id = 0;
  private limited = false;
  private readonly nvt: number;
  private readonly vcrit: number;
  constructor(name: string, public a: number, public c: number, public p: DiodeParams) {
    super(name);
    this.nvt = p.n * VT;
    this.vcrit = vcritOf(p.is, this.nvt);
  }
  reset(): void {
    this.vd = 0;
    this.id = 0;
  }
  stamp(sys: MnaSystem, x: Float64Array, info: StepInfo): void {
    const vraw = nodeV(x, this.a) - nodeV(x, this.c);
    const lim = pnjlim(vraw, this.vd, this.nvt, this.vcrit);
    this.limited = lim.limited;
    const v = lim.v;
    const e = safeExp(v / this.nvt);
    const id = this.p.is * (e - 1);
    const gd = (this.p.is / this.nvt) * e + info.gmin;
    this.vd = v;
    this.id = id;
    sys.conductance(this.a, this.c, gd);
    sys.currentSource(this.a, this.c, id - gd * v);
  }
  converged(): boolean {
    return !this.limited;
  }
  /** Corriente exacta para el voltaje de la solución x. */
  current(x: Float64Array): number {
    const v = nodeV(x, this.a) - nodeV(x, this.c);
    return this.p.is * (safeExp(Math.min(v, this.vd + 0.1) / this.nvt) - 1);
  }
}

export interface BjtParams {
  polarity: 1 | -1; // 1 = NPN, −1 = PNP
  is: number;
  bf: number;
  br: number;
}

export class Bjt extends Base {
  nonlinear = true;
  vbe = 0;
  vbc = 0;
  ic = 0;
  ib = 0;
  private limited = false;
  private readonly vcrit: number;
  constructor(name: string, public c: number, public b: number, public e: number, public p: BjtParams) {
    super(name);
    this.vcrit = vcritOf(p.is, VT);
  }
  reset(): void {
    this.vbe = 0;
    this.vbc = 0;
  }
  stamp(sys: MnaSystem, x: Float64Array, info: StepInfo): void {
    const pol = this.p.polarity;
    const vb = nodeV(x, this.b);
    const vc = nodeV(x, this.c);
    const ve = nodeV(x, this.e);
    const l1 = pnjlim(pol * (vb - ve), this.vbe, VT, this.vcrit);
    const l2 = pnjlim(pol * (vb - vc), this.vbc, VT, this.vcrit);
    this.limited = l1.limited || l2.limited;
    const vbe = l1.v;
    const vbc = l2.v;
    this.vbe = vbe;
    this.vbc = vbc;
    const { is, bf, br } = this.p;
    const ef = safeExp(vbe / VT);
    const er = safeExp(vbc / VT);
    const iF = is * (ef - 1);
    const iR = is * (er - 1);
    const gf = (is / VT) * ef + info.gmin;
    const gr = (is / VT) * er + info.gmin;
    // Corrientes en el dominio "primado" (NPN equivalente)
    const icp = iF - iR * (1 + 1 / br);
    const ibp = iF / bf + iR / br;
    this.ic = pol * icp;
    this.ib = pol * ibp;
    // Derivadas respecto a voltajes de nodo (independientes de la polaridad)
    const dIc_dVb = gf - gr * (1 + 1 / br);
    const dIc_dVe = -gf;
    const dIc_dVc = gr * (1 + 1 / br);
    const dIb_dVb = gf / bf + gr / br;
    const dIb_dVe = -gf / bf;
    const dIb_dVc = -gr / br;
    // Valores linealizados en el punto (vb, vc, ve) "limitados"
    const vbL = 0;
    const veL = -pol * vbe; // elegimos vb = 0 como referencia de linealización
    const vcL = -pol * vbc;
    const ic0 = this.ic;
    const ib0 = this.ib;
    const ieq_c = ic0 - (dIc_dVb * vbL + dIc_dVe * veL + dIc_dVc * vcL);
    const ieq_b = ib0 - (dIb_dVb * vbL + dIb_dVe * veL + dIb_dVc * vcL);
    const { c, b, e } = this;
    // Fila colector (corriente que sale del nodo c hacia el dispositivo = Ic)
    sys.addA(c, b, dIc_dVb);
    sys.addA(c, e, dIc_dVe);
    sys.addA(c, c, dIc_dVc);
    sys.addB(c, -ieq_c);
    // Fila base
    sys.addA(b, b, dIb_dVb);
    sys.addA(b, e, dIb_dVe);
    sys.addA(b, c, dIb_dVc);
    sys.addB(b, -ieq_b);
    // Fila emisor: sale −(Ic + Ib)
    sys.addA(e, b, -(dIc_dVb + dIb_dVb));
    sys.addA(e, e, -(dIc_dVe + dIb_dVe));
    sys.addA(e, c, -(dIc_dVc + dIb_dVc));
    sys.addB(e, ieq_c + ieq_b);
  }
  converged(): boolean {
    return !this.limited;
  }
  region(): 'corte' | 'activa' | 'saturación' | 'inversa' {
    const on = 0.5;
    const be = this.vbe > on;
    const bc = this.vbc > on;
    if (be && bc) return 'saturación';
    if (be) return 'activa';
    if (bc) return 'inversa';
    return 'corte';
  }
}

/** Fuente de voltaje con resistencia interna (baterías). */
export class VoltageSource extends Base {
  branches = 1;
  constructor(name: string, public p: number, public n: number, public emf: number, public rint: number) {
    super(name);
  }
  stamp(sys: MnaSystem): void {
    sys.voltageSource(this.p, this.n, this.branchIndex, this.emf, this.rint);
  }
  /** Corriente entregada por el terminal positivo. */
  current(x: Float64Array): number {
    return x[this.branchIndex];
  }
}

/**
 * Fuente de laboratorio con límite de corriente: modo CV (voltaje constante) mientras
 * I < Ilim; si la carga exige más, pasa a CC (corriente constante = Ilim).
 */
export class LimitedSource extends Base {
  branches = 1;
  nonlinear = true;
  mode: 'CV' | 'CC' = 'CV';
  private switched = false;
  constructor(
    name: string,
    public p: number,
    public n: number,
    public emf: number,
    public ilim: number,
    public rint = 0.005,
  ) {
    super(name);
  }
  reset(): void {
    this.mode = 'CV';
  }
  stamp(sys: MnaSystem, x: Float64Array): void {
    const k = this.branchIndex;
    this.switched = false;
    const i = x[k] ?? 0;
    const vout = nodeV(x, this.p) - nodeV(x, this.n);
    if (this.mode === 'CV' && i > this.ilim * 1.0001) {
      this.mode = 'CC';
      this.switched = true;
    } else if (this.mode === 'CC' && vout > this.emf + 1e-6) {
      this.mode = 'CV';
      this.switched = true;
    }
    if (this.mode === 'CV') {
      sys.voltageSource(this.p, this.n, k, this.emf, this.rint);
    } else {
      sys.addA(this.p, k, -1);
      sys.addA(this.n, k, 1);
      sys.addA(k, k, 1);
      sys.addB(k, this.ilim);
    }
  }
  converged(): boolean {
    return !this.switched;
  }
  current(x: Float64Array): number {
    return x[this.branchIndex];
  }
}
