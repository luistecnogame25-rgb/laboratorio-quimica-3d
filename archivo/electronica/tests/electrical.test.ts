/**
 * Circuitos de referencia verificados contra cálculos independientes (fórmulas cerradas
 * o resolución numérica separada del motor MNA).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { registerLibrary } from '../src/library';
import { CircuitBuilder, hole, pin } from '../src/library/builder';
import { createRuntime, Simulator } from '../src/electrical/simulator';
import { ledModelParams } from '../src/library/semiconductors';
import { VT } from '../src/electrical/mna';
import { buildNetlist } from '../src/electrical/netlist';

beforeAll(() => registerLibrary());

function val(sim: Simulator, id: string, label: string): number {
  const r = sim.reports().get(id)!;
  const v = r.values.find((x) => x.label === label);
  if (!v) throw new Error(`Sin valor ${label}`);
  return v.value;
}

/** Fuente de laboratorio conectada a los rieles superiores (T+ / T−). */
function withSupply(volts: number, ilim = 1) {
  const cb = new CircuitBuilder();
  const pb = cb.board();
  const ps = cb.free('dc-supply', { voltage: volts, ilim }, 0, -120);
  cb.wire(pin(ps, '+'), hole(pb, 'T+1'));
  cb.wire(pin(ps, '-'), hole(pb, 'T-1'));
  return { cb, pb, ps };
}

describe('Protoboard: conexiones internas', () => {
  const cb = new CircuitBuilder();
  const pb = cb.board('breadboard-830');
  const nl = () => buildNetlist(cb.project);
  const net = (h: string) => nl().holeNet.get(`${pb}:${h}`);

  it('una columna a–e forma una sola tira', () => {
    expect(net('10a')).toBe(net('10e'));
    expect(net('10c')).toBe(net('10b'));
  });
  it('el canal central separa a–e de f–j', () => expect(net('10e')).not.toBe(net('10f')));
  it('columnas distintas no están conectadas', () => expect(net('10a')).not.toBe(net('11a')));
  it('cada riel es continuo a lo largo de la placa', () => {
    expect(net('T+1')).toBe(net('T+50'));
    expect(net('B-1')).toBe(net('B-50'));
  });
  it('rieles + y − están aislados entre sí', () => {
    expect(net('T+1')).not.toBe(net('T-1'));
    expect(net('T+1')).not.toBe(net('B+1'));
  });
  it('tiene 830 perforaciones', () => {
    expect(nl().holeNet.size).toBe(830);
  });
  it('un componente insertado queda unido a la tira', () => {
    const r = cb.place('resistor', { resistance: 100 }, pb, '5a');
    const n = nl();
    expect(n.insertion.get(`${r}:1`)?.hole).toBe('5a');
    expect(n.insertion.get(`${r}:2`)?.hole).toBe('9a');
    expect(n.pinNet.get(`${r}:2`)).toBe(n.holeNet.get(`${pb}:9e`));
  });
});

