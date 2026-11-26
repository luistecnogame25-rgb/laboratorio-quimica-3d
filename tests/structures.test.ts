/**
 * Validación de estructuras importadas frente a valores experimentales de referencia
 * (geometrías de equilibrio en fase gas, NIST CCCBDB; parámetros de red de la propia COD).
 * Los conformeros de PubChem son CALCULADOS (MMFF94s): se admite una tolerancia y se documenta.
 */
import { describe, expect, it } from 'vitest';
import { KNOWN_DEVIATIONS, bondAngles, bondInfo, centralGeometries, coordination, empiricalFormula, findByComposition, polarityEstimate, reduceHill, structure, STRUCTURES } from '../src/chem/structures';

const s = (id: string) => structure(id)!;
const firstBond = (id: string) => bondInfo(s(id))[0];

describe('Estructuras importadas', () => {
  it('cada molécula con geometría tiene coordenadas y enlaces coherentes', () => {
    for (const r of STRUCTURES.filter((x) => x.geometry === 'pubchem3d')) {
      expect(r.atoms.every((a) => a.p)).toBe(true);
      for (const b of bondInfo(r)) expect(b.length, `${r.id}`).toBeGreaterThan(0.7), expect(b.length).toBeLessThan(2.2);
    }
  });
  it('sin conformero 3D en la fuente no se inventan coordenadas', () => {
    expect(s('hidrogeno').geometry).toBe('none');
    expect(s('hidrogeno').atoms.every((a) => a.p === null)).toBe(true);
    expect(s('cisplatino').geometry).toBe('none');
  });
});

describe('Longitudes de enlace frente a valores experimentales (±0,04 Å)', () => {
  const cases: [string, number][] = [
    ['agua', 0.958],
    ['metano', 1.087],
    ['amoniaco', 1.012],
    ['dioxido-carbono', 1.16],
    ['nitrogeno', 1.098],
    ['oxigeno', 1.208],
  ];
  for (const [id, ref] of cases) it(`${id}: ${ref} Å`, () => expect(Math.abs(firstBond(id).length - ref)).toBeLessThan(0.04));

  it('CO: discrepancia documentada (no se oculta ni se corrige)', () => {
    const d = Math.abs(firstBond('monoxido-carbono').length - 1.128);
    expect(d).toBeGreaterThan(0.04);
    expect(KNOWN_DEVIATIONS['monoxido-carbono'].reference).toMatch(/1,128/);
  });

  it('órdenes de enlace: O₂ doble, N₂ triple, eteno doble, etino triple', () => {
    expect(firstBond('oxigeno').order).toBe(2);
    expect(firstBond('nitrogeno').order).toBe(3);
    expect(bondInfo(s('eteno')).some((b) => b.order === 2)).toBe(true);
    expect(bondInfo(s('etino')).some((b) => b.order === 3)).toBe(true);
  });

  it('benceno: los seis C–C tienen la misma longitud (deslocalización) aunque la fuente use Kekulé', () => {
    const cc = bondInfo(s('benceno')).filter((b) => s('benceno').atoms[b.a].z === 6 && s('benceno').atoms[b.b].z === 6);
    expect(cc.length).toBe(6);
    const L = cc.map((b) => b.length);
    expect(Math.max(...L) - Math.min(...L)).toBeLessThan(0.01);
    expect(Math.abs(L[0] - 1.397)).toBeLessThan(0.04);
  });
});

describe('Ángulos y geometría VSEPR', () => {
  const angle = (id: string) => bondAngles(s(id))[0].value;
  it('ángulos de referencia (±3°)', () => {
    expect(Math.abs(angle('agua') - 104.5)).toBeLessThan(3);
    expect(Math.abs(angle('metano') - 109.47)).toBeLessThan(1);
    expect(Math.abs(angle('amoniaco') - 106.7)).toBeLessThan(3);
    expect(Math.abs(angle('dioxido-carbono') - 180)).toBeLessThan(1);
  });
  it('geometrías VSEPR', () => {
    const g = (id: string) => centralGeometries(s(id))[0];
    expect([g('agua').geometry, g('agua').lonePairs]).toEqual(['Angular', 2]);
    expect([g('amoniaco').geometry, g('amoniaco').lonePairs]).toEqual(['Piramidal trigonal', 1]);
    expect(g('metano').geometry).toBe('Tetraédrica');
    expect(g('dioxido-carbono').geometry).toBe('Lineal');
    expect(g('ion-amonio').geometry).toBe('Tetraédrica');
    expect(g('metanal').geometry).toBe('Trigonal plana');
  });
  it('polaridad estimada: H₂O y NH₃ polares; CO₂, CH₄ y C₆H₆ apolares', () => {
    expect(polarityEstimate(s('agua'))!.polar).toBe(true);
    expect(polarityEstimate(s('amoniaco'))!.polar).toBe(true);
    expect(polarityEstimate(s('dioxido-carbono'))!.polar).toBe(false);
    expect(polarityEstimate(s('metano'))!.polar).toBe(false);
    expect(polarityEstimate(s('benceno'))!.polar).toBe(false);
  });
});

describe('Cristales (COD, datos experimentales)', () => {
  const co = (id: string, c: string) => coordination(s(id)).find((x) => x.center === c)!;
  it('NaCl: coordinación 6, d(Na–Cl) = a/2', () => {
    const c = co('cloruro-sodio', 'Na');
    expect(c.neighbor).toBe('Cl');
    expect(c.count).toBe(6);
    expect(c.distance).toBeCloseTo(s('cloruro-sodio').cell!.a / 2, 3);
    expect(empiricalFormula(s('cloruro-sodio'))).toBe('ClNa');
  });
  it('MgO: coordinación 6', () => expect(co('oxido-magnesio', 'Mg').count).toBe(6));
  it('Cu (FCC): 12 vecinos a a/√2', () => {
    const c = co('cobre', 'Cu');
    expect(c.count).toBe(12);
    expect(c.distance).toBeCloseTo(3.615 / Math.SQRT2, 3);
  });
  it('Fe α (BCC): 8 vecinos a a·√3/2', () => {
    const c = co('hierro-alfa', 'Fe');
    expect(c.count).toBe(8);
    expect(c.distance).toBeCloseTo((2.866 * Math.sqrt(3)) / 2, 3);
  });
  it('calcita: Z = 6 (30 átomos por celda), C rodeado por 3 O', () => {
    expect(s('calcita').cellAtoms!.length).toBe(30);
    expect(empiricalFormula(s('calcita'))).toBe('CCaO3');
    const c = co('calcita', 'C');
    expect([c.neighbor, c.count]).toEqual(['O', 3]);
    expect(Math.abs(c.distance - 1.28)).toBeLessThan(0.03);
  });
});

describe('Búsqueda por composición', () => {
  it('encuentra moléculas exactas y cristales por fórmula empírica', () => {
    expect(findByComposition('H2O').exact[0].id).toBe('agua');
    expect(findByComposition('ClNa').empirical[0].id).toBe('cloruro-sodio');
    expect(findByComposition(reduceHill('Cl2Na2')).empirical[0].id).toBe('cloruro-sodio');
    expect(findByComposition('HXe').exact.length).toBe(0);
  });
});
