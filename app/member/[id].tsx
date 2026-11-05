import React, { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Avatar, Badge, Button, Card, Feather, IconButton, MaterialCommunityIcons, Muted, Screen, statusColors } from '@/components/ui';
import { useApp } from '@/context/app';
import {
  deleteLatestPayment, getMember, isLatestPayment, listMemberPayments, markReminded, Member, memberStatus, Payment,
  PLAN_LABEL, saveMember, setMemberActive,
} from '@/db/repo';
import { fmtDate } from '@/lib/dates';
import { displayPhone, inr } from '@/lib/format';
import { choosePhoto } from '@/lib/photos';
import { openWhatsApp, receiptText, reminderText } from '@/lib/whatsapp';
import { C } from '@/theme';

export default function MemberDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const { settings } = useApp();
  const [m, setM] = useState<Member | null>(null);
  const [pays, setPays] = useState<Payment[]>([]);
  const hide = settings.hide_amounts === '1';

  const load = useCallback(async () => {
    const mem = await getMember(db, Number(id));
    setM(mem);
    if (mem) setPays(await listMemberPayments(db, mem.id));
  }, [db, id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!m) return <Screen><Muted>Loading…</Muted></Screen>;

  const st = memberStatus(m, Number(settings.due_soon_days || '7'));
  const [bg, fg] = statusColors(st, m.balance);
  const totalPaid = pays.reduce((a, p) => a + p.amount, 0);
  const dueAmount = m.plan_fee + m.balance;

  const setPhoto = (uri: string | null) =>
    saveMember(db, { ...m, photo_uri: uri }).then(load);

  const remind = async () => {
    if (await openWhatsApp(m.phone, reminderText(settings.reminder_template, m, settings.upi_id))) {
      await markReminded(db, m.id);
      load();
    }
  };

  const paymentMenu = async (p: Payment) => {
    const latest = await isLatestPayment(db, p);
    const buttons: any[] = [
      { text: 'Send receipt on WhatsApp', onPress: () => openWhatsApp(m.phone, receiptText(settings.receipt_template, m, p)) },
    ];
    if (latest) {
      buttons.push({
        text: 'Delete this payment', style: 'destructive', onPress: () =>
          Alert.alert('Delete payment?', `${p.receipt_no} · ${inr(p.amount)} will be removed and the member’s dates put back.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => { await deleteLatestPayment(db, p); load(); } },
          ]),
      });
    }
    buttons.push({ text: 'Close', style: 'cancel' });
    Alert.alert(`Receipt ${p.receipt_no}`, latest ? undefined : 'Only the latest payment can be deleted.', buttons);
  };

  const moreMenu = () => {
    Alert.alert(m.name, undefined, [
      { text: 'Edit details', onPress: () => router.push({ pathname: '/member/new', params: { id: String(m.id) } }) },
      m.active
        ? { text: 'Mark as left the gym', style: 'destructive', onPress: async () => { await setMemberActive(db, m.id, false); router.back(); } }
        : { text: 'Mark as active again', onPress: async () => { await setMemberActive(db, m.id, true); load(); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const dueTitle = st.kind === 'new' ? 'No payment yet'
    : st.kind === 'paid' ? `Paid till ${fmtDate(m.paid_till, true)}`
    : `${st.label} · ${fmtDate(st.dueDate)}`;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <IconButton name="chevron-left" label="Back" onPress={() => router.back()} />
        <IconButton name="more-horizontal" label="More options" onPress={moreMenu} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Pressable onPress={() => choosePhoto((u) => setPhoto(u), m.photo_uri ? () => setPhoto(null) : undefined)} accessibilityLabel="Change photo">
          <Avatar name={m.name} uri={m.photo_uri} size={80} bg={bg} fg={fg} />
          <View style={{ position: 'absolute', right: -4, bottom: -4, width: 34, height: 34, borderRadius: 17, backgroundColor: C.ink, borderWidth: 3, borderColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="camera" size={14} color="#FFF" />
          </View>
        </Pressable>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink }}>{m.name}</Text>
          <Muted>{displayPhone(m.phone)} · {m.gym_name}</Muted>
          <Muted>{m.gender === 'female' ? 'Female' : 'Male'} · Member since {fmtDate(m.joined_on, true)}{m.active ? '' : ' · LEFT'}</Muted>
        </View>
      </View>

      <View style={{ backgroundColor: st.kind === 'paid' && m.balance === 0 ? C.paidBg : bg, borderRadius: 16, padding: 16, gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: fg }}>{dueTitle}</Text>
          <Text style={{ fontSize: 12, color: fg }}>{PLAN_LABEL[m.plan_type]} plan</Text>
        </View>
        <Text style={{ fontSize: 30, fontWeight: '700', color: C.ink }}>{inr(dueAmount, hide)}</Text>
        {m.balance > 0 && (
          <Text style={{ fontSize: 12, color: C.dueFg }}>{inr(m.plan_fee, hide)} plan fee + {inr(m.balance, hide)} pending balance</Text>
        )}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="Record payment" style={{ flex: 1, height: 48 }} onPress={() => router.push({ pathname: '/payment/new', params: { memberId: String(m.id) } })} />
          <Button title="WhatsApp" kind="green" style={{ flex: 1, height: 48 }} onPress={remind}
            icon={<MaterialCommunityIcons name="whatsapp" size={18} color="#FFF" />} />
        </View>
        {m.balance > 0 && (
          <Button title={`Collect balance only (${inr(m.balance, hide)})`} kind="outline" style={{ height: 44 }}
            onPress={() => router.push({ pathname: '/payment/new', params: { memberId: String(m.id), balanceOnly: '1' } })} />
        )}
        {m.last_reminded_on && <Muted>Last reminded {fmtDate(m.last_reminded_on, true)}</Muted>}
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Mini label="Total paid" value={inr(totalPaid, hide)} />
        <Mini label="Balance" value={inr(m.balance, hide)} color={m.balance > 0 ? C.amber : C.ink} />
        <Mini label="Payments" value={String(pays.length)} />
      </View>

      <Card style={{ paddingVertical: 4 }}>
        <Text style={{ fontWeight: '600', fontSize: 14, paddingVertical: 12, color: C.ink }}>Payment history</Text>
        {pays.length === 0 && <Muted style={{ paddingBottom: 12 }}>No payments recorded yet.</Muted>}
        {pays.map((p, i) => (
          <Pressable key={p.id} onPress={() => paymentMenu(p)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: i === pays.length - 1 ? 0 : 1, borderBottomColor: C.line }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontWeight: '600', fontSize: 14, color: C.ink }}>
                {inr(p.amount, hide)}
                {p.balance_after > 0 ? <Text style={{ fontSize: 12, color: C.amber }}>  · {inr(p.balance_after, hide)} balance</Text> : null}
              </Text>
              <Muted>
                #{p.receipt_no} · {fmtDate(p.paid_on)}
                {p.plan_months === 0 ? ' · balance payment' : p.period_from && p.period_to ? ` · ${fmtDate(p.period_from)} – ${fmtDate(p.period_to)}` : ''}
              </Muted>
            </View>
            <Badge text={p.mode === 'gpay' ? 'GPay' : 'Cash'} bg={p.mode === 'gpay' ? C.gpayBg : '#ECEAE3'} fg={p.mode === 'gpay' ? C.gpay : C.ink} />
          </Pressable>
        ))}
      </Card>

      {!!m.notes && (
        <Card style={{ gap: 6 }}>
          <Text style={{ fontWeight: '600', fontSize: 14, color: C.ink }}>Notes</Text>
          <Text style={{ fontSize: 13, color: C.muted }}>{m.notes}</Text>
        </Card>
      )}
    </Screen>
  );
}

function Mini({ label, value, color = C.ink }: { label: string; value: string; color?: string }) {
  return (
    <Card style={{ flex: 1, padding: 12, gap: 2 }}>
      <Muted>{label}</Muted>
      <Text style={{ fontWeight: '700', fontSize: 16, color }}>{value}</Text>
    </Card>
  );
}
