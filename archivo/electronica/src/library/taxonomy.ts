/**
 * Catálogo jerárquico de la biblioteca: categoría → subcategoría → artículo.
 *
 * Un artículo del catálogo NO es un componente nuevo del motor: es una "referencia comercial"
 * que apunta a una definición registrada (`type`) con unos parámetros preestablecidos
 * (p. ej. "Resistencia 10 kΩ ¼ W" = type 'resistor' + {resistance: 10000}).
 * Los artículos sin `type` están PLANIFICADOS y la interfaz los muestra como no disponibles.
 *
 * Para ampliar la biblioteca basta con llamar a addItems() (o añadir categorías a CATEGORIES):
 * la navegación, la búsqueda y la colocación funcionan sin cambios.
 */
import { eng } from '../core/format';
import type { Params } from '../core/types';
import { BATTERY_9V, batteryEmf } from './power';
import { DIODES, LED_COLORS, NPN_MODELS, PNP_MODELS, type BjtModel } from './semiconductors';

export interface Subcategory {
  id: string;
  name: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  subcategories: Subcategory[];
}

export interface CatalogItem {
  id: string;
  name: string;
  /** Referencia comercial o modelo (p. ej. "PN2222A", "1N4007", "220 Ω ±5 %"). */
  reference: string;
  category: string;
  subcategory: string;
  /** Definición registrada que se coloca en el laboratorio. Sin `type` = planificado. */
  type?: string;
  params?: Params;
  /** Acción especial en lugar de colocar un componente (herramientas). */
  action?: 'tool:wire' | 'tool:probe';
  phase?: number;
  summary: string;
  tags: string[];
  specs?: [string, string][];
}

const sc = (pairs: [string, string][]): Subcategory[] => pairs.map(([id, name]) => ({ id, name }));

