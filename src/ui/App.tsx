/**
 * Armazón de la aplicación (React): navegación, rutas por hash, gestión del experimento activo
 * y páginas. Las vistas 3D (tabla, visor atómico, laboratorio) son widgets imperativos de
 * Three.js montados mediante refs: React no re-renderiza la escena 3D.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DATA_SOURCE, element, ELEMENTS, FAMILIES, type ChemElement } from '../chem/elements';
import { uid } from '../core/format';
import { cloneExperiment, createExperiment } from '../core/project';
import { ProjectStore } from '../core/store';
import type { Experiment } from '../core/types';
import { exportProjectFile, importProjectFile, LocalProjectRepository, type ProjectMeta } from '../storage/projectStorage';
import { loadSettings, saveSettings, type AppSettings } from '../settings';
import { AtomViewer, type ViewMode } from './AtomViewer';
import { iconPath, toast } from './dom';
import { closeSheet, openElementMenu, openElementSheet, type SheetActions } from './ElementSheet';
import { LabView } from './LabView';
import { PeriodicTable, previewCard } from './PeriodicTable';
import { StructureViewer } from './StructureViewer';
import { CalculatorPage, type CalcTool, type CalcLinks } from './CalculatorPage';
import type { StructureRecord } from '../chem/structures';
import { displayFormula, KIND_LABEL, searchStructures, type StructureKind } from '../chem/structures';
import { subscript } from '../chem/formula';

export function Ico({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={iconPath(name)} />
    </svg>
  );
}

type Route = 'inicio' | 'tabla' | 'elemento' | 'molecula' | 'laboratorio' | 'calculadora' | 'moleculas' | 'enlaces' | 'academia' | 'experimentos' | 'configuracion';

const NAV: [Route, string, string][] = [
  ['inicio', 'home', 'Inicio'],
  ['tabla', 'table', 'Tabla periódica'],
  ['laboratorio', 'flask', 'Laboratorio 3D'],
  ['calculadora', 'calc', 'Calculadora'],
  ['moleculas', 'molecule', 'Biblioteca molecular'],
  ['enlaces', 'bond', 'Tipos de enlaces'],
  ['academia', 'academy', 'Academia'],
  ['experimentos', 'folder', 'Mis experimentos'],
  ['configuracion', 'gear', 'Configuración'],
];

function parseHash(): { route: Route; z: number; mode: ViewMode; id: string; arg: string } {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const route = (NAV.some((n) => n[0] === parts[0]) || parts[0] === 'elemento' || parts[0] === 'molecula' ? parts[0] : 'inicio') as Route;
  const z = Math.min(118, Math.max(1, Number(parts[1]) || 1));
  const mode = (['bohr', 'configuracion', 'orbitales', 'nucleo'].includes(parts[2]) ? parts[2] : 'bohr') as ViewMode;
  return { route, z, mode, id: parts[1] ?? '', arg: parts[2] ? decodeURIComponent(parts.slice(2).join('/')) : '' };
}

const go = (hash: string) => (location.hash = hash);
const LAST = 'quimlab.lastExperiment';

/* ======================= servicios compartidos (una sola instancia) ======================= */

const repo = new LocalProjectRepository();
const store = new ProjectStore(createExperiment('Mi primer experimento'));
let settings = loadSettings();
let lab: LabView | null = null;
let viewer: AtomViewer | null = null;
const savedOnce = new Set<string>();

async function persist(notify: boolean) {
  try {
    await repo.save(store.project);
    savedOnce.add(store.project.id);
    localStorage.setItem(LAST, store.project.id);
    if (notify) toast('Experimento guardado en este dispositivo', 'ok');
  } catch (e) {
    toast(`No se pudo guardar: ${(e as Error).message}`, 'error');
  }
}

let saveTimer = 0;
store.subscribe((p, reason) => {
  if (reason === 'preview' || reason === 'load') return;
  if (p.atoms.length || savedOnce.has(p.id)) {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void persist(false), 600);
  }
});

const sheetActions: SheetActions = {
  onViewAtom: (e, mode) => {
    closeSheet();
    go(`#/elemento/${e.z}/${mode ?? 'bohr'}`);
  },
  onAddToLab: (e) => {
    closeSheet();
    go('#/laboratorio');
    setTimeout(() => getLab().beginPlacement(e.z), 60);
  },
};

function getLab(): LabView {
  if (!lab)
    lab = new LabView(store, settings, {
      save: () => void persist(true),
      exportFile: () => exportProjectFile(store.project),
      openSheet: (e) => openElementSheet(e, sheetActions),
      viewAtom: (e) => sheetActions.onViewAtom(e),
      toggleNav: () => window.dispatchEvent(new Event('quimlab:toggle-nav')),
    });
  return lab;
}

