import { describe, expect, it } from 'vitest';
import { analyzeBond, findElement, paulingIonicPercent, predictFormulas, type BondAnalysis } from '../src/chem/bondAnalysis';
import { bySymbol, ELEMENTS } from '../src/chem/elements';

const z = (s: string) => bySymbol(s)!.z;
const an = (a: string, b: string, order: number | null = null) => {
  const r = analyzeBond(z(a), z(b), order);
  if (!r.ok) throw new Error(r.reason);
  return r as BondAnalysis;
};
const formulas = (a: string, b: string) => predictFormulas(bySymbol(a)!, bySymbol(b)!).map((f) => f.formula);

describe('analizador de enlaces — árbol del autor', () => {
  it('gas noble: no forma enlace (con nota para Xe)', () => {
    const r = analyzeBond(z('He'), z('H'));
    expect(r.ok).toBe(false);
    const x = analyzeBond(z('Xe'), z('F'));
    expect(x.ok).toBe(false);
    if (!x.ok) expect(x.notes.join(' ')).toMatch(/XeF₂/);
  });
  it('NaCl iónico, sal binaria, fórmula documentada', () => {
    const r = an('Na', 'Cl');
    expect(r.type).toBe('ionico');
    expect(r.func.name).toMatch(/Sal binaria/);
    const f = r.formulas.find((x) => x.formula === 'NaCl')!;
    expect(f.name).toBe('cloruro de sodio');
    expect(f.documented).toBeTruthy();
    expect(r.electrical.name).toMatch(/Aislante en estado sólido/);
    expect(r.ionicPercent!).toBeGreaterThan(60);
  });
  it('mismo no metal: covalente no polar; O₂ doble y N₂ triple', () => {
    expect(an('O', 'O').type).toBe('covalente-no-polar');
    expect(an('N', 'N').sigmaPi).toBe('Triple: 1 σ + 2 π');
    expect(an('O', 'O').formulaNote).toMatch(/O₂/);
  });
  it('corrección: un metal consigo mismo es metálico', () => {
    const r = an('Na', 'Na');
    expect(r.type).toBe('metalico');
    expect(r.electrical.name).toBe('Conductor');
  });
  it('metal + metal: metálico y aleación sustitucional o limitada', () => {
    const r = an('Cu', 'Zn');
    expect(r.type).toBe('metalico');
    expect(r.alloy?.name).toMatch(/Aleación/);
    expect(r.func.name).toMatch(/Aleación/);
  });
  it('semiconductores intrínsecos: Si, GaAs, ZnS, SiC y la nueva familia IV-VI', () => {
    expect(an('Si', 'Si').semiconductor.kind).toBe('intrinseco');
    expect(an('Ga', 'As').semiconductor.family).toBe('III-V');
    expect(an('Zn', 'S').semiconductor.family).toBe('II-VI');
    expect(an('Si', 'C').semiconductor.family).toBe('IV-IV');
    expect(an('Pb', 'Te').semiconductor.family).toBe('IV-VI');
  });
  it('corrección: ZnO es II-VI aunque el enlace salga iónico', () => {
    const r = an('Zn', 'O');
    expect(r.type).toBe('ionico');
    expect(r.semiconductor.family).toBe('II-VI');
  });
  it('corrección: el carbono (diamante) no es semiconductor intrínseco', () => {
    expect(an('C', 'C').semiconductor.kind).toBe('no');
  });
  it('extrínsecos: Si+P tipo N, Si+B tipo P, sin «compuesto»', () => {
    const n = an('Si', 'P');
    expect(n.semiconductor.pn).toBe('N');
    expect(n.formulas).toHaveLength(0);
    expect(n.formulaNote).toMatch(/No es un compuesto/);
    expect(an('B', 'Si').semiconductor.pn).toBe('P');
    expect(an('Ge', 'As').semiconductor.pn).toBe('N');
  });
});

