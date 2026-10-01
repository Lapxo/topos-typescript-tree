import { ts } from './compiler.ts';
import { atMark, bar, dash, five, mathName, numberName, orderName, past, slash, splitName } from './marks.ts';
import { counted, said, type Row } from './rows.ts';

type Callable = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;

const spaced = (text: string): string => text.split(/\s+/).filter(Boolean).join(' ').replace(/\( /g, '(').replace(/,? \)/g, ')').replace(/ ,/g, ',');
const reserved = new Set(Array.from({ length: ts.SyntaxKind.LastReservedWord - ts.SyntaxKind.FirstReservedWord + 1 }, (_, i) => ts.tokenToString(ts.SyntaxKind.FirstReservedWord + i) ?? ''));
const exported = (node: ts.Node): boolean => (ts.canHaveModifiers(node) ? ts.getModifiers(node) ?? [] : []).some((one) => one.kind === ts.SyntaxKind.ExportKeyword);
const signed = (name: string, fn: Callable): string => spaced(`${name}${fn.typeParameters ? `<${fn.typeParameters.map((one) => one.getText()).join(', ')}>` : ''}(${fn.parameters.map((one) => one.getText()).join(', ')})${fn.type ? `: ${fn.type.getText()}` : ''}`);
const shouting = (name: string): boolean => /^[A-Z][A-Z0-9_]*[A-Z0-9]$/.test(name);
function typeOf(node: ts.TypeNode | undefined): string {
  if (node === undefined) return '';
  if (ts.isTypeOperatorNode(node) && node.operator === ts.SyntaxKind.ReadonlyKeyword) return typeOf(node.type);
  if (ts.isArrayTypeNode(node)) return `${typeOf(node.elementType)}[]`;
  if (ts.isTypeReferenceNode(node)) return node.typeName.getText();
  if (ts.isTypeLiteralNode(node)) return `{${node.members.flatMap((one) => (one.name === undefined ? [] : [one.name.getText()])).join(', ')}}`;
  return spaced(node.getText());
}
function literalOf(node: ts.Expression, at: string, out: string[]): boolean {
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return out.push(`${at}=${node.text}`) > 0;
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) return out.push(`${at}=-${node.operand.text}`) > 0;
  if (!ts.isObjectLiteralExpression(node) || !node.properties.length) return false;
  return node.properties.every((one) => ts.isPropertyAssignment(one) && !ts.isComputedPropertyName(one.name) && literalOf(one.initializer, at ? `${at}.${one.name.getText()}` : one.name.getText(), out));
}
function typed(node: ts.Expression): boolean {
  if (ts.isNumericLiteral(node)) return /^\d+(?:\.\d+)?$/.test(node.getText()) && !/^[01]$/.test(node.getText());
  if (ts.isPrefixUnaryExpression(node)) return node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand) && /^\d+(?:\.\d+)?$/.test(node.operand.getText());
  if (ts.isStringLiteral(node)) return node.text.length > 0;
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text.length > 0 && !node.getText().includes('$');
  if (ts.isArrayLiteralExpression(node)) return node.elements.some((one) => typed(one));
  return ts.isObjectLiteralExpression(node) && node.properties.some((one) => ts.isPropertyAssignment(one) && typed(one.initializer));
}
function headRows(text: string): readonly Row[] {
  const head = /\/\*\*([\s\S]*?)\*\//.exec(text)?.[1];
  if (head === undefined) return [];
  const answer = /It answers ([^.:(]*)/.exec(head.split('\n').map((line) => line.replace(/^\s*\*\s?/, '')).join(' '))?.[1]?.trim();
  return [said('source/head', 'text', [head]), ...(answer ? [said('source/answers', 'text', [answer])] : [])];
}
function rangeOf(file: ts.SourceFile, node: ts.Node, name: ts.Node, init?: ts.Expression): Row | undefined {
  const at = (lo: number, hi: number, measure: string): Row => said(`source/range/${name.getText()}`, measure, [`${lo}..${hi}`]);
  if (init === undefined) return at(node.getStart(file), name.getEnd() + past, 'named');
  if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return at(node.getStart(file), init.getStart(file) + past, 'named');
  if (ts.isObjectLiteralExpression(init)) return at(init.getStart(file), init.getEnd() - 1, 'body');
  if (!ts.isCallExpression(init) || !ts.isIdentifier(init.expression) || init.arguments[0] === undefined) return undefined;
  const first = init.arguments[0];
  return ts.isObjectLiteralExpression(first) && first.getStart(file) === init.expression.getEnd() + 1 ? at(init.getStart(file), first.getEnd() - 1, 'body') : undefined;
}
function declarationRows(file: ts.SourceFile, carried: Set<string>): readonly Row[] {
  const rows: Row[] = [];
  const signatures = new Map<string, string[]>();
  const bodied = new Set<string>();
  const sign = (name: string, signature: string, body: boolean): void => {
    if (body && signatures.has(name) && !bodied.has(name)) return;
    if (body) bodied.add(name);
    signatures.set(name, [...(body ? [] : signatures.get(name) ?? []), signature]);
  };
  const ranges = new Map<string, Row>();
  const arrows = new Map<string, Callable>();
  for (const node of file.statements.filter(exported)) {
    if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
      carried.add(node.name.text);
      sign(node.name.text, signed(node.name.text, node), node.body !== undefined);
      if (node.body !== undefined) ranges.set(node.name.text, rangeOf(file, node, node.name)!);
      if (node.typeParameters && !arrows.has(node.name.text)) arrows.set(node.name.text, node);
      if (node.type !== undefined) rows.push(said(`source/returns/${node.name.text}`, 'type', [typeOf(node.type)]), said(`source/returns/${node.name.text}`, 'params', [spaced(`(${node.parameters.map((one) => one.getText()).join(', ')})`)]));
    }
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) carried.add(node.name.text);
    if (ts.isTypeAliasDeclaration(node) && ts.isUnionTypeNode(node.type) && node.type.types.every((one) => ts.isLiteralTypeNode(one) && ts.isStringLiteral(one.literal))) {
      rows.push(said(`source/union/${node.name.text}`, 'id', node.type.types.map((one) => ((one as ts.LiteralTypeNode).literal as ts.StringLiteral).text)));
    }
    for (const one of ts.isVariableStatement(node) ? node.declarationList.declarations : []) {
      if (!ts.isIdentifier(one.name)) continue;
      const fn = one.initializer !== undefined && (ts.isArrowFunction(one.initializer) || ts.isFunctionExpression(one.initializer)) ? one.initializer : undefined;
      sign(one.name.text, fn ? signed(one.name.text, fn) : spaced(`${one.name.text}${one.type ? `: ${one.type.getText()}` : ''}`), true);
      const range = one.initializer === undefined ? undefined : rangeOf(file, node, one.name, one.initializer);
      if (range !== undefined) ranges.set(one.name.text, range);
      if (one.type !== undefined && ts.isTypeReferenceNode(one.type)) rows.push(said(`source/declared/${one.name.text}`, 'type', [one.type.typeName.getText()]), said(`source/declared/${one.name.text}`, 'args', [spaced((one.type.typeArguments ?? []).map((arg) => arg.getText()).join(', '))]));
    }
  }
  const types = file.statements.filter(exported).flatMap((node) => ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && /^[A-Z]/.test(node.name.text) ? [node.name.text] : []));
  return [...rows, ...[...signatures].map(([name, all]) => said(`source/signature/${name}`, 'text', [all.join('; ')])), ...ranges.values(), ...(types.length ? [said('source/types', 'id', types)] : []),
    ...[...arrows].flatMap(([name, fn]) => [said(`source/arrow/${name}`, 'params', fn.parameters.map((one) => `${one.name.getText()}=${typeOf(one.type)}`)), said(`source/arrow/${name}`, 'result', [typeOf(fn.type)])])];
}
function importRows(file: ts.SourceFile, carried: Set<string>, faults: Set<string>): readonly Row[] {
  const imports = new Map<string, string[]>();
  const lines = new Set<number>();
  let twice = false;
  for (const node of file.statements.filter(ts.isImportDeclaration)) {
    const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line;
    twice ||= lines.has(line);
    lines.add(line);
    const bound = node.importClause?.namedBindings;
    if (!ts.isStringLiteral(node.moduleSpecifier) || bound === undefined || !ts.isNamedImports(bound)) continue;
    const names = bound.elements.filter((one) => !one.isTypeOnly).map((one) => (one.propertyName ?? one.name).text);
    if (node.importClause?.isTypeOnly) bound.elements.forEach((one) => carried.add(one.name.text));
    else imports.set(node.moduleSpecifier.text, [...(imports.get(node.moduleSpecifier.text) ?? []), ...names]);
  }
  if (twice) faults.add('two imports on one line');
  const specifiers = [...new Set(file.statements.flatMap((node) => ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier) ? [node.moduleSpecifier.text] : [])))];
  return [...[...imports].map(([from, names]) => said(`source/imports/${from}`, 'id', names)), ...(specifiers.length ? [said('source/specifiers', 'id', specifiers)] : [])];
}
/** What a TypeScript module says, read by the language and never by a pattern over its text: its head and the question it answers, what it exports, imports and spells, what a place customises, its lines, the names it declares, the words it compares against and the first step of every path; a page or a reader reads these and never the module. */
export function observe(bytes: Uint8Array): readonly Row[] {
  const text = new TextDecoder().decode(bytes);
  const file = ts.createSourceFile('module.ts', text, ts.ScriptTarget.Latest, true);
  const [carried, faults] = [new Set<string>(), new Set<string>()];
  const rows: Row[] = [said('source/lang', 'id', ['ts']), counted('source/lines', text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0)), ...headRows(text), ...declarationRows(file, carried), ...importRows(file, carried, faults)];
  const walked = walk(file, carried, faults);
  if (carried.size) rows.push(said('source/carries', 'id', [...carried].sort()));
  return [...rows, ...walked];
}

