import { describe, expect, it } from 'vitest';
import { analyzeCombination, chargeBalancedRatios } from '../src/chem/combination';
import { parseExperiment } from '../src/core/project';

describe('Análisis de combinaciones (Fase 2)', () => {
  it('2 H + 1 O → agua, compuesto conocido con geometría', () => {
    const r = analyzeCombination([1, 8, 1]);
    expect(r.verdict).toBe('conocido');
    expect(r.record!.id).toBe('agua');
  });
  it('H₂ es conocido pero la fuente no tiene geometría 3D: no se forma', () => {
    expect(analyzeCombination([1, 1]).verdict).toBe('conocido-sin-geometria');
  });
  it('Na + Cl → red cristalina, no molécula', () => {
    const r = analyzeCombination([11, 17]);
    expect(r.verdict).toBe('red-cristalina');
    expect(r.record!.id).toBe('cloruro-sodio');
  });
  it('He + H → incompatible en condiciones ordinarias', () => {
    expect(analyzeCombination([2, 1]).verdict).toBe('incompatible');
  });
  it('una combinación sin estructura documentada no se presenta como compuesto', () => {
    const r = analyzeCombination([11, 8, 8]);
    expect(r.verdict).toBe('no-validado');
    expect(r.record).toBeUndefined();
    expect(r.predictions).toContain('Na2O');
  });
  it('predicciones por estados de oxidación', () => {
    expect(chargeBalancedRatios(12, 8)).toContain('MgO');
    expect(chargeBalancedRatios(13, 8)).toContain('Al2O3');
  });
  it('un átomo aislado no se analiza', () => expect(analyzeCombination([6]).verdict).toBe('insuficiente'));
});

describe('Migración de experimentos', () => {
  it('un experimento v1 se importa como v2 sin enlaces', () => {
    const e = parseExperiment({ format: 'quimlab-experiment', version: 1, atoms: [{ id: 'a', z: 8, pos: [0, 0, 0] }], measurements: [] });
    expect(e.version).toBe(2);
    expect(e.bonds).toEqual([]);
    expect(e.structures).toEqual([]);
  });
  it('los enlaces sin estructura documentada se descartan al importar', () => {
    const e = parseExperiment({ format: 'quimlab-experiment', version: 2, atoms: [{ id: 'a', z: 1, pos: [0, 0, 0] }, { id: 'b', z: 1, pos: [1, 0, 0] }], bonds: [{ a: 'a', b: 'b', order: 1, structure: 'inventada' }], structures: [] });
    expect(e.bonds).toEqual([]);
  });
});
