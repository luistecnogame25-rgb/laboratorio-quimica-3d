/**
 * Convierte las fuentes descargadas (data/fuentes) en src/data/structures.data.ts:
 *  - Moléculas: conformero 3D de PubChem (SDF V2000) → átomos, enlaces y órdenes de enlace.
 *  - Cristales: CIF de la COD → celda unidad expandida con las operaciones de simetría del CIF.
 * No se añaden ni corrigen coordenadas. Uso: node scripts/build-structures.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { CRYSTALS, MOLECULES } from './fetch-sources.mjs';

const SYMBOLS = ['H','He','Li','Be','B','C','N','O','F','Ne','Na','Mg','Al','Si','P','S','Cl','Ar','K','Ca','Sc','Ti','V','Cr','Mn','Fe','Co','Ni','Cu','Zn','Ga','Ge','As','Se','Br','Kr','Rb','Sr','Y','Zr','Nb','Mo','Tc','Ru','Rh','Pd','Ag','Cd','In','Sn','Sb','Te','I','Xe','Cs','Ba','La','Ce','Pr','Nd','Pm','Sm','Eu','Gd','Tb','Dy','Ho','Er','Tm','Yb','Lu','Hf','Ta','W','Re','Os','Ir','Pt','Au','Hg','Tl','Pb','Bi','Po','At','Rn','Fr','Ra','Ac','Th','Pa','U','Np','Pu','Am','Cm','Bk','Cf','Es','Fm','Md','No','Lr','Rf','Db','Sg','Bh','Hs','Mt','Ds','Rg','Cn','Nh','Fl','Mc','Lv','Ts','Og'];
const Z = (sym) => {
  const i = SYMBOLS.indexOf(sym);
  if (i < 0) throw new Error(`Símbolo desconocido: ${sym}`);
  return i + 1;
};

/* Metadatos propios (nombre en español y clasificación, hechos químicos establecidos). */
const META = {
  agua: ['Agua', 'molecular', 'Covalente polar'],
  'dioxido-carbono': ['Dióxido de carbono', 'molecular', 'Covalente polar (molécula apolar)'],
  metano: ['Metano', 'molecular', 'Covalente'],
  amoniaco: ['Amoníaco', 'molecular', 'Covalente polar'],
  oxigeno: ['Oxígeno molecular', 'molecular', 'Covalente no polar (doble)'],
  nitrogeno: ['Nitrógeno molecular', 'molecular', 'Covalente no polar (triple)'],
  hidrogeno: ['Hidrógeno molecular', 'molecular', 'Covalente no polar (simple)'],
  'cloruro-hidrogeno': ['Cloruro de hidrógeno', 'molecular', 'Covalente polar'],
  'fluoruro-hidrogeno': ['Fluoruro de hidrógeno', 'molecular', 'Covalente polar'],
  glucosa: ['Glucosa (D-glucosa)', 'molecular', 'Covalente'],
  etanol: ['Etanol', 'molecular', 'Covalente'],
  benceno: ['Benceno', 'molecular', 'Covalente, sistema aromático deslocalizado'],
  'acido-sulfurico': ['Ácido sulfúrico', 'molecular', 'Covalente polar'],
  eteno: ['Eteno (etileno)', 'molecular', 'Covalente (enlace doble C=C)'],
  etino: ['Etino (acetileno)', 'molecular', 'Covalente (enlace triple C≡C)'],
  metanal: ['Metanal (formaldehído)', 'molecular', 'Covalente polar (C=O)'],
  'monoxido-carbono': ['Monóxido de carbono', 'molecular', 'Covalente polar (triple, con componente dativa)'],
  'acido-acetico': ['Ácido acético', 'molecular', 'Covalente'],
  'ion-amonio': ['Ion amonio', 'ion', 'Covalente con enlace coordinado (dativo)'],
  cisplatino: ['Cisplatino', 'coordinacion', 'Compuesto de coordinación (enlaces dativos Pt–N, Pt–Cl)'],
  'cloruro-sodio': ['Cloruro de sodio (halita)', 'ionico', 'Iónico — red cristalina'],
  'oxido-magnesio': ['Óxido de magnesio (periclasa)', 'ionico', 'Iónico — red cristalina'],
  cobre: ['Cobre', 'metalico', 'Metálico — red cúbica centrada en las caras'],
  'hierro-alfa': ['Hierro α', 'metalico', 'Metálico — red cúbica centrada en el cuerpo'],
  calcita: ['Carbonato de calcio (calcita)', 'ionico', 'Iónico (Ca²⁺ / CO₃²⁻) con enlaces covalentes C–O en el anión'],
};

