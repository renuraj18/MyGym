import type { SQLiteDatabase } from 'expo-sqlite';
import { addDays, addMonths, periodEnd, today } from '@/lib/dates';
import type { PayMode, PlanType } from '@/db/repo';

/**
 * Demo data for trying out reports and due dates: 3 gyms × 100 members with
 * realistic payment histories. Everything is generated relative to today, so
 * "due soon", "overdue" and "expired" always have members in them.
 */

const GYMS = [
  { name: 'Iron Fit · Thillai Nagar', monthly: 1500, quarterly: 4000, halfyearly: 7500, yearly: 12000 },
  { name: 'Iron Fit · KK Nagar', monthly: 1300, quarterly: 3600, halfyearly: 6800, yearly: 11000 },
  { name: 'Iron Fit · Srirangam', monthly: 1200, quarterly: 3300, halfyearly: 6200, yearly: 10000 },
];

const MALE = ['Arun', 'Karthik', 'Suresh', 'Vignesh', 'Prakash', 'Ramesh', 'Dinesh', 'Senthil', 'Murugan', 'Balaji',
  'Saravanan', 'Gokul', 'Hari', 'Ajith', 'Vijay', 'Manoj', 'Naveen', 'Rajesh', 'Siva', 'Ashwin', 'Bharath', 'Kumar',
  'Lokesh', 'Mohan', 'Pradeep', 'Sathish', 'Tamil', 'Vinoth', 'Yuvaraj', 'Elango'];
const FEMALE = ['Priya', 'Deepa', 'Meena', 'Kavya', 'Divya', 'Lakshmi', 'Anitha', 'Revathi', 'Sangeetha', 'Nandhini',
  'Gayathri', 'Janani', 'Keerthana', 'Madhu', 'Pavithra', 'Ramya', 'Sowmya', 'Swathi', 'Uma', 'Vidhya'];
const INITIALS = 'ABCDGHJKLMNPRSTV';

type Bucket = 'paid' | 'duesoon' | 'overdue' | 'expired' | 'new';

let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
function weighted<T>(items: [T, number][]): T {
  let r = rnd() * items.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of items) { if ((r -= w) <= 0) return v; }
  return items[items.length - 1][0];
}

export async function clearAllData(db: SQLiteDatabase) {
  await db.withTransactionAsync(async () => {
    await db.execAsync(`
      DELETE FROM payments; DELETE FROM members; DELETE FROM gyms;
      DELETE FROM sqlite_sequence WHERE name IN ('payments','members','gyms');
      INSERT INTO settings (key, value) VALUES ('receipt_seq', '0') ON CONFLICT(key) DO UPDATE SET value = '0';
    `);
  });
}

