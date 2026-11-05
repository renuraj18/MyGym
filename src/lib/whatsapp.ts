import { Alert, Linking } from 'react-native';
import { addDays } from './dates';
import { fmtDate } from './dates';
import { groupIN, normalizePhone } from './format';
import type { Member, Payment } from '@/db/repo';
import { PLAN_LABEL } from '@/db/repo';

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (all, key) => (key in vars ? vars[key] : all));
}

export function reminderText(template: string, m: Member, upiId: string): string {
  const due = m.paid_till ? addDays(m.paid_till, 1) : m.joined_on;
  const amount = m.plan_fee + m.balance;
  return fill(template, {
    name: m.name.split(' ')[0],
    gym: m.gym_name,
    amount: groupIN(amount),
    fee: groupIN(m.plan_fee),
    plan: PLAN_LABEL[m.plan_type],
    due_date: fmtDate(due, true),
    balance: groupIN(m.balance),
    balance_line: m.balance > 0 ? ` (includes ₹${groupIN(m.balance)} pending balance)` : '',
    upi_id: upiId || 'our UPI ID',
  });
}

export function receiptText(template: string, m: Member, p: Payment): string {
  return fill(template, {
    name: m.name.split(' ')[0],
    gym: m.gym_name,
    amount: groupIN(p.amount),
    mode: p.mode === 'gpay' ? 'GPay/UPI' : 'cash',
    date: fmtDate(p.paid_on, true),
    receipt_no: p.receipt_no,
    valid_till: fmtDate(p.period_to, true),
    balance_line: p.balance_after > 0 ? ` Balance pending: ₹${groupIN(p.balance_after)}.` : '',
  });
}

/** Opens the member's WhatsApp chat with the message typed in. Returns false if it could not open. */
export async function openWhatsApp(phone: string, text: string): Promise<boolean> {
  const num = normalizePhone(phone);
  if (num.length < 10) {
    Alert.alert('No WhatsApp number', 'Add a valid mobile number for this member first.');
    return false;
  }
  const url = `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    Alert.alert('Could not open WhatsApp', 'Make sure WhatsApp is installed on this phone.');
    return false;
  }
}
