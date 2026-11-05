import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import {
  Avatar, Button, Card, DateField, Feather, Field, IconButton, Label, Muted, Screen, Segmented,
} from '@/components/ui';
import { useApp } from '@/context/app';
import {
  getMember, gymFee, listMembers, Member, nextReceiptNo, PayMode, PLAN_LABEL, PLAN_MONTHS, PlanType,
  recordBalancePayment, recordPayment,
} from '@/db/repo';
import { addDays, daysBetween, fmtDate, periodEnd, today } from '@/lib/dates';
import { inr, parseAmount } from '@/lib/format';
import { maybeAutoBackup } from '@/lib/backup';
import { openWhatsApp, receiptText } from '@/lib/whatsapp';
import { C } from '@/theme';

const PLAN_OPTS = (['monthly', 'quarterly', 'halfyearly', 'yearly', 'custom', 'tilldate'] as PlanType[]).map((v) => ({ value: v, label: PLAN_LABEL[v] }));
const PLAN_SUB: Partial<Record<PlanType, string>> = {
  monthly: '1 month', quarterly: '3 months', halfyearly: '6 months', yearly: '12 months', custom: 'any months', tilldate: 'pick end date',
};

/** Where the new period starts: right after the current one, unless the member lapsed more than 30 days ago. */
function defaultFrom(m: Member): string {
  const now = today();
  if (!m.paid_till) return now;
  const next = addDays(m.paid_till, 1);
  return daysBetween(next, now) > 30 ? now : next;
}

export default function RecordPayment() {
  const params = useLocalSearchParams<{ memberId?: string; balanceOnly?: string; first?: string }>();
  const db = useSQLiteContext();
  const { gyms, settings } = useApp();
  const [member, setMember] = useState<Member | null>(null);
  const balanceOnly = params.balanceOnly === '1';

  useEffect(() => {
    if (params.memberId) getMember(db, Number(params.memberId)).then(setMember);
  }, [db, params.memberId]);

  if (!params.memberId && !member) return <PickMember onPick={setMember} />;
  if (!member) return <Screen><Muted>Loading…</Muted></Screen>;
  return <PaymentForm member={member} balanceOnly={balanceOnly} gymFeeFor={(p) => gymFee(gyms.find((g) => g.id === member.gym_id), p)} settings={settings} db={db} />;
}

