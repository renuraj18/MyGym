import React, { useEffect, useState } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import {
  Avatar, Button, Card, DateField, Feather, Field, GymPicker, IconButton, Label, Muted, Screen, Section, Segmented,
} from '@/components/ui';
import { useApp } from '@/context/app';
import {
  addHistoricalPayment, Gender, getMember, gymFee, PayMode, PLAN_LABEL, PLAN_MONTHS, PlanType, saveMember,
} from '@/db/repo';
import { addDays, fmtDate, periodEnd, today } from '@/lib/dates';
import { inr, normalizePhone, parseAmount } from '@/lib/format';
import { choosePhoto } from '@/lib/photos';
import { C } from '@/theme';
import { useLicense } from '@/context/license';
import { LicenseEnded } from '@/components/LicenseBanner';

const PLAN_OPTS = (['monthly', 'quarterly', 'halfyearly', 'yearly', 'custom', 'tilldate'] as PlanType[]).map((v) => ({ value: v, label: PLAN_LABEL[v] }));

function MemberForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const db = useSQLiteContext();
  const { gyms, gymId: selectedGym } = useApp();

  const [photo, setPhoto] = useState<string | null>(null);
  const [existing, setExisting] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState<Gender>('male');
  const [gymId, setGymId] = useState<number | null>(selectedGym ?? gyms[0]?.id ?? null);
  const [joined, setJoined] = useState(today());
  const [notes, setNotes] = useState('');

  const [plan, setPlan] = useState<PlanType>('monthly');
  const [customMonths, setCustomMonths] = useState('2');
  const [fee, setFee] = useState('');
  const [paidTill, setPaidTill] = useState(periodEnd(today(), 1));
  const [balance, setBalance] = useState('');
  const [lastAmount, setLastAmount] = useState('');
  const [lastDate, setLastDate] = useState(today());
  const [lastMode, setLastMode] = useState<PayMode>('gpay');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) return;
    getMember(db, Number(id)).then((m) => {
      if (!m) return;
      setPhoto(m.photo_uri); setName(m.name); setPhone(m.phone); setGender(m.gender); setGymId(m.gym_id);
      setJoined(m.joined_on); setNotes(m.notes); setPlan(m.plan_type); setCustomMonths(String(m.plan_months || 1));
      setFee(String(m.plan_fee || '')); setPaidTill(m.paid_till ?? today()); setBalance(m.balance ? String(m.balance) : '');
    });
  }, [db, editing, id]);

  const gym = gyms.find((g) => g.id === gymId);
  const months = plan === 'custom' ? Math.max(1, Number(customMonths) || 1) : PLAN_MONTHS[plan] ?? 1;

  // Fill the fee from the gym's plan fees when plan or gym changes (only if the user hasn't typed one).
  useEffect(() => {
    if (editing) return;
    const f = gymFee(gym, plan);
    if (f) setFee(String(f));
  }, [gym, plan, editing]);

  const showMembership = existing || editing;

  const save = async () => {
    if (!name.trim()) return Alert.alert('Name needed', 'Enter the member’s name.');
    if (!gymId) return Alert.alert('Gym needed', 'Add a gym in Settings first.');
    if (phone && normalizePhone(phone).length < 12) return Alert.alert('Check the number', 'Enter a 10-digit mobile number.');
    setSaving(true);
    try {
      const memberId = await saveMember(db, {
        id: editing ? Number(id) : undefined,
        gym_id: gymId, name: name.trim(), phone: normalizePhone(phone), gender, photo_uri: photo,
        joined_on: joined, notes: notes.trim(),
        plan_type: plan, plan_months: months, plan_fee: parseAmount(fee),
        paid_till: showMembership ? paidTill : null,
        balance: showMembership ? parseAmount(balance) : 0,
      });
      if (!editing && existing && parseAmount(lastAmount) > 0) {
        await addHistoricalPayment(db, {
          member_id: memberId, gym_id: gymId, paid_on: lastDate, amount: parseAmount(lastAmount), mode: lastMode,
          plan_type: plan, plan_months: months, plan_fee: parseAmount(fee), period_to: paidTill,
        });
      }
      if (editing || existing) router.replace(`/member/${memberId}`);
      else router.replace({ pathname: '/payment/new', params: { memberId: String(memberId), first: '1' } });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconButton name="x" label="Close" onPress={() => router.back()} />
        <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink }}>{editing ? 'Edit member' : 'Add member'}</Text>
      </View>

      <View style={{ alignItems: 'center', gap: 8 }}>
        <Pressable onPress={() => choosePhoto(setPhoto, photo ? () => setPhoto(null) : undefined)} accessibilityLabel="Add member photo"
          style={{ width: 112, height: 112, borderRadius: 56, borderWidth: photo ? 0 : 2, borderStyle: 'dashed', borderColor: '#B8B5AB', backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}>
          {photo ? <Avatar name={name || '?'} uri={photo} size={112} /> : (
            <>
              <Feather name="camera" size={28} color={C.muted} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: C.muted }}>Add photo</Text>
            </>
          )}
        </Pressable>
        <Muted>Optional · take a photo or pick from gallery</Muted>
      </View>

      {!editing && (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderWidth: existing ? 2 : 0, borderColor: C.green }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: C.ink }}>Existing member</Text>
            <Muted>{existing ? 'Enter their current plan — no new payment needed' : 'Already paid before using the app'}</Muted>
          </View>
          <Switch value={existing} onValueChange={setExisting} trackColor={{ true: C.green, false: C.border }} thumbColor="#FFF" />
        </Card>
      )}

      <Field label="Name" value={name} onChangeText={setName} placeholder="Full name" autoCapitalize="words" />
      <Field label="WhatsApp number" value={phone} onChangeText={setPhone} placeholder="98xxx xxxxx" keyboardType="phone-pad" />
      <View style={{ gap: 8 }}>
        <Label>Gender</Label>
        <Segmented columns={2} value={gender} onChange={setGender} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
      </View>
      <View style={{ gap: 8 }}>
        <Label>Gym</Label>
        <GymPicker gyms={gyms} value={gymId} onChange={setGymId} />
      </View>
      <DateField label={existing || editing ? 'Joined on' : 'Joining date'} value={joined} onChange={setJoined} />

      {showMembership && (
        <>
          <Section>{editing ? 'Membership (correct if needed)' : 'Current membership'}</Section>
          <Label>Plan</Label>
          <Segmented options={PLAN_OPTS} value={plan} onChange={setPlan} />
          {plan === 'custom' && <Field label="Number of months" value={customMonths} onChangeText={setCustomMonths} keyboardType="number-pad" />}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Field label="Fee (₹)" value={fee} onChangeText={setFee} keyboardType="number-pad" placeholder="0" />
            <DateField label="Paid till" value={paidTill} onChange={setPaidTill} />
          </View>
          <View style={{ backgroundColor: C.dueBg, borderRadius: 12, padding: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.dueFg }}>Next due: {fmtDate(addDays(paidTill, 1), true)}</Text>
            <Text style={{ fontSize: 12, color: C.dueFg }}>{inr(parseAmount(fee) + parseAmount(balance))}</Text>
          </View>
          <Field label="Balance pending (optional)" value={balance} onChangeText={setBalance} keyboardType="number-pad" placeholder="₹0 — amount they still owe" />

          {!editing && (
            <>
              <Section>Last payment (optional)</Section>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Field label="Amount (₹)" value={lastAmount} onChangeText={setLastAmount} keyboardType="number-pad" placeholder="0" />
                <DateField label="Paid on" value={lastDate} onChange={setLastDate} />
              </View>
              <Segmented columns={2} value={lastMode} onChange={setLastMode} options={[{ value: 'gpay', label: 'GPay / UPI' }, { value: 'cash', label: 'Cash' }]} />
              <Muted>Shows in their payment history so this month’s totals stay correct.</Muted>
            </>
          )}
        </>
      )}

      <Field label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="e.g. morning batch, PT" />

      <Button title={editing ? 'Save changes' : existing ? 'Save member' : 'Save & record first payment'} onPress={save} loading={saving} style={{ marginTop: 8, height: 56 }} />
    </Screen>
  );
}

export default function GatedMemberForm() {
  const { canEdit } = useLicense();
  return canEdit ? <MemberForm /> : <LicenseEnded what="add or edit members" />;
}
