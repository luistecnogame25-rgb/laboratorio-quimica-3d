/**
 * Punto único de registro de la biblioteca. Para añadir un componente:
 *  1. Declarar su ComponentDef (terminales, parámetros, modelo eléctrico) en un archivo de esta carpeta.
 *  2. Registrar aquí.
 *  3. Añadir su constructor 3D en src/render/models.ts y su ficha en src/education/sheets.ts.
 * El motor eléctrico y la interfaz no necesitan cambios.
 */
import { registerComponent, hasDef } from '../core/registry';
import type { ComponentDef } from '../core/types';
import { BOARD_SPECS } from './breadboards';
import { ceramicCapacitor, electrolyticCapacitor, resistor } from './passives';
import { diode, led, npn, pnp } from './semiconductors';
import { battery9v, benchSupply } from './power';
import { pushbutton, slideSwitch } from './inputs';

function boardDef(type: string): ComponentDef {
  const s = BOARD_SPECS[type];
  return {
    type,
    name: s.name,
    prefix: 'PB',
    category: 'protoboard',
    summary: s.rails
      ? `${s.points} puntos: tiras de 5 perforaciones por columna y 4 rieles de alimentación.`
      : `${s.points} puntos, sin rieles de alimentación.`,
    insertable: false,
    size: { w: s.columns * 2.54 + 6, h: 8.5, d: s.rails ? 54.6 : 35.6 },
    params: [],
    terminals: () => [],
    label: () => s.name,
    modelLevel: 'ideal',
    modelDoc: 'Las perforaciones de una misma tira se unen con resistencia cero (conexión ideal). No se modela la capacitancia parásita entre tiras.',
    eduId: 'breadboard',
  };
}

export function registerLibrary(): void {
  if (hasDef('resistor')) return;
  for (const t of Object.keys(BOARD_SPECS)) registerComponent(boardDef(t));
  [resistor, ceramicCapacitor, electrolyticCapacitor, led, diode, npn, pnp, battery9v, benchSupply, pushbutton, slideSwitch].forEach(registerComponent);
}
