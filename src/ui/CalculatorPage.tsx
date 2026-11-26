/**
 * Calculadora química (sección independiente del laboratorio). Herramientas:
 * Fórmula · Ecuaciones · Conversiones · Disoluciones · Fórmula empírica.
 * Toda la lógica está en src/chem/calculator.ts (probada); aquí solo hay presentación.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { element } from '../chem/elements';
import {
  analyzeFormula,
  AVOGADRO,
  balanceEquation,
  dilution,
  empiricalFromPercent,
  fmtOx,
  idealGasVolume,
  oxidationStates,
  stoichiometry,
  type BalancedEquation,
} from '../chem/calculator';
import { bondInfo, centralGeometries, findByComposition, KIND_LABEL, polarityEstimate, reduceHill, type StructureRecord } from '../chem/structures';

export type CalcTool = 'formula' | 'ecuaciones' | 'conversiones' | 'disoluciones' | 'empirica';

const TOOLS: [CalcTool, string][] = [
  ['formula', 'Fórmula'],
  ['ecuaciones', 'Ecuaciones'],
  ['conversiones', 'Conversiones'],
  ['disoluciones', 'Disoluciones'],
  ['empirica', 'Fórmula empírica'],
];

/** Número con cifras significativas; notación científica para valores muy grandes o pequeños. */
export function num(v: number, sig = 5): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e6 || a < 1e-3)) {
    const [m, e] = v.toExponential(sig - 1).split('e');
    return `${Number(m).toLocaleString('es', { maximumFractionDigits: sig - 1 })} × 10${String(Number(e)).replace(/-/g, '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)])}`;
  }
  return Number(v.toPrecision(sig)).toLocaleString('es', { maximumFractionDigits: 6 });
}

/** Subíndices solo tras un símbolo o un paréntesis (los coeficientes de hidratos quedan normales). */
function sub(f: string) {
  const SUBS = '₀₁₂₃₄₅₆₇₈₉';
  const body = f.replace(/([A-Za-z)\]}])(\d+)/g, (_m, a: string, d: string) => a + d.replace(/\d/g, (x) => SUBS[Number(x)]));
  return body.replace(/\^?(\d*)([+-])$/, (_m, d, s) => (d ? d.replace(/\d/g, (x: string) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(x)]) : '') + (s === '+' ? '⁺' : '⁻'));
}

export interface CalcLinks {
  openStructure(id: string): void;
  sendToLab(rec: StructureRecord): void;
}

