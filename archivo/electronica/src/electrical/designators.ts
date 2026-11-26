import { getDef } from '../core/registry';
import type { Project } from '../core/types';

/** Asigna designadores legibles (R1, R2, LED1, Q1…) según el orden en el proyecto. */
export function designators(project: Project): Map<string, string> {
  const count = new Map<string, number>();
  const out = new Map<string, string>();
  for (const c of project.components) {
    const prefix = getDef(c.type).prefix;
    const n = (count.get(prefix) ?? 0) + 1;
    count.set(prefix, n);
    out.set(c.id, `${prefix}${n}`);
  }
  return out;
}
