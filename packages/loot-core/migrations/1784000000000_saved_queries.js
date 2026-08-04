import { v4 as uuidv4 } from 'uuid';

// Seeded from the query console's former hardcoded examples. Names are stored
// in English (migrations run without i18n); the user can rename/delete freely
// afterward — deletions persist because this seed runs exactly once.
const EXAMPLES = [
  {
    name: 'Recent transactions for a payee',
    query: [
      'from transactions',
      'filter payee ~ "Amazon"',
      'sort -date',
      'take 50',
    ].join('\n'),
  },
  {
    name: 'Monthly spend + 3-month average',
    query: [
      'from transactions',
      'filter date >= last 6 months',
      'group month',
      'aggregate spend = sum amount, txns = count',
      'sort month',
      'window avg_3 = rolling_avg spend 3',
    ].join('\n'),
  },
  {
    name: 'Median spend by month, outliers excluded',
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
    name: 'Forecast the next 3 months',
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
    name: 'Biggest months, with average transaction',
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
  {
    name: 'Budget categories under 80% used',
    query: [
      'from budgets',
      'filter available > 0 and saturation < 0.8',
      'sort saturation',
    ].join('\n'),
  },
];

export default async function runMigration(db) {
  db.transaction(() => {
    db.execQuery(`
      CREATE TABLE saved_queries
        (id TEXT PRIMARY KEY,
         name TEXT,
         folder TEXT DEFAULT '',
         query TEXT,
         tombstone INTEGER DEFAULT 0);
    `);

    for (const example of EXAMPLES) {
      db.runQuery(
        `INSERT INTO saved_queries (id, name, folder, query, tombstone)
         VALUES (?, ?, ?, ?, 0)`,
        [uuidv4(), example.name, 'Examples', example.query],
      );
    }
  });
}
