/**
 * Almacenamiento local de proyectos (localStorage; persiste dentro del WebView de Android).
 * Interfaz asíncrona para poder sustituirla por IndexedDB, el sistema de archivos de
 * Capacitor o sincronización en la nube sin cambiar a quien la usa.
 */
import { parseProject } from '../core/project';
import type { Project } from '../core/types';

export interface ProjectMeta {
  id: string;
  name: string;
  modified: string;
  components: number;
  wires: number;
}

export interface ProjectRepository {
  list(): Promise<ProjectMeta[]>;
  load(id: string): Promise<Project | null>;
  save(p: Project): Promise<void>;
  remove(id: string): Promise<void>;
}

const INDEX = 'lab3d.index';
const KEY = (id: string) => `lab3d.project.${id}`;

export class LocalProjectRepository implements ProjectRepository {
  constructor(private readonly storage: Storage = localStorage) {}

  private readIndex(): ProjectMeta[] {
    try {
      return JSON.parse(this.storage.getItem(INDEX) ?? '[]') as ProjectMeta[];
    } catch {
      return [];
    }
  }

  async list(): Promise<ProjectMeta[]> {
    return this.readIndex().sort((a, b) => b.modified.localeCompare(a.modified));
  }

  async load(id: string): Promise<Project | null> {
    const raw = this.storage.getItem(KEY(id));
    if (!raw) return null;
    return parseProject(JSON.parse(raw));
  }

  async save(p: Project): Promise<void> {
    this.storage.setItem(KEY(p.id), JSON.stringify(p));
    const idx = this.readIndex().filter((m) => m.id !== p.id);
    idx.push({ id: p.id, name: p.name, modified: p.modified, components: p.components.length, wires: p.wires.length });
    this.storage.setItem(INDEX, JSON.stringify(idx));
  }

  async remove(id: string): Promise<void> {
    this.storage.removeItem(KEY(id));
    this.storage.setItem(INDEX, JSON.stringify(this.readIndex().filter((m) => m.id !== id)));
  }
}

/** Descarga el proyecto como archivo .lab3d.json. */
export function exportProjectFile(p: Project): void {
  const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${p.name.replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/g, '').trim() || 'proyecto'}.lab3d.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}

/** Abre un selector de archivo y devuelve el proyecto validado. */
export function importProjectFile(): Promise<Project> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return reject(new Error('No se eligió archivo.'));
      try {
        resolve(parseProject(JSON.parse(await f.text())));
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}