type Tally = { unread: number; longest: number; lexed: number; customised: number; dynamic: number; parsed: number; forms: number; spans: number; numbers: number; text: number };
const PARSING: Readonly<Record<string, ReadonlySet<string>>> = { split: new Set(['/', ':']), indexOf: new Set(['=', ':']), lastIndexOf: new Set(['=', ':']) };
const FORMS: ReadonlySet<string> = new Set(['..', '|']);
type Token = ts.StringLiteral | ts.NoSubstitutionTemplateLiteral | ts.TemplateLiteralToken;
const SOUGHT: ReadonlySet<string> = new Set(['split', 'indexOf', 'lastIndexOf', 'startsWith', 'endsWith', 'includes', 'replace', 'replaceAll', 'match', 'search']);
const token = (node: ts.Node): node is Token => ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateLiteralToken(node);
const compared: ReadonlySet<ts.SyntaxKind> = new Set([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken]);
const typeTest = (node: ts.Node): boolean => ts.isTypeOfExpression(node) || (ts.isSwitchStatement(node) && ts.isTypeOfExpression(node.expression));
const casedBy = (node: ts.Node): readonly Token[] => ((ts.isCaseClause(node) && !typeTest(node.parent.parent) ? [node.expression]
  : ts.isBinaryExpression(node) && compared.has(node.operatorToken.kind) && !typeTest(node.left) && !typeTest(node.right) ? [node.left, node.right] : []) as readonly ts.Node[])
  .filter(token).filter((one) => one.text !== '');
