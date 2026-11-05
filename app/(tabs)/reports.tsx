import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Badge, Button, Card, Chip, DateField, GymPicker, Muted, Screen } from '@/components/ui';
import { useApp } from '@/context/app';
import { useMembers, usePayments } from '@/hooks/useData';
import { memberStatus, paymentsBetween, PaymentWithMember, summarize } from '@/db/repo';
import { addMonths, endOfMonth, fmtDate, monthKey, monthShort, startOfMonth, today } from '@/lib/dates';
import { inr, inrCompact } from '@/lib/format';
import { backupNow } from '@/lib/backup';
import { C } from '@/theme';

type Period = 'month' | 'last' | 'year' | 'custom';

export default function Reports() {
  const db = useSQLiteContext();
  const { gyms, gymId, setGymId, settings } = useApp();
  const hide = settings.hide_amounts === '1';
  const now = today();
  const [period, setPeriod] = useState<Period>('month');
  const [cFrom, setCFrom] = useState(startOfMonth(now));
  const [cTo, setCTo] = useState(now);
  const [showAll, setShowAll] = useState(false);

  const [from, to, title] = useMemo((): [string, string, string] => {
    if (period === 'last') {
      const lm = addMonths(startOfMonth(now), -1);
      return [lm, endOfMonth(lm), 'Last month'];
    }
    if (period === 'year') return [now.slice(0, 4) + '-01-01', now.slice(0, 4) + '-12-31', `Year ${now.slice(0, 4)}`];
    if (period === 'custom') return [cFrom, cTo, `${fmtDate(cFrom, true)} – ${fmtDate(cTo, true)}`];
    return [startOfMonth(now), endOfMonth(now), 'This month'];
  }, [period, cFrom, cTo, now]);

  const { members } = useMembers();
  const { payments } = usePayments(from, to, gymId);

  // Last 6 months trend
  const [trend, setTrend] = useState<{ key: string; total: number }[]>([]);
  useFocusEffect(useCallback(() => {
    (async () => {
      const start = addMonths(startOfMonth(now), -5);
      const rows = await paymentsBetween(db, start, endOfMonth(now), gymId);
      const keys = Array.from({ length: 6 }, (_, i) => monthKey(addMonths(start, i)));
      setTrend(keys.map((k) => ({ key: k, total: rows.filter((r) => monthKey(r.paid_on) === k).reduce((a, r) => a + r.amount, 0) })));
    })();
  }, [db, gymId, now]));

  const dueSoonDays = Number(settings.due_soon_days || '7');
  const sum = useMemo(() => summarize(members, payments, dueSoonDays, endOfMonth(now)), [members, payments, dueSoonDays, now]);
  const gpayPct = sum.collected ? Math.round((sum.gpay / sum.collected) * 100) : 0;

  const byGym = gyms.map((g) => ({ name: g.name, total: payments.filter((p) => p.gym_id === g.id).reduce((a, p) => a + p.amount, 0) }));
  const maxGym = Math.max(1, ...byGym.map((g) => g.total));
  const maxTrend = Math.max(1, ...trend.map((t) => t.total));

  const newJoins = members.filter((m) => m.joined_on >= from && m.joined_on <= to).length;
  const renewals = payments.filter((p) => p.plan_months > 0).length;
  const expired = members.filter((m) => memberStatus(m, dueSoonDays).kind === 'expired').length;
  const gymLabel = gymId ? gyms.find((g) => g.id === gymId)?.name ?? '' : 'All gyms';

  const summaryText = () =>
    `MyGym report · ${gymLabel} · ${title}\n` +
    `Collected: ${inr(sum.collected)} (GPay ${inr(sum.gpay)}, Cash ${inr(sum.cash)})\n` +
    (gyms.length > 1 && !gymId ? byGym.map((g) => `  ${g.name}: ${inr(g.total)}`).join('\n') + '\n' : '') +
    `Still to collect: ${inr(sum.pendingDues + sum.balanceTotal)}\n` +
    `Payments: ${payments.length} · New joins: ${newJoins} · Active: ${sum.active} (Men ${sum.men}, Women ${sum.women})`;

  const exportPdf = async () => {
    const rows = payments.map((p) =>
      `<tr><td>${p.receipt_no}</td><td>${fmtDate(p.paid_on, true)}</td><td>${esc(p.member_name)}</td><td>${esc(p.gym_name)}</td><td>${p.mode === 'gpay' ? 'GPay' : 'Cash'}</td><td style="text-align:right">${inr(p.amount)}</td></tr>`,
    ).join('');
    const html = `<html><body style="font-family:sans-serif;padding:24px">
      <h2>MyGym report — ${esc(gymLabel)}</h2><p>${esc(title)}</p>
      <p><b>Collected:</b> ${inr(sum.collected)} &nbsp; GPay ${inr(sum.gpay)} &nbsp; Cash ${inr(sum.cash)}</p>
      <table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%;font-size:12px">
      <tr><th>Receipt</th><th>Date</th><th>Member</th><th>Gym</th><th>Mode</th><th>Amount</th></tr>${rows}</table></body></html>`;
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share report' });
  };

  const exportSheets = async () => {
    try {
      const r = await backupNow(db);
      Alert.alert('Saved to Google Sheets', `${r.payments} payments and ${r.members} members are in your “MyGym Backup” sheet.`);
    } catch (e: any) {
      Alert.alert('Could not export', e?.message ?? 'Connect your Google account in Settings first.');
    }
  };

  return (
    <Screen>
      <Text style={{ fontSize: 24, fontWeight: '700', color: C.ink }}>Reports</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip title="This month" active={period === 'month'} onPress={() => setPeriod('month')} />
        <Chip title="Last month" active={period === 'last'} onPress={() => setPeriod('last')} />
        <Chip title="This year" active={period === 'year'} onPress={() => setPeriod('year')} />
        <Chip title="Custom dates" active={period === 'custom'} onPress={() => setPeriod('custom')} />
      </ScrollView>
      {period === 'custom' && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <DateField label="From" value={cFrom} onChange={setCFrom} />
          <DateField label="To" value={cTo} onChange={setCTo} />
        </View>
      )}
      {gyms.length > 1 && <GymPicker gyms={gyms} value={gymId} onChange={setGymId} allowAll label="Gym" />}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Card style={{ flex: 1, gap: 4 }}>
          <Muted>Collected · {title}</Muted>
          <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink }}>{inr(sum.collected, hide)}</Text>
          <Muted>{payments.length} payments</Muted>
        </Card>
        <Card style={{ flex: 1, gap: 4 }}>
          <Muted>Still to collect (now)</Muted>
          <Text style={{ fontSize: 22, fontWeight: '700', color: C.amber }}>{inr(sum.pendingDues + sum.balanceTotal, hide)}</Text>
          <Muted>{inr(sum.pendingDues, hide)} dues + {inr(sum.balanceTotal, hide)} balances</Muted>
        </Card>
      </View>

      <Card style={{ gap: 10 }}>
        <Text style={{ fontWeight: '600', fontSize: 14, color: C.ink }}>GPay vs Cash</Text>
        <View style={{ flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', backgroundColor: C.line }}>
          <View style={{ width: `${gpayPct}%`, backgroundColor: C.gpay }} />
          <View style={{ width: `${sum.collected ? 100 - gpayPct : 0}%`, backgroundColor: C.amber }} />
        </View>
        <Text style={{ fontSize: 13, color: C.ink }}>● GPay / UPI {inr(sum.gpay, hide)} · {gpayPct}%</Text>
        <Text style={{ fontSize: 13, color: C.ink }}>● Cash {inr(sum.cash, hide)} · {sum.collected ? 100 - gpayPct : 0}%</Text>
      </Card>

      {gyms.length > 1 && !gymId && (
        <Card style={{ gap: 12 }}>
          <Text style={{ fontWeight: '600', fontSize: 14, color: C.ink }}>By gym</Text>
          {byGym.map((g) => (
            <View key={g.name} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: C.ink }}>{g.name}</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: C.ink }}>{inr(g.total, hide)}</Text>
              </View>
              <View style={{ height: 10, borderRadius: 5, backgroundColor: C.line, overflow: 'hidden' }}>
                <View style={{ width: `${(g.total / maxGym) * 100}%`, height: 10, backgroundColor: C.brand }} />
              </View>
            </View>
          ))}
        </Card>
      )}

      <Card style={{ gap: 10 }}>
        <Text style={{ fontWeight: '600', fontSize: 14, color: C.ink }}>Last 6 months</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', height: 130 }} accessibilityLabel="Monthly collection, last 6 months">
          {trend.map((t, i) => {
            const last = i === trend.length - 1;
            return (
              <View key={t.key} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 6, height: '100%' }}>
                <Text style={{ fontSize: 11, color: last ? C.brand : C.muted, fontWeight: last ? '600' : '400' }}>{hide ? '•' : inrCompact(t.total)}</Text>
                <View style={{ width: '100%', height: Math.max(4, (t.total / maxTrend) * 88), borderTopLeftRadius: 6, borderTopRightRadius: 6, backgroundColor: last ? C.brand : C.border }} />
                <Text style={{ fontSize: 11, color: last ? C.ink : C.muted }}>{monthShort(t.key)}</Text>
              </View>
            );
          })}
        </View>
      </Card>

      <Card style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Num label="New joins" value={String(newJoins)} />
        <Num label="Renewals" value={String(renewals)} />
        <Num label="Expired" value={String(expired)} />
        <Num label="Men / Women" value={`${sum.men} / ${sum.women}`} />
      </Card>

      <Text style={{ fontSize: 13, fontWeight: '600', color: C.ink }}>Export this report</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title="PDF" kind="outline" style={{ flex: 1, height: 44 }} onPress={exportPdf} />
        <Button title="Google Sheets" kind="outline" style={{ flex: 1, height: 44 }} onPress={exportSheets} />
        <Button title="WhatsApp" kind="outline" style={{ flex: 1, height: 44 }} onPress={() => Share.share({ message: summaryText() })} />
      </View>

      <Pressable onPress={() => setShowAll(!showAll)}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: C.brand }}>{showAll ? 'Hide payments' : `View all ${payments.length} payments (with receipt nos.)`}</Text>
      </Pressable>
      {showAll && (
        <Card style={{ paddingVertical: 4 }}>
          {payments.map((p: PaymentWithMember) => (
            <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', fontSize: 14, color: C.ink }}>{p.member_name} · {inr(p.amount, hide)}</Text>
                <Muted>#{p.receipt_no} · {fmtDate(p.paid_on)} · {p.gym_name}</Muted>
              </View>
              <Badge text={p.mode === 'gpay' ? 'GPay' : 'Cash'} bg={p.mode === 'gpay' ? C.gpayBg : '#ECEAE3'} fg={p.mode === 'gpay' ? C.gpay : C.ink} />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

function Num({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: C.ink }}>{value}</Text>
      <Muted>{label}</Muted>
    </View>
  );
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);
}
