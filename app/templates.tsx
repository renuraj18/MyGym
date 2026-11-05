import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, IconButton, Label, Muted, Screen } from '@/components/ui';
import { useApp } from '@/context/app';
import { DEFAULT_RECEIPT, DEFAULT_REMINDER } from '@/db/repo';
import { C } from '@/theme';

export default function Templates() {
  const { settings, updateSetting } = useApp();
  const [reminder, setReminder] = useState(settings.reminder_template);
  const [receipt, setReceipt] = useState(settings.receipt_template);

  const save = async () => {
    await updateSetting('reminder_template', reminder.trim() || DEFAULT_REMINDER);
    await updateSetting('receipt_template', receipt.trim() || DEFAULT_RECEIPT);
    router.back();
  };

  const box = { minHeight: 140, borderRadius: 14, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 14, fontSize: 14, color: C.ink, textAlignVertical: 'top' as const };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconButton name="chevron-left" label="Back" onPress={() => router.back()} />
        <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink }}>WhatsApp messages</Text>
      </View>

      <Label>Payment reminder</Label>
      <TextInput multiline value={reminder} onChangeText={setReminder} style={box} accessibilityLabel="Reminder message" />
      <Muted>Words in braces are filled in: {'{name} {gym} {amount} {fee} {plan} {due_date} {balance} {balance_line} {upi_id}'}</Muted>
      <Button title="Reset to default" kind="outline" style={{ height: 40 }} onPress={() => setReminder(DEFAULT_REMINDER)} />

      <Label>Payment receipt</Label>
      <TextInput multiline value={receipt} onChangeText={setReceipt} style={box} accessibilityLabel="Receipt message" />
      <Muted>{'{name} {gym} {amount} {mode} {date} {receipt_no} {valid_till} {balance_line}'}</Muted>
      <Button title="Reset to default" kind="outline" style={{ height: 40 }} onPress={() => setReceipt(DEFAULT_RECEIPT)} />

      <Card style={{ backgroundColor: C.dueBg }}>
        <Text style={{ fontSize: 12, color: C.dueFg }}>{'{balance_line}'} only appears for members who owe a balance, so the same message works for everyone.</Text>
      </Card>
      <Button title="Save messages" onPress={save} style={{ height: 56 }} />
    </Screen>
  );
}
