import { describe, expect, it } from 'vitest';
import { describeLooseAtom, describeStructure } from '../src/chem/description';
import { bySymbol } from '../src/chem/elements';
import { structure } from '../src/chem/structures';

const d = (id: string) => describeStructure(structure(id)!);
const bond = (id: string, label: string) => d(id).bonds.find((b) => b.label === label)!;

describe('Descripción de sustancias del laboratorio', () => {
  it('agua: sustancia molecular inorgánica, O–H covalente simple polar con δ⁻ en O', () => {
    const w = d('agua');
    expect(w.material).toBe('Sustancia molecular (covalente)');
    expect(w.organic).toBe(false);
    const b = bond('agua', 'O–H');
    expect([b.bondType, b.order, b.sigmaPi, b.polarity, b.negativeEnd, b.count]).toEqual(['Covalente', 'simple', '1 σ', 'polar', 'O', 2]);
    expect(b.dChi).toBeCloseTo(1.24, 2);
    expect(w.geometry[0]).toMatch(/O: angular/);
    expect(w.polarity).toMatch(/polar/);
    expect(w.intermolecular.join(' ')).toMatch(/Puentes de hidrógeno/);
  });
  it('O₂ doble no polar (1 σ + 1 π); N₂ triple (1 σ + 2 π)', () => {
    const o = d('oxigeno').bonds[0];
    expect([o.order, o.sigmaPi, o.polarity]).toEqual(['doble', '1 σ + 1 π', 'no polar']);
    expect(d('nitrogeno').bonds[0].sigmaPi).toBe('1 σ + 2 π');
  });
  it('metano: orgánico, C–H no polar (Δχ 0,35), apolar, solo London', () => {
    const m = d('metano');
    expect(m.organic).toBe(true);
    expect(bond('metano', 'C–H').polarity).toBe('no polar');
    expect(m.polarity).toMatch(/apolar/);
    expect(m.intermolecular).toHaveLength(1);
  });
  it('CO₂: enlaces polares, molécula apolar, acepta pero no forma puentes de H; inorgánico', () => {
    const c = d('dioxido-carbono');
    expect(bond('dioxido-carbono', 'O=C').polarity).toBe('polar');
    expect(c.polarity).toMatch(/apolar/);
    expect(c.organic).toBe(false);
    expect(c.intermolecular.join(' ')).toMatch(/aceptar puentes/);
  });
  it('benceno: C–C deslocalizado (aromático) y orgánico', () => {
    const cc = d('benceno').bonds.find((b) => b.label === 'C⋯C')!;
    expect(cc.count).toBe(6);
    expect(cc.order).toMatch(/aromático/);
  });
  it('ion amonio: ion poliatómico con enlace coordinado', () => {
    const a = d('ion-amonio');
    expect(a.material).toBe('Ion poliatómico');
    expect(a.bonds[0].bondType).toMatch(/coordinado/);
  });
  it('átomos sueltos: tipo de elemento', () => {
    expect(describeLooseAtom(bySymbol('Cu')!).material).toBe('Metal');
    expect(describeLooseAtom(bySymbol('O')!).material).toBe('No metal');
    expect(describeLooseAtom(bySymbol('Si')!).material).toBe('Metaloide');
    expect(describeLooseAtom(bySymbol('Ar')!).material).toBe('Gas noble');
  });
});
