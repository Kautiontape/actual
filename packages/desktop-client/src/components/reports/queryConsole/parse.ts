// @ts-strict-ignore
// A small pipeline query language (PRQL / dplyr flavored) for the Query
// console. Text is parsed into a list of pipeline stages which are later
// compiled to ActualQL + a client-side analytics pass (see `run.ts`).
//
// Example:
//   from transactions
//   filter payee ~ "Costco" and amount <= -50
//   exclude id in ("abc", "def")
//   group month
//   aggregate spend = sum amount, typical = median amount
//   sort month
//   window avg_3 = rolling_avg spend 3
//   forecast projected = spend 3

import { format, startOfYear, subDays, subMonths, subWeeks } from 'date-fns';

export const TABLES = [
  'transactions',
  'accounts',
  'categories',
  'payees',
  'schedules',
  'rules',
  'budgets',
] as const;
export type Table = (typeof TABLES)[number];

export const AGG_FNS = [
  'sum',
  'count',
  'count_distinct',
  'mean',
  'avg',
  'median',
  'mode',
  'min',
  'max',
  'stddev',
  'first',
  'last',
] as const;
export type AggFn = (typeof AGG_FNS)[number];

export const WINDOW_FNS = [
  'rolling_avg',
  'running_total',
  'delta',
  'pct_of_total',
  'lag',
] as const;
export type WindowFn = (typeof WINDOW_FNS)[number];

// Functions usable inside `derive` expressions (impl lives in run.ts).
export const EXPR_FN_NAMES = [
  'abs',
  'round',
  'floor',
  'ceil',
  'sqrt',
  'neg',
  'min',
  'max',
] as const;

export type CompareOp =
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | '~'
  | '!~'
  | 'in'
  | 'not in';

export type Value =
  | { type: 'string'; value: string }
  | { type: 'number'; value: number }
  | { type: 'date'; value: string }
  | { type: 'bool'; value: boolean };

export type Condition =
  | { kind: 'compare'; field: string; op: CompareOp; values: Value[] }
  | { kind: 'and'; left: Condition; right: Condition }
  | { kind: 'or'; left: Condition; right: Condition }
  | { kind: 'not'; cond: Condition };

export type GroupKey = { field: string; bucket?: 'month' | 'year' };

export type Aggregation = {
  name: string;
  fn: AggFn;
  arg?: string;
  // Optional per-aggregate `where` clause — restricts the group's rows before
  // the function runs, so one query can mix filtered and unfiltered aggregates.
  filter?: Condition;
};

// Arithmetic expression AST, used by `derive`.
export type Expr =
  | { kind: 'num'; value: number }
  | { kind: 'col'; name: string }
  | { kind: 'unary'; op: '-'; operand: Expr }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/'; left: Expr; right: Expr }
  | { kind: 'call'; fn: string; args: Expr[] };

export type SelectColumn = { out: string; src: string };

export type Stage =
  | { kind: 'from'; table: Table }
  | { kind: 'filter'; cond: Condition }
  | { kind: 'exclude'; cond: Condition }
  | { kind: 'group'; keys: GroupKey[] }
  | { kind: 'aggregate'; aggs: Aggregation[] }
  | { kind: 'derive'; name: string; expr: Expr }
  | { kind: 'having'; cond: Condition }
  | { kind: 'select'; cols: SelectColumn[] }
  | { kind: 'sort'; key: string; dir: 'asc' | 'desc' }
  | { kind: 'take'; n: number }
  | { kind: 'window'; name: string; fn: WindowFn; arg: string; n?: number }
  | { kind: 'forecast'; name: string; arg: string; n: number };

export class QueryParseError extends Error {
  line?: number;
  constructor(message: string, line?: number) {
    super(line != null ? `Line ${line}: ${message}` : message);
    this.name = 'QueryParseError';
    this.line = line;
  }
}

// --- Condition tokenizer ---------------------------------------------------

