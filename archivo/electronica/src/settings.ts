export interface AppSettings {
  quality: 'alta' | 'media' | 'baja';
  defaultWireColor: string;
  showNetHighlight: boolean;
  defaultTimeScale: number;
  defaultDt: number;
}

const KEY = 'lab3d.settings';

const DEFAULTS: AppSettings = {
  quality: 'media',
  defaultWireColor: 'auto',
  showNetHighlight: true,
  defaultTimeScale: 1,
  defaultDt: 2e-4,
};

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
  return s.quality === 'alta'
    ? { shadows: true, pixelRatio: 2 }
    : s.quality === 'media'
      ? { shadows: true, pixelRatio: 1.5 }
      : { shadows: false, pixelRatio: 1 };
}