export function CalculatorPage({ tool, arg, links }: { tool: CalcTool; arg: string; links: CalcLinks }) {
  return (
    <div className="page calc">
      <header className="page-header">
        <div>
          <h1>Calculadora química</h1>
          <p>Resultados calculados con masas atómicas de PubChem y constantes del SI.</p>
        </div>
      </header>
      <div className="segmented calc-tabs" role="tablist">
        {TOOLS.map(([t, l]) => (
          <button key={t} className={tool === t ? 'on' : ''} onClick={() => (location.hash = `#/calculadora/${t}`)}>
            {l}
          </button>
        ))}
      </div>
      {tool === 'formula' && <FormulaTool initial={arg} links={links} />}
      {tool === 'ecuaciones' && <EquationTool initial={arg} />}
      {tool === 'conversiones' && <ConversionTool initial={arg} />}
      {tool === 'disoluciones' && <SolutionTool />}
      {tool === 'empirica' && <EmpiricalTool />}
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="cfield">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return <div className="calc-error">{msg}</div>;
}

function useCalc<T>(fn: () => T, deps: unknown[]): { value: T | null; error: string | null } {
  return useMemo(() => {
    try {
      return { value: fn(), error: null };
    } catch (e) {
      return { value: null, error: (e as Error).message };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/* =============================== Fórmula =============================== */

function FormulaTool({ initial, links }: { initial: string; links: CalcLinks }) {
  const [f, setF] = useState(initial || 'H2O');
  const a = useCalc(() => analyzeFormula(f), [f]);
  const ox = useCalc(() => oxidationStates(f), [f]);
  const examples = ['H2O', 'CO2', 'C6H12O6', 'H2SO4', 'Ca(OH)2', 'CuSO4·5H2O', 'KMnO4', 'NH4+'];
  return (
    <>
      <div className="calc-input">
        <input className="big-input" value={f} onChange={(e) => setF(e.target.value)} placeholder="Fórmula: H2O, Ca(OH)2, CuSO4·5H2O, SO4^2-" aria-label="Fórmula química" autoCapitalize="off" spellCheck={false} />
        <div className="chips">
          {examples.map((x) => (
            <button key={x} className="chip" onClick={() => setF(x)}>
              {sub(x)}
            </button>
          ))}
        </div>
      </div>
      {a.error && <ErrorBox msg={a.error} />}
      {a.value && (
        <>
          <div className="result-hero">
            <div className="formula-big">{sub(a.value.formula.text)}</div>
            <div className="stats">
              <div>
                <small>Masa molar</small>
                <b>{a.value.molarMass.toFixed(3)} g/mol</b>
              </div>
              <div>
                <small>Átomos por fórmula</small>
                <b>{a.value.totalAtoms}</b>
              </div>
              <div>
                <small>Fórmula empírica</small>
                <b>{sub(a.value.empirical)}</b>
              </div>
              <div>
                <small>Carga</small>
                <b>{a.value.formula.charge === 0 ? '0' : fmtOx(a.value.formula.charge)}</b>
              </div>
            </div>
          </div>
          {a.value.nonStandard.length > 0 && <p className="small muted">Contiene elementos sin masa atómica estándar ({a.value.nonStandard.join(', ')}): se usa la masa del isótopo indicado por la fuente.</p>}
          <h2 className="section">Composición</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Elemento</th>
                  <th>Átomos</th>
                  <th>Masa atómica</th>
                  <th>Aporte (g/mol)</th>
                  <th>% en masa</th>
                  <th>% de átomos</th>
                </tr>
              </thead>
              <tbody>
                {a.value.rows.map((r) => (
                  <tr key={r.z}>
                    <td>
                      <b>{r.symbol}</b> <span className="muted">{r.name}</span>
                    </td>
                    <td>{r.count}</td>
                    <td>{r.atomicMass}</td>
                    <td>{r.massContribution.toFixed(3)}</td>
                    <td>
                      <div className="bar">
                        <i style={{ width: `${r.massPercent}%` }} />
                        <span>{r.massPercent.toFixed(2)} %</span>
                      </div>
                    </td>
                    <td>{r.atomPercent.toFixed(1)} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2 className="section">Estados de oxidación</h2>
          {ox.value && (
            <>
              <div className="table-wrap">
                <table className="data">
                  <tbody>
                    {ox.value.states.map((s) => (
                      <tr key={s.z}>
                        <td>
                          <b>{s.symbol}</b>
                        </td>
                        <td>{s.value === null ? '—' : fmtOx(s.value)}</td>
                        <td className="muted">{s.rule}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {ox.value.notes.map((n) => (
                <p key={n} className="small note-inline">
                  {n}
                </p>
              ))}
              <p className="small muted">Asignación por reglas habituales; los estados reales dependen de la estructura.</p>
            </>
          )}
          <StructureSection hill={hillOf(a.value.formula.counts)} charge={a.value.formula.charge} links={links} />
        </>
      )}
    </>
  );
}

function hillOf(counts: Map<number, number>) {
  const zs = [...counts.keys()];
  const s = (z: number) => element(z).symbol;
  const order = counts.has(6) ? [6, ...(counts.has(1) ? [1] : []), ...zs.filter((z) => z !== 6 && z !== 1).sort((a, b) => s(a).localeCompare(s(b)))] : zs.sort((a, b) => s(a).localeCompare(s(b)));
  return order.map((z) => s(z) + (counts.get(z)! > 1 ? counts.get(z) : '')).join('');
}

function StructureSection({ hill, charge, links }: { hill: string; charge: number; links: CalcLinks }) {
  const { exact, empirical } = findByComposition(hill);
  const mol = exact.find((r) => r.charge === charge) ?? exact[0];
  const cry = empirical[0] ?? findByComposition(reduceHill(hill)).empirical[0];
  const rec = mol ?? cry;
  return (
    <>
      <h2 className="section">Estructura, enlaces y geometría</h2>
      {!rec ? (
        <p className="small">
          No hay en la biblioteca una estructura documentada con esta composición. Sin una estructura de referencia no se determinan el tipo de enlace, la geometría ni la polaridad, porque la fórmula sola no fija cómo se unen los átomos.
        </p>
      ) : (
        <div className="struct-card">
          <div className="row gap">
            <b>{rec.name}</b>
            <span className="badge">{KIND_LABEL[rec.kind]}</span>
            <span className={`prov ${rec.geometry === 'cod' ? 'fuente' : rec.geometry === 'pubchem3d' ? 'calculado' : 'prediccion'}`}>{rec.geometry === 'cod' ? 'Experimental (COD)' : rec.geometry === 'pubchem3d' ? 'Geometría calculada (PubChem)' : 'Sin geometría 3D'}</span>
          </div>
          <p className="small">Enlace: {rec.bonding}.</p>
          {mol && <MolDetails rec={mol} />}
          {!mol && cry && <p className="small">Sólido sin moléculas aisladas: la fórmula coincide con la fórmula empírica de la red cristalina.</p>}
          {mol && <p className="small muted">Otras sustancias pueden compartir la misma fórmula molecular (isómeros); la biblioteca solo contiene esta.</p>}
          <div className="row gap mt">
            <button className="btn small primary" onClick={() => links.openStructure(rec.id)}>
              Ver estructura 3D
            </button>
            {rec.geometry === 'pubchem3d' && (
              <button className="btn small" onClick={() => links.sendToLab(rec)}>
                Llevar al laboratorio
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function MolDetails({ rec }: { rec: StructureRecord }) {
  const bonds = bondInfo(rec);
  const geo = centralGeometries(rec);
  const pol = polarityEstimate(rec);
  const byType = new Map<string, number>();
  for (const b of bonds) {
    const k = `${element(rec.atoms[b.a].z).symbol}${['', '–', '=', '≡'][b.order] ?? '–'}${element(rec.atoms[b.b].z).symbol}`;
    byType.set(k, (byType.get(k) ?? 0) + 1);
  }
  return (
    <div className="kv mt">
      <span>Enlaces</span>
      <span>{bonds.length ? [...byType].map(([k, n]) => `${n}× ${k}`).join(', ') : '—'}</span>
      <span>Geometría (VSEPR)</span>
      <span>{geo.length ? geo.map((g) => `${element(rec.atoms[g.atom].z).symbol}: ${g.geometry.toLowerCase()}`).join(' · ') : '—'}</span>
      <span>Polaridad</span>
      <span>{pol ? `${pol.polar ? 'Polar' : 'Apolar'} (estimación)` : 'Sin datos de geometría'}</span>
    </div>
  );
}

/* =============================== Ecuaciones =============================== */

function EquationTool({ initial }: { initial: string }) {
  const [eq, setEq] = useState(initial || 'C3H8 + O2 -> CO2 + H2O');
  const r = useCalc(() => balanceEquation(eq), [eq]);
  const examples = ['H2 + O2 -> H2O', 'Fe + O2 -> Fe2O3', 'KMnO4 + HCl -> KCl + MnCl2 + Cl2 + H2O', 'MnO4^- + Fe^2+ + H^+ -> Mn^2+ + Fe^3+ + H2O'];
  return (
    <>
      <div className="calc-input">
        <input className="big-input" value={eq} onChange={(e) => setEq(e.target.value)} aria-label="Ecuación química" autoCapitalize="off" spellCheck={false} />
        <small className="muted">Separa las especies con « + » (con espacios) y usa -&gt; o →. Cargas: Fe^3+, SO4^2-.</small>
        <div className="chips">
          {examples.map((x) => (
            <button key={x} className="chip" onClick={() => setEq(x)}>
              {x.length > 30 ? x.slice(0, 28) + '…' : x}
            </button>
          ))}
        </div>
      </div>
      {r.error && <ErrorBox msg={r.error} />}
      {r.value && (
        <>
          <div className="result-hero">
            <div className="formula-big eq">{r.value.text.split(' ').map((t, i) => <span key={i}>{/^\d+$/.test(t) || t === '+' || t === '→' ? t : sub(t)} </span>)}</div>
            <p className="small muted">Ajuste exacto por conservación de átomos{r.value.reactants.concat(r.value.products).some((s) => s.formula.charge) ? ' y de carga' : ''} (coeficientes enteros mínimos).</p>
          </div>
          <Stoichiometry eq={r.value} key={r.value.text} />
        </>
      )}
    </>
  );
}

function Stoichiometry({ eq }: { eq: BalancedEquation }) {
  const all = [...eq.reactants, ...eq.products];
  const [amounts, setAmounts] = useState<string[]>(all.map(() => ''));
  const [units, setUnits] = useState<('g' | 'mol')[]>(all.map(() => 'g'));
  const given = amounts.map((a, i) => {
    const v = parseFloat(a.replace(',', '.'));
    if (!Number.isFinite(v) || v < 0) return null;
    return units[i] === 'g' ? v / all[i].molarMass : v;
  });
  const res = useCalc(() => (given.some((g) => g !== null) ? stoichiometry(eq, given) : null), [JSON.stringify(given)]);
  return (
    <>
      <h2 className="section">Estequiometría y reactivo limitante</h2>
      <p className="small muted">Escribe la cantidad de una especie para calcular las demás, o de varios reactivos para hallar el limitante.</p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Especie</th>
              <th>Coef.</th>
              <th>M (g/mol)</th>
              <th>Cantidad conocida</th>
              <th>Moles</th>
              <th>Masa (g)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {all.map((s, i) => {
              const row = res.value?.rows[i];
              return (
                <tr key={i}>
                  <td>
                    <b>{sub(s.text)}</b> <span className="muted small">{i < eq.reactants.length ? 'reactivo' : 'producto'}</span>
                  </td>
                  <td>{eq.coefficients[i]}</td>
                  <td>{s.molarMass.toFixed(3)}</td>
                  <td>
                    <div className="amount">
                      <input inputMode="decimal" value={amounts[i]} onChange={(e) => setAmounts(amounts.map((x, k) => (k === i ? e.target.value : x)))} placeholder="—" aria-label={`Cantidad de ${s.text}`} />
                      <select value={units[i]} onChange={(e) => setUnits(units.map((u, k) => (k === i ? (e.target.value as 'g' | 'mol') : u)))}>
                        <option value="g">g</option>
                        <option value="mol">mol</option>
                      </select>
                    </div>
                  </td>
                  <td>{row ? num(row.mol, 4) : ''}</td>
                  <td>{row ? num(row.mass, 4) : ''}</td>
                  <td className="small">
                    {row?.limiting ? <span className="prov prediccion">Limitante</span> : row?.excessMol !== undefined && row.excessMol > 1e-12 ? <span className="muted">Sobran {num(row.excessMol * row.molarMass, 3)} g</span> : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {res.error && <ErrorBox msg={res.error} />}
      {res.value && <p className="small muted">Las masas de los productos son rendimientos teóricos (reacción completa).</p>}
    </>
  );
}

/* =============================== Conversiones =============================== */

function ConversionTool({ initial }: { initial: string }) {
  const [f, setF] = useState(initial || 'CO2');
  const [q, setQ] = useState('10');
  const [unit, setUnit] = useState<'g' | 'mol' | 'part'>('g');
  const [T, setT] = useState('273.15');
  const [P, setP] = useState('101.325');
  const a = useCalc(() => analyzeFormula(f), [f]);
  const v = parseFloat(q.replace(',', '.'));
  const M = a.value?.molarMass ?? NaN;
  const mol = unit === 'g' ? v / M : unit === 'mol' ? v : v / AVOGADRO;
  return (
    <>
      <div className="calc-grid">
        <Field label="Fórmula">
          <input value={f} onChange={(e) => setF(e.target.value)} autoCapitalize="off" spellCheck={false} />
        </Field>
        <Field label="Cantidad">
          <div className="amount">
            <input inputMode="decimal" value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={unit} onChange={(e) => setUnit(e.target.value as 'g' | 'mol' | 'part')}>
              <option value="g">g</option>
              <option value="mol">mol</option>
              <option value="part">partículas</option>
            </select>
          </div>
        </Field>
        <Field label="Temperatura (K)" hint="Para el volumen de gas ideal">
          <input inputMode="decimal" value={T} onChange={(e) => setT(e.target.value)} />
        </Field>
        <Field label="Presión (kPa)">
          <input inputMode="decimal" value={P} onChange={(e) => setP(e.target.value)} />
        </Field>
      </div>
      {a.error && <ErrorBox msg={a.error} />}
      {a.value && Number.isFinite(mol) && (
        <div className="result-grid">
          <div>
            <small>Masa</small>
            <b>{num(mol * M)} g</b>
          </div>
          <div>
            <small>Cantidad de sustancia</small>
            <b>{num(mol)} mol</b>
          </div>
          <div>
            <small>Entidades (moléculas o fórmulas unidad)</small>
            <b>{num(mol * AVOGADRO, 4)}</b>
          </div>
          <div>
            <small>Átomos totales</small>
            <b>{num(mol * AVOGADRO * a.value.totalAtoms, 4)}</b>
          </div>
          {a.value.rows.map((r) => (
            <div key={r.z}>
              <small>Átomos de {r.symbol}</small>
              <b>{num(mol * AVOGADRO * r.count, 4)}</b>
            </div>
          ))}
          <div>
            <small>Volumen como gas ideal</small>
            <b>{num(idealGasVolume(mol, parseFloat(T), parseFloat(P)), 4)} L</b>
          </div>
        </div>
      )}
      <p className="small muted mt">N_A = 6,02214076 × 10²³ mol⁻¹ y R = 8,314462618 J·mol⁻¹·K⁻¹ (valores exactos del SI). El volumen supone comportamiento de gas ideal; solo tiene sentido si la sustancia es un gas en esas condiciones.</p>
    </>
  );
}

/* =============================== Disoluciones =============================== */

function SolutionTool() {
  const [f, setF] = useState('NaCl');
  const [m, setM] = useState('5.85');
  const [V, setV] = useState('500');
  const [target, setTarget] = useState('0.1');
  const [d, setD] = useState({ c1: '1', v1: '', c2: '0.25', v2: '200' });
  const a = useCalc(() => analyzeFormula(f), [f]);
  const M = a.value?.molarMass ?? NaN;
  const p = (s: string) => parseFloat(s.replace(',', '.'));
  const c = p(m) / M / (p(V) / 1000);
  const need = p(target) * (p(V) / 1000) * M;
  const dil = useCalc(() => dilution({ c1: d.c1 ? p(d.c1) : null, v1: d.v1 ? p(d.v1) : null, c2: d.c2 ? p(d.c2) : null, v2: d.v2 ? p(d.v2) : null }), [JSON.stringify(d)]);
  return (
    <>
      <h2 className="section">Concentración molar</h2>
      <div className="calc-grid">
        <Field label="Soluto">
          <input value={f} onChange={(e) => setF(e.target.value)} autoCapitalize="off" spellCheck={false} />
        </Field>
        <Field label="Masa de soluto (g)">
          <input inputMode="decimal" value={m} onChange={(e) => setM(e.target.value)} />
        </Field>
        <Field label="Volumen de disolución (mL)">
          <input inputMode="decimal" value={V} onChange={(e) => setV(e.target.value)} />
        </Field>
        <Field label="Concentración deseada (mol/L)">
          <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
        </Field>
      </div>
      {a.error ? (
        <ErrorBox msg={a.error} />
      ) : (
        <div className="result-grid">
          <div>
            <small>Molaridad</small>
            <b>{num(c, 4)} mol/L</b>
          </div>
          <div>
            <small>Concentración en masa</small>
            <b>{num(p(m) / (p(V) / 1000), 4)} g/L</b>
          </div>
          <div>
            <small>Masa necesaria para {target} mol/L</small>
            <b>{num(need, 4)} g</b>
          </div>
        </div>
      )}
      <h2 className="section">Dilución · C₁V₁ = C₂V₂</h2>
      <p className="small muted">Deja vacía la magnitud que quieras calcular. Usa las mismas unidades a ambos lados.</p>
      <div className="calc-grid">
        {(['c1', 'v1', 'c2', 'v2'] as const).map((k) => (
          <Field key={k} label={{ c1: 'C₁ (mol/L)', v1: 'V₁ (mL)', c2: 'C₂ (mol/L)', v2: 'V₂ (mL)' }[k]}>
            <input inputMode="decimal" value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} placeholder="?" />
          </Field>
        ))}
      </div>
      {dil.error && <ErrorBox msg={dil.error} />}
      {dil.value && (
        <div className="result-grid">
          {(['c1', 'v1', 'c2', 'v2'] as const)
            .filter((k) => !d[k])
            .map((k) => (
              <div key={k}>
                <small>{{ c1: 'C₁', v1: 'V₁', c2: 'C₂', v2: 'V₂' }[k]}</small>
                <b>
                  {num(dil.value![k]!, 4)} {k.startsWith('c') ? 'mol/L' : 'mL'}
                </b>
              </div>
            ))}
        </div>
      )}
    </>
  );
}

/* =============================== Fórmula empírica =============================== */

function EmpiricalTool() {
  const [rows, setRows] = useState([
    { s: 'C', p: '40.0' },
    { s: 'H', p: '6.71' },
    { s: 'O', p: '53.3' },
  ]);
  const [M, setM] = useState('180.16');
  const r = useCalc(
    () => empiricalFromPercent(rows.filter((x) => x.s && x.p).map((x) => ({ symbol: x.s.trim(), percent: parseFloat(x.p.replace(',', '.')) })), M ? parseFloat(M.replace(',', '.')) : undefined),
    [JSON.stringify(rows), M],
  );
  return (
    <>
      <p className="small muted">Composición porcentual en masa → fórmula empírica; con la masa molar, también la molecular.</p>
      <div className="emp-rows">
        {rows.map((x, i) => (
          <div key={i} className="amount">
            <input value={x.s} onChange={(e) => setRows(rows.map((y, k) => (k === i ? { ...y, s: e.target.value } : y)))} placeholder="Símbolo" aria-label="Símbolo" />
            <input inputMode="decimal" value={x.p} onChange={(e) => setRows(rows.map((y, k) => (k === i ? { ...y, p: e.target.value } : y)))} placeholder="%" aria-label="Porcentaje" />
            <span className="muted">%</span>
          </div>
        ))}
        <div className="row gap">
          <button className="btn small" onClick={() => setRows([...rows, { s: '', p: '' }])}>
            Añadir elemento
          </button>
          {rows.length > 1 && (
            <button className="btn small ghost" onClick={() => setRows(rows.slice(0, -1))}>
              Quitar
            </button>
          )}
        </div>
      </div>
      <div className="calc-grid">
        <Field label="Masa molar (g/mol, opcional)">
          <input inputMode="decimal" value={M} onChange={(e) => setM(e.target.value)} />
        </Field>
      </div>
      {r.error && <ErrorBox msg={r.error} />}
      {r.value && (
        <div className="result-grid">
          <div>
            <small>Fórmula empírica</small>
            <b>{sub(r.value.empirical)}</b>
          </div>
          <div>
            <small>Masa de la fórmula empírica</small>
            <b>{r.value.empiricalMass.toFixed(3)} g/mol</b>
          </div>
          {r.value.molecular && (
            <div>
              <small>Fórmula molecular</small>
              <b>{sub(r.value.molecular)}</b>
            </div>
          )}
          <div>
            <small>Suma de porcentajes</small>
            <b>{r.value.sumPercent.toFixed(2)} %</b>
          </div>
        </div>
      )}
    </>
  );
}
