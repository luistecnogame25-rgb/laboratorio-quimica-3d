import { beforeAll, describe, expect, it } from 'vitest';
import { registerLibrary } from '../src/library';
import { TEMPLATES, getTemplate } from '../src/lab/templates';
import { createRuntime, Simulator } from '../src/electrical/simulator';
import { getDef } from '../src/core/registry';
import { pinKey, terminalsOf } from '../src/electrical/netlist';

beforeAll(() => registerLibrary());

describe('Plantillas / circuitos de referencia', () => {
  for (const t of TEMPLATES) {
    it(`${t.name}: patas insertadas, sin avisos y converge`, () => {
      const { project } = t.build();
      const sim = new Simulator(project);
      for (const c of project.components) {
        if (!getDef(c.type).insertable) continue;
        for (const term of terminalsOf(c)) expect(sim.netlist.insertion.has(pinKey(c.id, term.id)), `${c.type}.${term.id}`).toBe(true);
      }
      expect(sim.issues.filter((i) => i.level !== 'info')).toEqual([]);
      expect(sim.dcOperatingPoint()).toBe(true);
      sim.reset();
      for (let k = 0; k < 50; k++) expect(sim.step(project.simulation.dt)).toBe(true);
    });
  }

  it('divisor: 6,803 V en el punto medio', () => {
    const { project, probes } = getTemplate('divisor')!.build();
    const sim = new Simulator(project);
    sim.dcOperatingPoint();
    expect(sim.endVoltage(probes!.red)!).toBeCloseTo(6.803, 2);
  });

  it('transistor: LED apagado sin pulsar y ~15,5 mA al pulsar', () => {
    const { project } = getTemplate('transistor-switch')!.build();
    const rt = createRuntime();
    const sim = new Simulator(project, rt);
    const led = project.components.find((c) => c.type === 'led')!.id;
    const sw = project.components.find((c) => c.type === 'pushbutton')!.id;
    const iLed = () => sim.reports().get(led)!.values.find((v) => v.label === 'Corriente')!.value;
    sim.dcOperatingPoint();
    expect(iLed()).toBeLessThan(1e-5);
    rt.pressed.add(sw);
    sim.dcOperatingPoint();
    expect(iLed()).toBeGreaterThan(0.015);
    expect(iLed()).toBeLessThan(0.0165);
  });

  it('RC: 63 % de 5 V tras τ = 2,2 s y descarga al cambiar el interruptor', () => {
    const { project, probes } = getTemplate('rc')!.build();
    const sim = new Simulator(project, createRuntime());
    sim.reset();
    const dt = 2e-3;
    for (let k = 0; k < 1100; k++) sim.step(dt);
    expect(sim.endVoltage(probes!.red)!).toBeCloseTo(5 * (1 - Math.exp(-1)), 1);
  });

  it('límite de corriente: la fuente entra en CC a 20 mA', () => {
    const { project } = getTemplate('limite-corriente')!.build();
    const sim = new Simulator(project);
    sim.dcOperatingPoint();
    const ps = project.components.find((c) => c.type === 'dc-supply')!.id;
    const r = sim.reports().get(ps)!;
    expect(r.visual.display![2]).toBe('CC');
    expect(r.values.find((v) => v.label === 'Corriente')!.value).toBeCloseTo(0.02, 5);
  });
});
