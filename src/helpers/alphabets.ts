import { ts } from './compiler.ts';

/** The alphabets a source freezes: every array of two or more string literals closed with `as const`, found by the compiler, each set once and its members in one order. */
export function alphabetsOf(text: string): readonly (readonly string[])[] {
  const file = ts.createSourceFile('source.ts', text, ts.ScriptTarget.Latest, true);
  const found = new Map<string, readonly string[]>();
  const visit = (node: ts.Node): void => {
    if (ts.isAsExpression(node) && ts.isConstTypeReference(node.type)) {
      let held: ts.Expression = node.expression;
      while (ts.isParenthesizedExpression(held)) held = held.expression;
      if (ts.isArrayLiteralExpression(held) && held.elements.length > 1 && held.elements.every(ts.isStringLiteral)) {
        const members = [...new Set(held.elements.map((member) => (member as ts.StringLiteral).text))].sort();
        found.set(members.join('|'), members);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return [...found.values()];
}
