// @ts-check
/**
 * Reads TCGdex's card database (https://github.com/tcgdex/cards-database, MIT)
 * without executing it.
 *
 * Every card, set and series there is a TypeScript module whose default export
 * is an object literal. The obvious way to read them — import each file — would
 * run third-party code with this repo's permissions on every refresh. Instead
 * each file is parsed with the TypeScript compiler and its literal is evaluated
 * structurally: strings, numbers, booleans, arrays, objects, and the one
 * cross-file reference the data uses (`set: Set` / `serie: serie`, an imported
 * identifier), resolved by path. Anything else — a call, an operator, a spread
 * — is reported as unreadable rather than guessed at, and the caller decides
 * whether that's tolerable.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export class UnreadableLiteral extends Error {
  /** @param {string} file @param {string} detail */
  constructor(file, detail) {
    super(`${file}: ${detail}`);
    this.name = 'UnreadableLiteral';
  }
}

/**
 * @typedef {{ name: string, from: string }} ImportBinding
 * @typedef {{ value: Record<string, unknown>, imports: Map<string, string> }} ParsedModule
 */

/**
 * @param {ts.Expression} node
 * @param {Map<string, string>} imports  local identifier → module specifier
 * @param {string} file
 * @returns {unknown}
 */
function evaluate(node, imports, file) {
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    return evaluate(node.expression, imports, file);
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return -Number(node.operand.text);
  }
  // A long effect string is occasionally split across lines with `+`.
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = evaluate(node.left, imports, file);
    const right = evaluate(node.right, imports, file);
    if (typeof left === 'string' && typeof right === 'string') return left + right;
    throw new UnreadableLiteral(file, '`+` on something other than two strings');
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isIdentifier(node)) {
    if (node.text === 'undefined') return undefined;
    const from = imports.get(node.text);
    if (from) return { $ref: from };
    throw new UnreadableLiteral(file, `unknown identifier \`${node.text}\``);
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((el) => {
      if (ts.isSpreadElement(el)) throw new UnreadableLiteral(file, 'array spread');
      return evaluate(el, imports, file);
    });
  }
  if (ts.isObjectLiteralExpression(node)) {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) {
        const name = prop.name;
        const key =
          ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)
            ? name.text
            : null;
        if (key === null) throw new UnreadableLiteral(file, 'computed property name');
        out[key] = evaluate(prop.initializer, imports, file);
      } else if (ts.isShorthandPropertyAssignment(prop)) {
        out[prop.name.text] = evaluate(prop.name, imports, file);
      } else {
        throw new UnreadableLiteral(file, `unsupported property (${ts.SyntaxKind[prop.kind]})`);
      }
    }
    return out;
  }
  throw new UnreadableLiteral(file, `unsupported expression (${ts.SyntaxKind[node.kind]})`);
}

/**
 * Parses one data module and returns its default-exported literal.
 *
 * Handles both shapes the database uses: `const card: Card = {…}; export
 * default card` and a direct `export default {…}`.
 *
 * @param {string} source
 * @param {string} file  for error messages only
 * @returns {ParsedModule}
 */
export function parseDataModule(source, file) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  /** @type {Map<string, string>} */
  const imports = new Map();
  /** @type {Map<string, ts.Expression>} */
  const consts = new Map();
  /** @type {ts.Expression | undefined} */
  let exported;

  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const clause = stmt.importClause;
      // Type-only imports (`import { Card } from '../interfaces'`) bind nothing at runtime.
      if (clause?.name) imports.set(clause.name.text, stmt.moduleSpecifier.text);
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer)
          consts.set(decl.name.text, decl.initializer);
      }
    } else if (ts.isExportAssignment(stmt)) {
      exported = ts.isIdentifier(stmt.expression)
        ? consts.get(stmt.expression.text)
        : stmt.expression;
    }
  }
  if (!exported) throw new UnreadableLiteral(file, 'no default-exported literal');
  const value = evaluate(exported, imports, file);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new UnreadableLiteral(file, 'default export is not an object');
  }
  return { value: /** @type {Record<string, unknown>} */ (value), imports };
}

/**
 * The `export const name = {…}` literals of a module, e.g. `meta/legals.ts`'s
 * `standard` and `expanded` filters.
 *
 * @param {string} source
 * @param {string} file
 * @returns {Record<string, unknown>}
 */
export function parseNamedExports(source, file) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    const exported = stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.initializer) {
        out[decl.name.text] = evaluate(decl.initializer, new Map(), file);
      }
    }
  }
  return out;
}

/**
 * @typedef {{
 *   serie: Record<string, unknown> & { id: string },
 *   set: Record<string, unknown> & { id: string },
 *   localId: string,
 *   card: Record<string, unknown>,
 * }} RawCard
 */

/**
 * Walks `<root>/data/<Series>/<Set>/<localId>.ts`, yielding every card with its
 * set and series resolved. Series and sets are the sibling `<name>.ts` files
 * the cards import.
 *
 * @param {string} root  a checkout of tcgdex/cards-database
 * @param {{ skipSeries?: (serieId: string) => boolean }} [options]
 * @returns {{ cards: RawCard[], unreadable: string[] }}
 */
export function readDatabase(root, options = {}) {
  const dataDir = path.join(root, 'data');
  /** @type {RawCard[]} */
  const cards = [];
  /** @type {string[]} */
  const unreadable = [];

  /** @param {string} file */
  const load = (file) => parseDataModule(readFileSync(file, 'utf8'), path.relative(root, file));

  for (const serieEntry of readdirSync(dataDir, { withFileTypes: true })) {
    if (!serieEntry.isDirectory()) continue;
    const serieDir = path.join(dataDir, serieEntry.name);
    const serie = /** @type {RawCard['serie']} */ (load(`${serieDir}.ts`).value);
    if (options.skipSeries?.(serie.id)) continue;

    for (const setEntry of readdirSync(serieDir, { withFileTypes: true })) {
      if (!setEntry.isDirectory()) continue;
      const setDir = path.join(serieDir, setEntry.name);
      const set = /** @type {RawCard['set']} */ (load(`${setDir}.ts`).value);

      for (const cardFile of readdirSync(setDir)) {
        if (!cardFile.endsWith('.ts')) continue;
        const file = path.join(setDir, cardFile);
        try {
          cards.push({ serie, set, localId: cardFile.slice(0, -3), card: load(file).value });
        } catch (err) {
          if (!(err instanceof UnreadableLiteral)) throw err;
          unreadable.push(err.message);
        }
      }
    }
  }
  return { cards, unreadable };
}
