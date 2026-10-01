import { ts } from './compiler.ts';

export interface Comment {
  readonly pos: number;
  readonly end: number;
  readonly text: string;
}

/** The comments a source speaks, found by the compiler and never by a pattern: a block is one comment, and a run of line comments on consecutive lines is one. */
export function commentsOf(text: string): readonly Comment[] {
  const file = ts.createSourceFile('source.ts', text, ts.ScriptTarget.Latest, true);
  const found = new Map<number, ts.CommentRange>();
  const visit = (node: ts.Node): void => {
    for (const range of ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []) found.set(range.pos, range);
    for (const range of ts.getTrailingCommentRanges(text, node.getEnd()) ?? []) found.set(range.pos, range);
    ts.forEachChild(node, visit);
  };
  visit(file);
  const units: { pos: number; end: number }[] = [];
  let line: number | undefined;
  for (const range of [...found.values()].sort((a, b) => a.pos - b.pos)) {
    const first = file.getLineAndCharacterOfPosition(range.pos).line;
    const last = units[units.length - 1];
    if (range.kind === ts.SyntaxKind.SingleLineCommentTrivia && last && line !== undefined && first === line + 1 && /^\s*$/.test(text.slice(last.end, range.pos).replace(/\n/, ''))) {
      last.end = range.end;
    } else {
      units.push({ pos: range.pos, end: range.end });
    }
    line = file.getLineAndCharacterOfPosition(range.end).line;
  }
  return units.map((unit) => ({ ...unit, text: text.slice(unit.pos, unit.end) }));
}