type Tok =
  | { t: 'op'; v: CompareOp | '&&' | '||' }
  | { t: 'kw'; v: string }
  | { t: 'ident'; v: string }
  | { t: 'str'; v: string }
  | { t: 'num'; v: number }
  | { t: 'date'; v: string }
  | { t: 'punc'; v: '(' | ')' | ',' };

const KEYWORDS = new Set([
  'and',
  'or',
  'not',
  'in',
  'last',
  'this',
  'year',
  'month',
  'months',
  'day',
  'days',
  'week',
  'weeks',
  'today',
  'ytd',
  'true',
  'false',
]);

function tokenizeCondition(input: string, line: number): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = input.length;

  const isIdentStart = (c: string) => /[A-Za-z_]/.test(c);
  const isIdentChar = (c: string) => /[A-Za-z0-9_.]/.test(c);

  while (i < n) {
    const c = input[i];

    if (/\s/.test(c)) {
      i++;
      continue;
    }

    // Strings
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      let val = '';
      while (j < n && input[j] !== quote) {
        if (input[j] === '\\' && j + 1 < n) {
          val += input[j + 1];
          j += 2;
        } else {
          val += input[j];
          j++;
        }
      }
      if (j >= n) {
        throw new QueryParseError('Unterminated string literal', line);
      }
      toks.push({ t: 'str', v: val });
      i = j + 1;
      continue;
    }

    // Date literal @YYYY-MM-DD
    if (c === '@') {
      const m = /^@(\d{4}-\d{2}-\d{2})/.exec(input.slice(i));
      if (!m) {
        throw new QueryParseError(
          'Expected a date in the form @YYYY-MM-DD',
          line,
        );
      }
      toks.push({ t: 'date', v: m[1] });
      i += m[0].length;
      continue;
    }

    // Numbers (optionally signed)
    if (/[0-9]/.test(c) || (c === '-' && /[0-9.]/.test(input[i + 1] ?? ''))) {
      const m = /^-?\d+(\.\d+)?/.exec(input.slice(i));
      toks.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }

    // Multi-char operators
    const two = input.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '==' || two === '!=') {
      toks.push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    if (two === '!~') {
      toks.push({ t: 'op', v: '!~' });
      i += 2;
      continue;
    }
    if (two === '&&') {
      toks.push({ t: 'op', v: '&&' });
      i += 2;
      continue;
    }
    if (two === '||') {
      toks.push({ t: 'op', v: '||' });
      i += 2;
      continue;
    }

    if (c === '<' || c === '>' || c === '~') {
      toks.push({ t: 'op', v: c });
      i++;
      continue;
    }
    if (c === '=') {
      // single = behaves like ==
      toks.push({ t: 'op', v: '==' });
      i++;
      continue;
    }
    if (c === '(' || c === ')' || c === ',') {
      toks.push({ t: 'punc', v: c });
      i++;
      continue;
    }

    // Identifiers / keywords
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < n && isIdentChar(input[j])) j++;
      const word = input.slice(i, j);
      if (KEYWORDS.has(word.toLowerCase())) {
        toks.push({ t: 'kw', v: word.toLowerCase() });
      } else {
        toks.push({ t: 'ident', v: word });
      }
      i = j;
      continue;
    }

    throw new QueryParseError(`Unexpected character "${c}"`, line);
  }

  return toks;
}

// --- Condition parser (recursive descent) ----------------------------------

class CondParser {
  toks: Tok[];
  pos = 0;
  line: number;

  constructor(toks: Tok[], line: number) {
    this.toks = toks;
    this.line = line;
  }

  peek(): Tok | undefined {
    return this.toks[this.pos];
  }
  next(): Tok | undefined {
    return this.toks[this.pos++];
  }
  atEnd(): boolean {
    return this.pos >= this.toks.length;
  }