export const CATEGORIES: Category[] = [
  { id: 'protoboards', name: 'Protoboards y conexiones', icon: 'library', subcategories: sc([['pequenas', 'Protoboards pequeñas'], ['medianas', 'Protoboards medianas'], ['grandes', 'Protoboards grandes'], ['modulares', 'Protoboards modulares'], ['jumpers', 'Cables jumper'], ['terminales', 'Terminales'], ['conectores', 'Conectores'], ['adaptadores', 'Adaptadores']]) },
  { id: 'resistencias', name: 'Resistencias', icon: 'resistor', subcategories: sc([['fijas', 'Resistencias fijas'], ['carbon', 'Película de carbón'], ['metalica', 'Película metálica'], ['potencia', 'Resistencias de potencia'], ['smd', 'Resistencias SMD'], ['potenciometros', 'Potenciómetros'], ['trimmers', 'Trimmers'], ['ntc', 'Termistores NTC'], ['ptc', 'Termistores PTC'], ['ldr', 'Fotoresistencias LDR']]) },
  { id: 'capacitores', name: 'Capacitores', icon: 'capacitor', subcategories: sc([['ceramicos', 'Cerámicos'], ['electroliticos', 'Electrolíticos'], ['tantalio', 'Tantalio'], ['poliester', 'Poliéster'], ['polipropileno', 'Polipropileno'], ['variables', 'Variables'], ['smd', 'SMD']]) },
  { id: 'diodos', name: 'Diodos', icon: 'diode', subcategories: sc([['rectificadores', 'Rectificadores'], ['zener', 'Zener'], ['schottky', 'Schottky'], ['led', 'LED'], ['infrarrojos', 'Infrarrojos'], ['fotodiodos', 'Fotodiodos'], ['tvs', 'TVS']]) },
  { id: 'transistores', name: 'Transistores', icon: 'transistor', subcategories: sc([['npn', 'NPN'], ['pnp', 'PNP'], ['mosfet-n', 'MOSFET canal N'], ['mosfet-p', 'MOSFET canal P'], ['jfet', 'JFET'], ['potencia', 'Transistores de potencia'], ['senal', 'Transistores de señal']]) },
  { id: 'integrados', name: 'Circuitos integrados', icon: 'chip', subcategories: sc([['temporizadores', 'Temporizadores'], ['opamp', 'Amplificadores operacionales'], ['comparadores', 'Comparadores'], ['reguladores', 'Reguladores de voltaje'], ['logica', 'Puertas lógicas'], ['controladores', 'Controladores'], ['drivers', 'Drivers de motores'], ['convertidores', 'Convertidores'], ['comunicacion', 'Circuitos de comunicación']]) },
  { id: 'alimentacion', name: 'Alimentación', icon: 'battery', subcategories: sc([['9v', 'Baterías de 9 V'], ['aa', 'Pilas AA'], ['aaa', 'Pilas AAA'], ['14500', 'Celdas 14500'], ['18650', 'Celdas 18650'], ['dc', 'Fuentes DC'], ['ac', 'Fuentes AC'], ['regulables', 'Fuentes regulables'], ['dcdc', 'Convertidores DC-DC'], ['reguladores', 'Reguladores']]) },
  { id: 'microcontroladores', name: 'Microcontroladores', icon: 'cpu', subcategories: sc([['uno', 'Arduino UNO'], ['nano', 'Arduino Nano'], ['mega', 'Arduino Mega'], ['esp32', 'ESP32'], ['esp8266', 'ESP8266'], ['pico', 'Raspberry Pi Pico'], ['stm32', 'STM32']]) },
  { id: 'sensores', name: 'Sensores', icon: 'sensor', subcategories: sc([['temperatura', 'Temperatura'], ['humedad', 'Humedad'], ['distancia', 'Distancia'], ['ultrasonicos', 'Ultrasónicos'], ['infrarrojos', 'Infrarrojos'], ['proximidad', 'Proximidad'], ['luz', 'Luz'], ['movimiento', 'Movimiento'], ['linea', 'Línea'], ['presion', 'Presión'], ['acelerometros', 'Acelerómetros'], ['giroscopios', 'Giroscopios'], ['ambientales', 'Sensores ambientales']]) },
  { id: 'actuadores', name: 'Actuadores y motores', icon: 'motor', subcategories: sc([['dc', 'Motores DC'], ['servo', 'Servomotores'], ['paso', 'Motores paso a paso'], ['reductora', 'Motores con reductora'], ['ventiladores', 'Ventiladores'], ['reles', 'Relés'], ['solenoides', 'Solenoides'], ['valvulas', 'Electroválvulas']]) },
  { id: 'instrumentacion', name: 'Instrumentación', icon: 'gauge', subcategories: sc([['multimetros', 'Multímetros'], ['voltimetros', 'Voltímetros'], ['amperimetros', 'Amperímetros'], ['osciloscopios', 'Osciloscopios'], ['generadores', 'Generadores de señales'], ['analizadores', 'Analizadores lógicos']]) },
  { id: 'interruptores', name: 'Interruptores y controles', icon: 'switch', subcategories: sc([['pulsadores', 'Pulsadores'], ['interruptores', 'Interruptores'], ['dip', 'Switches DIP'], ['encoders', 'Encoders'], ['joysticks', 'Joysticks'], ['finales', 'Finales de carrera']]) },
  { id: 'visualizacion', name: 'Visualización y sonido', icon: 'display', subcategories: sc([['lcd', 'Pantallas LCD'], ['oled', 'Pantallas OLED'], ['7seg', 'Displays de siete segmentos'], ['indicadores', 'LEDs indicadores'], ['buzzers', 'Buzzers'], ['altavoces', 'Altavoces']]) },
];

const items: CatalogItem[] = [];
const byId = new Map<string, CatalogItem>();

export function addItems(list: CatalogItem[]): void {
  for (const it of list) {
    if (byId.has(it.id)) throw new Error(`Artículo duplicado en el catálogo: ${it.id}`);
    if (!CATEGORIES.some((c) => c.id === it.category && c.subcategories.some((s) => s.id === it.subcategory))) {
      throw new Error(`Categoría/subcategoría inexistente para ${it.id}: ${it.category}/${it.subcategory}`);
    }
    byId.set(it.id, it);
    items.push(it);
  }
}

export const catalogItems = () => items;
export const catalogItem = (id: string) => byId.get(id);
export const isAvailable = (it: CatalogItem) => !!it.type || !!it.action;
export const categoryOf = (id: string) => CATEGORIES.find((c) => c.id === id)!;
export const subcategoryOf = (cat: string, sub: string) => categoryOf(cat).subcategories.find((s) => s.id === sub)!;
export const itemsIn = (cat: string, sub?: string) => items.filter((i) => i.category === cat && (!sub || i.subcategory === sub));
/** Otras referencias del mismo tipo de componente ("modelos disponibles"). */
export const siblingsOf = (it: CatalogItem) => items.filter((i) => i.id !== it.id && i.category === it.category && i.subcategory === it.subcategory);

