// One small TypeScript file, read by this world's said region as a host hands it: the rows it says of the file, each a count or a set of words, and nothing it was not handed.
import { observe } from '../../src/regions/said.ts';

const text = `import { alphabet } from '@lapxo/topos/wire';\n\nexport const shades = (line: string): readonly string[] => alphabet(line.split('=')[1] ?? '').members;\n`;
const rows = observe(new TextEncoder().encode(text)) as readonly { readonly scope: string; readonly bound: { readonly kind: string; readonly lo?: number; readonly values?: readonly string[] } }[];

for (const row of rows) console.log(`${row.scope} · ${row.bound.kind === 'interval' ? row.bound.lo : (row.bound.values ?? []).join('|')}`);
