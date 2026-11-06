import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import {
  Avatar, Button, Card, Feather, GymPicker, IconButton, Muted, Screen, WhatsAppButton,
} from '@/components/ui';
import { useApp } from '@/context/app';
import { useMembers, usePayments } from '@/hooks/useData';
import { markReminded, memberStatus, summarize } from '@/db/repo';
import { endOfMonth, startOfMonth, today, weekdayDate } from '@/lib/dates';
import { inr } from '@/lib/format';
import { openWhatsApp, reminderText } from '@/lib/whatsapp';
import { LicenseBanner } from '@/components/LicenseBanner';
import { C } from '@/theme';

export default function Dashboard() {
  const db = useSQLiteContext();
  const { gyms, gymId, setGymId, settings } = useApp();
  const { members, reload } = useMembers();
  const now = today();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const { payments } = usePayments(monthStart, monthEnd, gymId);
  const hide = settings.hide_amounts === '1';
  const dueSoonDays = Number(settings.due_soon_days || '7');

  const sum = useMemo(() => summarize(members, payments, dueSoonDays, monthEnd), [members, payments, dueSoonDays, monthEnd]);
  const toCollect = sum.pendingDues + sum.balanceTotal;
  const expected = sum.collected + toCollect;
  const pct = expected > 0 ? Math.min(100, Math.round((sum.collected / expected) * 100)) : 0;

  const byGym = useMemo(() => {
    return gyms.map((g) => ({
      gym: g,
      members: members.filter((m) => m.gym_id === g.id && memberStatus(m, dueSoonDays).kind !== 'expired').length,
      collected: payments.filter((p) => p.gym_id === g.id).reduce((a, p) => a + p.amount, 0),
    }));
  }, [gyms, members, payments, dueSoonDays]);

  const dueSoon = useMemo(
    () => members
      .map((m) => ({ m, st: memberStatus(m, dueSoonDays) }))
      .filter((x) => x.st.kind === 'duesoon' || x.st.kind === 'overdue')
      .sort((a, b) => a.st.days - b.st.days)
      .slice(0, 4),
    [members, dueSoonDays],
  );

  const goMembers = (filter: string) => router.push({ pathname: '/members', params: { filter } });

  if (gyms.length === 0) {
    return (
      <Screen>
        <Text style={{ fontSize: 24, fontWeight: '700', color: C.ink }}>Welcome to MyGym</Text>
        <Card style={{ gap: 12 }}>
          <Text style={{ fontSize: 15, color: C.ink }}>Start by adding your gyms and their plan fees. You can add more branches any time.</Text>
          <Button title="Add my gyms" onPress={() => router.push('/gyms')} />
          <Button title="Restore from a backup" kind="outline" onPress={() => router.push('/settings')} />
        </Card>
        <LicenseBanner />
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ gap: 2 }}>
            <Muted>{weekdayDate(now)}</Muted>
            <Text style={{ fontSize: 24, fontWeight: '700', color: C.ink }}>MyGym</Text>
          </View>
          <IconButton name="settings" label="Settings" onPress={() => router.push('/settings')} />
        </View>
        <LicenseBanner />
        <GymPicker gyms={gyms} value={gymId} onChange={setGymId} allowAll />

        <View style={{ backgroundColor: C.dark, borderRadius: 20, padding: 18, gap: 10 }}>
          <Text style={{ color: C.darkMuted, fontSize: 12 }}>Collected this month</Text>
          <Text style={{ color: '#FFF', fontSize: 34, fontWeight: '700' }}>{inr(sum.collected, hide)}</Text>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: '#3A3D45', overflow: 'hidden' }}>
            <View style={{ width: `${pct}%`, height: 8, backgroundColor: C.accent }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: C.darkMuted, fontSize: 12 }}>{pct}% of {inr(expected, hide)} expected</Text>
            <Text style={{ color: C.darkMuted, fontSize: 12 }}>{inr(toCollect, hide)} pending</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <View style={{ flex: 1, backgroundColor: C.dark2, borderRadius: 12, padding: 10 }}>
              <Text style={{ color: C.darkMuted, fontSize: 11 }}>GPay / UPI</Text>
              <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 15 }}>{inr(sum.gpay, hide)}</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: C.dark2, borderRadius: 12, padding: 10 }}>
              <Text style={{ color: C.darkMuted, fontSize: 11 }}>Cash</Text>
              <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 15 }}>{inr(sum.cash, hide)}</Text>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Stat label="Active members" value={String(sum.active)} onPress={() => goMembers('all')} />
          <Stat label={`Due in ${dueSoonDays} days`} value={String(sum.dueSoon)} color={C.amber} onPress={() => goMembers('duesoon')} />
          <Stat label="Overdue" value={String(sum.overdue)} color={C.red} onPress={() => goMembers('overdue')} />
          <Stat label="Expired > 30 days" value={String(sum.expired)} color={C.muted} onPress={() => goMembers('expired')} />
          <Pressable onPress={() => goMembers('balance')} style={{ width: '100%' }}>
            <Card style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ gap: 4 }}>
                <Muted>Pending balances (part-paid)</Muted>
                <Text style={{ fontSize: 22, fontWeight: '700', color: C.amber }}>{inr(sum.balanceTotal, hide)}</Text>
              </View>
              <Muted>{sum.balanceMembers} members</Muted>
            </Card>
          </Pressable>
        </View>

        {gymId === null && gyms.length > 1 && (
          <Card style={{ gap: 12 }}>
            <Text style={{ fontWeight: '600', fontSize: 14, color: C.ink }}>By gym</Text>
            {byGym.map((r) => (
              <Pressable key={r.gym.id} onPress={() => setGymId(r.gym.id)} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: C.ink }}>{r.gym.name}</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: C.ink }}>{inr(r.collected, hide)} · {r.members}</Text>
              </Pressable>
            ))}
          </Card>
        )}

        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '600', fontSize: 14, color: C.ink }}>Due soon</Text>
            <Pressable onPress={() => router.push('/reminders')}><Text style={{ color: C.brand, fontWeight: '600', fontSize: 13 }}>See all</Text></Pressable>
          </View>
          {dueSoon.length === 0 && <Muted>Nobody is due in the next {dueSoonDays} days.</Muted>}
          {dueSoon.map(({ m, st }) => (
            <Pressable key={m.id} onPress={() => router.push(`/member/${m.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Avatar name={m.name} uri={m.photo_uri} size={36} bg={C.brandSoft} fg="#9A3412" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', fontSize: 14, color: C.ink }}>{m.name}</Text>
                <Muted>{inr(m.plan_fee + m.balance, hide)} · {st.label.toLowerCase()}</Muted>
              </View>
              <WhatsAppButton compact label={`Send WhatsApp reminder to ${m.name}`} onPress={async () => {
                if (await openWhatsApp(m.phone, reminderText(settings.reminder_template, m, settings.upi_id))) {
                  await markReminded(db, m.id);
                  reload();
                }
              }} />
            </Pressable>
          ))}
        </Card>
      </Screen>
      <Pressable onPress={() => router.push('/payment/new')} accessibilityRole="button"
        style={{ position: 'absolute', right: 20, bottom: 20, height: 56, paddingHorizontal: 20, borderRadius: 28, backgroundColor: C.brand, flexDirection: 'row', alignItems: 'center', gap: 8, elevation: 6 }}>
        <Feather name="plus" size={20} color="#FFF" />
        <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 15 }}>Record payment</Text>
      </Pressable>
    </View>
  );
}

function Stat({ label, value, color = C.ink, onPress }: { label: string; value: string; color?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ width: '48.5%' }} accessibilityRole="button">
      <Card style={{ gap: 4 }}>
        <Muted>{label}</Muted>
        <Text style={{ fontSize: 26, fontWeight: '700', color }}>{value}</Text>
      </Card>
    </Pressable>
  );
}
