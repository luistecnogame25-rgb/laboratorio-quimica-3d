import { beforeAll, describe, expect, it } from 'vitest';
import { registerLibrary } from '../src/library';
import { CircuitBuilder, hole, pin } from '../src/library/builder';
import { parseProject, ProjectFormatError, createProject } from '../src/core/project';
import { ProjectStore } from '../src/core/store';
import { Simulator } from '../src/electrical/simulator';
import { parseEng, eng } from '../src/core/format';
import { rotate, toLocal, toWorld } from '../src/core/geometry';

beforeAll(() => registerLibrary());

describe('Formato de proyecto', () => {
  it('ida y vuelta JSON conserva componentes, cables y parámetros', () => {
    const cb = new CircuitBuilder('Prueba');
    const pb = cb.board();
    const r = cb.place('resistor', { resistance: 4700 }, pb, '3a', 0);
    const bt = cb.free('battery-9v', { soc: 80 }, 10, -90, 1);
    cb.wire(pin(bt, '+'), hole(pb, '3c'), '#ff0000');
    const text = JSON.stringify(cb.project);
    const back = parseProject(JSON.parse(text));
    expect(back).toEqual(cb.project);
    expect(back.components.find((c) => c.id === r)!.params.resistance).toBe(4700);
    // El circuito recuperado se simula igual
    const s1 = new Simulator(cb.project);
    const s2 = new Simulator(back);
    expect(s2.netlist.nets.length).toBe(s1.netlist.nets.length);
  });

  it('rechaza archivos que no son proyectos', () => {
    expect(() => parseProject({ hello: 1 })).toThrow(ProjectFormatError);
    expect(() => parseProject({ format: 'lab3d-project', version: 99, components: [], wires: [] })).toThrow(/Versión/);
    expect(() =>
      parseProject({ format: 'lab3d-project', version: 1, components: [{ id: 'x', type: 'reactor-nuclear', x: 0, z: 0 }], wires: [] }),
    ).toThrow(/desconocido/);
  });

  it('elimina cables huérfanos al importar', () => {
    const p = createProject();
    (p.wires as unknown[]).push({ id: 'w', a: { kind: 'pin', inst: 'nada', term: '1' }, b: { kind: 'hole', board: 'nada', hole: '1a' }, color: 'auto' });
    expect(parseProject(JSON.parse(JSON.stringify(p))).wires.length).toBe(0);
  });
});

describe('Historial deshacer/rehacer', () => {
  it('deshace y rehace cambios', () => {
    const store = new ProjectStore(createProject());
    store.mutate('a', (p) => p.components.push({ id: 'r1', type: 'resistor', params: {}, x: 0, z: 0, rot: 0 }));
    store.mutate('b', (p) => (p.components[0].x = 10));
    expect(store.project.components[0].x).toBe(10);
    store.undo();
    expect(store.project.components[0].x).toBe(0);
    store.undo();
    expect(store.project.components.length).toBe(0);
    store.redo();
    store.redo();
    expect(store.project.components[0].x).toBe(10);
    expect(store.canRedo()).toBe(false);
  });

  it('borrar un componente elimina sus cables', () => {
    const cb = new CircuitBuilder();
    const pb = cb.board();
    const bt = cb.free('battery-9v', {}, 0, -90);
    cb.wire(pin(bt, '+'), hole(pb, '1a'));
    const store = new ProjectStore(cb.project);
    store.mutate('del', (p) => (p.components = p.components.filter((c) => c.id !== bt)));
    expect(store.project.wires.length).toBe(0);
  });
});

describe('Utilidades', () => {
  it('notación de ingeniería', () => {
    expect(eng(4700, 'Ω')).toBe('4.7 kΩ');
    expect(eng(0.0201, 'A')).toBe('20.1 mA');
    expect(eng(100e-6, 'F')).toBe('100 µF');
    expect(parseEng('4k7')).toBeCloseTo(4700);
    expect(parseEng('100n')).toBeCloseTo(100e-9);
    expect(parseEng('2.2M')).toBeCloseTo(2.2e6);
  });

  it('rotaciones de 90° son invertibles', () => {
    for (let r = 0; r < 4; r++) {
      const o = { x: 3, z: -7, rot: r };
      const p = { x: 1.27, z: 5.08 };
      const back = toLocal(toWorld(p, o), o);
      expect(back.x).toBeCloseTo(p.x);
      expect(back.z).toBeCloseTo(p.z);
    }
    const q = rotate({ x: 1, z: 0 }, 1);
    expect(q.x).toBeCloseTo(0);
    expect(q.z).toBeCloseTo(-1);
  });
});