/* ============================ búsqueda ============================ */

export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/µ|μ/g, 'u')
    .replace(/ω|ohmios|ohms|ohm/g, '')
    .replace(/[\s·,()/]+/g, '');
}

function haystack(it: CatalogItem): { all: string; exact: Set<string> } {
  const cat = categoryOf(it.category);
  const sub = subcategoryOf(it.category, it.subcategory);
  const parts = [it.name, it.reference, cat.name, sub.name, it.summary, ...it.tags, ...(it.specs ?? []).map(([k, v]) => `${k} ${v}`)];
  return { all: parts.map(norm).join('|'), exact: new Set([...it.tags, it.reference].map(norm)) };
}

const hayCache = new Map<string, ReturnType<typeof haystack>>();

/** Busca por nombre, tipo, modelo, referencia, categoría, características o valor ("10 kΩ", "mosfet"). */
export function searchCatalog(query: string): CatalogItem[] {
  const q = query.trim();
  if (!q) return [];
  const whole = norm(q);
  const tokens = q.split(/\s+/).map(norm).filter(Boolean);
  const scored: { it: CatalogItem; s: number }[] = [];
  for (const it of items) {
    let h = hayCache.get(it.id);
    if (!h) hayCache.set(it.id, (h = haystack(it)));
    let s = 0;
    if (h.exact.has(whole)) s = 100;
    else if (norm(it.name).startsWith(whole)) s = 60;
    else if (h.all.includes(whole)) s = 40;
    else if (tokens.length > 1 && tokens.every((t) => h!.all.includes(t))) s = 10;
    if (s && isAvailable(it)) s += 5;
    if (s) scored.push({ it, s });
  }
  return scored.sort((a, b) => b.s - a.s).map((x) => x.it);
}

/* ============================ artículos disponibles ============================ */

const ohmTags = (r: number) => {
  const e = eng(r, '').replace(' ', '');
  return [e, `${e}Ω`, `${r}`, e.replace('.', ',')];
};

function resistors(sub: string, values: number[], extra: Params, label: (r: number) => string, tags: string[], power = '1/4 W'): CatalogItem[] {
  return values.map((r) => ({
    id: `res-${sub}-${r}`,
    name: `Resistencia ${eng(r, 'Ω')}`,
    reference: label(r),
    category: 'resistencias',
    subcategory: sub,
    type: 'resistor',
    params: { resistance: r, ...extra },
    summary: `${eng(r, 'Ω')} · ${power}`,
    tags: [...ohmTags(r), ...tags],
    specs: [
      ['Resistencia', eng(r, 'Ω')],
      ['Tolerancia', extra.tolerance === '1' ? '±1 %' : '±5 %'],
      ['Potencia', power],
      ['Encapsulado', 'Axial, through-hole'],
    ],
  }));
}

function bjtItems(sub: string, models: Record<string, BjtModel>, type: 'npn' | 'pnp', prefix = ''): CatalogItem[] {
  return Object.entries(models).map(([key, m]) => ({
    id: `${prefix}${type}-${key}`,
    name: `Transistor ${type.toUpperCase()} ${m.label}`,
    reference: m.label,
    category: 'transistores',
    subcategory: sub,
    type,
    params: { model: key },
    summary: `${type.toUpperCase()} · ${eng(m.icmax, 'A')} · ${m.vceo} V`,
    tags: [type, 'bjt', 'bipolar', key, m.label, 'to-92', 'transistor'],
    specs: [
      ['Tipo', `BJT ${type.toUpperCase()}`],
      ['Encapsulado', 'TO-92'],
      ['Terminales (cara plana)', m.pinout.join(' – ')],
      ['V CEO máx.', `${m.vceo} V`],
      ['I C máx.', eng(m.icmax, 'A')],
      ['Potencia máx.', eng(m.pmax, 'W')],
      ['Ganancia βf (modelo)', String(m.bf)],
    ],
  }));
}

