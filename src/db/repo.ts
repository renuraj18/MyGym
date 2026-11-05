import type { SQLiteDatabase } from 'expo-sqlite';
import { addDays, daysBetween, today } from '@/lib/dates';

export type Gender = 'male' | 'female';
export type PayMode = 'gpay' | 'cash';
export type PlanType = 'monthly' | 'quarterly' | 'halfyearly' | 'yearly' | 'custom' | 'tilldate';

export const PLAN_LABEL: Record<PlanType, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  halfyearly: 'Half-yearly',
  yearly: 'Yearly',
  custom: 'Custom',
  tilldate: 'Till date',
};

export const PLAN_MONTHS: Partial<Record<PlanType, number>> = {
  monthly: 1,
  quarterly: 3,
  halfyearly: 6,
  yearly: 12,
};

export type Gym = {
  id: number;
  name: string;
  fee_monthly: number;
  fee_quarterly: number;
  fee_halfyearly: number;
  fee_yearly: number;
};

export type Member = {
  id: number;
  gym_id: number;
  gym_name: string;
  name: string;
  phone: string;
  gender: Gender;
  photo_uri: string | null;
  joined_on: string;
  notes: string;
  plan_type: PlanType;
  plan_months: number;
  plan_fee: number;
  paid_till: string | null;
  balance: number;
  last_reminded_on: string | null;
  active: number;
};

export type Payment = {
  id: number;
  receipt_no: string;
  member_id: number;
  gym_id: number;
  paid_on: string;
  amount: number;
  mode: PayMode;
  plan_type: PlanType;
  plan_months: number;
  plan_fee: number;
  prev_balance: number;
  prev_paid_till: string | null;
  balance_after: number;
  period_from: string | null;
  period_to: string | null;
  note: string;
};

export type PaymentWithMember = Payment & { member_name: string; gym_name: string };

export function gymFee(gym: Gym | undefined, plan: PlanType): number {
  if (!gym) return 0;
  switch (plan) {
    case 'monthly': return gym.fee_monthly;
    case 'quarterly': return gym.fee_quarterly;
    case 'halfyearly': return gym.fee_halfyearly;
    case 'yearly': return gym.fee_yearly;
    default: return 0;
  }
}

// ---------- status ----------

export type StatusKind = 'paid' | 'duesoon' | 'overdue' | 'expired' | 'new';

export type MemberStatus = {
  kind: StatusKind;
  dueDate: string;
  /** positive = days until due, negative = days late */
  days: number;
  label: string;
};

export function memberStatus(m: Member, dueSoonDays = 7, now = today()): MemberStatus {
  if (!m.paid_till) {
    return { kind: 'new', dueDate: m.joined_on, days: 0, label: 'No payment yet' };
  }
  const dueDate = addDays(m.paid_till, 1);
  const days = daysBetween(now, dueDate);
  if (days < -30) return { kind: 'expired', dueDate, days, label: `Expired ${-days}d` };
  if (days < 0) return { kind: 'overdue', dueDate, days, label: `Overdue ${-days}d` };
  if (days === 0) return { kind: 'duesoon', dueDate, days, label: 'Due today' };
  if (days === 1) return { kind: 'duesoon', dueDate, days, label: 'Due tomorrow' };
  if (days <= dueSoonDays) return { kind: 'duesoon', dueDate, days, label: `Due in ${days}d` };
  return { kind: 'paid', dueDate, days, label: m.balance > 0 ? 'Balance' : 'Paid' };
}

// ---------- settings ----------

export const DEFAULT_REMINDER =
  'Hi {name}, your {gym} membership of ₹{amount} is due on {due_date}.{balance_line} Please pay by GPay to {upi_id} or cash at the desk. Thank you!';
export const DEFAULT_RECEIPT =
  'Hi {name}, we received ₹{amount} by {mode} on {date} for {gym}. Receipt no. {receipt_no}. Membership valid till {valid_till}.{balance_line} Thank you!';