  parse(): Condition {
    const cond = this.parseOr();
    if (!this.atEnd()) {
      throw new QueryParseError('Unexpected tokens after condition', this.line);
    }
    return cond;
  }

  private isKw(v: string): boolean {
    const tk = this.peek();
    return tk?.t === 'kw' && tk.v === v;
  }
  private isOp(v: string): boolean {
    const tk = this.peek();
    return tk?.t === 'op' && tk.v === v;
  }

  parseOr(): Condition {
    let left = this.parseAnd();
    while (this.isKw('or') || this.isOp('||')) {
      this.next();
      const right = this.parseAnd();
      left = { kind: 'or', left, right };
    }
    return left;
  }

  parseAnd(): Condition {
    let left = this.parseNot();
    while (this.isKw('and') || this.isOp('&&')) {
      this.next();
      const right = this.parseNot();
      left = { kind: 'and', left, right };
    }
    return left;
  }

  parseNot(): Condition {
    if (this.isKw('not')) {
      this.next();
      return { kind: 'not', cond: this.parseNot() };
    }
    return this.parsePrimary();
  }

  parsePrimary(): Condition {
    const tk = this.peek();
    if (tk?.t === 'punc' && tk.v === '(') {
      this.next();
      const cond = this.parseOr();
      const close = this.next();
      if (!(close?.t === 'punc' && close.v === ')')) {
        throw new QueryParseError('Expected ")"', this.line);
      }
      return cond;
    }
    return this.parseCompare();
  }

  parseCompare(): Condition {
    const fieldTok = this.next();
    // Allow keyword tokens (e.g. `month`) as field names so that filters like
    // `filter month >= "2025-01"` parse correctly.
    if (fieldTok?.t !== 'ident' && fieldTok?.t !== 'kw') {
      throw new QueryParseError('Expected a field name', this.line);
    }
    const field = fieldTok.v;

    // operator (note: && / || are logical, not comparison operators)
    const COMPARE_OPS = ['==', '!=', '<', '<=', '>', '>=', '~', '!~'];
    let op: CompareOp | null = null;
    const opTok = this.peek();
    if (opTok?.t === 'op' && COMPARE_OPS.includes(opTok.v)) {
      this.next();
      op = opTok.v as CompareOp;
    } else if (opTok?.t === 'kw' && opTok.v === 'in') {
      this.next();
      op = 'in';
    } else if (opTok?.t === 'kw' && opTok.v === 'not') {
      this.next();
      if (!this.isKw('in')) {
        throw new QueryParseError('Expected "in" after "not"', this.line);
      }
      this.next();
      op = 'not in';
    }

    // Bare boolean field, e.g. `filter onbudget` ≡ `filter onbudget == true`.
    if (op === null) {
      return {
        kind: 'compare',
        field,
        op: '==',
        values: [{ type: 'bool', value: true }],
      };
    }

    if (op === 'in' || op === 'not in') {
      const values = this.parseValueList();
      return { kind: 'compare', field, op, values };
    }

    const value = this.parseValue();
    return { kind: 'compare', field, op, values: [value] };
  }

  parseValueList(): Value[] {
    const open = this.next();
    if (!(open?.t === 'punc' && open.v === '(')) {
      throw new QueryParseError('Expected "(" after "in"', this.line);
    }
    const values: Value[] = [];
    if (!(this.peek()?.t === 'punc' && (this.peek() as Tok).v === ')')) {
      values.push(this.parseValue());
      while (this.peek()?.t === 'punc' && (this.peek() as Tok).v === ',') {
        this.next();
        values.push(this.parseValue());
      }
    }
    const close = this.next();
    if (!(close?.t === 'punc' && close.v === ')')) {
      throw new QueryParseError('Expected ")" to close list', this.line);
    }
    return values;
  }

