import { beforeAll, describe, expect, it } from 'vitest';
import { registerLibrary } from '../src/library';
import { CATEGORIES, catalogItems, isAvailable, itemsIn, searchCatalog } from '../src/library/taxonomy';
import { getDef, hasDef, withDefaults } from '../src/core/registry';

beforeAll(() => registerLibrary());

describe('Catálogo jerárquico', () => {
  it('tiene las 13 categorías con sus subcategorías', () => {
    expect(CATEGORIES.length).toBe(13);
    expect(CATEGORIES.find((c) => c.id === 'sensores')!.subcategories.length).toBe(13);
  });

  it('cada artículo disponible apunta a un componente registrado con parámetros válidos', () => {
    for (const it of catalogItems().filter((i) => i.type)) {
      expect(hasDef(it.type!), it.id).toBe(true);
      const def = getDef(it.type!);
      const keys = new Set(def.params.map((p) => p.key));
      for (const k of Object.keys(it.params ?? {})) expect(keys.has(k), `${it.id}.${k}`).toBe(true);
      expect(def.terminals(withDefaults(def, it.params ?? {})).length >= 0).toBe(true);
    }
  });

  it('los planificados no son colocables y llevan su fase', () => {
    const planned = catalogItems().filter((i) => !isAvailable(i));
    expect(planned.length).toBeGreaterThan(50);
    for (const p of planned) expect(p.phase).toBeGreaterThanOrEqual(2);
  });

  it('subcategorías navegables con contenido disponible', () => {
    expect(itemsIn('resistencias', 'fijas').length).toBeGreaterThan(10);
    expect(itemsIn('transistores', 'npn').every(isAvailable)).toBe(true);
  });
});

describe('Búsqueda', () => {
  it('"10 kΩ" encuentra primero resistencias de 10 kΩ', () => {
    const r = searchCatalog('10 kΩ');
    expect(r[0].type).toBe('resistor');
    expect(r[0].params!.resistance).toBe(10000);
  });
  it('"10k" y "10000" también', () => {
    expect(searchCatalog('10k')[0].params!.resistance).toBe(10000);
    expect(searchCatalog('10000')[0].params!.resistance).toBe(10000);
  });
  it('"MOSFET" devuelve los MOSFET (planificados)', () => {
    const r = searchCatalog('MOSFET');
    expect(r.length).toBeGreaterThanOrEqual(5);
    // Primero los transistores MOSFET; después otros artículos que los mencionan (p. ej. drivers).
    expect(r.slice(0, 5).every((i) => i.category === 'transistores')).toBe(true);
  });
  it('por referencia, categoría y característica', () => {
    expect(searchCatalog('2n2222')[0].reference).toBe('PN2222A');
    expect(searchCatalog('arduino uno')[0].subcategory).toBe('uno');
    expect(searchCatalog('electrolitico 100uF').some((i) => i.params?.capacitance === 100e-6)).toBe(true);
    expect(searchCatalog('led azul')[0].params!.color).toBe('blue');
  });
});
