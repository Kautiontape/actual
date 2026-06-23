import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { MobilePageHeader, Page, PageHeader } from '#components/Page';

import { parseQuery, QueryParseError } from './parse';
import { QueryEditor } from './QueryEditor';
import { runQuery } from './run';
import type { QueryResult, Row } from './run';

const DEFAULT_QUERY = [
  '# Type a query, then press Run (or Cmd/Ctrl+Enter)',
  'from transactions',
  'filter date >= last 6 months',
  'group month',
  'aggregate spend = sum amount, txns = count',
  'sort month',
  'window avg_3 = rolling_avg spend 3',
].join('\n');

type Example = { label: string; query: string };

// In-memory scratchpad: survives navigating away and back during a session,
// but is intentionally cleared on a full reload.
const scratch: { text: string } = { text: DEFAULT_QUERY };

// Resizable editor: the code window keeps a modest default height so the
// results table gets the bulk of the space, and the user can drag the handle
// below it to grow it up to half of the console. The chosen height is
// remembered across reloads.
const MIN_EDITOR_HEIGHT = 120;
const DEFAULT_EDITOR_HEIGHT = 220;
const EDITOR_HEIGHT_KEY = 'queryConsole.editorHeight';

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

function readStoredEditorHeight(): number {
  try {
    const raw = localStorage.getItem(EDITOR_HEIGHT_KEY);
    const parsed = raw == null ? NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : DEFAULT_EDITOR_HEIGHT;
  } catch {
    return DEFAULT_EDITOR_HEIGHT;
  }
}