  parseValue(): Value {
    const tk = this.next();
    if (!tk) {
      throw new QueryParseError('Expected a value', this.line);
    }
    switch (tk.t) {
      case 'str':
        return { type: 'string', value: tk.v };
      case 'num':
        return { type: 'number', value: tk.v };
      case 'date':
        return { type: 'date', value: tk.v };
      case 'ident':
        // bareword treated as a string (e.g. category == Groceries)
        return { type: 'string', value: tk.v };
      case 'kw':
        return this.parseKeywordValue(tk.v);
      default:
        throw new QueryParseError('Expected a value', this.line);
    }
  }

  parseKeywordValue(kw: string): Value {
    const now = new Date();
    if (kw === 'true') return { type: 'bool', value: true };
    if (kw === 'false') return { type: 'bool', value: false };
    if (kw === 'today') {
      return { type: 'date', value: format(now, 'yyyy-MM-dd') };
    }
    if (kw === 'ytd') {
      return { type: 'date', value: format(startOfYear(now), 'yyyy-MM-dd') };
    }
    if (kw === 'this') {
      const unit = this.next();
      if (unit?.t === 'kw' && unit.v === 'year') {
        return { type: 'date', value: format(startOfYear(now), 'yyyy-MM-dd') };
      }
      if (unit?.t === 'kw' && unit.v === 'month') {
        return {
          type: 'date',
          value: format(now, 'yyyy-MM') + '-01',
        };
      }
      throw new QueryParseError(
        'Expected "year" or "month" after "this"',
        this.line,
      );
    }
    if (kw === 'last') {
      const numTok = this.next();
      if (numTok?.t !== 'num') {
        throw new QueryParseError('Expected a number after "last"', this.line);
      }
      const unit = this.next();
      if (unit?.t !== 'kw') {
        throw new QueryParseError(
          'Expected a unit (months, weeks, days, years) after "last N"',
          this.line,
        );
      }
      const amt = numTok.v;
      let d: Date;
      switch (unit.v) {
        case 'month':
        case 'months':
          d = subMonths(now, amt);
          break;
        case 'week':
        case 'weeks':
          d = subWeeks(now, amt);
          break;
        case 'day':
        case 'days':
          d = subDays(now, amt);
          break;
        case 'year':
          d = subMonths(now, amt * 12);
          break;
        default:
          throw new QueryParseError(`Unknown time unit "${unit.v}"`, this.line);
      }
      return { type: 'date', value: format(d, 'yyyy-MM-dd') };
    }
    throw new QueryParseError(`Unexpected keyword "${kw}"`, this.line);
  }
}

function parseCondition(text: string, line: number): Condition {
  const toks = tokenizeCondition(text, line);
  if (toks.length === 0) {
    throw new QueryParseError('Expected a condition', line);
  }
  return new CondParser(toks, line).parse();
}

// --- Arithmetic expression parser (for `derive`) ---------------------------

type ExprTok =
  | { t: 'num'; v: number }
  | { t: 'ident'; v: string }
  | { t: 'op'; v: '+' | '-' | '*' | '/' }
  | { t: 'punc'; v: '(' | ')' | ',' };

function tokenizeExpr(input: string, line: number): ExprTok[] {
  const toks: ExprTok[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(input[i + 1] ?? ''))) {
      const m = /^\d*\.?\d+/.exec(input.slice(i));
      toks.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (c === '+' || c === '-' || c === '*' || c === '/') {
      toks.push({ t: 'op', v: c });
      i++;
      continue;
    }
    if (c === '(' || c === ')' || c === ',') {
      toks.push({ t: 'punc', v: c });
      i++;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < input.length && /[A-Za-z0-9_.]/.test(input[j])) j++;
      toks.push({ t: 'ident', v: input.slice(i, j) });
      i = j;
      continue;
    }
    throw new QueryParseError(
      `Unexpected character "${c}" in expression`,
      line,
    );
  }
  return toks;
}

class ExprParser {
  toks: ExprTok[];
  pos = 0;
  line: number;

  constructor(toks: ExprTok[], line: number) {
    this.toks = toks;
    this.line = line;
  }

