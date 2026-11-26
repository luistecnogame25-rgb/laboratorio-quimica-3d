/**
 * Tipos centrales compartidos por todos los módulos.
 * La biblioteca de componentes, el motor eléctrico y el renderizado dependen de estos
 * contratos, no entre sí: así se pueden añadir componentes sin tocar el motor.
 */
import type { Element } from '../electrical/mna';

/** Pitch estándar de protoboard: 0,1" = 2,54 mm. La escena usa milímetros. */
export const PITCH = 2.54;

export type CategoryId =
  | 'protoboard'
  | 'pasivos'
  | 'semiconductores'
  | 'integrados'
  | 'alimentacion'
  | 'entrada'
  | 'salida'
  | 'microcontroladores'
  | 'instrumentos';

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  protoboard: 'Protoboards',
  pasivos: 'Pasivos',
  semiconductores: 'Semiconductores',
  integrados: 'Circuitos integrados',
  alimentacion: 'Alimentación',
  entrada: 'Entrada',
  salida: 'Salida',
  microcontroladores: 'Microcontroladores',
  instrumentos: 'Instrumentos',
};

/** Función eléctrica del terminal: se usa para colores, validación y documentación. */
export type TerminalKind =
  | 'positive'
  | 'negative'
  | 'passive'
  | 'anode'
  | 'cathode'
  | 'base'
  | 'collector'
  | 'emitter'
  | 'switch';

export interface TerminalDef {
  id: string;
  name: string;
  kind: TerminalKind;
  polarity?: '+' | '-';
  /** Posición en el plano local del componente (mm). */
  local: { x: number; z: number };
  /** Altura del punto de conexión sobre la base del componente (solo componentes fuera de la protoboard). */
  height?: number;
  maxVoltage?: number;
  maxCurrent?: number;
  func: string;
  /** Terminal unido internamente a otro (no necesita conexión externa; no se avisa si queda libre). */
  optional?: boolean;
}

export type ParamValue = number | string | boolean;
export type Params = Record<string, ParamValue>;

export interface ParamDef {
  key: string;
  label: string;
  type: 'number' | 'select' | 'boolean';
  unit?: string;
  default: ParamValue;
  min?: number;
  max?: number;
  step?: number;
  /** Valores estándar sugeridos (p. ej. serie E12). */
  presets?: number[];
  options?: { value: string; label: string }[];
  help?: string;
}

export interface Warning {
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface ReportValue {
  label: string;
  value: number;
  unit: string;
}

/** Estado visual derivado de la simulación. El renderizador solo lee esto. */
export interface VisualState {
  brightness?: number; // LED 0..1
  damaged?: boolean;
  heat?: number; // potencia / potencia nominal
  charge?: number; // capacitor: V / Vmax nominal
  region?: string; // transistor
  display?: string[]; // fuente regulable
  pressed?: boolean;
}

export interface InstanceReport {
  values: ReportValue[];
  warnings: Warning[];
  visual: VisualState;
}

/** Acceso de solo lectura a la solución del sistema MNA. */
export interface Solution {
  v(node: number): number;
  branch(index: number): number;
  time: number;
}

export interface RuntimeState {
  /** Estado interactivo (p. ej. pulsador presionado) indexado por id de instancia. */
  pressed: Set<string>;
  /** Componentes dañados durante la simulación (LED quemado…). */
  damaged: Set<string>;
  /** Voltajes iniciales de capacitores (continuidad al reconstruir el circuito). */
  capVoltages: Map<string, number>;
}

export interface ModelBuildContext {
  id: string;
  params: Params;
  /** Índice de nodo MNA por id de terminal (-1 = tierra, null = terminal flotante). */
  node(terminalId: string): number;
  /** Reserva un nodo interno (p. ej. entre la unión y la resistencia serie de un LED). */
  internalNode(): number;
  runtime: RuntimeState;
}

export interface ComponentModel {
  elements: Element[];
  report(sol: Solution): InstanceReport;
  /** Terminales que forman una fuente (para detección de cortocircuito y referencia de tierra). */
  source?: { pos: string; neg: string; emf: number; rint: number; branchElement: Element };
}

export interface ComponentDef {
  type: string;
  name: string;
  /** Prefijo de designador (R, C, D, Q, BT…). */
  prefix: string;
  category: CategoryId;
  summary: string;
  /** true: sus pines se insertan en perforaciones de protoboard. */
  insertable: boolean;
  /** Dimensiones aproximadas (mm) para selección y documentación. */
  size: { w: number; h: number; d: number };
  params: ParamDef[];
  terminals(params: Params): TerminalDef[];
  /** Etiqueta corta (p. ej. "220 Ω"). */
  label(params: Params): string;
  /**
   * Nivel de modelado eléctrico. Se muestra en la interfaz para no confundir
   * simulación con animación: 'fisico' = ecuaciones del dispositivo (Shockley, Ebers-Moll…),
   * 'ideal' = elemento lineal ideal, 'ninguno' = sin modelo eléctrico.
   */
  modelLevel: 'fisico' | 'ideal' | 'ninguno';
  modelDoc: string;
  createModel?(ctx: ModelBuildContext): ComponentModel;
  eduId: string;
}

/* ---------- Proyecto ---------- */

export interface ComponentInstance {
  id: string;
  type: string;
  params: Params;
  x: number;
  z: number;
  /** Rotación en pasos de 90° alrededor del eje vertical. */
  rot: number;
  group?: string;
}

export type WireEnd =
  | { kind: 'pin'; inst: string; term: string }
  | { kind: 'hole'; board: string; hole: string };

export interface Wire {
  id: string;
  a: WireEnd;
  b: WireEnd;
  /** Color hexadecimal o 'auto' (rojo = +, negro = GND, azul = señal). */
  color: string;
}

export interface Project {
  format: 'lab3d-project';
  version: 1;
  id: string;
  name: string;
  created: string;
  modified: string;
  components: ComponentInstance[];
  wires: Wire[];
  simulation: { timeScale: number; dt: number };
  camera?: { position: [number, number, number]; target: [number, number, number] };
  notes?: string;
  /** Últimas mediciones guardadas por el usuario. */
  measurements?: { label: string; value: number; unit: string; time: number }[];
}