describe('Resistencias (ley de Ohm)', () => {
  it('divisor de voltaje 1k/1k a 10 V → 5 V', () => {
    const cb2 = withSupply(10);
    const a = cb2.cb.place('resistor', { resistance: 1000 }, cb2.pb, '10a'); // 10a–14a
    const b = cb2.cb.place('resistor', { resistance: 1000 }, cb2.pb, '14b'); // 14b–18b
    cb2.cb.wire(hole(cb2.pb, 'T+3'), hole(cb2.pb, '10c'));
    cb2.cb.wire(hole(cb2.pb, '18c'), hole(cb2.pb, 'T-3'));
    const sim = new Simulator(cb2.cb.project);
    expect(sim.dcOperatingPoint()).toBe(true);
    expect(val(sim, a, 'Voltaje')).toBeCloseTo(5, 3);
    expect(val(sim, b, 'Corriente')).toBeCloseTo(0.005, 6);
  });

  it('serie + paralelo: 1k + (2k ∥ 2k) a 10 V → I = 5 mA', () => {
    const { cb, pb } = withSupply(10);
    const r1 = cb.place('resistor', { resistance: 1000 }, pb, '10a'); // 10–14
    const r2 = cb.place('resistor', { resistance: 2000 }, pb, '14b'); // 14–18
    const r3 = cb.place('resistor', { resistance: 2000 }, pb, '14c'); // 14–18
    cb.wire(hole(pb, 'T+5'), hole(pb, '10e'));
    cb.wire(hole(pb, '18e'), hole(pb, 'T-5'));
    const sim = new Simulator(cb.project);
    sim.dcOperatingPoint();
    expect(val(sim, r1, 'Corriente')).toBeCloseTo(0.005, 6);
    expect(val(sim, r2, 'Corriente')).toBeCloseTo(0.0025, 6);
    expect(val(sim, r3, 'Voltaje')).toBeCloseTo(5, 3);
  });

  it('advierte sobrecarga de potencia (9 V sobre 100 Ω de 1/4 W)', () => {
    const { cb, pb } = withSupply(9);
    const r = cb.place('resistor', { resistance: 100, power: '0.25' }, pb, '10a');
    cb.wire(hole(pb, 'T+5'), hole(pb, '10e'));
    cb.wire(hole(pb, '14e'), hole(pb, 'T-5'));
    const sim = new Simulator(cb.project);
    sim.dcOperatingPoint();
    const rep = sim.reports().get(r)!;
    expect(val(sim, r, 'Potencia')).toBeCloseTo(0.81, 2);
    expect(rep.warnings.some((w) => w.level === 'error')).toBe(true);
  });
});

