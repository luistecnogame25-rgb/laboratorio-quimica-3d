/**
 * Modelo de datos de un experimento del laboratorio de química.
 * Coordenadas en ångström (Å). En la Fase 1 las posiciones las define el usuario:
 * NO representan una geometría molecular calculada ni enlaces químicos.
 */
export interface AtomInstance {
  id: string;
  /** Número atómico. */
  z: number;
  pos: [number, number, number];
  group?: string;
}

export interface Measurement {
  id: string;
  kind: 'distance' | 'angle';
  atoms: string[];
  value: number;
  unit: 'Å' | '°';
}

/**
 * Enlace del laboratorio (nunca por simple proximidad). Procede de una estructura documentada
 * (`structure`) o lo ha creado el usuario con la herramienta «Enlazar» tras validar las reglas
 * de valencia (`manual`).
 */
export interface BondInstance {
  a: string;
  b: string;
  order: number;
  /** Estructura formada de la que procede. */
  structure?: string;
  /** Creado por el usuario con la herramienta «Enlazar» (propuesta no documentada). */
  manual?: boolean;
}

export interface FormedStructure {
  id: string;
  recordId: string;
  atoms: string[];
}

export interface Experiment {
  format: 'quimlab-experiment';
  version: 2;
  id: string;
  name: string;
  created: string;
  modified: string;
  atoms: AtomInstance[];
  measurements: Measurement[];
  bonds: BondInstance[];
  structures: FormedStructure[];
  notes: string;
  view: { atomScale: number; labels: boolean };
  /** Fuentes de datos usadas (se guardan con el experimento para trazabilidad). */
  sources: string[];
}
