import { describe, expect, it } from 'vitest';
import { checkBond, maxValence, recognize, typicalValence, valenceReport, type SimpleBond } from '../src/chem/bonding';
import { element } from '../src/chem/elements';
import { parseExperiment } from '../src/core/project';

const at = (id: string, z: number) => ({ id, z });

describe('Constructor de enlaces manual', () => {
  it('valencias típicas de libro de texto', () => {
    expect([1, 6, 7, 8, 9].map((z) => typicalValence(element(z)))).toEqual([1, 4, 3, 2, 1]);
    expect(maxValence(element(7))).toBe(4); // NH4+ (coordinado)
    expect(maxValence(element(16))).toBe(6); // H2SO4 (capa expandida)
    expect(typicalValence(element(2))).toBe(0);
  });

  it('no deja superar la valencia: el H solo admite un enlace', () => {
    const bonds: SimpleBond[] = [{ a: 'h', b: 'o', order: 1 }];
    const r = checkBond(1, 8, 'h', 'o2', 1, bonds);
    expect(r.ok).toBe(false);
  });

  it('rechaza gases nobles, H con doble enlace; metal–metal solo como unión metálica simple', () => {
    expect(checkBond(2, 1, 'a', 'b', 1, []).ok).toBe(false);
    const m = checkBond(29, 26, 'a', 'b', 1, []);
    expect(m.ok && m.kind).toMatch(/Metálico/);
    expect(checkBond(29, 26, 'a', 'b', 2, []).ok).toBe(false);
    expect(checkBond(1, 8, 'a', 'b', 2, []).ok).toBe(false);
    expect(checkBond(17, 8, 'a', 'b', 2, []).ok).toBe(false);
  });

  it('acepta enlaces válidos y orienta su tipo por Δχ', () => {
    const r = checkBond(1, 8, 'a', 'b', 1, []);
    expect(r.ok && r.kind).toMatch(/Covalente polar/);
    const n = checkBond(11, 17, 'a', 'b', 1, []);
    expect(n.ok && n.kind).toMatch(/Iónico/);
    expect(checkBond(6, 6, 'a', 'b', 3, []).ok).toBe(true);
  });

  it('la capa expandida solo se permite hacia O, F o Cl', () => {
    const bonds: SimpleBond[] = [
      { a: 's', b: 'h1', order: 1 },
      { a: 's', b: 'h2', order: 1 },
    ];
    expect(checkBond(16, 1, 's', 'h3', 1, bonds).ok).toBe(false);
    expect(checkBond(16, 8, 's', 'o1', 2, bonds).ok).toBe(true);
  });

  it('cambiar el orden de un enlace existente descuenta el anterior', () => {
    const bonds: SimpleBond[] = [{ a: 'c1', b: 'c2', order: 1 }];
    expect(checkBond(6, 6, 'c1', 'c2', 3, bonds).ok).toBe(true);
  });

  it('reconoce el agua construida a mano', () => {
    const atoms = [at('o', 8), at('h1', 1), at('h2', 1)];
    const r = recognize(atoms, [
      { a: 'o', b: 'h1', order: 1 },
      { a: 'h2', b: 'o', order: 1 },
    ]);
    expect(r?.record.id).toBe('agua');
    expect(new Set(r!.map)).toEqual(new Set(['o', 'h1', 'h2']));
  });

  it('reconoce el CO₂ solo con dobles enlaces', () => {
    const atoms = [at('c', 6), at('o1', 8), at('o2', 8)];
    expect(recognize(atoms, [{ a: 'c', b: 'o1', order: 2 }, { a: 'c', b: 'o2', order: 2 }])?.record.id).toBe('dioxido-carbono');
    expect(recognize(atoms, [{ a: 'c', b: 'o1', order: 1 }, { a: 'c', b: 'o2', order: 1 }])).toBeNull();
  });

  it('O–O simple no es O₂; al pasarlo a doble se reconoce el oxígeno', () => {
    const atoms = [at('a', 8), at('b', 8)];
    expect(recognize(atoms, [{ a: 'a', b: 'b', order: 1 }])).toBeNull();
    expect(checkBond(8, 8, 'a', 'b', 2, [{ a: 'a', b: 'b', order: 1 }]).ok).toBe(true);
    expect(recognize(atoms, [{ a: 'a', b: 'b', order: 2 }])?.record.id).toBe('oxigeno');
  });

  it('distingue isómeros por la conectividad: H–O–H–… no es agua', () => {
    const atoms = [at('o', 8), at('h1', 1), at('h2', 1)];
    expect(recognize(atoms, [{ a: 'o', b: 'h1', order: 1 }])).toBeNull();
  });

  it('reconoce el etanol con cualquier orden de construcción', () => {
    const ids = ['c1', 'c2', 'o', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
    const z = [6, 6, 8, 1, 1, 1, 1, 1, 1];
    const atoms = ids.map((id, i) => at(id, z[i]));
    const bonds: SimpleBond[] = [
      { a: 'h6', b: 'o', order: 1 },
      { a: 'c1', b: 'c2', order: 1 },
      { a: 'c2', b: 'o', order: 1 },
      { a: 'c1', b: 'h1', order: 1 },
      { a: 'c1', b: 'h2', order: 1 },
      { a: 'c1', b: 'h3', order: 1 },
      { a: 'c2', b: 'h4', order: 1 },
      { a: 'h5', b: 'c2', order: 1 },
    ];
    expect(recognize(atoms, bonds)?.record.id).toBe('etanol');
  });

  it('informa de valencias incompletas y cargas formales', () => {
    const r = valenceReport([at('c', 6), at('h', 1)], [{ a: 'c', b: 'h', order: 1 }]);
    expect(r.complete).toBe(false);
    expect(r.missing[0]).toMatchObject({ symbol: 'C', missing: 3 });
    const nh4 = valenceReport([at('n', 7), at('a', 1), at('b', 1), at('c', 1), at('d', 1)], ['a', 'b', 'c', 'd'].map((h) => ({ a: 'n', b: h, order: 1 })));
    expect(nh4.totalCharge).toBe(1);
    expect(nh4.complete).toBe(true);
  });

  it('los enlaces manuales se guardan y se recuperan del archivo', () => {
    const e = parseExperiment({
      format: 'quimlab-experiment',
      version: 2,
      atoms: [
        { id: 'a', z: 1, pos: [0, 0, 0] },
        { id: 'b', z: 8, pos: [1, 0, 0] },
      ],
      bonds: [
        { a: 'a', b: 'b', order: 1, manual: true },
        { a: 'a', b: 'b', order: 1 },
      ],
    });
    expect(e.bonds).toEqual([{ a: 'a', b: 'b', order: 1, manual: true }]);
  });
});