export const SETTING_DEFAULTS: Record<string, string> = {
  receipt_prefix: 'MG-',
  receipt_seq: '0',
  upi_id: '',
  reminder_template: DEFAULT_REMINDER,
  receipt_template: DEFAULT_RECEIPT,
  remind_days: '3',
  due_soon_days: '7',
  hide_amounts: '0',
  lock_enabled: '0',
  lock_timeout_sec: '60',
  backup_freq: 'daily', // off | daily | weekly | payment
  last_backup: '',
  backup_sheet_id: '',
  google_email: '',
};

export async function getSettings(db: SQLiteDatabase): Promise<Record<string, string>> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const out = { ...SETTING_DEFAULTS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string) {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

// ---------- gyms ----------

export async function listGyms(db: SQLiteDatabase): Promise<Gym[]> {
  return db.getAllAsync<Gym>('SELECT * FROM gyms ORDER BY id');
}

export async function saveGym(db: SQLiteDatabase, g: Omit<Gym, 'id'> & { id?: number }) {
  if (g.id) {
    await db.runAsync(
      'UPDATE gyms SET name=?, fee_monthly=?, fee_quarterly=?, fee_halfyearly=?, fee_yearly=? WHERE id=?',
      g.name, g.fee_monthly, g.fee_quarterly, g.fee_halfyearly, g.fee_yearly, g.id,
    );
    return g.id;
  }
  const r = await db.runAsync(
    'INSERT INTO gyms (name, fee_monthly, fee_quarterly, fee_halfyearly, fee_yearly, created_at) VALUES (?,?,?,?,?,?)',
    g.name, g.fee_monthly, g.fee_quarterly, g.fee_halfyearly, g.fee_yearly, new Date().toISOString(),
  );
  return r.lastInsertRowId;
}

export async function deleteGym(db: SQLiteDatabase, id: number): Promise<boolean> {
  const c = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM members WHERE gym_id=?', id);
  if ((c?.n ?? 0) > 0) return false;
  await db.runAsync('DELETE FROM gyms WHERE id=?', id);
  return true;
}

// ---------- members ----------

const MEMBER_SELECT = `SELECT m.*, g.name AS gym_name FROM members m JOIN gyms g ON g.id = m.gym_id`;

export async function listMembers(db: SQLiteDatabase, gymId?: number | null): Promise<Member[]> {
  if (gymId) {
    return db.getAllAsync<Member>(`${MEMBER_SELECT} WHERE m.active=1 AND m.gym_id=? ORDER BY m.name COLLATE NOCASE`, gymId);
  }
  return db.getAllAsync<Member>(`${MEMBER_SELECT} WHERE m.active=1 ORDER BY m.name COLLATE NOCASE`);
}

export async function getMember(db: SQLiteDatabase, id: number): Promise<Member | null> {
  return db.getFirstAsync<Member>(`${MEMBER_SELECT} WHERE m.id=?`, id);
}

export type MemberInput = {
  id?: number;
  gym_id: number;
  name: string;
  phone: string;
  gender: Gender;
  photo_uri: string | null;
  joined_on: string;
  notes: string;
  plan_type: PlanType;
  plan_months: number;
  plan_fee: number;
  paid_till: string | null;
  balance: number;
};

export async function saveMember(db: SQLiteDatabase, m: MemberInput): Promise<number> {
  if (m.id) {
    await db.runAsync(
      `UPDATE members SET gym_id=?, name=?, phone=?, gender=?, photo_uri=?, joined_on=?, notes=?,
       plan_type=?, plan_months=?, plan_fee=?, paid_till=?, balance=? WHERE id=?`,
      m.gym_id, m.name, m.phone, m.gender, m.photo_uri, m.joined_on, m.notes,
      m.plan_type, m.plan_months, m.plan_fee, m.paid_till, m.balance, m.id,
    );
    return m.id;
  }
  const r = await db.runAsync(
    `INSERT INTO members (gym_id, name, phone, gender, photo_uri, joined_on, notes, plan_type, plan_months,
     plan_fee, paid_till, balance, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    m.gym_id, m.name, m.phone, m.gender, m.photo_uri, m.joined_on, m.notes, m.plan_type, m.plan_months,
    m.plan_fee, m.paid_till, m.balance, new Date().toISOString(),
  );
  return r.lastInsertRowId;
}

export async function setMemberActive(db: SQLiteDatabase, id: number, active: boolean) {
  await db.runAsync('UPDATE members SET active=? WHERE id=?', active ? 1 : 0, id);
}

export async function markReminded(db: SQLiteDatabase, id: number) {
  await db.runAsync('UPDATE members SET last_reminded_on=? WHERE id=?', today(), id);
}

// ---------- payments ----------

export async function listMemberPayments(db: SQLiteDatabase, memberId: number): Promise<Payment[]> {
  return db.getAllAsync<Payment>('SELECT * FROM payments WHERE member_id=? ORDER BY paid_on DESC, id DESC', memberId);
}

export async function paymentsBetween(
  db: SQLiteDatabase, from: string, to: string, gymId?: number | null,
): Promise<PaymentWithMember[]> {
  const base = `SELECT p.*, m.name AS member_name, g.name AS gym_name FROM payments p
    JOIN members m ON m.id = p.member_id JOIN gyms g ON g.id = p.gym_id
    WHERE p.paid_on BETWEEN ? AND ?`;
  if (gymId) return db.getAllAsync<PaymentWithMember>(`${base} AND p.gym_id=? ORDER BY p.paid_on DESC, p.id DESC`, from, to, gymId);
  return db.getAllAsync<PaymentWithMember>(`${base} ORDER BY p.paid_on DESC, p.id DESC`, from, to);
}

export async function nextReceiptNo(db: SQLiteDatabase): Promise<string> {
  const s = await getSettings(db);
  const seq = Number(s.receipt_seq || '0') + 1;
  return `${s.receipt_prefix}${String(seq).padStart(4, '0')}`;
}

export type PaymentInput = {
  member: Member;
  paid_on: string;
  amount: number;
  mode: PayMode;
  plan_type: PlanType;
  plan_months: number;
  plan_fee: number;
  period_from: string;
  period_to: string;
  note?: string;
};

/** Records a payment, allocates the receipt number and moves the member's paid-till date and balance. */
export async function recordPayment(db: SQLiteDatabase, p: PaymentInput): Promise<Payment> {
  let saved: Payment | null = null;
  await db.withExclusiveTransactionAsync(async (tx) => {
    const s = await tx.getAllAsync<{ key: string; value: string }>(
      "SELECT key, value FROM settings WHERE key IN ('receipt_seq','receipt_prefix')",
    );
    const map: Record<string, string> = { receipt_seq: '0', receipt_prefix: SETTING_DEFAULTS.receipt_prefix };
    for (const r of s) map[r.key] = r.value;
    const seq = Number(map.receipt_seq) + 1;
    const receipt = `${map.receipt_prefix}${String(seq).padStart(4, '0')}`;

    const prev = p.member.balance;
    const totalDue = p.plan_fee + prev;
    const balanceAfter = Math.max(0, totalDue - p.amount);

    const r = await tx.runAsync(
      `INSERT INTO payments (receipt_no, member_id, gym_id, paid_on, amount, mode, plan_type, plan_months, plan_fee,
       prev_balance, prev_paid_till, balance_after, period_from, period_to, note, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      receipt, p.member.id, p.member.gym_id, p.paid_on, p.amount, p.mode, p.plan_type, p.plan_months, p.plan_fee,
      prev, p.member.paid_till, balanceAfter, p.period_from, p.period_to, p.note ?? '', new Date().toISOString(),
    );
    await tx.runAsync(
      'UPDATE members SET paid_till=?, balance=?, plan_type=?, plan_months=?, plan_fee=? WHERE id=?',
      p.period_to, balanceAfter, p.plan_type, p.plan_months, p.plan_fee, p.member.id,
    );
    await tx.runAsync(
      "INSERT INTO settings (key, value) VALUES ('receipt_seq', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      String(seq),
    );
    saved = {
      id: r.lastInsertRowId, receipt_no: receipt, member_id: p.member.id, gym_id: p.member.gym_id,
      paid_on: p.paid_on, amount: p.amount, mode: p.mode, plan_type: p.plan_type, plan_months: p.plan_months,
      plan_fee: p.plan_fee, prev_balance: prev, prev_paid_till: p.member.paid_till, balance_after: balanceAfter, period_from: p.period_from,
      period_to: p.period_to, note: p.note ?? '',
    };
  });
  return saved!;
}

