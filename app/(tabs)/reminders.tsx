import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Button, Card, GymPicker, MaterialCommunityIcons, Muted, Screen, WhatsAppButton } from '@/components/ui';
import { useApp } from '@/context/app';
import { useMembers } from '@/hooks/useData';
import { markReminded, Member, memberStatus } from '@/db/repo';
import { daysBetween, fmtDate, today } from '@/lib/dates';
import { inr } from '@/lib/format';
import { openWhatsApp, reminderText } from '@/lib/whatsapp';
import { C } from '@/theme';

/** Reminded within the last 2 days counts as "sent" so the same person isn't messaged twice. */
function recentlySent(m: Member) {
  return !!m.last_reminded_on && daysBetween(m.last_reminded_on, today()) <= 2;
}

export default function Reminders() {
  const db = useSQLiteContext();
  const { gyms, gymId, setGymId, settings } = useApp();
  const { members, reload } = useMembers();
  const dueSoonDays = Number(settings.due_soon_days || '7');
  const hide = settings.hide_amounts === '1';

  const groups = useMemo(() => {
    const rows = members.map((m) => ({ m, st: memberStatus(m, dueSoonDays) }));
    return {
      overdue: rows.filter((r) => r.st.kind === 'overdue').sort((a, b) => a.st.days - b.st.days),
      soon: rows.filter((r) => r.st.kind === 'duesoon').sort((a, b) => a.st.days - b.st.days),
      balance: rows.filter((r) => r.st.kind === 'paid' && r.m.balance > 0),
    };
  }, [members, dueSoonDays]);

  const send = async (m: Member) => {
    const ok = await openWhatsApp(m.phone, reminderText(settings.reminder_template, m, settings.upi_id));
    if (ok) await markReminded(db, m.id);
    return ok;
  };

  // ---- "Remind all": open each chat in turn; when the user comes back to the app, offer the next one.
  const queue = useRef<Member[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !running) return;
      reload();
      if (queue.current.length === 0) { setRunning(false); return; }
      const next = queue.current[0];
      Alert.alert('Next reminder', `${queue.current.length} left. Open WhatsApp for ${next.name}?`, [
        { text: 'Stop', style: 'cancel', onPress: () => { queue.current = []; setRunning(false); } },
        { text: 'Skip', onPress: () => { queue.current.shift(); if (queue.current.length) openNext(); else setRunning(false); } },
        { text: 'Open', onPress: () => openNext() },
      ]);
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const openNext = async () => {
    while (queue.current.length) {
      const m = queue.current.shift()!;
      if (await send(m)) return; // wait for the user to come back from WhatsApp
    }
    setRunning(false);
  };

  const pending = [...groups.overdue, ...groups.soon].filter((r) => !recentlySent(r.m) && r.m.phone).map((r) => r.m);

  const remindAll = () => {
    if (pending.length === 0) return Alert.alert('All done', 'Everyone due has already been reminded in the last 2 days.');
    Alert.alert(`Remind ${pending.length} members?`, 'WhatsApp opens for each one. Tap Send, then come back to MyGym for the next.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Start', onPress: () => { queue.current = [...pending]; setRunning(true); openNext(); } },
    ]);
  };

  const Row = ({ m, sub }: { m: Member; sub: string }) => (
    <Pressable onPress={() => router.push(`/member/${m.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontWeight: '600', fontSize: 14, color: C.ink }}>{m.name}</Text>
        <Muted>{sub}</Muted>
      </View>
      {recentlySent(m) ? (
        <Pressable onPress={async () => { await send(m); reload(); }} style={{ height: 40, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#ECEAE3', justifyContent: 'center' }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: C.muted }}>Sent {fmtDate(m.last_reminded_on)}</Text>
        </Pressable>
      ) : (
        <WhatsAppButton label={`Send WhatsApp to ${m.name}`} onPress={async () => { await send(m); reload(); }} />
      )}
    </Pressable>
  );

  const preview = members[0] ? reminderText(settings.reminder_template, members[0], settings.upi_id) : settings.reminder_template;

  return (
    <Screen>
      <Text style={{ fontSize: 24, fontWeight: '700', color: C.ink }}>Reminders</Text>
      {gyms.length > 1 && <GymPicker gyms={gyms} value={gymId} onChange={setGymId} allowAll label="Gym" />}

      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: C.ink }}>Message preview</Text>
          <Pressable onPress={() => router.push('/templates')} style={{ height: 32, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: C.border, justifyContent: 'center' }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: C.ink }}>Edit</Text>
          </Pressable>
        </View>
        <View style={{ backgroundColor: C.greenSoft, borderRadius: 12, borderBottomLeftRadius: 4, padding: 12 }}>
          <Text style={{ fontSize: 13, lineHeight: 19, color: '#14532D' }}>{preview}</Text>
        </View>
        <Muted>Opens WhatsApp with the message filled in — you tap Send.</Muted>
      </Card>

      <Card style={{ paddingVertical: 4 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: C.overFg, paddingTop: 12, paddingBottom: 4 }}>OVERDUE · {groups.overdue.length}</Text>
        {groups.overdue.length === 0 && <Muted style={{ paddingBottom: 10 }}>Nobody overdue.</Muted>}
        {groups.overdue.map(({ m, st }) => <Row key={m.id} m={m} sub={`${inr(m.plan_fee + m.balance, hide)} · ${-st.days} days late · ${m.gym_name}`} />)}

        <Text style={{ fontSize: 12, fontWeight: '600', color: C.dueFg, paddingTop: 14, paddingBottom: 4 }}>DUE IN NEXT {dueSoonDays} DAYS · {groups.soon.length}</Text>
        {groups.soon.length === 0 && <Muted style={{ paddingBottom: 10 }}>Nobody due soon.</Muted>}
        {groups.soon.map(({ m, st }) => <Row key={m.id} m={m} sub={`${inr(m.plan_fee + m.balance, hide)} · ${st.label.toLowerCase()} (${fmtDate(st.dueDate)}) · ${m.gym_name}`} />)}

        {groups.balance.length > 0 && (
          <>
            <Text style={{ fontSize: 12, fontWeight: '600', color: C.dueFg, paddingTop: 14, paddingBottom: 4 }}>PART-PAID BALANCE · {groups.balance.length}</Text>
            {groups.balance.map(({ m }) => <Row key={m.id} m={m} sub={`${inr(m.balance, hide)} balance · ${m.gym_name}`} />)}
          </>
        )}
      </Card>

      <Button title={`Remind all ${pending.length}, one by one`} kind="green" onPress={remindAll}
        icon={<MaterialCommunityIcons name="whatsapp" size={18} color="#FFF" />} />
      <Muted style={{ textAlign: 'center' }}>Steps through each member in WhatsApp; marks “Sent” when you return.</Muted>
    </Screen>
  );
}