export async function loadDemoData(db: SQLiteDatabase, membersPerGym = 100) {
  seed = Date.now() % 2147483646 || 1;
  const now = today();
  const prefixRow = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'receipt_prefix'");
  const prefix = prefixRow?.value || 'MG-';

  await clearAllData(db);

  type Pay = { member: number; gym: number; paid_on: string; amount: number; mode: PayMode; plan: PlanType; months: number;
    fee: number; prevBal: number; prevTill: string | null; balAfter: number; from: string; to: string; created: string };
  const payments: Pay[] = [];
  let memberCount = 0;

  await db.withTransactionAsync(async () => {
    const insGym = await db.prepareAsync(
      'INSERT INTO gyms (name, fee_monthly, fee_quarterly, fee_halfyearly, fee_yearly, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    const insMember = await db.prepareAsync(
      `INSERT INTO members (gym_id, name, phone, gender, photo_uri, joined_on, notes, plan_type, plan_months, plan_fee,
        paid_till, balance, last_reminded_on, active, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`);
    try {
      const usedNames = new Set<string>();
      for (const g of GYMS) {
        const gymRes = await insGym.executeAsync(g.name, g.monthly, g.quarterly, g.halfyearly, g.yearly, addDays(now, -540));
        const gymId = gymRes.lastInsertRowId;

        for (let i = 0; i < membersPerGym; i++) {
          const gender = rnd() < 0.62 ? 'male' : 'female';
          let name = '';
          do { name = `${pick(gender === 'male' ? MALE : FEMALE)} ${pick(INITIALS.split(''))}`; } while (usedNames.has(name) && usedNames.size < 1500);
          usedNames.add(name);
          const phone = `+91 9${int(0, 9)}${String(int(0, 99999999)).padStart(8, '0')}`;

          const plan = weighted<PlanType>([['monthly', 55], ['quarterly', 20], ['halfyearly', 11], ['yearly', 8], ['custom', 6]]);
          const months = plan === 'custom' ? pick([2, 4, 5]) : ({ monthly: 1, quarterly: 3, halfyearly: 6, yearly: 12 } as Record<string, number>)[plan];
          const fee = plan === 'custom'
            ? Math.round((g.monthly * months * 0.95) / 100) * 100
            : ({ monthly: g.monthly, quarterly: g.quarterly, halfyearly: g.halfyearly, yearly: g.yearly } as Record<string, number>)[plan];

          const bucket = weighted<Bucket>([['paid', 60], ['duesoon', 13], ['overdue', 12], ['expired', 12], ['new', 3]]);

          if (bucket === 'new') {
            const joined = addDays(now, -int(0, 6));
            await insMember.executeAsync(gymId, name, phone, gender, joined, 'Demo member', plan, months, fee, null, 0, 1, joined);
            memberCount++;
            continue;
          }

          // Start of the latest paid period, chosen so the member lands in the bucket.
          let lastStart: string;
          if (bucket === 'paid') {
            const span = Math.max(0, months * 30 - 10);
            lastStart = addDays(now, -int(0, span));
          } else {
            const paidTill = bucket === 'duesoon' ? addDays(now, int(0, 6))
              : bucket === 'overdue' ? addDays(now, -int(2, 30))
              : addDays(now, -int(35, 160));
            lastStart = addMonths(addDays(paidTill, 1), -months);
          }

          // Walk back through earlier periods; up to ~18 months of history.
          const periods: { from: string; to: string }[] = [];
          let start = lastStart;
          const maxPeriods = Math.max(1, Math.floor(18 / months));
          const count = int(1, maxPeriods);
          for (let k = 0; k < count; k++) {
            periods.unshift({ from: start, to: periodEnd(start, months) });
            start = addMonths(start, -months);
          }
          const joined = addDays(periods[0].from, -int(0, 3));
          const paidTill = periods[periods.length - 1].to;

          // ~12% still owe part of their latest payment.
          const partial = bucket !== 'expired' && rnd() < 0.12;
          const shortBy = partial ? Math.min(fee - 100, int(3, 10) * 100) : 0;
          const mode: PayMode = rnd() < 0.65 ? 'gpay' : 'cash';
          const active = bucket === 'expired' && rnd() < 0.3 ? 0 : 1;

          const res = await insMember.executeAsync(gymId, name, phone, gender, joined, 'Demo member', plan, months, fee,
            paidTill, shortBy, active, joined);
          const memberId = res.lastInsertRowId;
          memberCount++;

          let prevTill: string | null = null;
          periods.forEach((p, idx) => {
            const isLast = idx === periods.length - 1;
            let paidOn = addDays(p.from, weighted<number>([[0, 50], [int(1, 3), 35], [int(4, 9), 15]]));
            if (paidOn > now) paidOn = now;
            const amount = isLast ? fee - shortBy : fee;
            payments.push({
              member: memberId, gym: gymId, paid_on: paidOn, amount,
              mode: isLast ? mode : (rnd() < 0.65 ? 'gpay' : 'cash'),
              plan, months, fee, prevBal: 0, prevTill, balAfter: isLast ? shortBy : 0,
              from: p.from, to: p.to, created: `${paidOn}T10:00:00`,
            });
            prevTill = p.to;
          });
        }
      }

      // Receipt numbers in date order, like they would be in real use.
      payments.sort((a, b) => (a.paid_on < b.paid_on ? -1 : a.paid_on > b.paid_on ? 1 : 0));
      const insPay = await db.prepareAsync(
        `INSERT INTO payments (receipt_no, member_id, gym_id, paid_on, amount, mode, plan_type, plan_months, plan_fee,
          prev_balance, prev_paid_till, balance_after, period_from, period_to, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      try {
        let seq = 0;
        for (const p of payments) {
          seq++;
          await insPay.executeAsync(`${prefix}${String(seq).padStart(4, '0')}`, p.member, p.gym, p.paid_on, p.amount, p.mode,
            p.plan, p.months, p.fee, p.prevBal, p.prevTill, p.balAfter, p.from, p.to, 'Demo data', p.created);
        }
        await db.runAsync(
          "INSERT INTO settings (key, value) VALUES ('receipt_seq', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          String(seq));
      } finally {
        await insPay.finalizeAsync();
      }
    } finally {
      await insGym.finalizeAsync();
      await insMember.finalizeAsync();
    }
  });

  return { gyms: GYMS.length, members: memberCount, payments: payments.length };
}
