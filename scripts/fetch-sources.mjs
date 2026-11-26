/**
 * Descarga las fuentes estructurales (una vez; quedan en data/fuentes para trabajar sin conexión):
 *  - PubChem PUG-REST: conformero 3D (SDF) y propiedades de cada compuesto molecular.
 *  - Crystallography Open Database (COD): archivos CIF de sólidos cristalinos (dominio público).
 * Respeta el límite de PubChem (≤ 5 solicitudes/s). Uso: node scripts/fetch-sources.mjs
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';

export const MOLECULES = [
  // [id interno, nombre de búsqueda en PubChem]
  ['agua', 'water'],
  ['dioxido-carbono', 'carbon dioxide'],
  ['metano', 'methane'],
  ['amoniaco', 'ammonia'],
  ['oxigeno', 'oxygen'],
  ['nitrogeno', 'nitrogen'],
  ['hidrogeno', 'hydrogen'],
  ['cloruro-hidrogeno', 'hydrogen chloride'],
  ['fluoruro-hidrogeno', 'hydrogen fluoride'],
  ['glucosa', 'D-glucose'],
  ['etanol', 'ethanol'],
  ['benceno', 'benzene'],
  ['acido-sulfurico', 'sulfuric acid'],
  ['eteno', 'ethylene'],
  ['etino', 'acetylene'],
  ['metanal', 'formaldehyde'],
  ['monoxido-carbono', 'carbon monoxide'],
  ['acido-acetico', 'acetic acid'],
  ['ion-amonio', 'ammonium'],
  ['cisplatino', 'cisplatin'],
];

export const CRYSTALS = [
  ['cloruro-sodio', '1000041'],
  ['oxido-magnesio', '1000053'],
  ['cobre', '5000216'],
  ['hierro-alfa', '9000657'],
  ['calcita', '1547350'],
];

const UA = { 'User-Agent': 'quimica3d-educational-build' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  const r = await fetch(url, { headers: UA });
  return { ok: r.ok, status: r.status, text: await r.text() };
}

async function main() {
  mkdirSync('data/fuentes/pubchem', { recursive: true });
  mkdirSync('data/fuentes/cod', { recursive: true });
  const report = [];
  for (const [id, name] of MOLECULES) {
    const base = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}`;
    const props = await get(`${base}/property/MolecularFormula,MolecularWeight,IUPACName,CanonicalSMILES,Charge/JSON`);
    await sleep(260);
    writeFileSync(`data/fuentes/pubchem/${id}.props.json`, props.text);
    const sdf = await get(`${base}/SDF?record_type=3d`);
    await sleep(260);
    if (sdf.ok) writeFileSync(`data/fuentes/pubchem/${id}.3d.sdf`, sdf.text);
    else {
      // Sin conformero 3D en PubChem: se guarda la estructura 2D solo como referencia (no se usará como geometría).
      const sdf2 = await get(`${base}/SDF?record_type=2d`);
      await sleep(260);
      if (sdf2.ok) writeFileSync(`data/fuentes/pubchem/${id}.2d.sdf`, sdf2.text);
    }
    report.push(`${id}: propiedades ${props.status}, 3D ${sdf.status}`);
  }
  for (const [id, cod] of CRYSTALS) {
    const file = `data/fuentes/cod/${cod}.cif`;
    if (!existsSync(file)) {
      const r = await get(`https://www.crystallography.net/cod/${cod}.cif`);
      if (r.ok) writeFileSync(file, r.text);
      report.push(`${id} (COD ${cod}): ${r.status}`);
      await sleep(400);
    } else report.push(`${id} (COD ${cod}): ya descargado`);
  }
  writeFileSync('data/fuentes/descarga.txt', `Descargado: ${new Date().toISOString()}\n${report.join('\n')}\n`);
  console.log(report.join('\n'));
}

if (process.argv[1]?.endsWith('fetch-sources.mjs')) main();
