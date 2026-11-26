import { describe, expect, it } from 'vitest';
import { angle, distance, hillFormula } from '../src/chem/formula';
import { createExperiment, ExperimentFormatError, parseExperiment } from '../src/core/project';
import { ProjectStore } from '../src/core/store';

describe('Notación de Hill', () => {
  it('ordena C, H y después alfabéticamente', () => {
    expect(hillFormula([6, 1, 1, 1, 1])).toBe('CH4');
    expect(hillFormula([8, 1, 1])).toBe('H2O');
    expect(hillFormula([17, 11])).toBe('ClNa');
    expect(hillFormula([6, 6, 1, 1, 1, 1, 1, 1, 8])).toBe('C2H6O');
  });
});

describe('Geometría de medición', () => {
  it('distancia y ángulo', () => {
    expect(distance([0, 0, 0], [3, 4, 0])).toBeCloseTo(5);
    expect(angle([1, 0, 0], [0, 0, 0], [0, 1, 0])).toBeCloseTo(90);
    expect(angle([1, 0, 0], [0, 0, 0], [-1, 0, 0])).toBeCloseTo(180);
  });
});

describe('Experimentos: guardado y recuperación', () => {
  it('ida y vuelta JSON', () => {
    const e = createExperiment('Prueba');
    e.atoms.push({ id: 'a1', z: 8, pos: [0, 1, 0] }, { id: 'a2', z: 1, pos: [0.96, 1, 0] });
    e.measurements.push({ id: 'm1', kind: 'distance', atoms: ['a1', 'a2'], value: 0.96, unit: 'Å' });
    const back = parseExperiment(JSON.parse(JSON.stringify(e)));
    expect(back).toEqual(e);
    expect(back.sources[0]).toMatch(/PubChem/);
  });
  it('rechaza datos inválidos y limpia mediciones huérfanas', () => {
    expect(() => parseExperiment({ format: 'x' })).toThrow(ExperimentFormatError);
    expect(() => parseExperiment({ format: 'quimlab-experiment', version: 1, atoms: [{ id: 'a', z: 119, pos: [0, 0, 0] }] })).toThrow(/Número atómico/);
    const p = parseExperiment({ format: 'quimlab-experiment', version: 1, atoms: [], measurements: [{ id: 'm', kind: 'distance', atoms: ['x', 'y'], value: 1, unit: 'Å' }] });
    expect(p.measurements).toEqual([]);
  });
  it('deshacer/rehacer', () => {
    const s = new ProjectStore(createExperiment());
    s.mutate('add', (p) => p.atoms.push({ id: 'a', z: 6, pos: [0, 0, 0] }));
    s.mutate('move', (p) => (p.atoms[0].pos = [1, 0, 0]));
    s.undo();
    expect(s.project.atoms[0].pos).toEqual([0, 0, 0]);
    s.undo();
    expect(s.project.atoms.length).toBe(0);
    s.redo();
    expect(s.project.atoms.length).toBe(1);
  });
});
