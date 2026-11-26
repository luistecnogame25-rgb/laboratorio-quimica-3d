/** Símbolos esquemáticos (norma IEC/ANSI simplificada) como SVG en línea. */
const wrap = (body: string, w = 160, h = 70) =>
  `<svg class="symbol" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const SYMBOLS: Record<string, string> = {
  resistor:
    wrap('<path d="M5 35h30l5-12 10 24 10-24 10 24 10-24 10 24 10-24 5 12h40"/>') +
    wrap('<path d="M5 35h40M115 35h40"/><rect x="45" y="25" width="70" height="20" rx="1"/>'),
  capacitor: wrap('<path d="M5 35h67M88 35h67M72 15v40M88 15v40"/>'),
  'capacitor-electrolytic': wrap('<path d="M5 35h67M90 35h65M72 15v40"/><path d="M96 15q-8 20 0 40"/><path d="M58 18h8M62 14v8"/>'),
  diode: wrap('<path d="M5 35h55M100 35h55M60 15v40l40-20z M100 15v40"/>'),
  led: wrap('<path d="M5 35h55M100 35h55M60 15v40l40-20z M100 15v40"/><path d="M85 10l12-12M92 14l12-12"/><path d="M97 -2l0 6-6 0M104 2l0 6-6 0"/>', 160, 70),
  npn: wrap('<circle cx="95" cy="35" r="28"/><path d="M5 35h75M80 18v34M80 28l25-18v-10M80 42l25 18v10"/><path d="M99 55l6 5-8 1"/>', 160, 80),
  pnp: wrap('<circle cx="95" cy="35" r="28"/><path d="M5 35h75M80 18v34M80 28l25-18v-10M80 42l25 18v10"/><path d="M84 30l-4 -2 6 -4"/>', 160, 80),
  battery: wrap('<path d="M5 35h60M95 35h60M65 15v40M75 25v20M85 15v40M95 25v20"/><path d="M52 14h8M56 10v8"/>'),
  'dc-supply': wrap('<circle cx="80" cy="35" r="22"/><path d="M5 35h53M102 35h53M72 28h16M80 20v16M72 46h16"/>'),
  pushbutton: wrap('<path d="M5 45h50M105 45h50M55 45h0M105 45h0"/><circle cx="55" cy="45" r="3"/><circle cx="105" cy="45" r="3"/><path d="M50 30h60M80 30v-15M72 15h16"/>'),
  switch: wrap('<path d="M5 35h45M50 35l50-18M110 17h45M110 53h45"/><circle cx="50" cy="35" r="3"/><circle cx="110" cy="17" r="3"/><circle cx="110" cy="53" r="3"/>'),
  breadboard: wrap('<rect x="10" y="8" width="140" height="54" rx="4"/><path d="M20 20h120M20 50h120" stroke-dasharray="2 6"/><path d="M10 35h140" stroke-width="1"/>'),
};
