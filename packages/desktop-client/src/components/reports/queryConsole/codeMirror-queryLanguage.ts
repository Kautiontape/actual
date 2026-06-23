// CodeMirror language support for the Query-console pipeline DSL:
// syntax highlighting, schema-aware autocomplete, and live parse-error
// diagnostics (reusing the same `parseQuery` the executor runs).

import { autocompletion } from '@codemirror/autocomplete';
import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from '@codemirror/autocomplete';
import {
  HighlightStyle,
  StreamLanguage,
  syntaxHighlighting,
} from '@codemirror/language';
import type { StreamParser } from '@codemirror/language';
import { linter, lintGutter } from '@codemirror/lint';
import type { Diagnostic } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';
import { tags } from '@lezer/highlight';

import {
  AGG_FNS,
  EXPR_FN_NAMES,
  parseQuery,
  QueryParseError,
  TABLES,
  VERB_LIST,
  WINDOW_FNS,
} from './parse';

// Built-in transaction columns (incl. the friendly aliases).
const FIELDS = [
  'date',
  'amount',
  'payee',
  'category',
  'account',
  'notes',
  'id',
  'cleared',
  'reconciled',
  'offbudget',
  'onbudget',
];
const BUCKETS = ['month', 'year'];
const COND_KEYWORDS = ['and', 'or', 'not', 'in'];
const VALUE_KEYWORDS = ['true', 'false', 'last', 'this', 'today', 'ytd'];

const FN_NAMES = Array.from(
  new Set<string>([...AGG_FNS, ...WINDOW_FNS, ...EXPR_FN_NAMES]),
);

const VERB_SET = new Set<string>(VERB_LIST);
const FN_SET = new Set<string>(FN_NAMES);
const ATOM_SET = new Set<string>([
  ...COND_KEYWORDS,
  ...VALUE_KEYWORDS,
  ...BUCKETS,
]);

// --- syntax highlighting ---------------------------------------------------

type ParserState = { start: boolean };

const tokenTable = {
  qcVerb: tags.keyword,
  qcFn: tags.function(tags.variableName),
  qcAtom: tags.atom,
  qcField: tags.variableName,
  qcNum: tags.number,
  qcStr: tags.string,
  qcOp: tags.operator,
  qcComment: tags.comment,
};

const streamParser: StreamParser<ParserState> = {
  startState: () => ({ start: true }),
  token(stream, state) {
    if (stream.sol()) state.start = true;
    if (stream.eatSpace()) return null;

    if (stream.peek() === '#') {
      stream.skipToEnd();
      return 'qcComment';
    }

    const ch = stream.peek();
    if (ch === '"' || ch === "'") {
      stream.next();
      let c: string | void;
      let escaped = false;
      while ((c = stream.next()) != null) {
        if (c === ch && !escaped) break;
        escaped = c === '\\' && !escaped;
      }
      return 'qcStr';
    }

    if (stream.match(/^@\d{4}-\d{2}-\d{2}/)) return 'qcStr';
    if (stream.match(/^\d+(\.\d+)?/)) return 'qcNum';
    if (stream.match(/^(==|!=|<=|>=|!~|&&|\|\||[-+*/<>~=])/)) return 'qcOp';
    if (stream.match(/^[(),]/)) return null;

    const m = stream.match(/^[A-Za-z_][A-Za-z0-9_.]*/);
    if (m) {
      const word = (m as RegExpMatchArray)[0].toLowerCase();
      if (state.start && VERB_SET.has(word)) {
        state.start = false;
        return 'qcVerb';
      }
      state.start = false;
      if (FN_SET.has(word)) return 'qcFn';
      if (ATOM_SET.has(word)) return 'qcAtom';
      return 'qcField';
    }

    stream.next();
    return null;
  },
  tokenTable,
};

const queryLanguage = StreamLanguage.define(streamParser);

const lightHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#0000ff', fontWeight: '600' },
  { tag: tags.function(tags.variableName), color: '#795e26' },
  { tag: tags.atom, color: '#0070c1' },
  { tag: tags.variableName, color: '#001080' },
  { tag: tags.number, color: '#098658' },
  { tag: tags.string, color: '#a31515' },
  { tag: tags.operator, color: '#383838' },
  { tag: tags.comment, color: '#6a737d', fontStyle: 'italic' },
]);

const darkHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#569cd6', fontWeight: '600' },
  { tag: tags.function(tags.variableName), color: '#dcdcaa' },
  { tag: tags.atom, color: '#4fc1ff' },
  { tag: tags.variableName, color: '#9cdcfe' },
  { tag: tags.number, color: '#b5cea8' },
  { tag: tags.string, color: '#ce9178' },
  { tag: tags.operator, color: '#d4d4d4' },
  { tag: tags.comment, color: '#6a9955', fontStyle: 'italic' },
]);

// --- autocomplete ----------------------------------------------------------

function complete(label: string, type: Completion['type']): Completion {
  return { label, type };
}

// Columns the user has introduced via aggregate/derive/window/forecast/group,
// so `select`/`sort`/`having` can complete on them.
function definedColumns(doc: string): string[] {
  const cols = new Set<string>();
  for (const raw of doc.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    const sp = line.search(/\s/);
    const verb = (sp === -1 ? line : line.slice(0, sp)).toLowerCase();
    const rest = sp === -1 ? '' : line.slice(sp + 1);
    if (verb === 'aggregate' || verb === 'summarize') {
      for (const part of rest.split(',')) {
        const eq = part.indexOf('=');
        if (eq !== -1) cols.add(part.slice(0, eq).trim());
      }
    } else if (verb === 'derive' || verb === 'window' || verb === 'forecast') {
      const eq = rest.indexOf('=');
      if (eq !== -1) cols.add(rest.slice(0, eq).trim());
    } else if (verb === 'group') {
      for (const k of rest.split(',')) cols.add(k.trim());
    }
  }
  cols.delete('');
  return [...cols];
}

function optionsForVerb(verb: string, doc: string): Completion[] {
  const fields = FIELDS.map(f => complete(f, 'variable'));
  const defined = definedColumns(doc).map(c => complete(c, 'variable'));
  const fns = (names: readonly string[]) =>
    names.map(n => complete(n, 'function'));

  switch (verb) {
    case 'from':
      return TABLES.map(t => complete(t, 'class'));
    case 'aggregate':
    case 'summarize':
      return [...fns(AGG_FNS), ...fields];
    case 'window':
      return [...fns(WINDOW_FNS), ...defined, ...fields];
    case 'derive':
      return [...fns(EXPR_FN_NAMES), ...fields, ...defined];
    case 'filter':
    case 'where':
    case 'exclude':
    case 'having':
      return [
        ...fields,
        ...defined,
        ...[...COND_KEYWORDS, ...VALUE_KEYWORDS].map(k =>
          complete(k, 'keyword'),
        ),
      ];
    case 'group':
      return [...BUCKETS.map(b => complete(b, 'keyword')), ...fields];
    case 'select':
    case 'sort':
    case 'order':
      return [...defined, ...fields];
    default:
      return fields;
  }
}

function completionSource(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[A-Za-z_][A-Za-z0-9_.]*/);
  if (!word && !context.explicit) return null;
  const from = word ? word.from : context.pos;

  const line = context.state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);
  const stripped = before.replace(/^\s*/, '');
  const firstSpace = stripped.search(/\s/);

  // Still typing the first word of the line → it's a verb.
  if (firstSpace === -1) {
    return {
      from,
      options: VERB_LIST.map(v => complete(v, 'keyword')),
      validFor: /^[A-Za-z_]*$/,
    };
  }

  const verb = stripped.slice(0, firstSpace).toLowerCase();
  return {
    from,
    options: optionsForVerb(verb, context.state.doc.toString()),
    validFor: /^[A-Za-z_][A-Za-z0-9_.]*$/,
  };
}

// --- diagnostics -----------------------------------------------------------

const queryLinter = linter(
  view => {
    const text = view.state.doc.toString();
    if (!text.trim()) return [];

    const diagnostics: Diagnostic[] = [];
    try {
      parseQuery(text);
    } catch (e) {
      if (e instanceof QueryParseError && e.line != null) {
        const ln = Math.min(Math.max(e.line, 1), view.state.doc.lines);
        const line = view.state.doc.line(ln);
        diagnostics.push({
          from: line.from,
          to: line.to,
          severity: 'error',
          message: e.message,
        });
      } else {
        const first = view.state.doc.line(1);
        diagnostics.push({
          from: first.from,
          to: first.to,
          severity: 'error',
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return diagnostics;
  },
  { delay: 350 },
);

// --- assembled extension ---------------------------------------------------

export function queryLanguageExtensions(isDarkTheme: boolean): Extension[] {
  return [
    queryLanguage,
    syntaxHighlighting(isDarkTheme ? darkHighlight : lightHighlight),
    autocompletion({ override: [completionSource] }),
    queryLinter,
    lintGutter(),
  ];
}
