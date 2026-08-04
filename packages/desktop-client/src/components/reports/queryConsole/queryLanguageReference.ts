// The query-language reference, rendered in-app at /query/docs. Keep this in
// sync with parse.ts (verbs, functions, operators) and run.ts (tables).
export const QUERY_LANGUAGE_REFERENCE = `
# Query language reference

The Query console runs a small pipeline language: **one verb per line**, each
stage transforming the rows from the stage above it. Start with a \`from\` line
that picks a table, then filter, group, aggregate, and shape the output.

## Verbs

| Verb | Alias | Purpose | Example |
| --- | --- | --- | --- |
| \`from\` | | Choose the source table | \`from transactions\` |
| \`filter\` | \`where\` | Keep rows matching a condition | \`filter amount < 0\` |
| \`exclude\` | | Drop rows matching a condition | \`exclude amount < -500\` |
| \`group\` | | Group rows by a field | \`group month\` |
| \`aggregate\` | \`summarize\` | Compute values per group | \`aggregate spend = sum amount\` |
| \`derive\` | | Add a computed column | \`derive avg = spend / n\` |
| \`having\` | | Filter groups after aggregation | \`having spend < -2000\` |
| \`select\` | | Choose / order output columns | \`select month, spend\` |
| \`sort\` | \`order\` | Order rows (prefix \`-\` for descending) | \`sort -date\` |
| \`take\` | \`limit\` | Limit the number of rows | \`take 50\` |
| \`window\` | | Rolling calculation across ordered rows | \`window avg3 = rolling_avg spend 3\` |
| \`forecast\` | | Project future periods | \`forecast projected = spend 3\` |

## Tables

- \`transactions\` — every transaction (fields include \`date\`, \`amount\`, \`payee\`, \`category\`, \`account\`, \`notes\`, \`cleared\`, \`reconciled\`, \`offbudget\`, \`onbudget\`).
- \`accounts\`, \`categories\`, \`payees\`, \`schedules\`, \`rules\`.
- \`budgets\` — budgeted/spent/available per category per month (fields include \`month\`, \`category\`, \`group\`, \`budgeted\`, \`spent\`, \`available\`, \`balance\`, \`carryover\`, \`goal\`, \`saturation\`).

## Filter operators

\`==\` (or \`=\`), \`!=\`, \`<\`, \`>\`, \`<=\`, \`>=\`, \`~\` (contains), \`!~\` (not contains),
\`in\`, \`not in\`, combined with \`and\` / \`or\` / \`not\`. Operators \`&&\` and \`||\` work
as aliases for \`and\` / \`or\`. Text values use double or single quotes:
\`filter payee ~ "Amazon"\`. Parentheses group sub-expressions.

A bare boolean field is a shorthand for \`== true\`: \`filter onbudget\`.

Dates support absolute literals (\`@YYYY-MM-DD\`) and relative expressions:

| Expression | Meaning |
| --- | --- |
| \`today\` | today's date |
| \`ytd\` | start of the current year |
| \`this month\` | first day of the current month |
| \`this year\` | start of the current year |
| \`last N months\` | N months ago (also \`weeks\`, \`days\`) |

## Aggregation functions

| Function | Description |
| --- | --- |
| \`sum\` | Total |
| \`count\` | Row count |
| \`count_distinct\` | Distinct value count |
| \`mean\` / \`avg\` | Arithmetic mean |
| \`median\` | Middle value |
| \`mode\` | Most frequent value |
| \`min\` | Minimum |
| \`max\` | Maximum |
| \`stddev\` | Sample standard deviation |

## Window functions

| Function | Arguments | Description |
| --- | --- | --- |
| \`rolling_avg\` | column [n] | Rolling average over the last n rows (default 3) |
| \`running_total\` | column | Cumulative sum |
| \`delta\` | column | Difference from the previous row |
| \`pct_of_total\` | column | Each value as a percentage of the grand total |
| \`lag\` | column [n] | Value from n rows back (default 1) |

## Derive expression functions

Available inside \`derive\` expressions (as function calls, e.g. \`derive x = abs(amount)\`):

\`abs\`, \`round\`, \`floor\`, \`ceil\`, \`sqrt\`, \`neg\`, \`min\`, \`max\`.

Arithmetic operators \`+\`, \`-\`, \`*\`, \`/\` are also supported, along with parentheses for grouping.

## Worked example

\`\`\`
from transactions
filter amount < 0
group month
aggregate spend = sum amount, n = count
derive avg_txn = spend / n
having spend < -2000
sort spend
select month, spend, avg_txn, n
\`\`\`

Reads the biggest-spending months, with the average transaction size, showing
only months over $2,000 of spend.
`;
