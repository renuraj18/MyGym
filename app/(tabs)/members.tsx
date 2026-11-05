import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, Badge, Chip, Empty, Feather, GymPicker, Muted, statusColors } from '@/components/ui';
import { useApp } from '@/context/app';
import { useMembers } from '@/hooks/useData';
import { memberStatus, PLAN_LABEL } from '@/db/repo';
import { fmtDateShortYear } from '@/lib/dates';
import { inr, normalizePhone } from '@/lib/format';
import { C } from '@/theme';

type Filter = 'all' | 'duesoon' | 'overdue' | 'balance' | 'paid' | 'expired' | 'male' | 'female';

export default function Members() {
  const params = useLocalSearchParams<{ filter?: Filter }>();
  const { gyms, gymId, setGymId, settings } = useApp();
  const { members } = useMembers();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const dueSoonDays = Number(settings.due_soon_days || '7');
  const hide = settings.hide_amounts === '1';

  useEffect(() => {
    if (params.filter) setFilter(params.filter);
  }, [params.filter]);

  const rows = useMemo(() => members.map((m) => ({ m, st: memberStatus(m, dueSoonDays) })), [members, dueSoonDays]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, duesoon: 0, overdue: 0, balance: 0, paid: 0, expired: 0, male: 0, female: 0 };
    for (const { m, st } of rows) {
      if (st.kind !== 'expired') c.all++;
      if (st.kind === 'duesoon') c.duesoon++;
      if (st.kind === 'overdue') c.overdue++;
      if (st.kind === 'expired') c.expired++;
      if (st.kind === 'paid') c.paid++;
      if (m.balance > 0) c.balance++;
      c[m.gender === 'female' ? 'female' : 'male']++;
    }
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const digits = normalizePhone(term);
    return rows
      .filter(({ m, st }) => {
        switch (filter) {
          case 'all': return st.kind !== 'expired';
          case 'balance': return m.balance > 0;
          case 'male': case 'female': return m.gender === filter;
          case 'paid': return st.kind === 'paid';
          default: return st.kind === filter;
        }
      })
      .filter(({ m }) => !term || m.name.toLowerCase().includes(term) || (digits.length >= 4 && m.phone.includes(term.replace(/\D/g, ''))))
      .sort((a, b) => {
        // Most urgent first, then by name
        const rank = (k: string) => ({ overdue: 0, duesoon: 1, new: 2, paid: 3, expired: 4 } as any)[k] ?? 5;
        return rank(a.st.kind) - rank(b.st.kind) || a.st.days - b.st.days || a.m.name.localeCompare(b.m.name);
      });
  }, [rows, filter, q]);

  const chips: { key: Filter; label: string }[] = [
    { key: 'all', label: `All ${counts.all}` },
    { key: 'duesoon', label: `Due soon ${counts.duesoon}` },
    { key: 'overdue', label: `Overdue ${counts.overdue}` },
    { key: 'balance', label: `Balance ${counts.balance}` },
    { key: 'paid', label: `Paid ${counts.paid}` },
    { key: 'expired', label: `Expired ${counts.expired}` },
    { key: 'male', label: `Men ${counts.male}` },
    { key: 'female', label: `Women ${counts.female}` },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <View style={{ padding: 20, paddingBottom: 8, gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: C.ink }}>Members</Text>
          <Muted>{counts.all} active</Muted>
        </View>
        <View style={{ height: 48, borderRadius: 14, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 }}>
          <Feather name="search" size={18} color={C.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search name or phone" placeholderTextColor="#8A8E96"
            style={{ flex: 1, fontSize: 15, color: C.ink }} accessibilityLabel="Search members" />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {chips.map((c) => <Chip key={c.key} title={c.label} active={filter === c.key} onPress={() => setFilter(c.key)} />)}
        </ScrollView>
        {gyms.length > 1 && <GymPicker gyms={gyms} value={gymId} onChange={setGymId} allowAll label="Gym" />}
      </View>

      <FlatList
        data={shown}
        keyExtractor={(x) => String(x.m.id)}
        contentContainerStyle={{ marginHorizontal: 20, backgroundColor: C.card, borderRadius: 16, paddingHorizontal: 14, paddingBottom: 4 }}
        style={{ flex: 1 }}
        ListEmptyComponent={<Empty text={members.length === 0 ? 'No members yet. Tap “Add member” to start.' : 'No members match.'} />}
        ListFooterComponent={<View style={{ height: 90 }} />}
        renderItem={({ item: { m, st } }) => {
          const [bg, fg] = statusColors(st, m.balance);
          const badge = st.kind === 'paid' && m.balance > 0 ? `Balance ${inr(m.balance, hide)}` : st.label;
          return (
            <Pressable onPress={() => router.push(`/member/${m.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line }}>
              <Avatar name={m.name} uri={m.photo_uri} bg={bg} fg={fg} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontWeight: '600', fontSize: 14, color: C.ink }}>{m.name}</Text>
                <Muted>{m.gym_name} · {PLAN_LABEL[m.plan_type]} {inr(m.plan_fee, hide)}</Muted>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Badge text={badge} bg={bg} fg={fg} />
                <Muted>{m.paid_till ? (st.kind === 'paid' ? `till ${fmtDateShortYear(m.paid_till)}` : fmtDateShortYear(st.dueDate)) : ''}</Muted>
              </View>
            </Pressable>
          );
        }}
      />

      <Pressable onPress={() => router.push('/member/new')} accessibilityRole="button"
        style={{ position: 'absolute', right: 20, bottom: 20, height: 56, paddingHorizontal: 20, borderRadius: 28, backgroundColor: C.brand, flexDirection: 'row', alignItems: 'center', gap: 8, elevation: 6 }}>
        <Feather name="plus" size={20} color="#FFF" />
        <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 15 }}>Add member</Text>
      </Pressable>
    </SafeAreaView>
  );
}
