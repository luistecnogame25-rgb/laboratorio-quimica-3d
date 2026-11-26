/**
 * Verificación de la calculadora química. Las masas molares se contrastan con un valor
 * independiente: el "MolecularWeight" que PubChem calcula para cada compuesto descargado.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  analyzeFormula,
  balanceEquation,
  dilution,
  empiricalFromPercent,
  FormulaError,
  idealGasVolume,
  oxidationStates,
  parseFormula,
  stoichiometry,
} from '../src/chem/calculator';

const sym = (f: string) => {
  const p = parseFormula(f);
  return Object.fromEntries([...p.counts].map(([z, c]) => [z, c]));
};
const ox = (f: string, s: string) => oxidationStates(f).states.find((x) => x.symbol === s)!.value;

describe('Interpretación de fórmulas', () => {
  it('paréntesis, corchetes, hidratos y cargas', () => {
    expect(sym('Ca(OH)2')).toEqual({ 20: 1, 8: 2, 1: 2 });
    expect(sym('(NH4)3PO4')).toEqual({ 7: 3, 1: 12, 15: 1, 8: 4 });
    expect(sym('K4[Fe(CN)6]')).toEqual({ 19: 4, 26: 1, 6: 6, 7: 6 });
    expect(sym('CuSO4·5H2O')).toEqual({ 29: 1, 16: 1, 8: 9, 1: 10 });
    expect(sym('CuSO4*5H2O')).toEqual(sym('CuSO4·5H2O'));
    expect(sym('H₂O')).toEqual({ 1: 2, 8: 1 });
    expect(parseFormula('SO4^2-').charge).toBe(-2);
    expect(parseFormula('NH4+').charge).toBe(1);
    expect(parseFormula('Fe^3+').charge).toBe(3);
    expect(parseFormula('SO₄²⁻').charge).toBe(-2);
  });
  it('errores comprensibles', () => {
    expect(() => parseFormula('Xx2')).toThrow(FormulaError);
    expect(() => parseFormula('Ca(OH2')).toThrow(/paréntesis/);
    expect(() => parseFormula('h2o')).toThrow(/mayúscula/);
  });
});

describe('Masa molar (contrastada con PubChem)', () => {
  const dir = 'data/fuentes/pubchem';
  const files = readdirSync(dir).filter((f) => f.endsWith('.props.json'));
  for (const f of files) {
    const p = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')).PropertyTable.Properties[0];
    it(`${p.MolecularFormula} = ${p.MolecularWeight} g/mol`, () => {
      expect(Math.abs(analyzeFormula(p.MolecularFormula.replace(/[+-]$/, '')).molarMass - Number(p.MolecularWeight))).toBeLessThan(0.01);
    });
  }
  it('composición porcentual del agua y fórmula empírica de la glucosa', () => {
    const w = analyzeFormula('H2O');
    expect(w.rows.find((r) => r.symbol === 'O')!.massPercent).toBeCloseTo(88.81, 1);
    expect(w.totalAtoms).toBe(3);
    expect(analyzeFormula('C6H12O6').empirical).toBe('CH2O');
    expect(analyzeFormula('CuSO4·5H2O').molarMass).toBeCloseTo(249.68, 1);
  });
});

describe('Estados de oxidación', () => {
  it('casos de referencia', () => {
    expect(ox('H2SO4', 'S')).toBe(6);
    expect(ox('KMnO4', 'Mn')).toBe(7);
    expect(ox('Fe2O3', 'Fe')).toBe(3);
    expect(ox('NH3', 'N')).toBe(-3);
    expect(ox('NH4+', 'N')).toBe(-3);
    expect(ox('Cr2O7^2-', 'Cr')).toBe(6);
    expect(ox('NaH', 'H')).toBe(-1);
    expect(ox('OF2', 'O')).toBe(2);
    expect(ox('CH4', 'C')).toBe(-4);
    expect(ox('NaCl', 'Cl')).toBe(-1);
    expect(ox('O2', 'O')).toBe(0);
  });
  it('promedios y casos en que las reglas no bastan', () => {
    const fe = oxidationStates('Fe3O4').states.find((s) => s.symbol === 'Fe')!;
    expect(fe.average).toBe(true);
    expect(fe.value).toBeCloseTo(8 / 3);
    expect(ox('C2H6O', 'C')).toBe(-2);
    const per = oxidationStates('H2O2');
    expect(per.consistent).toBe(false);
    expect(per.notes[0]).toMatch(/peróxido/);
    expect(oxidationStates('CH2O2N').notes[0]).toMatch(/sin conocer la estructura/);
  });
});

describe('Ajuste de ecuaciones', () => {
  it('ecuaciones moleculares', () => {
    expect(balanceEquation('H2 + O2 -> H2O').coefficients).toEqual([2, 1, 2]);
    expect(balanceEquation('C3H8 + O2 -> CO2 + H2O').coefficients).toEqual([1, 5, 3, 4]);
    expect(balanceEquation('Fe + O2 -> Fe2O3').coefficients).toEqual([4, 3, 2]);
    expect(balanceEquation('KMnO4 + HCl -> KCl + MnCl2 + Cl2 + H2O').coefficients).toEqual([2, 16, 2, 2, 5, 8]);
    expect(balanceEquation('C2H6O + O2 → CO2 + H2O').coefficients).toEqual([1, 3, 2, 3]);
  });
  it('ecuaciones iónicas (conserva la carga)', () => {
    expect(balanceEquation('MnO4^- + Fe^2+ + H^+ -> Mn^2+ + Fe^3+ + H2O').coefficients).toEqual([1, 5, 8, 1, 5, 4]);
  });
  it('rechaza ecuaciones imposibles', () => {
    expect(() => balanceEquation('H2 -> O2')).toThrow(/solo en un lado/);
    expect(() => balanceEquation('H2O')).toThrow(/flecha/);
  });
});

describe('Estequiometría', () => {
  it('4,0 g de H₂ producen ≈35,75 g de agua', () => {
    const eq = balanceEquation('H2 + O2 -> H2O');
    const r = stoichiometry(eq, [4.0 / eq.reactants[0].molarMass, null, null]);
    expect(r.rows[2].mass).toBeCloseTo(35.75, 1);
  });
  it('reactivo limitante: 10 g H₂ + 32 g O₂ → el O₂ limita', () => {
    const eq = balanceEquation('H2 + O2 -> H2O');
    const r = stoichiometry(eq, [10 / eq.reactants[0].molarMass, 32 / eq.reactants[1].molarMass, null]);
    expect(r.limiting).toBe(1);
    expect(r.rows[2].mass).toBeCloseTo(36.03, 1);
    expect(r.rows[0].excessMol!).toBeGreaterThan(0);
  });
});

describe('Conversiones, disoluciones y fórmula empírica', () => {
  it('volumen molar de un gas ideal en condiciones normales ≈ 22,414 L', () => expect(idealGasVolume(1)).toBeCloseTo(22.414, 2));
  it('dilución C₁V₁ = C₂V₂', () => {
    expect(dilution({ c1: 2, v1: null, c2: 0.5, v2: 1 }).v1).toBeCloseTo(0.25);
    expect(() => dilution({ c1: null, v1: null, c2: 1, v2: 1 })).toThrow();
  });
  it('C 40,0 %, H 6,71 %, O 53,3 % → CH₂O; con M = 180 g/mol → C₆H₁₂O₆', () => {
    const r = empiricalFromPercent([{ symbol: 'C', percent: 40.0 }, { symbol: 'H', percent: 6.71 }, { symbol: 'O', percent: 53.3 }], 180.16);
    expect(r.empirical).toBe('CH2O');
    expect(r.molecular).toBe('C6H12O6');
  });
  it('Fe 69,94 %, O 30,06 % → Fe₂O₃ (proporción 1:1,5)', () => {
    expect(empiricalFromPercent([{ symbol: 'Fe', percent: 69.94 }, { symbol: 'O', percent: 30.06 }]).empirical).toBe('Fe2O3');
  });
});
