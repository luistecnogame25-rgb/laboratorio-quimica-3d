export interface AppSettings {
  quality: 'alta' | 'media' | 'baja';
  /** Desactiva animaciones decorativas (giro de electrones en el modelo de Bohr, transiciones). */
  reduceMotion: boolean;
  /** Escala visual por defecto de los átomos en el laboratorio (no altera datos). */
  atomScale: number;
}

const KEY = 'quimlab.settings';

const DEFAULTS: AppSettings = { quality: 'media', reduceMotion: false, atomScale: 1 };

export function loadSettings(): AppSettings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<AppSettings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: AppSettings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function qualityOf(s: AppSettings) {
  return s.quality === 'alta' ? { shadows: true, pixelRatio: 2 } : s.quality === 'media' ? { shadows: true, pixelRatio: 1.5 } : { shadows: false, pixelRatio: 1 };
}