/** Adds an old payment to history (existing members) without changing the member's dates or balance. */
export async function addHistoricalPayment(
  db: SQLiteDatabase,
  p: { member_id: number; gym_id: number; paid_on: string; amount: number; mode: PayMode; plan_type: PlanType; plan_months: number; plan_fee: number; period_to: string | null },
) {
  await db.withExclusiveTransactionAsync(async (tx) => {
    const row = await tx.getAllAsync<{ key: string; value: string }>(
      "SELECT key, value FROM settings WHERE key IN ('receipt_seq','receipt_prefix')",
    );
    const map: Record<string, string> = { receipt_seq: '0', receipt_prefix: SETTING_DEFAULTS.receipt_prefix };
    for (const r of row) map[r.key] = r.value;
    const seq = Number(map.receipt_seq) + 1;
    await tx.runAsync(
      `INSERT INTO payments (receipt_no, member_id, gym_id, paid_on, amount, mode, plan_type, plan_months, plan_fee,
       prev_balance, prev_paid_till, balance_after, period_from, period_to, note, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,0,NULL,0,NULL,?,?,?)`,
      `${map.receipt_prefix}${String(seq).padStart(4, '0')}`, p.member_id, p.gym_id, p.paid_on, p.amount, p.mode,
      p.plan_type, p.plan_months, p.plan_fee, p.period_to, 'Added as existing member', new Date().toISOString(),
    );
    await tx.runAsync(
      "INSERT INTO settings (key, value) VALUES ('receipt_seq', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      String(seq),
    );
  });
}