/** Solución independiente de LED + resistencia por bisección. */
function ledReference(vs: number, r: number, color: string): number {
  const m = ledModelParams(color);
  const f = (i: number) => vs - i * (r + m.rs) - m.n * VT * Math.log(i / m.is + 1);
  let lo = 0;
  let hi = vs / r;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function ledCircuit(volts: number, r: number, reversed = false, color = 'red') {
  const { cb, pb } = withSupply(volts);
  const res = cb.place('resistor', { resistance: r }, pb, '10a'); // 10a–14a
  // LED de 14b a 15b (ánodo en 14) o invertido
  const led = reversed ? cb.place('led', { color }, pb, '15b', 2) : cb.place('led', { color }, pb, '14b');
  cb.wire(hole(pb, 'T+2'), hole(pb, '10e'));
  cb.wire(hole(pb, '15e'), hole(pb, 'T-2'));
  return { cb, pb, res, led };
}

describe('LED', () => {
  it('LED rojo + 330 Ω a 9 V coincide con la solución independiente', () => {
    const { cb, led } = ledCircuit(9, 330);
    const sim = new Simulator(cb.project);
    expect(sim.dcOperatingPoint()).toBe(true);
    const iRef = ledReference(9, 330, 'red');
    expect(val(sim, led, 'Corriente')).toBeCloseTo(iRef, 6);
    expect(iRef).toBeGreaterThan(0.019);
    expect(iRef).toBeLessThan(0.022);
    expect(sim.reports().get(led)!.visual.brightness!).toBeGreaterThan(0.9);
  });

  it('Vf ≈ 2,0 V a 20 mA (rojo) y ≈ 3,1 V (azul)', () => {
    for (const [color, vf] of [['red', 2.0], ['blue', 3.1]] as const) {
      const m = ledModelParams(color);
      const v = m.n * VT * Math.log(0.02 / m.is + 1) + 0.02 * m.rs;
      expect(v).toBeCloseTo(vf, 6);
    }
  });

  it('polaridad invertida: no conduce y se informa', () => {
    const { cb, led } = ledCircuit(9, 330, true);
    const sim = new Simulator(cb.project);
    sim.dcOperatingPoint();
    expect(Math.abs(val(sim, led, 'Corriente'))).toBeLessThan(1e-9);
    expect(sim.reports().get(led)!.visual.brightness).toBe(0);
    // 9 V en inversa superan los 5 V que soporta un LED: debe advertirse como error.
    expect(sim.reports().get(led)!.warnings.some((w) => w.level === 'error' && /inverso/.test(w.message))).toBe(true);
    // Con 3 V en inversa solo se informa de que no conduce.
    const low = ledCircuit(3, 330, true);
    const sim3 = new Simulator(low.cb.project);
    sim3.dcOperatingPoint();
    expect(sim3.reports().get(low.led)!.warnings.some((w) => w.level === 'info' && /inversa/.test(w.message))).toBe(true);
  });

  it('sin resistencia limitadora a 9 V el LED se quema', () => {
    const { cb, pb } = withSupply(9, 3);
    const led = cb.place('led', {}, pb, '14b');
    cb.wire(hole(pb, 'T+2'), hole(pb, '14e'));
    cb.wire(hole(pb, '15e'), hole(pb, 'T-2'));
    const rt = createRuntime();
    const sim = new Simulator(cb.project, rt);
    sim.dcOperatingPoint();
    sim.reports();
    expect(rt.damaged.has(led)).toBe(true);
    // Al reconstruir, el LED dañado queda abierto
    const sim2 = new Simulator(cb.project, rt);
    sim2.dcOperatingPoint();
    expect(sim2.reports().get(led)!.visual.damaged).toBe(true);
  });

  it('circuito abierto: sin retorno a GND no circula corriente y se advierte', () => {
    const { cb, pb } = withSupply(9);
    cb.place('resistor', { resistance: 330 }, pb, '10a');
    const led = cb.place('led', {}, pb, '14b');
    cb.wire(hole(pb, 'T+2'), hole(pb, '10e'));
    const sim = new Simulator(cb.project);
    sim.dcOperatingPoint();
    expect(Math.abs(val(sim, led, 'Corriente'))).toBeLessThan(1e-9);
    expect(sim.issues.some((i) => /sin conectar/.test(i.message))).toBe(true);
  });
});

describe('Capacitores (transitorio)', () => {
  it('carga RC: V(τ) = 63,2 % de la fuente', () => {
    const { cb, pb } = withSupply(5);
    const r = cb.place('resistor', { resistance: 10000 }, pb, '10a'); // 10–14
    const c = cb.place('capacitor-electrolytic', { capacitance: 100e-6, vmax: '16' }, pb, '14c'); // + en 14, − en 15
    cb.wire(hole(pb, 'T+2'), hole(pb, '10e'));
    cb.wire(hole(pb, '15e'), hole(pb, 'T-2'));
    void r;
    const sim = new Simulator(cb.project);
    sim.reset();
    const dt = 1e-3;
    for (let k = 0; k < 1000; k++) expect(sim.step(dt)).toBe(true);
    const expected = 5 * (1 - Math.exp(-1));
    expect(val(sim, c, 'Voltaje')).toBeCloseTo(expected, 1);
    expect(Math.abs(val(sim, c, 'Voltaje') - expected) / expected).toBeLessThan(0.005);
  });

  it('descarga RC: V(τ) = 36,8 % del voltaje inicial', () => {
    const cb = new CircuitBuilder();
    const pb = cb.board();
    const c = cb.place('capacitor-electrolytic', { capacitance: 100e-6, v0: 5 }, pb, '20a'); // 20–21
    cb.place('resistor', { resistance: 1000 }, pb, '17b'); // 17–21
    cb.wire(hole(pb, '17c'), hole(pb, '20c'));
    const sim = new Simulator(cb.project);
    sim.reset();
    for (let k = 0; k < 1000; k++) sim.step(1e-4);
    expect(val(sim, c, 'Voltaje') / 5).toBeCloseTo(Math.exp(-1), 2);
  });

  it('en DC el capacitor es un circuito abierto', () => {
    const { cb, pb } = withSupply(5);
    cb.place('resistor', { resistance: 1000 }, pb, '10a');
    const c = cb.place('capacitor-ceramic', { capacitance: 1e-6 }, pb, '14c'); // 14–16
    cb.wire(hole(pb, 'T+2'), hole(pb, '10e'));
    cb.wire(hole(pb, '16e'), hole(pb, 'T-2'));
    const sim = new Simulator(cb.project);
    sim.dcOperatingPoint();
    expect(val(sim, c, 'Voltaje')).toBeCloseTo(5, 4);
  });

  it('electrolítico invertido genera error de polaridad', () => {
    const { cb, pb } = withSupply(5);
    const c = cb.place('capacitor-electrolytic', {}, pb, '21c', 2); // + en 21 (a la derecha), − en 20
    cb.wire(hole(pb, 'T+2'), hole(pb, '20e'));
    cb.wire(hole(pb, '21e'), hole(pb, 'T-2'));
    const sim = new Simulator(cb.project);
    sim.reset();
    for (let k = 0; k < 10; k++) sim.step(1e-3);
    expect(sim.reports().get(c)!.warnings.some((w) => /Polaridad invertida/.test(w.message))).toBe(true);
  });
});

describe('Transistores', () => {
  function npnSwitch(baseToSupply: boolean) {
    const { cb, pb } = withSupply(5);
    // Q1 PN2222A (E-B-C) en 30,31,32 fila c
    const q = cb.place('npn', { model: '2N2222A' }, pb, '30c');
    const rb = cb.place('resistor', { resistance: 10000 }, pb, '27b'); // 27–31
    const rc = cb.place('resistor', { resistance: 1000 }, pb, '32b'); // 32–36
    cb.wire(hole(pb, '30e'), hole(pb, 'T-10'));
    cb.wire(hole(pb, '36e'), hole(pb, 'T+10'));
    cb.wire(hole(pb, '27e'), hole(pb, baseToSupply ? 'T+8' : 'T-8'));
    return { cb, q, rb, rc };
  }

  it('NPN en saturación con Rb = 10 kΩ, Rc = 1 kΩ', () => {
    const { cb, q, rc } = npnSwitch(true);
    const sim = new Simulator(cb.project);
    expect(sim.dcOperatingPoint()).toBe(true);
    const r = sim.reports().get(q)!;
    expect(r.visual.region).toBe('saturación');
    expect(val(sim, q, 'Vce')).toBeLessThan(0.2);
    expect(val(sim, q, 'Vbe')).toBeGreaterThan(0.6);
    expect(val(sim, q, 'Vbe')).toBeLessThan(0.8);
    const ib = val(sim, q, 'Ib');
    expect(ib).toBeCloseTo((5 - val(sim, q, 'Vbe')) / 10000, 6);
    // Rc va de la columna 32 (terminal 1, colector) a la 36 (terminal 2, +5 V): la corriente fluye 2 → 1.
    expect(-val(sim, rc, 'Corriente')).toBeGreaterThan(0.0048);
  });

  it('NPN en corte con la base a GND', () => {
    const { cb, q } = npnSwitch(false);
    const sim = new Simulator(cb.project);
    sim.dcOperatingPoint();
    expect(sim.reports().get(q)!.visual.region).toBe('corte');
    expect(Math.abs(val(sim, q, 'Ic'))).toBeLessThan(1e-9);
  });

  it('NPN en región activa: Ic = βf·Ib', () => {
    const { cb, pb } = withSupply(5);
    const q = cb.place('npn', { model: '2N2222A' }, pb, '30c');
    cb.place('resistor', { resistance: 1e6 }, pb, '27b'); // Rb 1 MΩ
    cb.place('resistor', { resistance: 100 }, pb, '32b'); // Rc pequeña
    cb.wire(hole(pb, '30e'), hole(pb, 'T-10'));
    cb.wire(hole(pb, '36e'), hole(pb, 'T+10'));
    cb.wire(hole(pb, '27e'), hole(pb, 'T+8'));
    const sim = new Simulator(cb.project);
    sim.dcOperatingPoint();
    expect(sim.reports().get(q)!.visual.region).toBe('activa');
    const beta = val(sim, q, 'Ic') / val(sim, q, 'Ib');
    expect(beta).toBeGreaterThan(195);
    expect(beta).toBeLessThan(201);
  });

  it('PNP en saturación (emisor a +5 V, base a GND por 10 kΩ)', () => {
    const { cb, pb } = withSupply(5);
    const q = cb.place('pnp', { model: '2N3906' }, pb, '30c'); // E 30, B 31, C 32
    cb.place('resistor', { resistance: 10000 }, pb, '27b'); // 27–31
    cb.place('resistor', { resistance: 1000 }, pb, '32b'); // 32–36
    cb.wire(hole(pb, '30e'), hole(pb, 'T+10'));
    cb.wire(hole(pb, '36e'), hole(pb, 'T-10'));
    cb.wire(hole(pb, '27e'), hole(pb, 'T-8'));
    const sim = new Simulator(cb.project);
    expect(sim.dcOperatingPoint()).toBe(true);
    expect(sim.reports().get(q)!.visual.region).toBe('saturación');
    expect(val(sim, q, 'Ic')).toBeLessThan(-0.0045);
  });
});

describe('Fuentes y fallos', () => {
  it('cortocircuito directo de la batería se detecta antes de simular', () => {
    const cb = new CircuitBuilder();
    const bt = cb.free('battery-9v', {}, 0, 0);
    cb.wire(pin(bt, '+'), pin(bt, '-'));
    const sim = new Simulator(cb.project);
    expect(sim.issues.some((i) => i.level === 'error' && /Cortocircuito directo/.test(i.message))).toBe(true);
    sim.dcOperatingPoint();
    const i = val(sim, bt, 'Corriente');
    expect(i).toBeCloseTo(9.5 / 1.7, 3); // limitado por la resistencia interna
  });

  it('batería de 9 V: caída por resistencia interna con carga de 100 Ω', () => {
    const cb = new CircuitBuilder();
    const pb = cb.board();
    const bt = cb.free('battery-9v', { chemistry: 'alkaline', soc: 100 }, 0, -100);
    cb.place('resistor', { resistance: 100, power: '1' }, pb, '10a');
    cb.wire(pin(bt, '+'), hole(pb, '10e'));
    cb.wire(pin(bt, '-'), hole(pb, '14e'));
    const sim = new Simulator(cb.project);
    sim.dcOperatingPoint();
    const i = 9.5 / (100 + 1.7);
    expect(val(sim, bt, 'Corriente')).toBeCloseTo(i, 6);
    expect(val(sim, bt, 'Voltaje en bornes')).toBeCloseTo(9.5 - i * 1.7, 5);
  });

  it('fuente regulable entra en modo CC al superar el límite', () => {
    const { cb, pb, ps } = withSupply(10, 0.1);
    cb.place('resistor', { resistance: 10, power: '1' }, pb, '10a');
    cb.wire(hole(pb, 'T+2'), hole(pb, '10e'));
    cb.wire(hole(pb, '14e'), hole(pb, 'T-2'));
    const sim = new Simulator(cb.project);
    expect(sim.dcOperatingPoint()).toBe(true);
    expect(val(sim, ps, 'Corriente')).toBeCloseTo(0.1, 6);
    expect(val(sim, ps, 'Voltaje de salida')).toBeCloseTo(1, 4);
    expect(sim.reports().get(ps)!.visual.display![2]).toBe('CC');
  });

  it('pulsador: abre y cierra el circuito', () => {
    const { cb, pb } = withSupply(5);
    const sw = cb.place('pushbutton', {}, pb, '40e'); // 40e,40f,42e,42f
    const r = cb.place('resistor', { resistance: 1000 }, pb, '42a'); // 42–46
    cb.wire(hole(pb, 'T+12'), hole(pb, '40a'));
    cb.wire(hole(pb, '46a'), hole(pb, 'T-12'));
    const rt = createRuntime();
    const sim = new Simulator(cb.project, rt);
    sim.dcOperatingPoint();
    expect(Math.abs(val(sim, r, 'Corriente'))).toBeLessThan(1e-7);
    rt.pressed.add(sw);
    sim.dcOperatingPoint();
    expect(val(sim, r, 'Corriente')).toBeCloseTo(0.005, 5);
  });

  it('sin fuente se informa al usuario', () => {
    const cb = new CircuitBuilder();
    const pb = cb.board();
    cb.place('resistor', {}, pb, '10a');
    const sim = new Simulator(cb.project);
    expect(sim.issues.some((i) => /No hay fuente/.test(i.message))).toBe(true);
  });
});