/* ------------------------------ SDF ------------------------------ */
function parseSdf(text) {
  const lines = text.split(/\r?\n/);
  const counts = lines[3];
  const na = parseInt(counts.slice(0, 3));
  const nb = parseInt(counts.slice(3, 6));
  const CHG = { 1: 3, 2: 2, 3: 1, 5: -1, 6: -2, 7: -3 };
  const atoms = [];
  for (let i = 0; i < na; i++) {
    const l = lines[4 + i];
    const sym = l.slice(31, 34).trim();
    const c = parseInt(l.slice(36, 39)) || 0;
    atoms.push({ z: Z(sym), p: [Number(l.slice(0, 10)), Number(l.slice(10, 20)), Number(l.slice(20, 30))].map((v) => Math.round(v * 1e4) / 1e4), q: CHG[c] ?? 0 });
  }
  const bonds = [];
  for (let i = 0; i < nb; i++) {
    const l = lines[4 + na + i];
    bonds.push([parseInt(l.slice(0, 3)) - 1, parseInt(l.slice(3, 6)) - 1, parseInt(l.slice(6, 9))]);
  }
  for (const l of lines) {
    if (l.startsWith('M  CHG')) {
      const parts = l.slice(6).trim().split(/\s+/).map(Number);
      for (let k = 1; k + 1 < parts.length; k += 2) atoms[parts[k] - 1].q = parts[k + 1];
    }
  }
  const prop = (name) => {
    const i = lines.findIndex((l) => l.includes(`<${name}>`));
    return i >= 0 ? lines[i + 1].trim() : null;
  };
  return { atoms, bonds, cid: Number(prop('PUBCHEM_COMPOUND_CID')), conformerId: prop('PUBCHEM_CONFORMER_ID'), mmffEnergy: prop('PUBCHEM_MMFF94_ENERGY') };
}

/* ------------------------------ CIF ------------------------------ */
function tokenize(line) {
  const out = [];
  const re = /'([^']*)'|"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}
const num = (s) => Number(String(s).replace(/\(.*\)/, ''));

function parseCif(text) {
  const lines = text.split(/\r?\n/);
  const tags = {};
  const loops = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l === 'loop_') {
      const head = [];
      i++;
      while (i < lines.length && lines[i].trim().startsWith('_')) head.push(lines[i++].trim());
      const rows = [];
      let buf = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t === 'loop_' || t.startsWith('_') || t.startsWith('data_') || (t.startsWith('#') && buf.length === 0)) break;
        if (t && !t.startsWith('#') && !t.startsWith(';')) {
          buf.push(...tokenize(t));
          while (buf.length >= head.length) rows.push(buf.splice(0, head.length));
        }
        i++;
      }
      i--;
      loops.push({ head, rows });
    } else if (l.startsWith('_')) {
      const [k, ...rest] = tokenize(l);
      if (rest.length) tags[k] = rest.join(' ');
      else if (lines[i + 1]?.trim() && !lines[i + 1].trim().startsWith('_') && !lines[i + 1].trim().startsWith(';')) tags[k] = tokenize(lines[++i].trim()).join(' ');
      else if (lines[i + 1]?.startsWith(';')) {
        const buf = [];
        i += 2;
        while (i < lines.length && !lines[i].startsWith(';')) buf.push(lines[i++].trim());
        tags[k] = buf.join(' ');
      }
    }
  }
  const loopWith = (tag) => loops.find((lp) => lp.head.includes(tag));
  const symLoop = loopWith('_symmetry_equiv_pos_as_xyz') ?? loopWith('_space_group_symop_operation_xyz');
  const symCol = symLoop.head.findIndex((h) => h === '_symmetry_equiv_pos_as_xyz' || h === '_space_group_symop_operation_xyz');
  const ops = symLoop.rows.map((r) => r[symCol]);
  const atomLoop = loopWith('_atom_site_fract_x');
  const col = (t) => atomLoop.head.indexOf(t);
  const sites = atomLoop.rows.map((r) => {
    const label = r[col('_atom_site_label')];
    const ts = col('_atom_site_type_symbol') >= 0 ? r[col('_atom_site_type_symbol')] : label;
    const sym = ts.replace(/[^A-Za-z]/g, '').replace(/^([A-Z][a-z]?).*/, '$1');
    const occ = col('_atom_site_occupancy') >= 0 ? num(r[col('_atom_site_occupancy')]) : 1;
    return { label, z: Z(sym), f: [num(r[col('_atom_site_fract_x')]), num(r[col('_atom_site_fract_y')]), num(r[col('_atom_site_fract_z')])], occ };
  });
  const cell = {
    a: num(tags._cell_length_a), b: num(tags._cell_length_b), c: num(tags._cell_length_c),
    alpha: num(tags._cell_angle_alpha), beta: num(tags._cell_angle_beta), gamma: num(tags._cell_angle_gamma),
  };
  return {
    cell, ops, sites,
    spaceGroup: tags['_symmetry_space_group_name_H-M'] ?? tags['_space_group_name_H-M_alt'] ?? '',
    title: tags._publ_section_title ?? '', doi: tags._journal_paper_doi ?? null, year: tags._journal_year ?? null,
    journal: tags._journal_name_full ?? '', temperature: tags._cell_measurement_temperature ?? tags._diffrn_ambient_temperature ?? null,
    authors: (loopWith('_publ_author_name')?.rows ?? []).map((r) => r[0]),
  };
}