/** Records only a balance payment (no new period) — used to clear a pending balance. */
export async function recordBalancePayment(
  db: SQLiteDatabase, member: Member, amount: number, mode: PayMode, paid_on: string,
): Promise<Payment> {
  return recordPayment(db, {
    member, paid_on, amount, mode,
    plan_type: member.plan_type, plan_months: 0, plan_fee: 0,
    period_from: member.paid_till ?? paid_on, period_to: member.paid_till ?? paid_on,
    note: 'Balance payment',
  });
}

/** Only the member's latest payment can be deleted, so their paid-till and balance can be restored exactly. */
export async function isLatestPayment(db: SQLiteDatabase, payment: Payment): Promise<boolean> {
  const latest = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM payments WHERE member_id=? ORDER BY id DESC LIMIT 1', payment.member_id,
  );
  return latest?.id === payment.id;
}

export async function deleteLatestPayment(db: SQLiteDatabase, payment: Payment) {
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('DELETE FROM payments WHERE id=?', payment.id);
    await tx.runAsync(
      'UPDATE members SET paid_till=?, balance=? WHERE id=?',
      payment.prev_paid_till, payment.prev_balance, payment.member_id,
    );
  });
}

// ---------- dashboard numbers ----------

export type Summary = {
  active: number;
  dueSoon: number;
  overdue: number;
  expired: number;
  balanceMembers: number;
  balanceTotal: number;
  collected: number;
  gpay: number;
  cash: number;
  pendingDues: number;
  men: number;
  women: number;
};

export function summarize(members: Member[], monthPayments: Payment[], dueSoonDays: number, monthEnd: string): Summary {
  const s: Summary = {
    active: 0, dueSoon: 0, overdue: 0, expired: 0, balanceMembers: 0, balanceTotal: 0,
    collected: 0, gpay: 0, cash: 0, pendingDues: 0, men: 0, women: 0,
  };
  for (const m of members) {
    const st = memberStatus(m, dueSoonDays);
    if (m.gender === 'female') s.women++; else s.men++;
    if (st.kind === 'expired') { s.expired++; continue; }
    s.active++;
    if (st.kind === 'duesoon') s.dueSoon++;
    if (st.kind === 'overdue') s.overdue++;
    if (m.balance > 0) { s.balanceMembers++; s.balanceTotal += m.balance; }
    if ((st.kind === 'overdue' || st.kind === 'duesoon' || st.kind === 'paid') && st.dueDate <= monthEnd) {
      s.pendingDues += m.plan_fee;
    }
  }
  for (const p of monthPayments) {
    s.collected += p.amount;
    if (p.mode === 'gpay') s.gpay += p.amount; else s.cash += p.amount;
  }
  return s;
}