function available(): CatalogItem[] {
  const out: CatalogItem[] = [];
  // Protoboards
  const boards: [string, string, string, string][] = [
    ['pequenas', 'breadboard-170', 'Protoboard mini', '170 puntos'],
    ['medianas', 'breadboard-400', 'Protoboard media', '400 puntos'],
    ['grandes', 'breadboard-830', 'Protoboard completa', '830 puntos'],
  ];
  for (const [sub, type, name, ref] of boards)
    out.push({
      id: type,
      name,
      reference: ref,
      category: 'protoboards',
      subcategory: sub,
      type,
      summary: ref,
      tags: ['protoboard', 'breadboard', 'placa de pruebas', ref],
      specs: [['Puntos', ref], ['Paso', '2,54 mm'], ['Rieles', type === 'breadboard-170' ? 'No' : '4 (2 + y 2 −)']],
    });
  out.push({ id: 'tool-jumper', name: 'Cable jumper', reference: 'Herramienta Cable', category: 'protoboards', subcategory: 'jumpers', action: 'tool:wire', summary: 'Une terminales y perforaciones', tags: ['cable', 'jumper', 'wire', 'dupont'], specs: [['Uso', 'Clic en origen y destino, o arrastrar']] });

  // Resistencias
  out.push(...resistors('fijas', [10, 47, 100, 220, 330, 470, 1e3, 2.2e3, 4.7e3, 10e3, 22e3, 47e3, 100e3, 1e6], { tolerance: '5', power: '0.25' }, (r) => `${eng(r, 'Ω')} ±5 %`, ['fija', 'carbon']));
  out.push(...resistors('carbon', [220, 1e3, 10e3], { tolerance: '5', power: '0.25' }, (r) => `CF ${eng(r, 'Ω')} ±5 %`, ['pelicula de carbon', 'cf']));
  out.push(...resistors('metalica', [100, 1e3, 4.7e3, 10e3, 100e3], { tolerance: '1', power: '0.25' }, (r) => `MF ${eng(r, 'Ω')} ±1 %`, ['pelicula metalica', 'mf', 'precision']));
  out.push(...resistors('potencia', [10, 47, 100], { tolerance: '5', power: '1' }, (r) => `${eng(r, 'Ω')} 1 W`, ['potencia', '1w'], '1 W'));

  // Capacitores
  for (const c of [22e-12, 1e-9, 10e-9, 100e-9, 1e-6])
    out.push({
      id: `cap-cer-${c}`,
      name: `Capacitor cerámico ${eng(c, 'F')}`,
      reference: eng(c, 'F'),
      category: 'capacitores',
      subcategory: 'ceramicos',
      type: 'capacitor-ceramic',
      params: { capacitance: c },
      summary: `${eng(c, 'F')} · 50 V`,
      tags: [eng(c, 'F'), eng(c, '').replace(' ', ''), 'ceramico', 'no polarizado', 'mlcc'],
      specs: [['Capacidad', eng(c, 'F')], ['Voltaje', '50 V'], ['Polaridad', 'No polarizado']],
    });
  for (const [c, v] of [[10e-6, '25'], [100e-6, '25'], [220e-6, '16'], [470e-6, '16'], [1000e-6, '16']] as [number, string][])
    out.push({
      id: `cap-elec-${c}`,
      name: `Electrolítico ${eng(c, 'F')}`,
      reference: `${eng(c, 'F')} ${v} V`,
      category: 'capacitores',
      subcategory: 'electroliticos',
      type: 'capacitor-electrolytic',
      params: { capacitance: c, vmax: v },
      summary: `${eng(c, 'F')} · ${v} V · polarizado`,
      tags: [eng(c, 'F'), eng(c, '').replace(' ', ''), 'electrolitico', 'polarizado'],
      specs: [['Capacidad', eng(c, 'F')], ['Voltaje', `${v} V`], ['Polaridad', 'Polarizado (franja = −)']],
    });

  // Diodos
  for (const [key, d] of Object.entries(DIODES))
    out.push({
      id: `diode-${key}`,
      name: `Diodo ${key}`,
      reference: key,
      category: 'diodos',
      subcategory: 'rectificadores',
      type: 'diode',
      params: { model: key },
      summary: d.label,
      tags: [key, 'diodo', 'rectificador', key === '1N4148' ? 'señal conmutacion' : 'rectificador 1a'],
      specs: [['Corriente máx.', eng(d.imax, 'A')], ['V RRM', `${d.vrrm} V`], ['Encapsulado', key === '1N4148' ? 'DO-35 (vidrio)' : 'DO-41']],
    });
  for (const [key, c] of Object.entries(LED_COLORS))
    for (const sub of ['led', 'indicadores'] as const) {
      if (sub === 'indicadores' && !['red', 'green', 'yellow'].includes(key)) continue;
      out.push({
        id: `led-${sub}-${key}`,
        name: `LED ${c.label.toLowerCase()} 5 mm`,
        reference: `5 mm · ${c.label}`,
        category: sub === 'led' ? 'diodos' : 'visualizacion',
        subcategory: sub,
        type: 'led',
        params: { color: key },
        summary: `Vf ${c.vf.toFixed(1)} V @ 20 mA`,
        tags: ['led', c.label, key, '5mm', 'indicador'],
        specs: [['Color', c.label], ['Vf típico', `${c.vf.toFixed(2)} V @ 20 mA`], ['I máx.', '30 mA'], ['V inversa máx.', '5 V'], ...(c.nm ? ([['Longitud de onda', `${c.nm} nm`]] as [string, string][]) : [])],
      });
    }

  // Transistores
  out.push(...bjtItems('npn', NPN_MODELS, 'npn'), ...bjtItems('pnp', PNP_MODELS, 'pnp'));
  out.push(
    ...bjtItems('senal', { BC547B: NPN_MODELS.BC547B, '2N3904': NPN_MODELS['2N3904'] }, 'npn', 'sig-'),
    ...bjtItems('senal', { '2N3906': PNP_MODELS['2N3906'] }, 'pnp', 'sig-'),
  );

  // Alimentación
  for (const [key, b] of Object.entries(BATTERY_9V))
    out.push({
      id: `bat9-${key}`,
      name: `Batería 9 V ${key === 'alkaline' ? 'alcalina' : key === 'nimh' ? 'NiMH' : 'litio'}`,
      reference: b.label,
      category: 'alimentacion',
      subcategory: '9v',
      type: 'battery-9v',
      params: { chemistry: key, soc: 100 },
      summary: `${eng(batteryEmf(key, 100), 'V')} · ${b.mAh} mAh`,
      tags: ['bateria', 'pila', '9v', key, 'pp3', '6lr61'],
      specs: [['Voltaje (lleno)', `${b.vFull} V`], ['Voltaje (vacío)', `${b.vEmpty} V`], ['Resistencia interna', `${b.rint} Ω`], ['Capacidad', `${b.mAh} mAh`]],
    });
  for (const v of [3.3, 5, 12])
    out.push({
      id: `psu-${v}`,
      name: `Fuente DC ${v} V`,
      reference: `Fuente de laboratorio a ${v} V`,
      category: 'alimentacion',
      subcategory: 'dc',
      type: 'dc-supply',
      params: { voltage: v, ilim: 0.5 },
      summary: `${v} V · límite 500 mA`,
      tags: ['fuente', 'dc', `${v}v`],
      specs: [['Voltaje', `${v} V`], ['Límite de corriente', '500 mA (ajustable)']],
    });
  out.push({
    id: 'psu-regulable',
    name: 'Fuente regulable 0–30 V',
    reference: '0–30 V / 0–5 A',
    category: 'alimentacion',
    subcategory: 'regulables',
    type: 'dc-supply',
    summary: 'CV / CC con límite de corriente',
    tags: ['fuente', 'regulable', 'laboratorio', 'bench'],
    specs: [['Rango de voltaje', '0–30 V'], ['Límite de corriente', '1 mA – 5 A'], ['Modos', 'CV / CC']],
  });

  // Instrumentación (herramientas)
  out.push({ id: 'tool-dmm', name: 'Multímetro de sondas', reference: 'Voltaje DC', category: 'instrumentacion', subcategory: 'multimetros', action: 'tool:probe', summary: 'Mide voltaje entre dos puntos', tags: ['multimetro', 'tester', 'sonda', 'dmm'], specs: [['Magnitud', 'Voltaje DC'], ['Registro', 'V(t) en tiempo real']] });
  out.push({ id: 'tool-voltmeter', name: 'Voltímetro', reference: 'Sondas roja y negra', category: 'instrumentacion', subcategory: 'voltimetros', action: 'tool:probe', summary: 'Voltaje entre dos puntos o respecto a GND', tags: ['voltimetro', 'voltaje', 'sonda'] });

  // Interruptores
  out.push({ id: 'pushbutton', name: 'Pulsador táctil 6×6', reference: 'Tact switch 4 patas', category: 'interruptores', subcategory: 'pulsadores', type: 'pushbutton', summary: 'Contacto momentáneo', tags: ['pulsador', 'boton', 'tact', 'push button'], specs: [['Contactos', 'NA (normalmente abierto)'], ['Corriente típica', '50 mA'], ['Montaje', 'A caballo del canal central']] });
  out.push({ id: 'slide-switch', name: 'Interruptor deslizante', reference: 'SPDT 3 patas', category: 'interruptores', subcategory: 'interruptores', type: 'slide-switch', summary: 'Un polo, dos posiciones', tags: ['interruptor', 'spdt', 'deslizante', 'switch'], specs: [['Configuración', 'SPDT'], ['Posiciones', '2']] });
  return out;
}