/** Convierte "-x+1/2" en coeficientes [cx, cy, cz, constante]. */
function parseOpComponent(expr) {
  const e = expr.replace(/\s+/g, '').toLowerCase();
  const out = [0, 0, 0, 0];
  const re = /([+-]?)(\d+(?:\.\d+)?(?:\/\d+)?)?([xyz])?/g;
  let m;
  while ((m = re.exec(e)) && m[0] !== '') {
    const sign = m[1] === '-' ? -1 : 1;
    if (m[3]) out['xyz'.indexOf(m[3])] += sign * (m[2] ? evalFrac(m[2]) : 1);
    else if (m[2]) out[3] += sign * evalFrac(m[2]);
  }
  return out;
}
const evalFrac = (s) => (s.includes('/') ? Number(s.split('/')[0]) / Number(s.split('/')[1]) : Number(s));

function expandCell(cif) {
  const ops = cif.ops.map((o) => o.split(',').map(parseOpComponent));
  const atoms = [];
  const wrap = (v) => ((v % 1) + 1) % 1;
  for (const s of cif.sites) {
    for (const op of ops) {
      const f = op.map((c) => wrap(c[0] * s.f[0] + c[1] * s.f[1] + c[2] * s.f[2] + c[3]));
      const dup = atoms.some((a) => a.z === s.z && a.f.every((v, i) => { const d = Math.abs(v - f[i]); return d < 1e-3 || d > 1 - 1e-3; }));
      if (!dup) atoms.push({ z: s.z, f: f.map((v) => (Math.abs(v - 1) < 1e-3 ? 0 : Math.round(v * 1e5) / 1e5)), occ: s.occ });
    }
  }
  return atoms;
}

/* ------------------------------ ensamblado ------------------------------ */
const records = [];
for (const [id] of MOLECULES) {
  const [name, kind, bonding] = META[id];
  const propsRaw = JSON.parse(readFileSync(`data/fuentes/pubchem/${id}.props.json`, 'utf8'));
  const p = propsRaw.PropertyTable.Properties[0];
  const has3d = existsSync(`data/fuentes/pubchem/${id}.3d.sdf`);
  const sdf = parseSdf(readFileSync(`data/fuentes/pubchem/${id}.${has3d ? '3d' : '2d'}.sdf`, 'utf8'));
  records.push({
    id, name, kind, bonding,
    formula: p.MolecularFormula, charge: p.Charge ?? 0, mw: p.MolecularWeight ?? null, iupac: p.IUPACName ?? null, smiles: p.ConnectivitySMILES ?? p.CanonicalSMILES ?? null,
    cid: p.CID,
    geometry: has3d ? 'pubchem3d' : 'none',
    // Sin conformero 3D: se conserva la conectividad (enlaces), no las coordenadas 2D.
    atoms: sdf.atoms.map((a) => ({ z: a.z, p: has3d ? a.p : null, q: a.q })),
    bonds: sdf.bonds,
    conformerId: has3d ? sdf.conformerId : null,
    source: { name: 'PubChem', url: `https://pubchem.ncbi.nlm.nih.gov/compound/${p.CID}`, detail: has3d ? `Conformero 3D ${sdf.conformerId} (calculado por PubChem con MMFF94s; no es una estructura experimental)` : 'PubChem no ofrece conformero 3D para este compuesto' },
  });
}
for (const [id, cod] of CRYSTALS) {
  const [name, kind, bonding] = META[id];
  const cif = parseCif(readFileSync(`data/fuentes/cod/${cod}.cif`, 'utf8'));
  const cellAtoms = expandCell(cif);
  records.push({
    id, name, kind, bonding,
    formula: null, charge: 0, mw: null, iupac: null, smiles: null, cid: null,
    geometry: 'cod',
    cell: { ...cif.cell, spaceGroup: cif.spaceGroup },
    cellAtoms: cellAtoms.map((a) => ({ z: a.z, f: a.f })),
    atoms: [], bonds: [],
    source: {
      name: 'Crystallography Open Database', url: `https://www.crystallography.net/cod/${cod}.html`, cod,
      detail: `${cif.authors.join(', ')}${cif.year ? ` (${cif.year})` : ''}. ${cif.title}${cif.journal ? `. ${cif.journal}` : ''}${cif.doi ? `. DOI ${cif.doi}` : ''}`.replace(/\s+/g, ' ').trim(),
      doi: cif.doi, temperature: cif.temperature,
    },
  });
}

const out = `/* ARCHIVO GENERADO por scripts/build-structures.mjs — no editar a mano. */
import type { StructureRecord } from '../chem/structures';
export const STRUCTURES: StructureRecord[] = ${JSON.stringify(records)};
`;
writeFileSync('src/data/structures.data.ts', out);
for (const r of records) console.log(r.id.padEnd(20), r.geometry.padEnd(10), r.formula ?? r.cell.spaceGroup, r.atoms.length || r.cellAtoms.length, 'átomos');