  peek(): ExprTok | undefined {
    return this.toks[this.pos];
  }
  next(): ExprTok | undefined {
    return this.toks[this.pos++];
  }

  parse(): Expr {
    const expr = this.parseAddSub();
    if (this.pos < this.toks.length) {
      throw new QueryParseError('Unexpected tokens in expression', this.line);
    }
    return expr;
  }

  parseAddSub(): Expr {
    let left = this.parseMulDiv();
    let tk = this.peek();
    while (tk?.t === 'op' && (tk.v === '+' || tk.v === '-')) {
      this.next();
      const right = this.parseMulDiv();
      left = { kind: 'binary', op: tk.v, left, right };
      tk = this.peek();
    }
    return left;
  }

  parseMulDiv(): Expr {
    let left = this.parseUnary();
    let tk = this.peek();
    while (tk?.t === 'op' && (tk.v === '*' || tk.v === '/')) {
      this.next();
      const right = this.parseUnary();
      left = { kind: 'binary', op: tk.v, left, right };
      tk = this.peek();
    }
    return left;
  }

  parseUnary(): Expr {
    const tk = this.peek();
    if (tk?.t === 'op' && tk.v === '-') {
      this.next();
      return { kind: 'unary', op: '-', operand: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  parsePrimary(): Expr {
    const tk = this.next();
    if (!tk) {
      throw new QueryParseError('Unexpected end of expression', this.line);
    }
    if (tk.t === 'num') {
      return { kind: 'num', value: tk.v };
    }
    if (tk.t === 'punc' && tk.v === '(') {
      const expr = this.parseAddSub();
      const close = this.next();
      if (!(close?.t === 'punc' && close.v === ')')) {
        throw new QueryParseError('Expected ")"', this.line);
      }
      return expr;
    }
    if (tk.t === 'ident') {
      // Function call?
      if (this.peek()?.t === 'punc' && (this.peek() as ExprTok).v === '(') {
        this.next();
        const args: Expr[] = [];
        if (
          !(this.peek()?.t === 'punc' && (this.peek() as ExprTok).v === ')')
        ) {
          args.push(this.parseAddSub());
          while (
            this.peek()?.t === 'punc' &&
            (this.peek() as ExprTok).v === ','
          ) {
            this.next();
            args.push(this.parseAddSub());
          }
        }
        const close = this.next();
        if (!(close?.t === 'punc' && close.v === ')')) {
          throw new QueryParseError(
            'Expected ")" to close function call',
            this.line,
          );
        }
        return { kind: 'call', fn: tk.v, args };
      }
      return { kind: 'col', name: tk.v };
    }
    throw new QueryParseError('Expected a value in expression', this.line);
  }
}

function parseExpr(text: string, line: number): Expr {
  const toks = tokenizeExpr(text, line);
  if (toks.length === 0) {
    throw new QueryParseError('Expected an expression', line);
  }
  return new ExprParser(toks, line).parse();
}

// --- Line / program parser -------------------------------------------------

function stripComment(line: string): string {
  let inStr: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inStr) {
      if (c === inStr) inStr = null;
      else if (c === '\\') i++;
    } else if (c === '"' || c === "'") {
      inStr = c;
    } else if (c === '#') {
      return line.slice(0, i);
    }
  }
  return line;
}

export const VERB_LIST = [
  'from',
  'filter',
  'where',
  'exclude',
  'group',
  'aggregate',
  'summarize',
  'derive',
  'having',
  'select',
  'sort',
  'order',
  'take',
  'limit',
  'window',
  'forecast',
] as const;

const VERBS = new Set<string>(VERB_LIST);

function parseGroup(rest: string, line: number): Stage {
  const keys: GroupKey[] = rest
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(raw => {
      const key = raw.toLowerCase();
      if (key === 'month' || key === 'year') {
        return { field: 'date', bucket: key } as GroupKey;
      }
      return { field: raw } as GroupKey;
    });
  if (keys.length === 0) {
    throw new QueryParseError('group requires at least one field', line);
  }
  return { kind: 'group', keys };
}

// Split on `sep` only at the top level — not inside quotes or parentheses — so
// commas in a `where` condition's `in (...)` list don't split the aggregates.
function splitTopLevel(input: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quote) {
      current += c;
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
      current += c;
    } else if (c === '(') {
      depth++;
      current += c;
    } else if (c === ')') {
      depth = Math.max(0, depth - 1);
      current += c;
    } else if (c === sep && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  parts.push(current);
  return parts;
}

function parseAggregate(rest: string, line: number): Stage {
  const aggs: Aggregation[] = splitTopLevel(rest, ',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(part => {
      const eq = part.indexOf('=');
      if (eq === -1) {
        throw new QueryParseError(
          `Expected "name = fn [field]" in aggregate, got "${part}"`,
          line,
        );
      }
      const name = part.slice(0, eq).trim();
      let exprText = part.slice(eq + 1).trim();

      // Optional per-aggregate `where <condition>` restricts the group's rows
      // before the function runs, e.g. `first amount where amount > 0`.
      let filter: Condition | undefined;
      const whereMatch = /\s+where\s+/i.exec(exprText);
      if (whereMatch) {
        const condText = exprText
          .slice(whereMatch.index + whereMatch[0].length)
          .trim();
        exprText = exprText.slice(0, whereMatch.index).trim();
        filter = parseCondition(condText, line);
      }

      const expr = exprText.split(/\s+/);
      const fn = expr[0] as AggFn;
      if (!AGG_FNS.includes(fn)) {
        throw new QueryParseError(`Unknown aggregate function "${fn}"`, line);
      }
      const arg = expr[1];
      if (fn === 'count' && !arg) {
        return filter ? { name, fn, filter } : { name, fn };
      }
      if (!arg) {
        throw new QueryParseError(
          `"${fn}" needs a field, e.g. ${fn} amount`,
          line,
        );
      }
      return filter ? { name, fn, arg, filter } : { name, fn, arg };
    });
  if (aggs.length === 0) {
    throw new QueryParseError(
      'aggregate requires at least one definition',
      line,
    );
  }
  return { kind: 'aggregate', aggs };
}

