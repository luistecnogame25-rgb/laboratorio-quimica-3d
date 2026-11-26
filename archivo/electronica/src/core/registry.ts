import type { ComponentDef, Params } from './types';

/**
 * Registro de componentes. Cada componente se declara una sola vez (definición + modelo)
 * y el resto del sistema lo consulta aquí. Añadir un componente = registrar una definición.
 */
const defs = new Map<string, ComponentDef>();

export function registerComponent(def: ComponentDef): void {
  if (defs.has(def.type)) throw new Error(`Componente duplicado: ${def.type}`);
  defs.set(def.type, def);
}

export function getDef(type: string): ComponentDef {
  const d = defs.get(type);
  if (!d) throw new Error(`Tipo de componente desconocido: ${type}`);
  return d;
}

export function hasDef(type: string): boolean {
  return defs.has(type);
}

export function allDefs(): ComponentDef[] {
  return [...defs.values()];
}

export function defaultParams(def: ComponentDef): Params {
  const p: Params = {};
  for (const pd of def.params) p[pd.key] = pd.default;
  return p;
}

/** Completa parámetros faltantes con valores por defecto (compatibilidad de proyectos). */
export function withDefaults(def: ComponentDef, params: Params): Params {
  return { ...defaultParams(def), ...params };
}

export function num(params: Params, key: string): number {
  const v = params[key];
  return typeof v === 'number' ? v : parseFloat(String(v));
}
