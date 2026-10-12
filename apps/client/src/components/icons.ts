/** Minimal original SVG glyphs for abilities (used as CSS masks so they take team/agent colour). */
const svg = (body: string) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' fill='none' stroke='white' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'>${body}</svg>`)}")`;

export const ABILITY_ICONS: Record<string, string> = {
  surge: svg("<path d='M5 8l8 8-8 8M15 8l8 8-8 8'/>"),
  veil: svg("<circle cx='11' cy='18' r='6'/><circle cx='20' cy='14' r='7'/><path d='M6 26h20'/>"),
  overdrive: svg("<path d='M18 3L7 18h8l-2 11 12-16h-8z' fill='white'/>"),
  seeker: svg("<circle cx='16' cy='16' r='3' fill='white'/><path d='M4 16s5-8 12-8 12 8 12 8-5 8-12 8S4 16 4 16z'/>"),
  echo: svg("<path d='M10 10a8 8 0 000 12M6 6a14 14 0 000 20M22 10a8 8 0 010 12M26 6a14 14 0 010 20'/><circle cx='16' cy='16' r='2' fill='white'/>"),
  decoy: svg("<circle cx='12' cy='8' r='3'/><path d='M12 12v9M8 30l4-9 4 9M7 16h10'/><path d='M22 8h4M22 14h6M22 20h4' stroke-dasharray='2 2'/>"),
  overwatch: svg("<circle cx='16' cy='16' r='4'/><circle cx='16' cy='16' r='9'/><circle cx='16' cy='16' r='14' stroke-dasharray='3 3'/>"),
  barrier: svg("<rect x='4' y='8' width='24' height='16'/><path d='M4 16h24M12 8v8M20 16v8'/>"),
  caltrops: svg("<path d='M6 26l4-8 4 8M14 26l4-10 4 10M22 26l3-6 3 6M4 28h24'/>"),
  reinforce: svg("<path d='M16 3l11 4v8c0 7-5 12-11 14C10 27 5 22 5 15V7z'/><path d='M16 10v10M11 15h10'/>"),
  sentry: svg("<rect x='10' y='8' width='12' height='8'/><path d='M22 12h7M16 16v4M10 28l6-8 6 8'/>"),
  mend: svg("<path d='M13 4h6v9h9v6h-9v9h-6v-9H4v-6h9z'/>"),
  station: svg("<rect x='5' y='5' width='22' height='22'/><path d='M16 10v12M10 16h12'/>"),
  aegis: svg("<path d='M16 3l11 4v8c0 7-5 12-11 14C10 27 5 22 5 15V7z'/>"),
  renewal: svg("<path d='M16 3v26M3 16h26M7 7l18 18M25 7L7 25'/><circle cx='16' cy='16' r='5' fill='white'/>"),
};
