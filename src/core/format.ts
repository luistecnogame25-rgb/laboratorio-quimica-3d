/** Formato en notación de ingeniería (1.2 kΩ, 4.7 µF, 20.1 mA). */
const PREFIXES: [number, string][] = [
  [1e9, 'G'],
  [1e6, 'M'],
  [1e3, 'k'],
  [1, ''],
  [1e-3, 'm'],
  [1e-6, 'µ'],
  [1e-9, 'n'],
  [1e-12, 'p'],
];

export function eng(value: number, unit = '', digits = 3): string {
  if (!Number.isFinite(value)) return `— ${unit}`.trim();
  const abs = Math.abs(value);
  if (abs < 1e-15) return `0 ${unit}`.trim();
  for (const [scale, prefix] of PREFIXES) {
    if (abs >= scale * 0.9995) {
      const v = value / scale;
      return `${trim(v.toPrecision(digits))} ${prefix}${unit}`.trim();
    }
  }
  const [scale, prefix] = PREFIXES[PREFIXES.length - 1];
  return `${trim((value / scale).toPrecision(digits))} ${prefix}${unit}`.trim();
}

function trim(s: string): string {
  if (s.includes('e')) return s;
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/** Interpreta "4k7", "2.2k", "100n", "1M", "470" → número. */
export function parseEng(text: string): number | null {
  const t = text.trim().replace(',', '.').replace(/[ΩFVAH]$/i, '').replace('µ', 'u');
  const m = /^(-?\d*\.?\d+)\s*([GMkmunp]?)(\d*)$/.exec(t);
  if (!m) return null;
  const mult: Record<string, number> = { G: 1e9, M: 1e6, k: 1e3, '': 1, m: 1e-3, u: 1e-6, n: 1e-9, p: 1e-12 };
  let num = parseFloat(m[1]);
  if (m[3]) num = parseFloat(`${m[1]}.${m[3]}`);
  return num * mult[m[2]];
}

export function uid(prefix = 'id'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}