function parseWindow(rest: string, line: number): Stage {
  const eq = rest.indexOf('=');
  if (eq === -1) {
    throw new QueryParseError('Expected "name = fn field [n]" in window', line);
  }
  const name = rest.slice(0, eq).trim();
  const expr = rest
    .slice(eq + 1)
    .trim()
    .split(/\s+/);
  const fn = expr[0] as WindowFn;
  if (!WINDOW_FNS.includes(fn)) {
    throw new QueryParseError(`Unknown window function "${fn}"`, line);
  }
  const arg = expr[1];
  if (!arg) {
    throw new QueryParseError(`"${fn}" needs a column to operate on`, line);
  }
  const n = expr[2] != null ? Number(expr[2]) : undefined;
  if (expr[2] != null && Number.isNaN(n)) {
    throw new QueryParseError(`Expected a number, got "${expr[2]}"`, line);
  }
  return { kind: 'window', name, fn, arg, n };
}

function parseForecast(rest: string, line: number): Stage {
  const eq = rest.indexOf('=');
  if (eq === -1) {
    throw new QueryParseError('Expected "name = column n" in forecast', line);
  }
  const name = rest.slice(0, eq).trim();
  const expr = rest
    .slice(eq + 1)
    .trim()
    .split(/\s+/);
  const arg = expr[0];
  const n = Number(expr[1]);
  if (!arg || Number.isNaN(n)) {
    throw new QueryParseError(
      'forecast needs a column and number of periods, e.g. forecast next = spend 3',
      line,
    );
  }
  return { kind: 'forecast', name, arg, n };
}

