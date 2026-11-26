# Fuentes científicas y evaluación tecnológica

## 1. Datos de los elementos

| Fuente | Uso | Estado |
|---|---|---|
| **PubChem Periodic Table** (NCBI/NLM) — [PUG-REST JSON](https://pubchem.ncbi.nlm.nih.gov/rest/pug/periodictable/JSON) · [página](https://pubchem.ncbi.nlm.nih.gov/periodic-table/) | Las 17 columnas de los 118 elementos: masa, configuración, electronegatividad, radio, energía de ionización, afinidad electrónica, estados de oxidación, estado estándar, fusión, ebullición, densidad, familia, año de descubrimiento y color CPK | **Usada.** Copia local en `data/fuentes/pubchem-periodictable.json` (obtenida el 2026-11-23), convertida sin modificar valores por `scripts/build-elements.mjs` |
| Cita recomendada | Kim S. *et al.* "PubChem Periodic Table and Element Pages: Improving Access to Information on Chemical Elements from Authoritative Sources". *Chemistry Teacher International* 2021, 3(1):57-65. DOI [10.1515/cti-2020-0006](https://doi.org/10.1515/cti-2020-0006) | No se pudo leer durante la investigación (el servidor rechazó la descarga automática) |
| [Cuaderno IUPAC sobre este conjunto](https://iupac.github.io/WFChemCookbook/datasources/pubchem_ptable.html) | Unidades: eV (ionización, afinidad), K (fusión, ebullición), g/cm³ (densidad, referida a 0 °C y 1 atm) | Consultado |

### Lo que está verificado y lo que no

- **Unidades**: confirmadas por el cuaderno de IUPAC (no por un documento de PubChem, que no se pudo leer).
- **Energía de ionización**: es la **primera** (H = 13,598 eV, He = 24,587 eV coinciden con los valores conocidos).
- **Electronegatividad**: el conjunto no declara la escala; los valores coinciden con la escala de **Pauling** (F 3,98; C 2,55; O 3,44). Se indica así en la ficha.
- **Radio atómico**: definición **no especificada**. Algunos valores coinciden con los radios de van der Waals de Bondi (H 120, He 140, Li 182, C 170, N 155, O 152 pm), pero otros no (F 135 pm frente a 147 pm de Bondi). La aplicación lo muestra como "radio según PubChem, definición no especificada".
- **Colores CPK**: los valores coinciden con la convención de Jmol (H FFFFFF, C 909090, O FF0D0D); el conjunto no declara la fuente.
- **Masa**: para elementos sin isótopos estables (Tc, Pm, Z ≥ 84), el valor puede ser la masa de un isótopo concreto; se avisa en la ficha.
- **Configuraciones**: 10 superpesados vienen marcadas como *predicted* o *calculated* (Mt, Ds, Rg, Cn, Nh, Fl, Mc, Lv, Ts, Og) y se muestran como tales.
- **Estado estándar**: "Expected to be…" se muestra como "(predicción)".
- **Campos vacíos** (por ejemplo, afinidad electrónica en 61 elementos): se muestran como "Sin dato en la fuente", sin rellenarlos.
- **Clasificaciones discutidas**: H, He, el grupo 3 (La/Ac frente a Lu/Lr), Zn/Cd/Hg/Cn, los metaloides y los superpesados llevan una nota explicativa en la ficha.

### Calculado en la aplicación (identificado como "Calculado")

Grupo, período y bloque (según la estructura de la tabla, con Lu y Lr en el grupo 3); la configuración expandida y ordenada; los electrones por nivel; los electrones de valencia (solo bloques s y p); el diagrama de cajas (Pauli y Hund); los electrones desapareados; los neutrones estimados (N = A − Z, con A redondeada; marcado como "Aproximación").

### Pendiente de incorporar (no se inventa)

Aplicaciones, reactividad, compuestos conocidos y riesgos de cada elemento. La ficha enlaza la página oficial del elemento en PubChem (`pubchem.ncbi.nlm.nih.gov/element/<Z>`), que contiene las referencias individuales.

## 2. Modelos físicos usados en la visualización

| Modelo | Base | Limitación declarada en la interfaz |
|---|---|---|
| Bohr | Electrones por nivel calculados a partir de la configuración | Didáctico: no son órbitas reales ni distancias a escala |
| Orbitales | Armónicos esféricos reales normalizados Y_lm (s, p, d, f), con normalización y ortogonalidad verificadas en las pruebas | Solo la parte angular hidrogenoide; sin parte radial ni efectos multielectrónicos |
| Núcleo | Z protones + N estimados; radio nuclear R ≈ 1,2·A^(1/3) fm (fórmula empírica estándar, citada como orden de magnitud) | Disposición interna ilustrativa; isótopo no especificado |
| Átomos del laboratorio | Radio visual = 0,35 × radio de la fuente | Tamaño visual, no un volumen físico |

## 3. Evaluación de tecnologías

| Tecnología | Licencia | Valoración | Decisión |
|---|---|---|---|
| **Three.js** | MIT | Ligero, funciona en el WebView de Android y ya se usaba en el proyecto | **Usada** (escena, cámara, modelos) |
| **React 19** | MIT | Componentes para la interfaz; las escenas 3D quedan fuera del ciclo de render de React | **Usada** en la interfaz (directriz Android) |
| **Capacitor 8** | MIT | Empaqueta la misma app web como app Android nativa | **Usada** |
| Babylon.js | Apache-2.0 | Muy completa, pero más pesada (≈2–3× el tamaño de Three.js) | No necesaria |
| WebGPU | Estándar W3C | No disponible en todos los WebView de Android | Evolución futura (Three.js permite migrar) |
| RDKit.js (MinimalLib) | BSD | Química orgánica en WebAssembly: SMILES, cálculo de fórmulas, coordenadas 2D y 3D | **Candidata para las Fases 2 y 3** (validación de estructuras) |
| 3Dmol.js | BSD (según su repositorio, ⚠ por verificar) | Visor molecular muy completo | Evaluar para la Fase 3; puede bastar con Three.js |
| PubChem PUG-REST | Datos abiertos, límite de 5 solicitudes/s, sin clave | Conformeros 3D de compuestos con su CID | **Fase 3**: descarga de estructuras al empaquetar, con referencia |
| Crystallography Open Database | Datos abiertos (CC0 según el proyecto, ⚠ por verificar) | Archivos CIF de redes cristalinas | **Fase 3** (NaCl, metales) |
| Materials Project | API con clave gratuita y términos propios | Estructuras y propiedades calculadas | Revisar los términos antes de usarla |
| NIST Chemistry WebBook / Atomic Spectra Database | Datos públicos del NIST | Datos de referencia (termoquímica, niveles de energía) | Validación cruzada en fases posteriores |
| Open Babel | GPL-2.0 | Conversión de formatos; la GPL obligaría a publicar todo el código bajo GPL | Solo como herramienta externa de preparación de datos |
| Avogadro | GPL / BSD (según componente) | Editor de escritorio | Solo como herramienta de referencia |
| Psi4 / PySCF / ASE | LGPL / Apache-2.0 / LGPL (⚠ por verificar) | Química cuántica en Python; **no se ejecuta en Android ni en el navegador** | Fase 4: cálculos previos fuera de la app (resultados empaquetados y marcados como "cálculo") o servicio opcional |

Regla del proyecto: no se afirmará ningún cálculo cuántico sin un motor real que lo ejecute, y los resultados precalculados indicarán el método y la base usados.

## 4. Estructuras moleculares y cristalinas (Fases 2 y 3)

Descargadas con `scripts/fetch-sources.mjs` (registro en `data/fuentes/descarga.txt`) y convertidas por `scripts/build-structures.mjs`, sin modificar coordenadas.

### PubChem (conformeros 3D, **calculados** con MMFF94s)

Agua (CID 962), dióxido de carbono, metano, amoníaco, oxígeno, nitrógeno, cloruro de hidrógeno, fluoruro de hidrógeno, D-glucosa, etanol, benceno, ácido sulfúrico, eteno, etino, metanal, monóxido de carbono, ácido acético e ion amonio. Cada ficha enlaza su página en PubChem.

**Sin conformero 3D en PubChem:** hidrógeno molecular y cisplatino. Se conserva solo la conectividad y no se dibuja ninguna geometría.

### Crystallography Open Database (dominio público, **experimentales**)

| Sólido | Entrada COD | Grupo espacial | Referencia |
|---|---|---|---|
| NaCl (halita) | 1000041 | Fm-3m | Abrahams y Bernstein, *Acta Cryst.* 18 (1965) 926, DOI 10.1107/S0365110X65002244 |
| MgO (periclasa) | 1000053 | Fm-3m | Sasaki, Fujino y Takéuchi (indicado en el CIF) |
| Cobre | 5000216 | Fm-3m | *Standard X-ray diffraction powder patterns* (1953) |
| Hierro α | 9000657 | Im-3m | *Hydrostatic compression of iron and related compounds* (P = 0) |
| Calcita | 1547350 | R-3c (hexagonal) | *Structural evolution of calcite at high temperatures*, 2013, medida a 295 K |

La referencia completa de cada CIF (autores, título, revista, DOI) se muestra en el visor.

### Validación frente a valores experimentales (NIST CCCBDB, fase gas)

| Molécula | Referencia | Resultado |
|---|---|---|
| H₂O | d(O–H) 0,958 Å; ángulo 104,5° | Dentro de ±0,04 Å y ±3° |
| CH₄ | d(C–H) 1,087 Å; 109,47° | Correcto |
| NH₃ | d(N–H) 1,012 Å; 106,7° | Correcto |
| CO₂ | d(C=O) 1,160 Å; 180° | Correcto |
| N₂ / O₂ | 1,098 / 1,208 Å | Correcto |
| C₆H₆ | d(C–C) 1,397 Å, seis iguales | Correcto |
| **CO** | d(C≡O) 1,128 Å | **Discrepancia de ≈0,07 Å**: documentada en la app |