describe('analizador de enlaces — clasificaciones añadidas', () => {
  it('fórmulas por estados de oxidación: MgCl₂, Al₂O₃', () => {
    expect(formulas('Mg', 'Cl')).toContain('MgCl2');
    expect(formulas('Al', 'O')).toContain('Al2O3');
  });
  it('nomenclatura con prefijos en no metal + no metal', () => {
    const r = an('C', 'O');
    const names = Object.fromEntries(r.formulas.map((f) => [f.formula, f.name]));
    expect(names.CO2).toBe('dióxido de carbono');
    expect(names.CO).toBe('monóxido de carbono');
    expect(r.func.name).toMatch(/Óxido no metálico/);
    expect(r.coordinate).toMatch(/CO/);
  });
  it('funciones: óxido básico, anfótero, hidruro metálico, hidrácido, hidruro no metálico', () => {
    expect(an('Na', 'O').func.name).toMatch(/óxido básico/);
    expect(an('Al', 'O').func.name).toMatch(/anfótero/);
    expect(an('Na', 'H').func.name).toBe('Hidruro metálico');
    const hcl = an('H', 'Cl');
    expect(hcl.func.name).toBe('Hidrácido');
    expect(hcl.formulas[0].formula).toBe('HCl');
    expect(hcl.formulas[0].name).toMatch(/clorhídrico/);
    const nh3 = an('N', 'H');
    expect(nh3.func.name).toBe('Hidruro no metálico');
    expect(nh3.formulas[0]).toMatchObject({ formula: 'NH3', name: 'amoníaco' });
    expect(nh3.formulas[0].documented).toBeTruthy();
    expect(nh3.intermolecular.join(' ')).toMatch(/Puentes de hidrógeno/);
  });
  it('OF₂ no es un óxido', () => {
    const r = an('O', 'F');
    expect(r.func.name).toMatch(/no es un óxido/);
    // La fuente no da el estado +2 del oxígeno: no se predice ninguna fórmula (no se inventa).
    expect(r.formulas).toHaveLength(0);
    expect(r.formulaNote).toMatch(/no permiten equilibrar/);
  });
  it('metal de varios estados: nombres de Stock', () => {
    const names = an('Fe', 'Cl').formulas.map((f) => f.name);
    expect(names).toContain('cloruro de hierro(III)');
    expect(names).toContain('cloruro de hierro(II)');
  });
  it('polaridad, δ⁻ y carácter iónico de Pauling', () => {
    const r = an('H', 'O', 1);
    expect(r.type).toBe('covalente-polar');
    expect(r.negativeEnd?.symbol).toBe('O');
    expect(r.sigmaPi).toBe('Simple: 1 σ');
    expect(paulingIonicPercent(0)).toBe(0);
    expect(paulingIonicPercent(1.7)).toBeCloseTo(51.4, 0);
  });
  it('tipo de sólido: red covalente (SiO₂), molecular (CO₂), intersticial (Fe–C)', () => {
    expect(an('Si', 'O').solid.name).toBe('Sólido de red covalente');
    expect(an('C', 'O').solid.name).toBe('Sustancia molecular');
    expect(an('Fe', 'C').alloy?.name).toMatch(/intersticial/);
  });
  it('octeto: el metal cede y el no metal gana; excepciones', () => {
    const r = an('Na', 'Cl');
    expect(r.octet.join(' ')).toMatch(/Na cede 1 e⁻/);
    expect(r.octet.join(' ')).toMatch(/Cl gana 1 e⁻/);
    expect(an('B', 'F').octet.join(' ')).toMatch(/octeto incompleto/);
    expect(an('S', 'F').octet.join(' ')).toMatch(/octeto expandido/);
  });
  it('búsqueda por nombre sin acentos, símbolo o número', () => {
    expect(findElement('Oxigeno', ELEMENTS)?.symbol).toBe('O');
    expect(findElement('na', ELEMENTS)?.symbol).toBe('Na');
    expect(findElement('26', ELEMENTS)?.symbol).toBe('Fe');
    expect(findElement('xyz', ELEMENTS)).toBeNull();
  });
});