const stepped = (head: string): boolean => head.length > 1 && [...head].every((c) => (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c === dash) && (head[0] ?? '') >= 'a';
const declared = (file: ts.SourceFile): readonly string[] => [...new Set(file.statements.flatMap((node) => (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)
  ? (node.name === undefined ? [] : [node.name.text]) : ts.isVariableStatement(node) ? node.declarationList.declarations.flatMap((one) => (ts.isIdentifier(one.name) ? [one.name.text] : [])) : [])))].sort();
/** A literal handed first to a call that searches a string is what the module reads, never what it writes. */
function sought(node: Token): boolean {
  const whole = ts.isNoSubstitutionTemplateLiteral(node) || ts.isStringLiteral(node) ? node : ts.isTemplateSpan(node.parent) ? node.parent.parent : node.parent;
  const call = whole.parent;
  return ts.isCallExpression(call) && call.arguments[0] === whole && ts.isPropertyAccessExpression(call.expression) && SOUGHT.has(call.expression.name.text);
}
const customised = (node: Token): boolean => !sought(node) && (/#(?:[0-9a-fA-F]{3}){1,2}(?![0-9a-fA-F])/.test(node.text)
  || /[\u2190-\u21ff\u2200-\u22ff\u27c0-\u27ef\u2980-\u2aff]/.test(node.text) || /[A-Za-z]+ [a-z]+ [a-z]+[,;] [a-z]+/.test(node.text));

