# Fase 4 — Química computacional

## Estado actual (honesto)

**La aplicación no ejecuta ningún cálculo cuántico.** Psi4, PySCF y ASE son programas de Python con dependencias nativas (BLAS/LAPACK, compiladores): no funcionan dentro del WebView de Android ni en el navegador, y no hay en este proyecto ningún servidor que los ejecute.

Datos «calculados» que la app muestra hoy, siempre etiquetados como tales:

| Dato | Origen | Etiqueta en la app |
|---|---|---|
| Geometrías de moléculas | Conformeros 3D de PubChem (campo de fuerza **MMFF94s**, mecánica molecular, no cuántica) | «Geometría calculada» |
| Longitudes, ángulos, VSEPR, polaridad estimada | Calculados por la app sobre esas geometrías | «Calculado» / «estimación» |
| Coordinación en cristales | Calculada por la app sobre celdas **experimentales** de la COD | «Estructura experimental» |
| Forma de orbitales atómicos | Armónicos esféricos (solución analítica hidrogenoide) | «Aproximación pedagógica» |

Discrepancia documentada: en el CO, la distancia C–O del conformero MMFF94s difiere unos 0,07 Å del valor experimental (1,128 Å). Se muestra en la ficha de la molécula.

## Diseño para incorporar cálculos reales

Los cálculos se harán **fuera de la app** y sus resultados se empaquetarán como datos, con su método:

```
tools/qc/ (por crear)         Python 3 + PySCF (Apache-2.0)
  entrada:  data/fuentes/pubchem/*.3d.sdf      (geometría inicial con su CID)
  cálculo:  optimización DFT (p. ej. B3LYP/def2-SVP), energías, orbitales moleculares (HOMO/LUMO),
            cargas (Mulliken/Löwdin), densidad electrónica en una rejilla (formato cube)
  salida:   data/calculos/<id>.json  { metodo, base, programa, version, fecha, energia_Eh,
                                        geometria_optimizada, orbitales: [...], cargas: [...] }
scripts/build-calculations.mjs → src/data/calculations.data.ts
```

En la interfaz, cada resultado se mostrará con la etiqueta **«Cálculo (método/base, programa, versión)»**, junto a la geometría de la fuente para compararlas. Para moléculas grandes, las densidades y orbitales se empaquetarán a baja resolución (nivel de detalle) por memoria en Android.

## Qué falta para completarla

1. Instalar Python 3 y PySCF en el equipo de desarrollo (`pip install pyscf`). Es gratuito, pero hay que hacerlo a mano.
2. Escribir y validar `tools/qc/optimize.py` contra valores de referencia (p. ej. geometrías experimentales del NIST CCCBDB para H₂O, NH₃ y CH₄).
3. Añadir el visor de superficies de isodensidad y orbitales moleculares (marching cubes sobre archivos cube).
4. Documentar en cada resultado el método, la base y la versión del programa.

Hasta entonces, la app no muestra energías moleculares, orbitales moleculares ni cargas atómicas calculadas.
