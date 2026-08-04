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

- \`transactions\` — every transaction (fields include \`date\`, \`amount\`, \`payee\`, \`category\`, \`account\`, \`notes\`, \`cleared\`, \`reconciled\`, \`offbudget\`, \`onbudget\`, \`open\`, \`closed\`).
- \`accounts\`, \`categories\`, \`payees\`, \`schedules\`, \`rules\`.
- \`budgets\` — budgeted/spent/available per category per month (fields include \`month\`, \`category\`, \`group\`, \`budgeted\`, \`spent\`, \`available\`, \`balance\`, \`carryover\`, \`goal\`, \`saturation\`).

## Filter operators

\`==\` (or \`=\`), \`!=\`, \`<\`, \`>\`, \`<=\`, \`>=\`, \`~\` (contains), \`!~\` (not contains),
\`in\`, \`not in\`, combined with \`and\` / \`or\` / \`not\`. Operators \`&&\` and \`||\` work
as aliases for \`and\` / \`or\`. Text values use double or single quotes:
\`filter payee ~ "Amazon"\`. Parentheses group sub-expressions.

A bare boolean field is a shorthand for \`== true\`: \`filter onbudget\` (or
\`filter open\` to skip closed accounts).

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
| \`first\` | Value from the first row in the group (pair with \`sort\` before \`group\`) |
| \`last\` | Value from the last row in the group |

Any aggregate can take a \`where <condition>\` clause to restrict the group's
rows before it runs, so one query can mix filtered and unfiltered aggregates:
\`aggregate balance = sum amount, paid = first amount where amount > 0\`.

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

## Most recent row per group ("last credit-card payment")

\`first\`/\`last\` return a value from the first/last row of each group in the
current sort order, so sort first, then group. On a credit card a payment is a
positive amount (money in). With a \`where\` clause you can compute the balance
from every transaction while pulling the last payment from only the positive
ones, and keep just the cards that still owe money:

\`\`\`
from transactions
filter account ~ "💳"
sort -date
group account
aggregate balance = sum amount, day = first date where amount > 0, paid = first amount where amount > 0
having balance < 0
\`\`\`

\`balance = sum amount\` sees every transaction; \`first … where amount > 0\` sees
only payments; \`having balance < 0\` drops the paid-off cards.
`;
