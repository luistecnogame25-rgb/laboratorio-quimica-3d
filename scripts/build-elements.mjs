/**
 * Genera src/data/elements.data.ts a partir del conjunto oficial de PubChem
 * (data/fuentes/pubchem-periodictable.json, obtenido de
 *  https://pubchem.ncbi.nlm.nih.gov/rest/pug/periodictable/JSON).
 *
 * Los valores se copian tal cual (texto), sin redondear ni completar campos vacíos.
 * Solo se añade el nombre en español (nomenclatura IUPAC en español).
 * Uso: node scripts/build-elements.mjs
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs';

const SRC = 'data/fuentes/pubchem-periodictable.json';
const OUT = 'src/data/elements.data.ts';

const ES = [
  'Hidrógeno', 'Helio', 'Litio', 'Berilio', 'Boro', 'Carbono', 'Nitrógeno', 'Oxígeno', 'Flúor', 'Neón',
  'Sodio', 'Magnesio', 'Aluminio', 'Silicio', 'Fósforo', 'Azufre', 'Cloro', 'Argón', 'Potasio', 'Calcio',
  'Escandio', 'Titanio', 'Vanadio', 'Cromo', 'Manganeso', 'Hierro', 'Cobalto', 'Níquel', 'Cobre', 'Zinc',
  'Galio', 'Germanio', 'Arsénico', 'Selenio', 'Bromo', 'Kriptón', 'Rubidio', 'Estroncio', 'Itrio', 'Circonio',
  'Niobio', 'Molibdeno', 'Tecnecio', 'Rutenio', 'Rodio', 'Paladio', 'Plata', 'Cadmio', 'Indio', 'Estaño',
  'Antimonio', 'Telurio', 'Yodo', 'Xenón', 'Cesio', 'Bario', 'Lantano', 'Cerio', 'Praseodimio', 'Neodimio',
  'Prometio', 'Samario', 'Europio', 'Gadolinio', 'Terbio', 'Disprosio', 'Holmio', 'Erbio', 'Tulio', 'Iterbio',
  'Lutecio', 'Hafnio', 'Tantalio', 'Wolframio', 'Renio', 'Osmio', 'Iridio', 'Platino', 'Oro', 'Mercurio',
  'Talio', 'Plomo', 'Bismuto', 'Polonio', 'Astato', 'Radón', 'Francio', 'Radio', 'Actinio', 'Torio',
  'Protactinio', 'Uranio', 'Neptunio', 'Plutonio', 'Americio', 'Curio', 'Berkelio', 'Californio', 'Einstenio', 'Fermio',
  'Mendelevio', 'Nobelio', 'Laurencio', 'Rutherfordio', 'Dubnio', 'Seaborgio', 'Bohrio', 'Hasio', 'Meitnerio', 'Darmstatio',
  'Roentgenio', 'Copernicio', 'Nihonio', 'Flerovio', 'Moscovio', 'Livermorio', 'Teneso', 'Oganesón',
];

const json = JSON.parse(readFileSync(SRC, 'utf8'));
const cols = json.Table.Columns.Column;
const rows = json.Table.Row.map((r) => Object.fromEntries(cols.map((c, i) => [c, r.Cell[i]])));
if (rows.length !== 118) throw new Error(`Se esperaban 118 elementos y hay ${rows.length}`);

const out = rows.map((r, i) => {
  if (Number(r.AtomicNumber) !== i + 1) throw new Error(`Orden inesperado en fila ${i}`);
  return {
    z: Number(r.AtomicNumber),
    symbol: r.Symbol,
    nameEn: r.Name,
    nameEs: ES[i],
    atomicMass: r.AtomicWeight ?? r.AtomicMass,
    cpkHex: r.CPKHexColor,
    electronConfiguration: r.ElectronConfiguration,
    electronegativity: r.Electronegativity,
    atomicRadius: r.AtomicRadius,
    ionizationEnergy: r.IonizationEnergy,
    electronAffinity: r.ElectronAffinity,
    oxidationStates: r.OxidationStates,
    standardState: r.StandardState,
    meltingPoint: r.MeltingPoint,
    boilingPoint: r.BoilingPoint,
    density: r.Density,
    groupBlock: r.GroupBlock,
    yearDiscovered: r.YearDiscovered,
  };
});

const retrieved = statSync(SRC).mtime.toISOString().slice(0, 10);
const ts = `/* ARCHIVO GENERADO por scripts/build-elements.mjs — no editar a mano. */
/** Datos crudos de PubChem (texto tal cual; '' = sin dato en la fuente). */
export interface RawElement {
  z: number;
  symbol: string;
  nameEn: string;
  nameEs: string;
  atomicMass: string;
  cpkHex: string;
  electronConfiguration: string;
  electronegativity: string;
  atomicRadius: string;
  ionizationEnergy: string;
  electronAffinity: string;
  oxidationStates: string;
  standardState: string;
  meltingPoint: string;
  boilingPoint: string;
  density: string;
  groupBlock: string;
  yearDiscovered: string;
}

export const DATA_SOURCE = {
  name: 'PubChem Periodic Table (NCBI/NLM)',
  url: 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/periodictable/JSON',
  page: 'https://pubchem.ncbi.nlm.nih.gov/periodic-table/',
  retrieved: '${retrieved}',
  citation: 'Kim S. et al. PubChem Periodic Table and Element Pages: Improving Access to Information on Chemical Elements from Authoritative Sources. Chemistry Teacher International 2021, 3(1):57-65. DOI 10.1515/cti-2020-0006',
};

export const RAW_ELEMENTS: RawElement[] = ${JSON.stringify(out, null, 1)};
`;
writeFileSync(OUT, ts);
console.log(`OK: ${out.length} elementos → ${OUT} (fuente obtenida el ${retrieved})`);