function tally(node: ts.Node, file: ts.SourceFile, counts: Tally): void {
  const spelled = token(node) && ((node.text.includes('://') && !node.text.includes('xmlns="')) || /\{[a-z]+\}/.test(node.text));
  if (node.kind === ts.SyntaxKind.RegularExpressionLiteral || spelled || (ts.isArrayLiteralExpression(node) && node.elements.length >= five && node.elements.every((one) => ts.isStringLiteral(one) && /^[a-z]+$/.test(one.text)))) counts.unread += 1;
  const heads = token(node) ? node.text.split(' ') : [];
  if ((node.kind === ts.SyntaxKind.RegularExpressionLiteral && (node.getText().match(/[A-Za-z]+/g) ?? []).some((word) => reserved.has(word))) || (heads.length > 1 && reserved.has(heads[0]!) && reserved.has(heads[1]!))) counts.lexed += 1;
  if (token(node) && customised(node)) counts.customised += 1;
  if (ts.isFunctionLike(node) && 'body' in node && node.body !== undefined) counts.longest = ((span) => (span > counts.longest ? span : counts.longest))(file.getLineAndCharacterOfPosition(node.getEnd()).line - file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1);
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) counts.dynamic += 1;
  const [head, first] = ts.isCallExpression(node) ? [node.expression, node.arguments[0]] : [undefined, undefined];
  if ((head !== undefined && ts.isPropertyAccessExpression(head) && first !== undefined && ts.isStringLiteral(first) && PARSING[head.name.text]?.has(first.text)) || (head !== undefined && ts.isIdentifier(head) && head.text === numberName)
    || (ts.isStringLiteral(node) && node.text === atMark) || (ts.isIdentifier(node) && node.text === orderName)) counts.parsed += 1;
  if (head !== undefined && ts.isPropertyAccessExpression(head) && head.name.text === splitName && first !== undefined && ts.isStringLiteral(first) && FORMS.has(first.text)) counts.forms += 1;
  if (head !== undefined && ts.isPropertyAccessExpression(head) && ts.isIdentifier(head.expression) && head.expression.text === mathName && ['min', 'max'].includes(head.name.text)) counts.spans += 1;
  if (ts.isNumericLiteral(node) && !/^[01]$/.test(node.getText())) counts.numbers += 1;
  if (token(node)) counts.text += ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)) && /^(?:prose|form\/template|form\/prose)\//.test(node.text) ? 1 : 0) + (node.text.match(/```|-->|!\[|<(?:img|svg|p)\b|\|---/g) ?? []).length;
}
function faulted(node: ts.Node, templated: boolean, faults: Set<string>): void {
  if (ts.isNumericLiteral(node) && !templated && !/^[01]$/.test(node.getText())) faults.add('a magic number');
  if (ts.isNonNullExpression(node)) faults.add('a non-null assertion');
  if ((ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name !== undefined && ts.isIdentifier(node.name) && shouting(node.name.text)) faults.add('a shouting name');
}
function called(node: ts.CallExpression, calls: Set<string>, typedBy: Map<string, string[]>, filled: Set<string>): void {
  const root = rootOf(node.expression);
  if (root !== undefined) calls.add(root);
  const last = ts.isIdentifier(node.expression) ? node.expression.text : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : undefined;
  const second = node.arguments[1];
  if (last !== undefined && second !== undefined && typed(second)) typedBy.set(last, [...(typedBy.get(last) ?? []), second.getText().split(bar).join(slash)]);
  if (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) && ['push', 'add', 'set', 'unshift', 'splice'].includes(node.expression.name.text)) filled.add(node.expression.expression.text);
}

