import { alphabetsOf } from './alphabets.ts';
import { atMark, slash } from './marks.ts';
import { commentsOf } from './comments.ts';
import { counted, type Row } from './rows.ts';

/** The hazard classes a file's text shows, each once. */
function hazardsOf(text: string): readonly string[] {
  const hit: string[] = [];
  if (/catch\s*(?:\([^)]*\))?\s*\{\s*(?:\/\*[\s\S]*?\*\/)?\s*\}/.test(text)) hit.push('empty-catch');
  if (/\bprocess\.exit\s*\(/.test(text)) hit.push('mute-exit');
  if (/\breaddirSync\b/.test(text) && /\breadFileSync\b/.test(text) && !/\bobserveFile\b/.test(text)) {
    hit.push('reads-world-twice');
  }
  if (/\bok\s*[:=]\s*true\b/.test(text) && !/\bdigest\b/.test(text)) hit.push('marker-const');
  const constants = new Set([...text.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*['"`][^'"`]*['"`]\s*;/g)].map((m) => m[1]));
  if (new RegExp('\\b' + 'create' + 'Require' + '\\s*\\(|\\b' + 're' + 'quire' + '\\s*\\(\\s*[^\'"`]').test(text) || [...text.matchAll(/\bimport\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g)].some((m) => constants.has(m[1]))) hit.push('hidden-load');
  if (/\bnew RegExp\s*\(/.test(text) && new RegExp('\\bpa' + 'th|lo' + 'c/|all' + 'owed').test(text)) hit.push('regex-over-pa' + 'ths');
  if (/\bsymlinkSync\s*\(/.test(text)) hit.push('symlink-write-pa' + 'th');
  if (/\breason=|\bproc=|\blanes=|\bmodel=/.test(text)) hit.push('wire-literal');
  if (/writeFileSync\s*\([^)]*(?:leases|work-lanes|work-watch)/.test(text)) hit.push('mutable-shared-file');
  return [...new Set(hit)];
}

/** The package a specifier reaches: its name without the scope; a relative specifier or a host module reaches none. */
function packageOf(specifier: string): string | undefined {
  if (specifier.startsWith('.') || specifier.startsWith(slash) || specifier.startsWith('node:')) return undefined;
  const steps = specifier.split(slash);
  return specifier.startsWith(atMark) ? steps[1] : steps[0];
}

/** What a TypeScript source is made of, read once from its bytes: its lines, its comments, the packages it reaches and where, how many are capsules, its frozen alphabets and hazard classes; every question is answered at every file, so a zero is a reading too. */
export function observe(bytes: Uint8Array): readonly Row[] {
  const text = new TextDecoder().decode(bytes);
  const lines = text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
  const reached = new Map<string, number>();
  for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([@\w][\w@./:+-]*)["']/g)) {
    const name = packageOf(m[1] ?? '');
    if (name && !reached.has(name)) reached.set(name, text.slice(0, m.index).split('\n').length);
  }
  const capsules = [...reached.keys()].filter((name) => name.startsWith('topos-')).length;
  const builtins = [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']node:[\w/]+["']/g)].length;
  const comments = commentsOf(text).length;
  return [
    counted('lines', lines),
    { scope: 'lines', measure: 'per-file', role: 'reads', bound: { kind: 'interval', lo: lines, hi: lines } },
    { scope: 'comments', measure: 'per-file', role: 'reads', bound: { kind: 'interval', lo: comments, hi: comments } },
    { scope: 'dep', measure: 'id', role: 'reads', bound: { kind: 'enumerated', values: reached.size ? [...reached.keys()].sort() : ['none'] } },
    ...(reached.size ? [{ scope: 'dep', measure: 'line', role: 'reads' as const, bound: { kind: 'enumerated' as const, values: [...reached].map(([name, at]) => `${name}:${at}`).sort() } }] : []),
    counted('audit/topos/capsule-imports-only-topos', capsules),
    counted('builtins', builtins),
    ...alphabetsOf(text).map((members): Row => ({ scope: 'alphabet', measure: 'id', role: 'reads', bound: { kind: 'enumerated', values: members } })),
    counted('hazard', 0),
    ...hazardsOf(text).map((kind) => counted(`hazard/${kind}`, 1)),
  ];
}

