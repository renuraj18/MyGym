import type { SQLiteDatabase } from 'expo-sqlite';

const DB_VERSION = 1;

export async function migrate(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current >= DB_VERSION) return;

  if (current < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS gyms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        fee_monthly INTEGER NOT NULL DEFAULT 0,
        fee_quarterly INTEGER NOT NULL DEFAULT 0,
        fee_halfyearly INTEGER NOT NULL DEFAULT 0,
        fee_yearly INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gym_id INTEGER NOT NULL REFERENCES gyms(id),
        name TEXT NOT NULL,
        phone TEXT NOT NULL DEFAULT '',
        gender TEXT NOT NULL DEFAULT 'male',
        photo_uri TEXT,
        joined_on TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        plan_type TEXT NOT NULL DEFAULT 'monthly',
        plan_months INTEGER NOT NULL DEFAULT 1,
        plan_fee INTEGER NOT NULL DEFAULT 0,
        paid_till TEXT,
        balance INTEGER NOT NULL DEFAULT 0,
        last_reminded_on TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_no TEXT NOT NULL,
        member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        gym_id INTEGER NOT NULL,
        paid_on TEXT NOT NULL,
        amount INTEGER NOT NULL,
        mode TEXT NOT NULL,
        plan_type TEXT NOT NULL,
        plan_months INTEGER NOT NULL DEFAULT 1,
        plan_fee INTEGER NOT NULL DEFAULT 0,
        prev_balance INTEGER NOT NULL DEFAULT 0,
        prev_paid_till TEXT,
        balance_after INTEGER NOT NULL DEFAULT 0,
        period_from TEXT,
        period_to TEXT,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_members_gym ON members(gym_id);
      CREATE INDEX IF NOT EXISTS idx_members_paid_till ON members(paid_till);
      CREATE INDEX IF NOT EXISTS idx_payments_member ON payments(member_id);
      CREATE INDEX IF NOT EXISTS idx_payments_paid_on ON payments(paid_on);
    `);
  }

  await db.execAsync(`PRAGMA user_version = ${DB_VERSION}`);
}