function parseDerive(rest: string, line: number): Stage {
  const eq = rest.indexOf('=');
  if (eq === -1) {
    throw new QueryParseError('Expected "name = expression" in derive', line);
  }
  const name = rest.slice(0, eq).trim();
  const exprText = rest.slice(eq + 1).trim();
  if (!name) {
    throw new QueryParseError('derive requires a column name', line);
  }
  return { kind: 'derive', name, expr: parseExpr(exprText, line) };
}

function parseSelect(rest: string, line: number): Stage {
  const cols: SelectColumn[] = rest
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(part => {
      const eq = part.indexOf('=');
      if (eq === -1) {
        return { out: part, src: part };
      }
      const out = part.slice(0, eq).trim();
      const src = part.slice(eq + 1).trim();
      if (!out || !src) {
        throw new QueryParseError(`Invalid select column "${part}"`, line);
      }
      return { out, src };
    });
  if (cols.length === 0) {
    throw new QueryParseError('select requires at least one column', line);
  }
  return { kind: 'select', cols };
}

export function parseQuery(text: string): Stage[] {
  const stages: Stage[] = [];
  const rawLines = text.split('\n');

  rawLines.forEach((raw, idx) => {
    const lineNo = idx + 1;
    const line = stripComment(raw).trim();
    if (!line) return;

    const spaceIdx = line.search(/\s/);
    const verb = (
      spaceIdx === -1 ? line : line.slice(0, spaceIdx)
    ).toLowerCase();
    const rest = spaceIdx === -1 ? '' : line.slice(spaceIdx + 1).trim();

    if (!VERBS.has(verb)) {
      throw new QueryParseError(
        `Unknown verb "${verb}". Expected one of: ${[...VERBS].join(', ')}`,
        lineNo,
      );
    }

    switch (verb) {
      case 'from': {
        const table = rest.toLowerCase() as Table;
        if (!TABLES.includes(table)) {
          throw new QueryParseError(
            `Unknown table "${rest}". Try: ${TABLES.join(', ')}`,
            lineNo,
          );
        }
        stages.push({ kind: 'from', table });
        break;
      }
      case 'filter':
      case 'where':
        stages.push({ kind: 'filter', cond: parseCondition(rest, lineNo) });
        break;
      case 'exclude':
        stages.push({ kind: 'exclude', cond: parseCondition(rest, lineNo) });
        break;
      case 'group':
        stages.push(parseGroup(rest, lineNo));
        break;
      case 'aggregate':
      case 'summarize':
        stages.push(parseAggregate(rest, lineNo));
        break;
      case 'derive':
        stages.push(parseDerive(rest, lineNo));
        break;
      case 'having':
        stages.push({ kind: 'having', cond: parseCondition(rest, lineNo) });
        break;
      case 'select':
        stages.push(parseSelect(rest, lineNo));
        break;
      case 'sort':
      case 'order': {
        let key = rest.trim();
        let dir: 'asc' | 'desc' = 'asc';
        if (key.startsWith('-')) {
          dir = 'desc';
          key = key.slice(1).trim();
        } else if (key.startsWith('+')) {
          key = key.slice(1).trim();
        }
        if (!key) {
          throw new QueryParseError('sort requires a column name', lineNo);
        }
        stages.push({ kind: 'sort', key, dir });
        break;
      }
      case 'take':
      case 'limit': {
        const n = Number(rest.trim());
        if (Number.isNaN(n) || n <= 0) {
          throw new QueryParseError('take requires a positive number', lineNo);
        }
        stages.push({ kind: 'take', n: Math.floor(n) });
        break;
      }
      case 'window':
        stages.push(parseWindow(rest, lineNo));
        break;
      case 'forecast':
        stages.push(parseForecast(rest, lineNo));
        break;
      default:
        break;
    }
  });

  if (stages.length === 0) {
    throw new QueryParseError('Empty query');
  }

  return stages;
}