function getViewer(): AtomViewer {
  if (!viewer)
    viewer = new AtomViewer(settings, {
      openSheet: (e) => openElementSheet(e, sheetActions),
      addToLab: (e) => sheetActions.onAddToLab(e),
      navigate: (z, mode) => go(`#/elemento/${z}/${mode}`),
    });
  return viewer;
}

let structViewer: StructureViewer | null = null;
function getStructViewer(): StructureViewer {
  if (!structViewer) structViewer = new StructureViewer(settings, { back: () => (history.length > 1 ? history.back() : go('#/moleculas')) });
  return structViewer;
}

const calcLinks: CalcLinks = {
  openStructure: (id) => go(`#/molecula/${id}`),
  sendToLab: (rec: StructureRecord) => {
    go('#/laboratorio');
    setTimeout(() => getLab().insertStructure(rec), 80);
  },
};

function openExperiment(p: Experiment) {
  store.load(p);
  savedOnce.add(p.id);
  localStorage.setItem(LAST, p.id);
  getLab().requestFrame();
  go('#/laboratorio');
}

/** Monta un widget imperativo (elemento DOM) dentro de React. */
function Host({ el }: { el: HTMLElement }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.append(el);
    return () => el.remove();
  }, [el]);
  return <div ref={ref} className="host" />;
}

/* ======================= aplicación ======================= */

export function App() {
  const [loc, setLoc] = useState(parseHash);
  const [navCollapsed, setNavCollapsed] = useState(localStorage.getItem('quimlab.nav') === 'collapsed');
  const [navOpen, setNavOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const on = () => setLoc(parseHash());
    window.addEventListener('hashchange', on);
    const toggle = () =>
      setNavCollapsed((c) => {
        localStorage.setItem('quimlab.nav', c ? 'open' : 'collapsed');
        return !c;
      });
    window.addEventListener('quimlab:toggle-nav', toggle);
    // Recuperar el último experimento
    const id = localStorage.getItem(LAST);
    (id ? repo.load(id) : Promise.resolve(null))
      .then((p) => {
        if (p) {
          store.load(p);
          savedOnce.add(p.id);
        }
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
    return () => {
      window.removeEventListener('hashchange', on);
      window.removeEventListener('quimlab:toggle-nav', toggle);
    };
  }, []);

  // Activar o pausar los widgets 3D según la ruta (ahorro de GPU y batería).
  useEffect(() => {
    if (!ready) return;
    closeSheet();
    setNavOpen(false);
    if (loc.route === 'laboratorio') getLab().activate();
    else lab?.deactivate();
    if (loc.route === 'elemento') {
      const v = getViewer();
      v.activate();
      v.show(loc.z, loc.mode);
    } else viewer?.deactivate();
    if (loc.route === 'molecula') {
      const v = getStructViewer();
      v.activate();
      v.show(loc.id);
    } else structViewer?.deactivate();
  }, [loc, ready]);

  if (!ready) return null;
  const route = loc.route;
  const full = route === 'laboratorio' || route === 'elemento' || route === 'molecula';

  return (
    <div className={`app ${navCollapsed ? 'nav-collapsed' : ''}`}>
      <nav className={`nav ${navOpen ? 'open' : ''}`} aria-label="Secciones">
        <div className="brand" title="Laboratorio de Química 3D">
          <span className="brand-mark">
            <Ico name="atom" size={20} />
          </span>
          <span className="brand-name">Química 3D</span>
        </div>
        {NAV.map(([r, ic, label]) => (
          <a key={r} href={`#/${r}`} className={route === r || (r === 'tabla' && route === 'elemento') || (r === 'moleculas' && route === 'molecula') ? 'active' : ''} data-tip={navCollapsed ? label : undefined}>
            <Ico name={ic} size={19} />
            <span>{label}</span>
          </a>
        ))}
        <span className="spacer" />
        <button className="nav-collapse" type="button" onClick={() => window.dispatchEvent(new Event('quimlab:toggle-nav'))} aria-label="Contraer navegación">
          <Ico name="sidebar" size={18} />
          <span>{navCollapsed ? '' : 'Contraer'}</span>
        </button>
      </nav>
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}
      <div className="shell-body">
        <div className="mobile-bar">
          <button className="icon-btn" aria-label="Menú" onClick={() => setNavOpen(true)}>
            <Ico name="menu" />
          </button>
          <b>{NAV.find((n) => n[0] === route)?.[2] ?? (route === 'molecula' ? 'Estructura' : 'Elemento')}</b>
        </div>
        <main className={`main ${full ? 'full' : ''}`}>
          {route === 'laboratorio' && <Host el={getLab().el} />}
          {route === 'elemento' && <Host el={getViewer().el} />}
          {route === 'molecula' && <Host el={getStructViewer().el} />}
          {route === 'inicio' && <Home />}
          {route === 'tabla' && <TablePage />}
          {route === 'moleculas' && <MoleculesPage />}
          {route === 'enlaces' && <BondsPage />}
          {route === 'academia' && <AcademyPage />}
          {route === 'experimentos' && <ExperimentsPage />}
          {route === 'configuracion' && <SettingsPage />}
          {route === 'calculadora' && <CalculatorPage key={loc.id + loc.arg} tool={(['formula', 'ecuaciones', 'conversiones', 'disoluciones', 'empirica'].includes(loc.id) ? loc.id : 'formula') as CalcTool} arg={loc.arg} links={calcLinks} />}
        </main>
      </div>
    </div>
  );
}

