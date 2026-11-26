import type { Experiment as Project } from './types';
import { cloneExperiment as cloneProject, pruneMeasurements as pruneWires } from './project';

type Listener = (p: Project, reason: string) => void;

/**
 * Contenedor del proyecto activo con historial deshacer/rehacer basado en instantáneas.
 * Todas las modificaciones pasan por mutate() para que sean reversibles.
 */
export class ProjectStore {
  private history: string[] = [];
  private future: string[] = [];
  private listeners = new Set<Listener>();
  private readonly limit = 120;

  constructor(public project: Project) {}

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(reason: string) {
    for (const l of this.listeners) l(this.project, reason);
  }

  /** Aplica un cambio registrándolo en el historial. */
  mutate(label: string, fn: (p: Project) => void): void {
    const before = JSON.stringify(this.project);
    fn(this.project);
    pruneWires(this.project);
    if (JSON.stringify(this.project) === before) return;
    this.history.push(before);
    if (this.history.length > this.limit) this.history.shift();
    this.future = [];
    this.project.modified = new Date().toISOString();
    this.emit(label);
  }

  /** Cambio sin historial (p. ej. arrastre en curso). Llamar a commitFrom() al terminar. */
  mutateSilently(fn: (p: Project) => void): void {
    fn(this.project);
    this.emit('preview');
  }

  /** Registra en el historial un estado previo capturado antes de cambios silenciosos. */
  commitFrom(snapshot: string, label: string): void {
    if (snapshot === JSON.stringify(this.project)) return;
    this.history.push(snapshot);
    this.future = [];
    this.project.modified = new Date().toISOString();
    this.emit(label);
  }

  snapshot(): string {
    return JSON.stringify(this.project);
  }

  canUndo() {
    return this.history.length > 0;
  }
  canRedo() {
    return this.future.length > 0;
  }

  undo(): void {
    const prev = this.history.pop();
    if (!prev) return;
    this.future.push(JSON.stringify(this.project));
    this.project = JSON.parse(prev);
    this.emit('undo');
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.history.push(JSON.stringify(this.project));
    this.project = JSON.parse(next);
    this.emit('redo');
  }

  /** Reemplaza el proyecto (abrir/nuevo) y limpia el historial. */
  load(p: Project): void {
    this.project = cloneProject(p);
    this.history = [];
    this.future = [];
    this.emit('load');
  }
}
