import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function localDB(filename = ':memory:') {
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)');
  const dir = fileURLToPath(new URL('../drizzle/', import.meta.url));
  for (const name of readdirSync(dir).filter(n => n.endsWith('.sql')).sort()) {
    if (!db.prepare('SELECT name FROM _migrations WHERE name=?').get(name)) {
      db.exec('BEGIN');
      try {
        db.exec(readFileSync(path.join(dir, name), 'utf8'));
        db.prepare('INSERT INTO _migrations VALUES (?)').run(name);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    }
  }
  function prepare(sql, args = []) {
    return {
      bind: (...values) => prepare(sql, values),
      first: async () => db.prepare(sql).get(...args) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...args) }),
      run: async () => ({ meta: db.prepare(sql).run(...args) }),
    };
  }
  return {
    prepare,
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const values = [];
        for (const stmt of statements) values.push(await stmt.run());
        db.exec('COMMIT');
        return values;
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    close: () => db.close(),
  };
}