function walk(file: ts.SourceFile, carried: Set<string>, imported: ReadonlySet<string>): readonly Row[] {
  const literals: string[][] = [];
  const [calls, words, faults, empty, filled, heads, cases, typedWords] = [new Set<string>(), new Set<string>(), new Set<string>(), new Set<string>(), new Set<string>(), new Set<string>(), new Set<string>(), new Set<string>()];
  const typedBy = new Map<string, string[]>();
  const counts: Tally = { unread: 0, longest: 0, lexed: 0, customised: 0, dynamic: 0, parsed: 0, forms: 0, spans: 0, numbers: 0, text: 0 };
  const visit = (node: ts.Node, templated: boolean): void => {
    tally(node, file, counts);
    faulted(node, templated, faults);
    if (ts.isStringLiteral(node) && /^[a-z]+$/.test(node.text)) words.add(node.text);
    if (token(node) && stepped(node.text.split(slash)[0] ?? '')) heads.add(node.text.split(slash)[0] ?? '');
    for (const one of casedBy(node)) cases.add(one.text);
    if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) typedWords.add(node.literal.text);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && (node.parent.flags & ts.NodeFlags.Const) !== 0 && node.initializer !== undefined && emptied(node.initializer)) empty.add(node.name.text);
    if (ts.isCallExpression(node)) called(node, calls, typedBy, filled);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isElementAccessExpression(node.left) && ts.isIdentifier(node.left.expression)) filled.add(node.left.expression.text);
    const flat: string[] = [];
    if (ts.isObjectLiteralExpression(node) && literalOf(node, '', flat)) return void literals.push(flat);
    if ((ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)) && (ts.getModifiers(node) ?? []).some((one) => one.kind === ts.SyntaxKind.ReadonlyKeyword)) carried.add(node.name.getText());
    ts.forEachChild(node, (child) => visit(child, templated || ts.isTemplateExpression(node)));
  };
  visit(file, false);
  const never = [...empty].filter((name) => !filled.has(name));
  const shape = [...['a shouting name', 'a magic number', 'a non-null assertion'].filter((one) => faults.has(one)), ...[...imported], ...(never.length ? [`${never.join(', ')} always empty`] : [])];
  return [
    ...literals.map((flat, i) => said(`source/literal/${i}`, 'id', flat)), ...(calls.size ? [said('source/calls', 'id', [...calls].sort())] : []), ...(words.size ? [said('source/words', 'id', [...words].sort())] : []),
    ...[...typedBy].map(([name, wants]) => said(`source/typed/${name}`, 'text', wants)), ...(shape.length ? [said('source/shape', 'id', shape)] : []),
    counted('source/unread', counts.unread), counted('source/longest', counts.longest, 'longest'), counted('source/lexed', counts.lexed), counted('source/customised', counts.customised), counted('source/dynamic', counts.dynamic),
    counted('source/parsed', counts.parsed), counted('source/form-splits', counts.forms), counted('source/spans', counts.spans), counted('source/numbers', counts.numbers), counted('source/text', counts.text),
    ...[['source/heads', heads], ['source/compared', cases], ['source/literal-types', typedWords]].flatMap(([scope, held]) => ((held as Set<string>).size ? [said(scope as string, 'id', [...(held as Set<string>)].sort())] : [])),
    ...(declared(file).length ? [said('source/declares', 'id', declared(file))] : []),
  ];
}

const emptied = (node: ts.Expression): boolean => (ts.isArrayLiteralExpression(node) && !node.elements.length) || (ts.isObjectLiteralExpression(node) && !node.properties.length)
  || (ts.isStringLiteral(node) && node.text === '') || (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && ['Set', 'Map'].includes(node.expression.text) && !node.typeArguments && !(node.arguments ?? []).length);
const rootOf = (node: ts.Expression): string | undefined => (ts.isIdentifier(node) ? node.text : ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) || ts.isCallExpression(node) ? rootOf(node.expression) : undefined);