/* ============================ artículos planificados ============================ */

type P = [sub: string, name: string, ref: string, summary: string];
function planned(category: string, phase: number, list: P[], tags: string[] = []): CatalogItem[] {
  return list.map(([sub, name, ref, summary]) => ({
    id: `plan-${category}-${norm(name + '-' + ref)}`,
    name,
    reference: ref,
    category,
    subcategory: sub,
    phase,
    summary,
    tags: [...tags, ...name.split(' ')],
  }));
}

const PLANNED: CatalogItem[] = [
  ...planned('protoboards', 2, [['modulares', 'Protoboard modular encadenable', 'Módulo 400 + rieles', 'Placas acoplables'], ['terminales', 'Bornera de tornillo', 'KF301-2P', 'Terminal de 2 vías 5,08 mm'], ['conectores', 'Tira de pines macho', 'Header 2,54 mm', '1×40'], ['conectores', 'Conector DC jack', '5,5 × 2,1 mm', 'Entrada de alimentación'], ['adaptadores', 'Adaptador de batería 9 V', 'Clip 9 V', 'Broche con cables'], ['adaptadores', 'Módulo de alimentación para protoboard', 'MB102', '3,3 V / 5 V']]),
  ...planned('resistencias', 2, [['smd', 'Resistencia SMD', '0805 10 kΩ', 'Montaje superficial'], ['potenciometros', 'Potenciómetro lineal', '10 kΩ B10K', 'Divisor ajustable'], ['potenciometros', 'Potenciómetro logarítmico', '10 kΩ A10K', 'Para audio'], ['trimmers', 'Trimmer multivuelta', '3296W 10 kΩ', 'Ajuste fino'], ['ntc', 'Termistor NTC', 'NTC 10 kΩ B3950', 'R disminuye con T'], ['ptc', 'Termistor PTC', 'PTC reajustable 500 mA', 'Fusible reseteable'], ['ldr', 'Fotoresistencia', 'GL5528', 'R disminuye con la luz']]),
  ...planned('capacitores', 2, [['tantalio', 'Capacitor de tantalio', '10 µF 16 V', 'Polarizado, baja ESR'], ['poliester', 'Capacitor de poliéster', '100 nF 100 V', 'Película'], ['polipropileno', 'Capacitor de polipropileno', '470 nF 275 V X2', 'Película, red'], ['variables', 'Capacitor variable', '5–60 pF', 'Sintonía'], ['smd', 'Capacitor SMD', '0805 100 nF', 'Montaje superficial']]),
  ...planned('diodos', 2, [['zener', 'Diodo Zener 5,1 V', '1N4733A', 'Referencia de voltaje'], ['zener', 'Diodo Zener 12 V', '1N4742A', 'Referencia de voltaje'], ['schottky', 'Diodo Schottky', '1N5819', 'Baja caída 0,3 V'], ['infrarrojos', 'LED infrarrojo', 'IR 940 nm', 'Emisor IR'], ['fotodiodos', 'Fotodiodo', 'BPW34', 'Sensor de luz rápido'], ['tvs', 'Diodo TVS', 'P6KE6.8A', 'Protección contra picos']]),
  ...planned('transistores', 2, [['mosfet-n', 'MOSFET canal N', '2N7000', '60 V · 200 mA · TO-92'], ['mosfet-n', 'MOSFET canal N de nivel lógico', 'IRLZ44N', '55 V · 47 A · TO-220'], ['mosfet-n', 'MOSFET canal N', 'IRF520', '100 V · 9 A · TO-220'], ['mosfet-p', 'MOSFET canal P', 'IRF9540N', '−100 V · −23 A · TO-220'], ['mosfet-p', 'MOSFET canal P', 'BS250', '−45 V · TO-92'], ['jfet', 'JFET canal N', 'J201', 'Bajo ruido'], ['jfet', 'JFET canal N', '2N5457', 'Uso general'], ['potencia', 'Darlington de potencia', 'TIP120', '60 V · 5 A · TO-220'], ['potencia', 'Transistor de potencia NPN', 'TIP31C', '100 V · 3 A · TO-220'], ['potencia', 'Transistor de potencia NPN', '2N3055', '60 V · 15 A · TO-3']], ['mosfet', 'fet']),
  ...planned('integrados', 2, [['temporizadores', 'Temporizador', 'NE555', 'Astable / monoestable'], ['temporizadores', 'Temporizador doble', 'NE556', 'Dos 555'], ['opamp', 'Amplificador operacional doble', 'LM358', 'Alimentación simple'], ['opamp', 'Amplificador operacional JFET', 'TL072', 'Bajo ruido'], ['opamp', 'Amplificador operacional', 'LM741', 'Clásico'], ['comparadores', 'Comparador doble', 'LM393', 'Salida colector abierto'], ['reguladores', 'Regulador lineal 5 V', 'LM7805', '1,5 A · TO-220'], ['reguladores', 'Regulador ajustable', 'LM317', '1,25–37 V'], ['reguladores', 'Regulador LDO 3,3 V', 'AMS1117-3.3', '1 A'], ['logica', 'Cuatro NAND', '74HC00', 'CMOS'], ['logica', 'Cuatro AND', '74HC08', 'CMOS'], ['logica', 'Seis inversores', '74HC04', 'CMOS'], ['logica', 'Cuatro XOR', '74HC86', 'CMOS'], ['controladores', 'Driver de 16 canales PWM', 'PCA9685', 'I²C'], ['controladores', 'Array Darlington', 'ULN2003', '7 canales'], ['drivers', 'Puente H doble', 'L298N', '2 A por canal'], ['drivers', 'Puente H doble', 'L293D', '600 mA, con diodos'], ['drivers', 'Driver de motores', 'TB6612FNG', 'MOSFET, 1,2 A'], ['drivers', 'Driver de motor paso a paso', 'A4988', 'Micropasos'], ['convertidores', 'ADC 16 bits', 'ADS1115', 'I²C, 4 canales'], ['convertidores', 'DAC 12 bits', 'MCP4725', 'I²C'], ['convertidores', 'ADC 10 bits', 'MCP3008', 'SPI, 8 canales'], ['comunicacion', 'Conversor RS-232', 'MAX232', 'Niveles TTL ↔ RS-232'], ['comunicacion', 'Conversor USB-serie', 'CH340G', 'USB ↔ UART'], ['comunicacion', 'Transceptor CAN', 'MCP2551', 'Bus CAN']], ['ci', 'integrado', 'chip']),
  ...planned('alimentacion', 2, [['aa', 'Pila AA alcalina', 'LR6 1,5 V', '≈2500 mAh'], ['aa', 'Pila AA NiMH', 'HR6 1,2 V', '≈2000 mAh'], ['aaa', 'Pila AAA alcalina', 'LR03 1,5 V', '≈1100 mAh'], ['14500', 'Celda Li-ion 14500', '3,7 V', 'Formato AA'], ['18650', 'Celda Li-ion 18650', '3,7 V 2600 mAh', 'Alta capacidad'], ['ac', 'Fuente AC', '12 V AC 50/60 Hz', 'Transformador'], ['dcdc', 'Convertidor elevador', 'MT3608', 'Step-up 2 A'], ['dcdc', 'Convertidor reductor', 'LM2596', 'Step-down 3 A'], ['reguladores', 'Módulo regulador 5 V', 'LM7805 módulo', 'Con capacitores']], ['bateria', 'fuente']),
  ...planned('microcontroladores', 3, [['uno', 'Arduino UNO R3', 'ATmega328P', '14 E/S digitales · 6 analógicas · 5 V'], ['nano', 'Arduino Nano', 'ATmega328P', 'Formato compacto para protoboard'], ['mega', 'Arduino Mega 2560', 'ATmega2560', '54 E/S digitales · 16 analógicas'], ['esp32', 'ESP32 DevKit', 'ESP32-WROOM-32', 'Wi-Fi + Bluetooth · 3,3 V'], ['esp8266', 'NodeMCU', 'ESP8266 (ESP-12E)', 'Wi-Fi · 3,3 V'], ['pico', 'Raspberry Pi Pico', 'RP2040', 'Doble núcleo ARM Cortex-M0+'], ['stm32', 'Blue Pill', 'STM32F103C8T6', 'ARM Cortex-M3 72 MHz']], ['microcontrolador', 'mcu', 'arduino', 'placa']),
  ...planned('sensores', 3, [['temperatura', 'Sensor de temperatura analógico', 'LM35', '10 mV/°C'], ['temperatura', 'Sensor de temperatura digital', 'DS18B20', '1-Wire'], ['humedad', 'Sensor de temperatura y humedad', 'DHT11', 'Digital'], ['humedad', 'Sensor de temperatura y humedad', 'DHT22', 'Mayor precisión'], ['distancia', 'Sensor de distancia láser', 'VL53L0X', 'ToF, I²C'], ['distancia', 'Sensor de distancia IR', 'Sharp GP2Y0A21', '10–80 cm'], ['ultrasonicos', 'Sensor ultrasónico', 'HC-SR04', '2–400 cm'], ['infrarrojos', 'Receptor IR', 'VS1838B', 'Mandos 38 kHz'], ['proximidad', 'Sensor de obstáculos IR', 'FC-51', 'Salida digital'], ['luz', 'Módulo de luz', 'LDR KY-018', 'Analógico'], ['luz', 'Sensor de luz digital', 'BH1750', 'Lux, I²C'], ['movimiento', 'Sensor PIR', 'HC-SR501', 'Detección de presencia'], ['linea', 'Sensor de línea', 'TCRT5000', 'Reflectivo IR'], ['presion', 'Sensor de presión barométrica', 'BMP280', 'I²C/SPI'], ['acelerometros', 'Acelerómetro de 3 ejes', 'ADXL345', 'I²C/SPI'], ['giroscopios', 'Acelerómetro + giroscopio', 'MPU6050', '6 ejes, I²C'], ['ambientales', 'Sensor ambiental', 'BME280', 'T, humedad y presión']], ['sensor']),
  ...planned('actuadores', 4, [['dc', 'Motor DC', '130 3–6 V', 'Juguetería / robótica'], ['servo', 'Microservo', 'SG90', '180°, 1,8 kg·cm'], ['servo', 'Servo metálico', 'MG996R', '10 kg·cm'], ['paso', 'Motor paso a paso unipolar', '28BYJ-48', '5 V, con reductora'], ['paso', 'Motor paso a paso bipolar', 'NEMA 17', '1,8°/paso'], ['reductora', 'Motor con reductora', 'TT 1:48', 'Para carritos'], ['ventiladores', 'Ventilador', '5 V 40 mm', 'Refrigeración'], ['reles', 'Relé', 'SRD-05VDC-SL-C', '5 V, 10 A'], ['solenoides', 'Solenoide', '12 V push-pull', 'Actuador lineal'], ['valvulas', 'Electroválvula', '12 V 1/2"', 'Riego']], ['motor', 'actuador']),
  ...planned('instrumentacion', 2, [['amperimetros', 'Amperímetro', 'Serie', 'Medición de corriente en el circuito'], ['multimetros', 'Multímetro 3D con puntas', 'DMM', 'Voltaje, corriente y resistencia'], ['osciloscopios', 'Osciloscopio de 2 canales', '2 CH', 'Formas de onda'], ['generadores', 'Generador de señales', 'Seno / cuadrada / triangular', 'Fuente de señal AC'], ['analizadores', 'Analizador lógico', '8 canales', 'Señales digitales']], ['instrumento']),
  ...planned('interruptores', 3, [['dip', 'Switch DIP', '4 posiciones', 'Configuración'], ['encoders', 'Encoder rotativo', 'KY-040', 'Con pulsador'], ['joysticks', 'Joystick analógico', 'KY-023', '2 ejes + botón'], ['finales', 'Final de carrera', 'KW11-3Z', 'Microinterruptor con palanca'], ['interruptores', 'Interruptor de palanca', 'MTS-102', 'SPDT']], ['interruptor']),
  ...planned('visualizacion', 3, [['lcd', 'Pantalla LCD 16×2', 'HD44780', 'Con interfaz I²C opcional'], ['oled', 'Pantalla OLED 0,96"', 'SSD1306 128×64', 'I²C'], ['7seg', 'Display de 7 segmentos', 'Cátodo común 0,56"', '1 dígito'], ['7seg', 'Display de 4 dígitos', 'TM1637', '2 hilos'], ['buzzers', 'Buzzer activo', '5 V', 'Tono fijo'], ['buzzers', 'Buzzer pasivo', 'Piezo', 'Tono variable (PWM)'], ['altavoces', 'Altavoz', '8 Ω 0,5 W', 'Audio']], ['display', 'pantalla']),
];

addItems(available());
addItems(PLANNED);
