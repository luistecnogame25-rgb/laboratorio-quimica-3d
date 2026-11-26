/**
 * Validación de la base de elementos. Los valores de referencia de esta prueba son
 * conocidos independientemente de PubChem (configuraciones de tablas NIST/IUPAC de uso común,
 * posiciones en la tabla), lo que permite detectar errores de importación o de cálculo.
 */
import { describe, expect, it } from 'vitest';
import { ELEMENTS, FAMILIES, blockOf, bySymbol, element, groupOf, parseConfiguration, periodOf, searchElements } from '../src/chem/elements';

describe('Base de datos de 118 elementos', () => {
  it('contiene los 118 elementos en orden, con símbolos únicos', () => {
    expect(ELEMENTS.length).toBe(118);
    ELEMENTS.forEach((e, i) => expect(e.z).toBe(i + 1));
    expect(new Set(ELEMENTS.map((e) => e.symbol)).size).toBe(118);
    expect(element(118).symbol).toBe('Og');
    expect(element(118).name).toBe('Oganesón');
  });

  it('la configuración electrónica de cada elemento suma Z electrones', () => {
    for (const e of ELEMENTS) {
      const total = e.configuration.subshells.reduce((a, s) => a + s.electrons, 0);
      expect(total, `${e.symbol}: ${e.configuration.raw}`).toBe(e.z);
      for (const s of e.configuration.subshells) expect(s.electrons).toBeLessThanOrEqual([2, 6, 10, 14][s.l]);
    }
  });

  it('los electrones por nivel suman Z', () => {
    for (const e of ELEMENTS) expect(e.shells.reduce((a, b) => a + b, 0)).toBe(e.z);
    expect(bySymbol('Na')!.shells).toEqual([2, 8, 1]);
    expect(bySymbol('Fe')!.shells).toEqual([2, 8, 14, 2]);
  });

  it('configuraciones conocidas, incluidas las excepciones a la regla de Aufbau', () => {
    expect(bySymbol('C')!.configuration.short).toBe('[He] 2s2 2p2');
    expect(bySymbol('Fe')!.configuration.short).toBe('[Ar] 3d6 4s2');
    expect(bySymbol('Cr')!.configuration.short).toBe('[Ar] 3d5 4s1');
    expect(bySymbol('Cu')!.configuration.short).toBe('[Ar] 3d10 4s1');
    expect(bySymbol('Pd')!.configuration.short).toBe('[Kr] 4d10');
    expect(bySymbol('Au')!.configuration.short).toBe('[Xe] 4f14 5d10 6s1');
  });

  it('identifica datos predichos o calculados', () => {
    expect(bySymbol('Og')!.configuration.status).toBe('predicha');
    expect(bySymbol('Mt')!.configuration.status).toBe('calculada');
    expect(bySymbol('Fe')!.configuration.status).toBe('fuente');
    expect(bySymbol('Og')!.state.predicted).toBe(true);
  });

  it('grupos, períodos y bloques', () => {
    const cases: [string, number, number | null, string][] = [
      ['H', 1, 1, 's'], ['He', 1, 18, 's'], ['B', 2, 13, 'p'], ['Ne', 2, 18, 'p'], ['Na', 3, 1, 's'], ['Cl', 3, 17, 'p'],
      ['Sc', 4, 3, 'd'], ['Zn', 4, 12, 'd'], ['Kr', 4, 18, 'p'], ['Ag', 5, 11, 'd'], ['Cs', 6, 1, 's'], ['La', 6, null, 'f'],
      ['Yb', 6, null, 'f'], ['Lu', 6, 3, 'd'], ['Hf', 6, 4, 'd'], ['Rn', 6, 18, 'p'], ['Fr', 7, 1, 's'], ['U', 7, null, 'f'], ['Lr', 7, 3, 'd'], ['Og', 7, 18, 'p'],
    ];
    for (const [s, p, g, b] of cases) {
      const e = bySymbol(s)!;
      expect([periodOf(e.z), groupOf(e.z), blockOf(e.z)], s).toEqual([p, g, b]);
    }
  });

  it('cada posición de la tabla es única', () => {
    const keys = new Set(ELEMENTS.map((e) => `${e.pos.row}-${e.pos.col}`));
    expect(keys.size).toBe(118);
  });

  it('las 10 familias aparecen y los valores numéricos tienen rangos físicos plausibles', () => {
    expect(new Set(ELEMENTS.map((e) => e.family)).size).toBe(Object.keys(FAMILIES).length);
    for (const e of ELEMENTS) {
      if (e.electronegativity.value !== null) expect(e.electronegativity.value).toBeGreaterThan(0.6), expect(e.electronegativity.value).toBeLessThan(4.1);
      if (e.ionizationEnergy.value !== null) expect(e.ionizationEnergy.value).toBeGreaterThan(3), expect(e.ionizationEnergy.value).toBeLessThan(25);
      if (e.meltingK.value !== null) expect(e.meltingK.value).toBeGreaterThan(0);
    }
  });

  it('valores de referencia independientes (Pauling, energía de ionización)', () => {
    expect(bySymbol('F')!.electronegativity.value).toBeCloseTo(3.98, 2);
    expect(bySymbol('C')!.electronegativity.value).toBeCloseTo(2.55, 2);
    expect(bySymbol('H')!.ionizationEnergy.value).toBeCloseTo(13.598, 2);
    expect(bySymbol('He')!.ionizationEnergy.value).toBeCloseTo(24.587, 2);
  });

  it('electrones de valencia solo para bloques s y p', () => {
    expect(bySymbol('O')!.valenceElectrons).toBe(6);
    expect(bySymbol('Na')!.valenceElectrons).toBe(1);
    expect(bySymbol('Br')!.valenceElectrons).toBe(7);
    expect(bySymbol('Fe')!.valenceElectrons).toBeNull();
  });

  it('no rellena datos ausentes', () => {
    const og = bySymbol('Og')!;
    expect(og.electronegativity.value).toBeNull();
    expect(og.cpk).toBeNull();
  });

  it('búsqueda por nombre, símbolo y número', () => {
    expect(searchElements('oro')[0].symbol).toBe('Au');
    expect(searchElements('Fe')[0].symbol).toBe('Fe');
    expect(searchElements('26')[0].symbol).toBe('Fe');
    expect(searchElements('nitrogeno')[0].symbol).toBe('N');
    expect(searchElements('gold')[0].symbol).toBe('Au');
  });

  it('parseo de configuraciones con subniveles desordenados', () => {
    const r = parseConfiguration('[Rn]7s2 7p6 5f14 6d10 (predicted)');
    expect(r.status).toBe('predicha');
    expect(r.subshells.reduce((a, s) => a + s.electrons, 0)).toBe(118);
  });
});