function storeEditorHeight(value: number) {
  try {
    localStorage.setItem(EDITOR_HEIGHT_KEY, String(Math.round(value)));
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}

function formatCell(value: unknown): { text: string; numeric: boolean } {
  if (value == null || value === '') return { text: '', numeric: false };
  if (typeof value === 'boolean') {
    return { text: value ? '✓' : '', numeric: false };
  }
  if (typeof value === 'number') {
    return {
      text: value.toLocaleString(undefined, {
        minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
        maximumFractionDigits: 2,
      }),
      numeric: true,
    };
  }
  return { text: String(value), numeric: false };
}

function toDelimited(columns: string[], rows: Row[], sep: string): string {
  const escape = (s: string) =>
    sep === ',' && /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const header = columns.map(escape).join(sep);
  const body = rows
    .map(row => columns.map(col => escape(formatCell(row[col]).text)).join(sep))
    .join('\n');
  return `${header}\n${body}`;
}

export function QueryConsole() {
  const { t } = useTranslation();
  const { isNarrowWidth } = useResponsive();

  const [text, setText] = useState(scratch.text);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [editorHeight, setEditorHeight] = useState(readStoredEditorHeight);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  function maxEditorHeight() {
    const available = containerRef.current?.clientHeight ?? 0;
    // Cap the code window at ~half the console so results always have room.
    return Math.max(MIN_EDITOR_HEIGHT, available * 0.5);
  }

  function onResizeStart(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startHeight: editorHeight };
  }

  function onResizeMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const next = clamp(
      drag.startHeight + (e.clientY - drag.startY),
      MIN_EDITOR_HEIGHT,
      maxEditorHeight(),
    );
    setEditorHeight(next);
  }

  function onResizeEnd(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    storeEditorHeight(editorHeight);
  }

  const examples: Example[] = [
    {
      label: t('Recent transactions for a payee'),
      query: [
        'from transactions',
        'filter payee ~ "Amazon"',
        'sort -date',
        'take 50',
      ].join('\n'),
    },
    {
      label: t('Monthly spend + 3-month average'),
      query: DEFAULT_QUERY,
    },
    {
      label: t('Median spend by month, outliers excluded'),
      query: [
        'from transactions',
        'filter category ~ "Food" or category ~ "Grocer"',
        'exclude amount < -500',
        'group month',
        'aggregate spend = sum amount, typical = median amount, txns = count',
        'sort month',
      ].join('\n'),
    },
    {
      label: t('Forecast the next 3 months'),
      query: [
        'from transactions',
        'group month',
        'aggregate spend = sum amount',
        'sort month',
        'window trend = rolling_avg spend 3',
        'forecast projected = spend 3',
      ].join('\n'),
    },
    {
      label: t('Biggest months, with average transaction'),
      query: [
        'from transactions',
        'filter amount < 0',
        'group month',
        'aggregate spend = sum amount, n = count',
        'derive avg_txn = spend / n',
        'having spend < -2000',
        'sort spend',
        'select month, spend, avg_txn, n',
      ].join('\n'),
    },
  ];

  function onChangeText(value: string) {
    setText(value);
    scratch.text = value;
  }

  async function onRun() {
    setIsRunning(true);
    setError(null);
    try {
      const stages = parseQuery(text);
      const res = await runQuery(stages);
      setResult(res);
    } catch (e) {
      setResult(null);
      if (e instanceof QueryParseError) {
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setIsRunning(false);
    }
  }

  function onCopy() {
    if (!result) return;
    void navigator.clipboard.writeText(
      toDelimited(result.columns, result.rows, '\t'),
    );
  }

  function onExportCsv() {
    if (!result) return;
    const csv = toDelimited(result.columns, result.rows, ',');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'query.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const numericColumns = new Set<string>();
  if (result) {
    for (const col of result.columns) {
      const sample = result.rows.find(r => r[col] != null && r[col] !== '');
      if (sample && typeof sample[col] === 'number') {
        numericColumns.add(col);
      }
    }
  }

  return (
    <Page
      header={
        isNarrowWidth ? (
          <MobilePageHeader title={t('Query')} />
        ) : (
          <PageHeader title={t('Query')} />
        )
      }
      padding={0}
    >
      <View
        innerRef={containerRef}
        style={{
          flexDirection: 'column',
          padding: 15,
          gap: 12,
          flexGrow: 1,
          minHeight: 0,
          background: theme.pageBackground,
        }}
      >
        <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
          <Trans>
            Write a pipeline query — one verb per line — and run it against your
            transactions. Verbs: from, filter, exclude, group, aggregate,
            derive, having, select, sort, take, window, forecast.
          </Trans>
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {examples.map(ex => (
            <Button
              key={ex.label}
              variant="bare"
              style={{
                fontSize: 12,
                color: theme.pageTextLink,
                border: `1px solid ${theme.tableBorder}`,
                borderRadius: 4,
                padding: '3px 8px',
              }}
              onPress={() => onChangeText(ex.query)}
            >
              {ex.label}
            </Button>
          ))}
        </View>

        <View
          style={{
            height: editorHeight,
            minHeight: MIN_EDITOR_HEIGHT,
            flexShrink: 0,
          }}
        >
          <QueryEditor value={text} onChange={onChangeText} onSubmit={onRun} />
        </View>

        <View
          onPointerDown={onResizeStart}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
          onPointerCancel={onResizeEnd}
          aria-label={t('Resize the query editor')}
          style={{
            height: 10,
            marginTop: -6,
            marginBottom: -6,
            flexShrink: 0,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'row-resize',
            touchAction: 'none',
          }}
        >
          <View
            style={{
              width: 40,
              height: 3,
              borderRadius: 2,
              background: theme.tableBorder,
            }}
          />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Button
            variant="primary"
            isDisabled={isRunning}
            onPress={() => void onRun()}
          >
            {isRunning ? <Trans>Running…</Trans> : <Trans>Run</Trans>}
          </Button>
          {result && (
            <>
              <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
                <Trans count={result.rowCount}>
                  {{ count: result.rowCount }} rows
                </Trans>
                {result.truncated ? '+' : ''} · {result.durationMs}
                ms
              </Text>
              <View style={{ flex: 1 }} />
              <Button variant="bare" onPress={onCopy}>
                <Trans>Copy</Trans>
              </Button>
              <Button variant="bare" onPress={onExportCsv}>
                <Trans>Export CSV</Trans>
              </Button>
            </>
          )}
        </View>

        {error && (
          <View
            style={{
              padding: 12,
              borderRadius: 6,
              background: theme.errorBackground,
              border: `1px solid ${theme.errorBorder}`,
            }}
          >
            <Text style={{ color: theme.errorText, ...styles.verySmallText }}>
              {error}
            </Text>
          </View>
        )}

        {result && !error && (
          <View
            style={{
              flexGrow: 1,
              minHeight: 0,
              overflow: 'auto',
              border: `1px solid ${theme.tableBorder}`,
              borderRadius: 6,
            }}
          >
            <table
              style={{
                borderCollapse: 'collapse',
                width: '100%',
                fontSize: 13,
                color: theme.tableText,
              }}
            >
              <thead>
                <tr>
                  {result.columns.map(col => (
                    <th
                      key={col}
                      style={{
                        position: 'sticky',
                        top: 0,
                        textAlign: numericColumns.has(col) ? 'right' : 'left',
                        background: theme.tableHeaderBackground,
                        color: theme.tableHeaderText,
                        padding: '8px 12px',
                        borderBottom: `1px solid ${theme.tableBorder}`,
                        whiteSpace: 'nowrap',
                        fontWeight: 600,
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr
                    key={i}
                    style={{
                      background:
                        i % 2 === 0
                          ? theme.tableBackground
                          : theme.tableRowBackgroundHover,
                    }}
                  >
                    {result.columns.map(col => {
                      const cell = formatCell(row[col]);
                      return (
                        <td
                          key={col}
                          style={{
                            textAlign: numericColumns.has(col)
                              ? 'right'
                              : 'left',
                            padding: '6px 12px',
                            borderBottom: `1px solid ${theme.tableBorder}`,
                            whiteSpace: 'nowrap',
                            fontVariantNumeric: cell.numeric
                              ? 'tabular-nums'
                              : undefined,
                          }}
                        >
                          {cell.text}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {result.rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={result.columns.length || 1}
                      style={{ padding: 16, color: theme.pageTextSubdued }}
                    >
                      <Trans>No rows matched.</Trans>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </View>
        )}
      </View>
    </Page>
  );
}