/* ======================= páginas ======================= */

function Page({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div className="row gap">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

function Home() {
  const [recent, setRecent] = useState<ProjectMeta[]>([]);
  useEffect(() => void repo.list().then((l) => setRecent(l.slice(0, 3))), []);
  const featured = [1, 6, 8, 26, 79, 92].map(element);
  return (
    <div className="page home">
      <section className="hero">
        <h1>Explora la materia, átomo a átomo.</h1>
        <p>Los 118 elementos con datos de PubChem, su estructura atómica en 3D y un laboratorio donde manipularlos.</p>
        <div className="row gap">
          <a className="btn primary lg" href="#/tabla">
            <Ico name="table" size={17} /> Tabla periódica
          </a>
          <a className="btn lg" href="#/calculadora">
            <Ico name="calc" size={17} /> Calculadora
          </a>
          <a className="btn lg" href="#/laboratorio">
            <Ico name="flask" size={17} /> Laboratorio 3D
          </a>
        </div>
      </section>
      <h2 className="section">Empieza por un elemento</h2>
      <div className="el-strip">
        {featured.map((e) => (
          <a key={e.z} className="el-card" href={`#/elemento/${e.z}/bohr`} style={{ ['--fam' as string]: FAMILIES[e.family].color }}>
            <span className="z">{e.z}</span>
            <span className="sym">{e.symbol}</span>
            <span className="nm">{e.name}</span>
          </a>
        ))}
      </div>
      {recent.length > 0 && (
        <>
          <h2 className="section">Experimentos recientes</h2>
          <div className="list">
            {recent.map((m) => (
              <button key={m.id} className="list-row" onClick={() => repo.load(m.id).then((p) => p && openExperiment(p))}>
                <Ico name="flask" />
                <span className="grow">{m.name}</span>
                <span className="muted">{m.atoms} átomos</span>
                <Ico name="chevronRight" size={16} />
              </button>
            ))}
          </div>
        </>
      )}
      <p className="footnote">
        Datos: {DATA_SOURCE.name}, obtenidos el {DATA_SOURCE.retrieved}. Cada valor indica si procede de la fuente, si es un cálculo de la aplicación o una predicción.
      </p>
    </div>
  );
}

function TablePage() {
  const ref = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<{ e: ChemElement; x: number; y: number } | null>(null);
  const table = useMemo(
    () =>
      new PeriodicTable({
        onSelect: (e) => openElementSheet(e, sheetActions),
        onMenu: (e, anchor) => openElementMenu(e, anchor, sheetActions),
        onPreview: (e, anchor) => {
          if (!e || !anchor) return setPreview(null);
          const r = anchor.getBoundingClientRect();
          setPreview({ e, x: Math.min(window.innerWidth - 300, r.right + 8), y: Math.min(window.innerHeight - 200, r.top) });
        },
      }),
    [],
  );
  useEffect(() => {
    ref.current?.append(table.el);
    return () => table.el.remove();
  }, [table]);
  return (
    <div className="page wide">
      <header className="page-header">
        <div>
          <h1>Tabla periódica</h1>
          <p>Toca un elemento para ver su ficha. Mantén pulsado o usa ⋯ para más opciones.</p>
        </div>
      </header>
      <div ref={ref} />
      <Legend />
      {preview && <PreviewPortal e={preview.e} x={preview.x} y={preview.y} />}
    </div>
  );
}

function PreviewPortal({ e, x, y }: { e: ChemElement; x: number; y: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const card = previewCard(e);
    ref.current?.replaceChildren(card);
  }, [e]);
  return <div ref={ref} className="pv-float" style={{ left: x, top: y }} />;
}

function Legend() {
  return (
    <div className="legend-note">
      <span>
        Colores por familia según la clasificación de PubChem. En la vista 3D, los átomos usan la convención de colores CPK incluida en el mismo conjunto de datos.
      </span>
    </div>
  );
}

function Pending({ phase, children }: { phase: number; children: ReactNode }) {
  return (
    <div className="pending">
      <span className="badge">Fase {phase}</span>
      <div>{children}</div>
    </div>
  );
}

const KIND_FILTERS: [StructureKind | 'all', string][] = [
  ['all', 'Todas'],
  ['molecular', 'Moléculas'],
  ['ion', 'Iones'],
  ['coordinacion', 'Coordinación'],
  ['ionico', 'Sólidos iónicos'],
  ['metalico', 'Metálicos'],
];

function provenance(geometry: string) {
  return geometry === 'cod' ? ['fuente', 'Experimental (COD)'] : geometry === 'pubchem3d' ? ['calculado', 'Calculada (PubChem)'] : ['prediccion', 'Sin geometría 3D'];
}

function MoleculesPage() {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<StructureKind | 'all'>('all');
  const list = searchStructures(q).filter((s) => kind === 'all' || s.kind === kind);
  return (
    <Page title="Biblioteca molecular" subtitle="Estructuras de bases de datos científicas, con su procedencia.">
      <div className="pt-bar">
        <label className="search-wrap">
          <Ico name="search" size={15} />
          <input type="search" placeholder="Nombre, fórmula o tipo de enlace" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <span className="pt-count">{list.length} estructuras</span>
      </div>
      <div className="chips" style={{ margin: '14px 0 20px' }}>
        {KIND_FILTERS.map(([k, l]) => (
          <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="list">
        {list.map((s) => {
          const [cls, label] = provenance(s.geometry);
          return (
            <a key={s.id} className="list-row" href={`#/molecula/${s.id}`}>
              <span className="formula">{subscript(displayFormula(s))}</span>
              <span className="grow">
                <b>{s.name}</b>
                <small className="muted">
                  {KIND_LABEL[s.kind]} · {s.bonding}
                </small>
              </span>
              <span className={`prov ${cls}`}>{label}</span>
              <Ico name="chevronRight" size={16} />
            </a>
          );
        })}
      </div>
      <p className="footnote">
        Moléculas: conformeros 3D de PubChem, calculados con el campo de fuerza MMFF94s (no son estructuras experimentales). Sólidos: archivos CIF de la Crystallography Open Database, determinados por difracción de rayos X (experimentales). Las discrepancias conocidas con valores experimentales se indican en cada estructura.
      </p>
    </Page>
  );
}

function ExampleLinks({ items }: { items: [string, string][] }) {
  return (
    <div className="chips">
      {items.map(([id, label]) => (
        <a key={id + label} className="chip" href={`#/molecula/${id}`}>
          {label}
        </a>
      ))}
    </div>
  );
}

function BondsPage() {
  const sections: { title: string; scope: string; text: string; examples: [string, string][]; note?: string }[] = [
    { title: 'Enlace iónico', scope: 'Intramolecular · red', text: 'Un átomo cede electrones y otro los acepta: se forman cationes y aniones que se atraen electrostáticamente. En estado sólido forman redes cristalinas, no moléculas aisladas; la proporción de iones (p. ej. 1:1 en NaCl) mantiene la neutralidad eléctrica.', examples: [['cloruro-sodio', 'NaCl (red)'], ['oxido-magnesio', 'MgO (red)'], ['calcita', 'CaCO₃ (calcita)']] },
    { title: 'Covalente simple, doble y triple', scope: 'Intramolecular', text: 'Los átomos comparten uno, dos o tres pares de electrones. A mayor orden de enlace, menor longitud y mayor energía de enlace entre los mismos átomos.', examples: [['etanol', 'C–C simple (etanol)'], ['eteno', 'C=C doble (eteno)'], ['etino', 'C≡C triple (etino)'], ['oxigeno', 'O=O'], ['nitrogeno', 'N≡N']] },
    { title: 'Covalente polar y no polar', scope: 'Intramolecular', text: 'Si los átomos tienen distinta electronegatividad, el par compartido se desplaza hacia el más electronegativo (enlace polar). La polaridad de la molécula depende además de su geometría: el CO₂ tiene enlaces polares pero es apolar por su simetría lineal.', examples: [['agua', 'H₂O (polar)'], ['fluoruro-hidrogeno', 'HF (polar)'], ['dioxido-carbono', 'CO₂ (apolar)'], ['metano', 'CH₄']] },
    { title: 'Covalente coordinado (dativo)', scope: 'Intramolecular', text: 'Ambos electrones del par compartido proceden del mismo átomo. Es la base de los compuestos de coordinación, donde ligandos ceden pares de electrones a un ion metálico.', examples: [['ion-amonio', 'NH₄⁺'], ['monoxido-carbono', 'CO'], ['cisplatino', 'Cisplatino']] },
    { title: 'Enlace metálico', scope: 'Red', text: 'Los cationes metálicos ocupan posiciones de una red y los electrones de valencia están deslocalizados en todo el sólido, lo que explica la conductividad eléctrica y térmica y la maleabilidad.', examples: [['cobre', 'Cu (FCC)'], ['hierro-alfa', 'Fe α (BCC)']] },
    { title: 'Enlace deslocalizado y aromaticidad', scope: 'Intramolecular', text: 'En sistemas como el benceno los electrones π se reparten entre todos los átomos del anillo: los seis enlaces C–C son equivalentes, intermedios entre simple y doble.', examples: [['benceno', 'Benceno']] },
  ];
  const inter = [
    ['Puentes de hidrógeno', 'H unido a N, O o F interacciona con un par libre de una molécula vecina (p. ej. entre moléculas de agua).'],
    ['Dipolo-dipolo', 'Atracción entre moléculas polares.'],
    ['Dispersión de London', 'Dipolos instantáneos; existen entre todas las moléculas y crecen con el tamaño.'],
    ['Ion-dipolo', 'Entre un ion y una molécula polar; explica la disolución de sales en agua.'],
  ];
  return (
    <Page title="Tipos de enlaces" subtitle="Cada ejemplo abre una estructura documentada en 3D.">
      {sections.map((s) => (
        <section key={s.title} className="bond-sec">
          <div className="row gap">
            <h2>{s.title}</h2>
            <span className="badge">{s.scope}</span>
          </div>
          <p>{s.text}</p>
          <ExampleLinks items={s.examples} />
        </section>
      ))}
      <section className="bond-sec">
        <div className="row gap">
          <h2>Construye tus propias moléculas</h2>
          <span className="badge">Laboratorio</span>
        </div>
        <p>
          En el laboratorio, pulsa <b>Enlazar</b> (icono de dos átomos unidos), elige <b>simple, doble o triple</b> y toca dos átomos. El enlace solo se crea si
          respeta la valencia de cada elemento (H: 1, O: 2, N: 3, C: 4…; N y O admiten un enlace coordinado más; P y S pueden ampliar su capa al unirse a O, F o Cl).
          Los gases nobles y los pares de metales no se enlazan. Tocar de nuevo un enlace con el mismo orden lo quita.
        </p>
        <p>
          Mientras la molécula no coincide con ninguna de la biblioteca, sus enlaces se ven en <b>naranja</b> y se marca como «No validada». Cuando completas una
          molécula documentada (agua, CO₂, metano, amoníaco, etanol…), la app la reconoce, le aplica la geometría real de PubChem y la describe en «Sustancias».
        </p>
        <div className="chips">
          <a className="chip" href="#/laboratorio">
            Ir al laboratorio
          </a>
        </div>
      </section>
      <section className="bond-sec">
        <div className="row gap">
          <h2>Interacciones intermoleculares</h2>
          <span className="badge">No son enlaces químicos</span>
        </div>
        <p>Actúan entre moléculas, no dentro de ellas, y son mucho más débiles que los enlaces iónicos, covalentes o metálicos. No deben confundirse con ellos.</p>
        <div className="table-wrap">
          <table className="data">
            <tbody>
              {inter.map(([a, b]) => (
                <tr key={a}>
                  <td>
                    <b>{a}</b>
                  </td>
                  <td>{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pending phase={2}>La representación 3D de interacciones entre varias moléculas requiere geometrías de agregados (dímeros, cristales moleculares) que aún no se han importado.</Pending>
      </section>
      <section className="bond-sec">
        <div className="row gap">
          <h2>Multicéntrico y sólidos covalentes de red</h2>
          <span className="badge">Pendiente</span>
        </div>
        <p>Ejemplos como el diborano (enlaces de tres centros y dos electrones) o el diamante y el cuarzo (redes covalentes) se añadirán cuando se importen sus estructuras desde PubChem o la COD.</p>
      </section>
    </Page>
  );
}

type Module = { t: string; text: string; links?: [string, string][]; challenge?: [string, string] };

const MODULES: Module[] = [
  { t: 'Estructura de la materia', text: 'La materia está formada por átomos. Una sustancia pura puede ser un elemento (un solo tipo de átomo) o un compuesto (dos o más elementos combinados en proporción fija); una mezcla combina sustancias sin unirlas químicamente.', links: [['#/tabla', 'Tabla periódica'], ['#/moleculas', 'Compuestos']], challenge: ['¿El agua es un elemento, un compuesto o una mezcla?', 'Un compuesto: H₂O combina hidrógeno y oxígeno en proporción fija 2:1.'] },
  { t: 'Átomo', text: 'Un núcleo con protones (carga +) y neutrones (sin carga), rodeado de electrones (carga −). El núcleo mide del orden de 10⁻¹⁵ m y el átomo de 10⁻¹⁰ m: casi todo el volumen del átomo corresponde a los electrones.', links: [['#/elemento/6/bohr', 'Carbono (Bohr)'], ['#/elemento/6/nucleo', 'Núcleo del carbono']], challenge: ['¿Cuántos protones y electrones tiene un átomo neutro de oxígeno?', '8 y 8: en un átomo neutro el número de electrones es igual a Z.'] },
  { t: 'Número atómico y masa atómica', text: 'Z es el número de protones y define el elemento. El número másico A = protones + neutrones de un isótopo. La masa atómica relativa de la tabla es el promedio ponderado de los isótopos naturales.', links: [['#/elemento/26/nucleo', 'Hierro']], challenge: ['El cloro tiene isótopos de masa ≈35 (≈76 %) y ≈37 (≈24 %). Estima su masa atómica.', '0,76·35 + 0,24·37 ≈ 35,5 (el valor tabulado es 35,45).'] },
  { t: 'Isótopos', text: 'Átomos de un mismo elemento (igual Z) con distinto número de neutrones. Ejemplos: ¹H, ²H (deuterio) y ³H (tritio, radiactivo); ¹²C, ¹³C y ¹⁴C (radiactivo, usado en datación).', links: [['#/elemento/1/nucleo', 'Hidrógeno']], challenge: ['¿Cuántos neutrones tiene el ¹⁴C?', '14 − 6 = 8 neutrones.'] },
  { t: 'Configuración electrónica', text: 'Los electrones ocupan subniveles según el principio de Aufbau, con un máximo de dos por orbital y espines opuestos (Pauli); en orbitales de igual energía se reparten primero de uno en uno (Hund). Hay excepciones, como el cromo (3d⁵ 4s¹) o el cobre (3d¹⁰ 4s¹).', links: [['#/elemento/24/configuracion', 'Cromo'], ['#/elemento/29/configuracion', 'Cobre']], challenge: ['Escribe la configuración del nitrógeno y di cuántos electrones desapareados tiene.', '1s² 2s² 2p³: tres electrones desapareados en 2p (Hund).'] },
  { t: 'Tabla periódica', text: 'Los elementos se ordenan por Z en 7 períodos (filas) y 18 grupos (columnas). Los bloques s, p, d y f indican el último subnivel que se ocupa. Los elementos de un mismo grupo comparten configuración de valencia y comportamiento químico parecido.', links: [['#/tabla', 'Explorar la tabla']], challenge: ['¿En qué bloque está el hierro?', 'En el bloque d (grupo 8, período 4).'] },
  { t: 'Electrones de valencia', text: 'Son los electrones del nivel más externo y los que participan en los enlaces. En los bloques s y p coinciden con las unidades del número de grupo (grupos 1–2) o con el grupo menos 10 (grupos 13–18).', links: [['#/elemento/8/bohr', 'Oxígeno'], ['#/elemento/11/bohr', 'Sodio']], challenge: ['¿Cuántos electrones de valencia tiene el cloro?', '7 (grupo 17): 3s² 3p⁵.'] },
  { t: 'Electronegatividad', text: 'Tendencia de un átomo a atraer los electrones de un enlace. En la escala de Pauling el flúor tiene el valor máximo (3,98); aumenta hacia la derecha de un período y hacia arriba en un grupo.', links: [['#/elemento/9/bohr', 'Flúor']], challenge: ['Calcula Δχ del enlace H–Cl con los datos de la tabla.', '3,16 − 2,20 = 0,96: enlace covalente polar.'] },
  { t: 'Enlace iónico', text: 'Transferencia de electrones entre átomos de electronegatividad muy diferente. Los iones se ordenan en una red: en el NaCl cada Na⁺ está rodeado por 6 Cl⁻ y viceversa. El modelo de transferencia completa es una simplificación: todo enlace real tiene cierto carácter covalente.', links: [['#/molecula/cloruro-sodio', 'Red de NaCl'], ['#/molecula/oxido-magnesio', 'MgO']], challenge: ['¿Qué número de coordinación tiene el Na⁺ en la halita?', '6 (la app lo calcula a partir de la celda experimental).'] },
  { t: 'Enlace covalente', text: 'Compartición de pares de electrones. Al aumentar el orden de enlace disminuye la longitud: compara C–C (etanol), C=C (eteno) y C≡C (etino) en la pestaña Enlaces de cada molécula.', links: [['#/molecula/etanol', 'Etanol'], ['#/molecula/eteno', 'Eteno'], ['#/molecula/etino', 'Etino']], challenge: ['Ordena por longitud los enlaces C–C, C=C y C≡C.', 'C–C > C=C > C≡C (≈1,5 > 1,33 > 1,20 Å).'] },
  { t: 'Construye moléculas', text: 'En el laboratorio, la herramienta Enlazar une dos átomos solo si respetan su valencia: cada H forma 1 enlace, el O 2, el N 3 y el C 4. Si completas una molécula documentada, la app la reconoce y le aplica su geometría real de PubChem; si no, la marca como «No validada» e indica qué valencias faltan.', links: [['#/laboratorio', 'Laboratorio'], ['#/enlaces', 'Cómo enlazar']], challenge: ['Construye el metano: ¿cuántos átomos y enlaces necesitas?', '1 C y 4 H con 4 enlaces simples C–H; al completarlo, la app lo reconoce como metano (CID 297) con geometría tetraédrica.'] },
  { t: 'Enlace metálico', text: 'Red de cationes con electrones de valencia deslocalizados. El cobre cristaliza en una red cúbica centrada en las caras (12 vecinos) y el hierro α en una cúbica centrada en el cuerpo (8 vecinos).', links: [['#/molecula/cobre', 'Cobre'], ['#/molecula/hierro-alfa', 'Hierro α']], challenge: ['¿Cuántos átomos hay en la celda unidad FCC?', '4 (8 vértices × 1/8 + 6 caras × 1/2).'] },
  { t: 'Geometría molecular', text: 'La teoría VSEPR predice la geometría a partir de los dominios electrónicos (átomos enlazados + pares libres) del átomo central: CH₄ tetraédrica, NH₃ piramidal trigonal, H₂O angular y CO₂ lineal.', links: [['#/molecula/metano', 'CH₄'], ['#/molecula/amoniaco', 'NH₃'], ['#/molecula/agua', 'H₂O'], ['#/molecula/dioxido-carbono', 'CO₂']], challenge: ['¿Por qué el ángulo H–O–H (≈104,5°) es menor que el tetraédrico?', 'Los dos pares libres del oxígeno repelen más que los pares enlazantes y cierran el ángulo.'] },
  { t: 'Polaridad', text: 'Una molécula es polar si la suma de los dipolos de sus enlaces no se anula. El CO₂ tiene enlaces polares pero es apolar por ser lineal y simétrico; el agua es polar por su geometría angular.', links: [['#/molecula/dioxido-carbono', 'CO₂'], ['#/molecula/agua', 'H₂O']], challenge: ['¿El CH₄ es polar?', 'No: sus cuatro dipolos C–H se anulan por la simetría tetraédrica.'] },
  { t: 'Fuerzas intermoleculares', text: 'Puentes de hidrógeno, dipolo-dipolo, dispersión de London e ion-dipolo actúan ENTRE moléculas y son mucho más débiles que los enlaces. Explican, por ejemplo, el punto de ebullición elevado del agua.', links: [['#/enlaces', 'Tipos de enlaces'], ['#/molecula/agua', 'Agua']], challenge: ['¿Un puente de hidrógeno es un enlace covalente?', 'No: es una interacción intermolecular, mucho más débil.'] },
  { t: 'Estructuras cristalinas', text: 'Un cristal repite una celda unidad en tres dimensiones. Se describe con sus parámetros de red (a, b, c, α, β, γ) y su grupo espacial. Las celdas de la biblioteca provienen de experimentos de difracción de rayos X.', links: [['#/molecula/cloruro-sodio', 'NaCl'], ['#/molecula/calcita', 'Calcita']], challenge: ['¿Qué distancia Na–Cl corresponde a una celda de arista a = 5,62 Å?', 'a/2 = 2,81 Å.'] },
  { t: 'Compuestos químicos', text: 'La fórmula molecular indica los átomos de una molécula (C₆H₁₂O₆); la empírica, la proporción mínima (CH₂O). Los sólidos iónicos y metálicos se describen con fórmulas empíricas porque no forman moléculas.', links: [['#/moleculas', 'Biblioteca molecular']], challenge: ['¿Cuál es la fórmula empírica de la glucosa?', 'CH₂O.'] },
  { t: 'Reacciones químicas', text: 'En una reacción se reorganizan los átomos y se conserva la masa: las ecuaciones deben ajustarse. Ejemplos: 2 H₂ + O₂ → 2 H₂O; CH₄ + 2 O₂ → CO₂ + 2 H₂O. La simulación de reacciones (energía, cinética) no está implementada.', challenge: ['Ajusta la combustión del etanol: C₂H₆O + O₂ → CO₂ + H₂O.', 'C₂H₆O + 3 O₂ → 2 CO₂ + 3 H₂O.'] },
];

function AcademyPage() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <Page title="Academia" subtitle="17 módulos. Cada uno enlaza modelos 3D interactivos.">
      <div className="modules">
        {MODULES.map((m, i) => (
          <div key={m.t} className={`module ${open === i ? 'open' : ''}`}>
            <button className="module-head" onClick={() => setOpen(open === i ? null : i)}>
              <span className="num">{i + 1}</span>
              <b className="grow">{m.t}</b>
              <Ico name={open === i ? 'chevronUp' : 'chevronDown'} size={16} />
            </button>
            {open === i && (
              <div className="module-body">
                <p>{m.text}</p>
                {m.links && (
                  <div className="chips" style={{ marginTop: 12 }}>
                    {m.links.map(([href, l]) => (
                      <a key={href} className="chip" href={href}>
                        {l}
                      </a>
                    ))}
                  </div>
                )}
                {m.challenge && (
                  <details className="challenge">
                    <summary>Reto: {m.challenge[0]}</summary>
                    <p>{m.challenge[1]}</p>
                  </details>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </Page>
  );
}

function ExperimentsPage() {
  const [list, setList] = useState<ProjectMeta[]>([]);
  const refresh = () => void repo.list().then(setList);
  useEffect(refresh, []);
  const newExp = () => {
    const p = createExperiment('Experimento sin título');
    openExperiment(p);
  };
  return (
    <Page
      title="Mis experimentos"
      subtitle="Guardados en este dispositivo. Exporta a .quimlab.json para copias de seguridad."
      actions={
        <>
          <button
            className="btn"
            onClick={() =>
              importProjectFile()
                .then(async (p) => {
                  if (await repo.load(p.id).catch(() => null)) p.id = uid('exp');
                  await repo.save(p);
                  toast(`Importado: ${p.name}`, 'ok');
                  openExperiment(p);
                })
                .catch((e) => toast(`No se pudo importar: ${(e as Error).message}`, 'error'))
            }
          >
            <Ico name="upload" size={16} /> Importar
          </button>
          <button className="btn primary" onClick={newExp}>
            <Ico name="plus" size={16} /> Nuevo
          </button>
        </>
      }
    >
      {list.length === 0 ? (
        <div className="empty">Aún no hay experimentos guardados.</div>
      ) : (
        <div className="list">
          {list.map((m) => (
            <div key={m.id} className="list-row">
              <Ico name="flask" />
              <span className="grow">
                <b>{m.name}</b>
                <small className="muted">
                  {m.atoms} {m.atoms === 1 ? 'átomo' : 'átomos'} · {m.measurements} {m.measurements === 1 ? 'medición' : 'mediciones'} · {new Date(m.modified).toLocaleString('es')}
                </small>
              </span>
              <button className="btn small" onClick={() => repo.load(m.id).then((p) => p && openExperiment(p))}>
                Abrir
              </button>
              <button
                className="icon-btn"
                data-tip="Duplicar"
                onClick={async () => {
                  const p = await repo.load(m.id);
                  if (!p) return;
                  const c = cloneExperiment(p);
                  c.id = uid('exp');
                  c.name = `${p.name} (copia)`;
                  c.created = c.modified = new Date().toISOString();
                  await repo.save(c);
                  refresh();
                }}
              >
                <Ico name="copy" />
              </button>
              <button className="icon-btn" data-tip="Exportar" onClick={() => repo.load(m.id).then((p) => p && exportProjectFile(p))}>
                <Ico name="download" />
              </button>
              <button
                className="icon-btn danger"
                data-tip="Eliminar"
                onClick={async () => {
                  if (!confirm(`¿Eliminar "${m.name}" de este dispositivo? No se puede deshacer.`)) return;
                  await repo.remove(m.id);
                  refresh();
                }}
              >
                <Ico name="trash" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}

function SettingsPage() {
  const [s, setS] = useState<AppSettings>({ ...settings });
  const update = (patch: Partial<AppSettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    settings = next;
    saveSettings(next);
    lab?.applySettings(next);
    viewer?.applySettings(next);
  };
  return (
    <Page title="Configuración">
      <div className="settings">
        <label className="set-row">
          <span>
            <b>Calidad gráfica</b>
            <small>Baja desactiva sombras y reduce la resolución (recomendada en móviles de gama media).</small>
          </span>
          <select value={s.quality} onChange={(e) => update({ quality: e.target.value as AppSettings['quality'] })}>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>
        </label>
        <label className="set-row">
          <span>
            <b>Reducir movimiento</b>
            <small>Detiene animaciones decorativas como el giro de electrones.</small>
          </span>
          <input type="checkbox" checked={s.reduceMotion} onChange={(e) => update({ reduceMotion: e.target.checked })} />
        </label>
        <label className="set-row">
          <span>
            <b>Escala visual de los átomos</b>
            <small>Solo cambia el tamaño en pantalla; no modifica datos.</small>
          </span>
          <select value={String(s.atomScale)} onChange={(e) => update({ atomScale: Number(e.target.value) })}>
            {[0.6, 0.8, 1, 1.25, 1.5].map((v) => (
              <option key={v} value={v}>
                {v}×
              </option>
            ))}
          </select>
        </label>
        <div className="set-row">
          <span>
            <b>Borrar datos locales</b>
            <small>Elimina experimentos y preferencias de este dispositivo.</small>
          </span>
          <button
            className="btn danger"
            onClick={() => {
              if (!confirm('¿Borrar todos los experimentos y preferencias de este dispositivo? No se puede deshacer.')) return;
              Object.keys(localStorage)
                .filter((k) => k.startsWith('quimlab.'))
                .forEach((k) => localStorage.removeItem(k));
              location.reload();
            }}
          >
            Borrar
          </button>
        </div>
      </div>
      <h2 className="section">Acerca de</h2>
      <p className="muted">
        Laboratorio de Química 3D · versión 0.4.0 (Fases 1–3, 5 y 6, calculadora química; Fase 4 documentada). {ELEMENTS.length} elementos. Datos: {DATA_SOURCE.name} ({DATA_SOURCE.retrieved}). Software: React (MIT), Three.js (MIT), Capacitor (MIT), Vite (MIT).
      </p>
    </Page>
  );
}

// Acceso de depuración solo en desarrollo (no se incluye en la compilación de producción).
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__quimlab = { getLab, getViewer, store };
