/**
 * Orquesta la simulación en tiempo real: ejecuta pasos transitorios por cuadro según la
 * escala de tiempo, reconstruye el circuito cuando el usuario lo edita (conservando la
 * carga de los capacitores) y produce lecturas para la interfaz y la escena.
 */
import type { ProjectStore } from '../core/store';
import type { InstanceReport, WireEnd } from '../core/types';
import { createRuntime, Simulator, type CircuitIssue } from '../electrical/simulator';

export type SimState = 'stopped' | 'running' | 'paused' | 'dc';

export interface ProbeSample {
  t: number;
  v: number;
}

export class SimulationController {
  state: SimState = 'stopped';
  sim: Simulator | null = null;
  runtime = createRuntime();
  reports: Map<string, InstanceReport> | null = null;
  issues: CircuitIssue[] = [];
  error: string | null = null;
  /** Velocidad real alcanzada (tiempo simulado / tiempo real). */
  achievedSpeed = 1;
  readonly recorder: ProbeSample[] = [];
  readonly recorderMax = 1200;
  probeEnds: { red?: WireEnd; black?: WireEnd } = {};

  onUpdate: () => void = () => {};
  private damagedCount = 0;
  private uiTimer = 0;

  constructor(private readonly store: ProjectStore) {
    store.subscribe((_p, reason) => {
      if (reason === 'preview') return; // arrastre en curso: se reconstruye al soltar
      if (this.state === 'running' || this.state === 'paused') this.rebuild(true);
      else if (this.state === 'dc') this.runDC();
      else this.validateOnly();
    });
    this.validateOnly();
  }

  get timeScale() {
    return this.store.project.simulation.timeScale;
  }
  get dt() {
    return this.store.project.simulation.dt;
  }
  get time() {
    return this.sim?.time ?? 0;
  }

  /** Valida el circuito sin simular (para mostrar errores de conexión en todo momento). */
  validateOnly() {
    try {
      this.issues = new Simulator(this.store.project, createRuntime()).issues;
      this.error = null;
    } catch (e) {
      this.error = (e as Error).message;
    }
    this.onUpdate();
  }

  start() {
    if (this.state === 'paused') {
      this.state = 'running';
      this.onUpdate();
      return;
    }
    this.runtime = createRuntime();
    this.recorder.length = 0;
    this.rebuild(false);
    this.state = this.error ? 'stopped' : 'running';
    this.onUpdate();
  }

  pause() {
    if (this.state === 'running') this.state = 'paused';
    this.onUpdate();
  }

  stop() {
    this.state = 'stopped';
    this.sim = null;
    this.reports = null;
    this.runtime = createRuntime();
    this.error = null;
    this.validateOnly();
  }

  /** Punto de operación DC (estado estacionario, capacitores abiertos). */
  runDC() {
    try {
      this.runtime.capVoltages.clear();
      this.sim = new Simulator(this.store.project, this.runtime);
      this.issues = this.sim.issues;
      const ok = this.sim.dcOperatingPoint();
      this.reports = this.sim.reports();
      this.error = ok ? null : 'El análisis DC no convergió. Revisa conexiones (nodos flotantes o cortocircuitos).';
      this.state = 'dc';
    } catch (e) {
      this.error = (e as Error).message;
    }
    this.onUpdate();
  }

  private rebuild(keepTime: boolean) {
    try {
      const oldTime = this.sim?.time ?? 0;
      this.sim?.saveState();
      this.sim = new Simulator(this.store.project, this.runtime);
      this.sim.reset();
      if (keepTime) this.sim.time = oldTime;
      this.issues = this.sim.issues;
      this.error = null;
      this.damagedCount = this.runtime.damaged.size;
      // Primer paso para tener lecturas inmediatas
      this.sim.step(this.dt);
      this.reports = this.sim.reports();
    } catch (e) {
      this.error = (e as Error).message;
      this.state = 'stopped';
    }
    this.onUpdate();
  }

  frame(realDt: number) {
    if (this.state !== 'running' || !this.sim) return;
    const target = realDt * this.timeScale;
    const maxSteps = 400;
    let steps = Math.ceil(target / this.dt - 1e-9);
    let h = this.dt;
    if (steps > maxSteps) {
      steps = maxSteps;
      h = this.dt; // se limita la velocidad en lugar de perder precisión
    }
    const t0 = this.sim.time;
    for (let i = 0; i < steps; i++) {
      if (!this.sim.step(h)) {
        this.error = `La simulación no convergió en t = ${this.sim.time.toExponential(3)} s. Se pausó.`;
        this.state = 'paused';
        break;
      }
    }
    this.achievedSpeed = realDt > 0 ? (this.sim.time - t0) / realDt : 1;
    this.reports = this.sim.reports();
    if (this.runtime.damaged.size !== this.damagedCount) this.rebuild(true);
    // Registro de la sonda
    const v = this.probeVoltage();
    if (v !== null) {
      this.recorder.push({ t: this.sim.time, v });
      if (this.recorder.length > this.recorderMax) this.recorder.splice(0, this.recorder.length - this.recorderMax);
    }
    this.uiTimer += realDt;
    if (this.uiTimer > 0.1) {
      this.uiTimer = 0;
      this.onUpdate();
    }
  }

  /** Diferencia de potencial entre la punta roja y la negra (o respecto a GND si no hay negra). */
  probeVoltage(): number | null {
    if (!this.sim || !this.probeEnds.red) return null;
    const vr = this.sim.endVoltage(this.probeEnds.red);
    if (vr === null) return null;
    if (!this.probeEnds.black) return vr;
    const vb = this.sim.endVoltage(this.probeEnds.black);
    return vb === null ? null : vr - vb;
  }

  setProbes(red?: WireEnd, black?: WireEnd) {
    const changed = JSON.stringify([red, black]) !== JSON.stringify([this.probeEnds.red, this.probeEnds.black]);
    this.probeEnds = { red, black };
    if (changed) this.recorder.length = 0;
  }

  isActive() {
    return this.state !== 'stopped';
  }
}
