import { ts } from './compiler.ts';
import { commentsOf } from './comments.ts';
import type { Row } from './rows.ts';


type Spelled = { readonly text: string; readonly line: number };

const CODE = /\.(?:ts|tsx|mts|cts|js|mjs|cjs|jsx)$/;

/** The words a text holds: identifiers and each part of a dotted name, steps that name a place, inner parts of a constant, symbols outside ASCII, and every package named whole. */
function wordSet(text: string): ReadonlySet<string> {
  const words = new Set<string>();
  for (const m of text.matchAll(/[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/g)) {
    const word = m[0];
    words.add(word);
    for (const part of word.split('.')) if (part) words.add(part);
    if (/^[A-Z0-9_]+$/.test(word)) for (const part of word.split('_').slice(1, -1)) if (part) words.add(`_${part}_`);
  }
  for (const m of text.matchAll(/([\w.-]+)\//g)) words.add(`${m[1]}/`);
  for (const m of text.matchAll(/[^\u0000-\u007f]/gu)) words.add(m[0]);
  for (const m of text.matchAll(/(?<![\w.\/:-])\/([A-Za-z][\w.-]*)(?=\/)/g)) words.add(`/${m[1]}`);
  for (const m of text.matchAll(/\bdo\s+not\b/gi)) words.add(m[0].toLowerCase().replace(/\s+/, ' '));
  for (const m of text.matchAll(/@[\w.-]+\/[\w.-]+|\bnode:[\w/]+/g)) words.add(m[0]);
  return words;
}

const wordsOf = (text: string): readonly string[] => (wordSet(text).size ? [...wordSet(text)].sort() : ['none']);

/** What a source spells rather than names, as the compiler parses it: its string literals and the literal parts of its templates, and its comments, each with the line it starts on; a method or a type spells nothing. */
function spelled(source: string): { readonly held: readonly Spelled[]; readonly said: readonly Spelled[] } {
  const file = ts.createSourceFile('source.ts', source, ts.ScriptTarget.Latest, true);
  const lineOf = (pos: number): number => file.getLineAndCharacterOfPosition(pos).line + 1;
  const held: Spelled[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) held.push({ text: node.text, line: lineOf(node.getStart(file)) });
    if (ts.isTemplateExpression(node)) {
      held.push({ text: node.head.text, line: lineOf(node.head.getStart(file)) });
      for (const span of node.templateSpans) held.push({ text: span.literal.text, line: lineOf(span.literal.getStart(file)) });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { held, said: commentsOf(source).map((one) => ({ text: one.text, line: lineOf(one.pos) })) };
}

const firstLines = (parts: readonly Spelled[]): readonly string[] => {
  const at = new Map<string, number>();
  for (const part of parts) for (const word of wordSet(part.text)) if (!at.has(word)) at.set(word, part.line);
  return [...at].map(([word, line]) => `${word}:${line}`).sort();
};

/** The vocabulary of a file in the three kinds a lock tells apart: what a source spells, what it names, and what it says beside them; a line's about and a whole ceiling are read as absent, as is the envelope. */
export function observe(bytes: Uint8Array, place: string): readonly Row[] {
  const text = new TextDecoder().decode(bytes)
    .replace(/^(bound-lock\/1 .*?) ?about="(?:[^"\\]|\\.)*"/gm, '$1')
    .replace(/^bound-lock\/1 .* role=(?:reads|writes)(?: .*)?$/gm, '')
    .replace(/^bound-lock\/1(?= )/gm, '');
  const row = (scope: string, values: readonly string[], measure = 'id'): Row => ({ scope, measure, role: 'reads', bound: { kind: 'enumerated', values: values.length ? values : ['none'] } });
  const byLine = text.split('\n').map((one, i) => ({ text: one, line: i + 1 }));
  if (!CODE.test(place)) return [row('literal', wordsOf(text)), row('literal', firstLines(byLine), 'line')];
  const { held, said } = spelled(text);
  return [
    row('literal', wordsOf(held.map((part) => part.text).join('\n'))), row('identifier', wordsOf(text)), row('comment', wordsOf(said.map((part) => part.text).join('\n'))),
    row('literal', firstLines(held), 'line'), row('identifier', firstLines(byLine), 'line'),
  ];
}