function PaymentForm({
  member, balanceOnly, gymFeeFor, settings, db,
}: {
  member: Member; balanceOnly: boolean; gymFeeFor: (p: PlanType) => number; settings: Record<string, string>; db: ReturnType<typeof useSQLiteContext>;
}) {
  const [plan, setPlan] = useState<PlanType>(member.plan_type === 'tilldate' ? 'monthly' : member.plan_type);
  const [customMonths, setCustomMonths] = useState(String(member.plan_type === 'custom' ? member.plan_months : 2));
  const [from, setFrom] = useState(defaultFrom(member));
  const [tillDate, setTillDate] = useState(periodEnd(defaultFrom(member), 1));
  const [fee, setFee] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<PayMode>('gpay');
  const [sendReceipt, setSendReceipt] = useState(!!member.phone);
  const [receiptNo, setReceiptNo] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { nextReceiptNo(db).then(setReceiptNo); }, [db]);

  const months = plan === 'custom' ? Math.max(1, Number(customMonths) || 1) : PLAN_MONTHS[plan] ?? 1;
  const validTill = plan === 'tilldate' ? tillDate : periodEnd(from, months);

  // Fee follows the plan: the gym's fee for that plan, or the member's own fee if it is the same plan.
  const feeFor = useCallback((p: PlanType) => {
    if (p === member.plan_type && member.plan_fee) return member.plan_fee;
    return gymFeeFor(p);
  }, [member, gymFeeFor]);

  useEffect(() => {
    if (balanceOnly) { setAmount(String(member.balance)); return; }
    const f = feeFor(plan);
    setFee(f ? String(f) : '');
    setAmount(String((f || 0) + member.balance));
  }, [plan, balanceOnly, member.balance, feeFor]);

  const feeN = balanceOnly ? 0 : parseAmount(fee);
  const amountN = parseAmount(amount);
  const total = feeN + member.balance;
  const balanceAfter = Math.max(0, total - amountN);

  const save = async () => {
    if (amountN <= 0) return Alert.alert('Amount needed', 'Enter the amount received.');
    if (!balanceOnly && validTill < from) return Alert.alert('Check dates', '“Valid till” must be after the start date.');
    if (amountN > total) {
      const ok = await new Promise<boolean>((res) => Alert.alert('More than due', `${inr(amountN)} is more than ${inr(total)} due. The extra is not stored as credit. Save anyway?`, [
        { text: 'Cancel', style: 'cancel', onPress: () => res(false) }, { text: 'Save', onPress: () => res(true) },
      ]));
      if (!ok) return;
    }
    setSaving(true);
    try {
      const p = balanceOnly
        ? await recordBalancePayment(db, member, amountN, mode, today())
        : await recordPayment(db, {
          member, paid_on: today(), amount: amountN, mode, plan_type: plan, plan_months: months, plan_fee: feeN,
          period_from: from, period_to: validTill,
        });
      maybeAutoBackup(db, 'payment');
      if (sendReceipt) {
        const updated = await getMember(db, member.id);
        await openWhatsApp(member.phone, receiptText(settings.receipt_template, updated ?? member, p));
      }
      router.replace(`/member/${member.id}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconButton name="x" label="Close" onPress={() => router.back()} />
        <View>
          <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink }}>{balanceOnly ? 'Collect balance' : 'Record payment'}</Text>
          <Muted>Receipt no. {receiptNo} · auto-numbered</Muted>
        </View>
      </View>

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
        <Avatar name={member.name} uri={member.photo_uri} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '600', fontSize: 15, color: C.ink }}>{member.name}</Text>
          <Muted>{member.gym_name}{member.paid_till ? ` · paid till ${fmtDate(member.paid_till, true)}` : ' · first payment'}</Muted>
        </View>
      </Card>

      {!balanceOnly && (
        <>
          <Label>Plan period</Label>
          <Segmented options={PLAN_OPTS} value={plan} onChange={setPlan} sub={PLAN_SUB} />
          {plan === 'custom' && <Field label="Number of months" value={customMonths} onChangeText={setCustomMonths} keyboardType="number-pad" />}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <DateField label="From" value={from} onChange={(v) => { setFrom(v); if (plan === 'tilldate' && tillDate < v) setTillDate(periodEnd(v, 1)); }} />
            {plan === 'tilldate'
              ? <DateField label="Valid till" value={tillDate} onChange={setTillDate} />
              : (
                <View style={{ gap: 8, flex: 1 }}>
                  <Label>Valid till</Label>
                  <View style={{ height: 52, borderRadius: 14, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, justifyContent: 'center', paddingHorizontal: 14 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: C.ink }}>{fmtDate(validTill, true)}</Text>
                  </View>
                </View>
              )}
          </View>
          <Field label="Plan fee (₹)" value={fee} onChangeText={(v) => { setFee(v); setAmount(String(parseAmount(v) + member.balance)); }} keyboardType="number-pad" placeholder="Set fees in Settings → My gyms" />
        </>
      )}

      <View style={{ gap: 8 }}>
        <Label>Amount received</Label>
        <View style={{ height: 64, borderRadius: 14, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 6 }}>
          <Text style={{ fontSize: 26, fontWeight: '700', color: C.muted }}>₹</Text>
          <TextInput value={amount} onChangeText={setAmount} keyboardType="number-pad" accessibilityLabel="Amount received"
            style={{ flex: 1, fontSize: 26, fontWeight: '700', color: C.ink }} />
        </View>
        <Card style={{ gap: 6, padding: 14 }}>
          {!balanceOnly && <Line label="Plan fee" value={inr(feeN)} />}
          <Line label="Previous balance" value={inr(member.balance)} />
          <Line label="Received now" value={`− ${inr(amountN)}`} />
          <View style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 6 }}>
            <Line label="Balance pending" value={inr(balanceAfter)} strong color={balanceAfter > 0 ? C.amber : C.paidFg} />
          </View>
        </Card>
        <Muted>Partial payment is fine — the balance shows on their profile and in reminders until paid.</Muted>
      </View>

      <View style={{ gap: 8 }}>
        <Label>Paid by</Label>
        <Segmented columns={2} value={mode} onChange={setMode} options={[{ value: 'gpay', label: 'GPay / UPI' }, { value: 'cash', label: 'Cash' }]} />
      </View>

      <Pressable onPress={() => setSendReceipt(!sendReceipt)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
        <Switch value={sendReceipt} onValueChange={setSendReceipt} trackColor={{ true: C.green, false: C.border }} thumbColor="#FFF" />
        <Text style={{ fontSize: 14, color: C.ink, flex: 1 }}>Send WhatsApp receipt (no. {receiptNo}) to member</Text>
      </Pressable>

      <Button title={`Save payment · ${inr(amountN)}`} onPress={save} loading={saving} style={{ height: 56, marginTop: 4 }} />
    </Screen>
  );
}

function Line({ label, value, strong, color = C.ink }: { label: string; value: string; strong?: boolean; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: 13, color, fontWeight: strong ? '600' : '400' }}>{label}</Text>
      <Text style={{ fontSize: 13, color, fontWeight: strong ? '600' : '400' }}>{value}</Text>
    </View>
  );
}

function PickMember({ onPick }: { onPick: (m: Member) => void }) {
  const db = useSQLiteContext();
  const { gymId } = useApp();
  const [all, setAll] = useState<Member[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => { listMembers(db, gymId).then(setAll); }, [db, gymId]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter((m) => !t || m.name.toLowerCase().includes(t) || m.phone.includes(t)).slice(0, 50);
  }, [all, q]);
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconButton name="x" label="Close" onPress={() => router.back()} />
        <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink }}>Who paid?</Text>
      </View>
      <View style={{ height: 48, borderRadius: 14, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 }}>
        <Feather name="search" size={18} color={C.muted} />
        <TextInput autoFocus value={q} onChangeText={setQ} placeholder="Search name or phone" placeholderTextColor="#8A8E96" style={{ flex: 1, fontSize: 15, color: C.ink }} />
      </View>
      <Card style={{ paddingVertical: 4 }}>
        {shown.length === 0 && <Muted style={{ padding: 12 }}>No members found.</Muted>}
        {shown.map((m) => (
          <Pressable key={m.id} onPress={() => onPick(m)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <Avatar name={m.name} uri={m.photo_uri} size={36} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', color: C.ink }}>{m.name}</Text>
              <Muted>{m.gym_name}</Muted>
            </View>
          </Pressable>
        ))}
      </Card>
      <Button title="New member" kind="outline" onPress={() => router.replace('/member/new')} />
    </Screen>
  );
}
