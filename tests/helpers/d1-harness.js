'use strict';

// Executes the actual migration and Worker SQL against SQLite. This models the
// documented D1 transactional batch API without reaching Cloudflare or Google.
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

function createD1(options = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync(path.join(__dirname, '../../cloudflare/registration/migrations/0001_registration.sql'), 'utf8'));
  const state = { sessions: [], reads: 0, batches: 0, inserts: 0 };
  const db = {
    withSession(mode) { state.sessions.push(mode); return this; },
    prepare(sql) {
      const statement = { sql, values: [], bind(...values) { return { ...this, values }; },
        async first() {
          state.reads++;
          if (options.readFails) throw new Error('Private database read failure.');
          return sqlite.prepare(this.sql).get(...this.values) || null;
        }
      };
      return statement;
    },
    async batch(statements) {
      state.batches++;
      if (options.failBefore) throw new Error('Private database unavailable.');
      sqlite.exec('BEGIN IMMEDIATE');
      let results;
      try {
        results = statements.map((statement, index) => {
          if (options.failDuring && index === 1) throw new Error('Private transaction failure.');
          const rows = sqlite.prepare(statement.sql).all(...statement.values);
          const changes = /^INSERT/i.test(statement.sql) ? sqlite.prepare('SELECT changes() AS count').get().count : 0;
          return { success: true, results: rows, meta: { changes } };
        });
        sqlite.exec('COMMIT');
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
      state.inserts += results[0]?.results?.length || 0;
      if (options.failAfter) throw new Error('Private response lost after commit.');
      options.transformResults?.(results);
      return results;
    }
  };
  return { db, sqlite, state, options, close: () => sqlite.close() };
}

module.exports = { createD1 };
