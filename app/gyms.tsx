import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Button, Card, Feather, Field, IconButton, Muted, Screen } from '@/components/ui';
import { useApp } from '@/context/app';
import { deleteGym, Gym, saveGym } from '@/db/repo';
import { inr, parseAmount } from '@/lib/format';
import { C } from '@/theme';
import { useLicense } from '@/context/license';

type Draft = { id?: number; name: string; m: string; q: string; h: string; y: string };
const empty: Draft = { name: '', m: '', q: '', h: '', y: '' };
const toDraft = (g: Gym): Draft => ({ id: g.id, name: g.name, m: String(g.fee_monthly || ''), q: String(g.fee_quarterly || ''), h: String(g.fee_halfyearly || ''), y: String(g.fee_yearly || '') });

export default function Gyms() {
  const db = useSQLiteContext();
  const { gyms, reload } = useApp();
  const { requireEdit } = useLicense();
  const [draft, setDraft] = useState<Draft | null>(gyms.length === 0 ? { ...empty } : null);

  const save = async () => {
    if (!requireEdit()) return;
    if (!draft?.name.trim()) return Alert.alert('Name needed', 'Enter the gym or branch name.');
    await saveGym(db, {
      id: draft.id, name: draft.name.trim(),
      fee_monthly: parseAmount(draft.m), fee_quarterly: parseAmount(draft.q),
      fee_halfyearly: parseAmount(draft.h), fee_yearly: parseAmount(draft.y),
    });
    await reload();
    setDraft(null);
  };

  const remove = (g: Gym) => requireEdit() && Alert.alert(`Delete ${g.name}?`, undefined, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Delete', style: 'destructive', onPress: async () => {
        if (!(await deleteGym(db, g.id))) Alert.alert('Gym has members', 'Move or remove its members first.');
        else { await reload(); setDraft(null); }
      },
    },
  ]);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconButton name="chevron-left" label="Back" onPress={() => router.back()} />
        <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink }}>My gyms & fees</Text>
      </View>

      {gyms.map((g) => (
        <Pressable key={g.id} onPress={() => setDraft(toDraft(g))}>
          <Card style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '600', fontSize: 15, color: C.ink }}>{g.name}</Text>
              <Feather name="edit-2" size={16} color={C.muted} />
            </View>
            <Muted>Monthly {inr(g.fee_monthly)} · Quarterly {inr(g.fee_quarterly)}</Muted>
            <Muted>Half-yearly {inr(g.fee_halfyearly)} · Yearly {inr(g.fee_yearly)}</Muted>
          </Card>
        </Pressable>
      ))}

      {draft ? (
        <Card style={{ gap: 12 }}>
          <Text style={{ fontWeight: '600', fontSize: 15, color: C.ink }}>{draft.id ? 'Edit gym' : 'New gym'}</Text>
          <Field label="Gym / branch name" value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} placeholder="e.g. Thillai Nagar" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Field label="Monthly ₹" value={draft.m} onChangeText={(v) => setDraft({ ...draft, m: v })} keyboardType="number-pad" />
            <Field label="Quarterly ₹" value={draft.q} onChangeText={(v) => setDraft({ ...draft, q: v })} keyboardType="number-pad" />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Field label="Half-yearly ₹" value={draft.h} onChangeText={(v) => setDraft({ ...draft, h: v })} keyboardType="number-pad" />
            <Field label="Yearly ₹" value={draft.y} onChangeText={(v) => setDraft({ ...draft, y: v })} keyboardType="number-pad" />
          </View>
          <Muted>These fill in automatically when you record a payment; you can still change the amount each time.</Muted>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {gyms.length > 0 && <Button title="Cancel" kind="outline" style={{ flex: 1 }} onPress={() => setDraft(null)} />}
            <Button title="Save gym" style={{ flex: 1 }} onPress={save} />
          </View>
          {draft.id && <Button title="Delete gym" kind="danger" onPress={() => remove(gyms.find((g) => g.id === draft.id)!)} />}
        </Card>
      ) : (
        <Button title="Add another gym" kind="outline" icon={<Feather name="plus" size={16} color={C.ink} />} onPress={() => setDraft({ ...empty })} />
      )}
    </Screen>
  );
}
