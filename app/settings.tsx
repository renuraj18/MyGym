import React, { useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Button, Card, Chip, Feather, Field, IconButton, Muted, NavItem, Screen, Section, Toggle } from '@/components/ui';
import { useApp } from '@/context/app';
import { backupNow, connectGoogle, disconnectGoogle, restoreFromSheet, sheetUrl } from '@/lib/backup';
import { clearPin } from '@/lib/lock';
import { clearAllData, loadDemoData } from '@/lib/demo';
import { fmtDate, toISO } from '@/lib/dates';
import { C } from '@/theme';

export default function Settings() {
  const db = useSQLiteContext();
  const { settings, updateSetting, gyms, reload, setGymId } = useApp();
  const [busy, setBusy] = useState<'backup' | 'restore' | 'connect' | 'demo' | 'clear' | null>(null);
  const [upi, setUpi] = useState(settings.upi_id);
  const [prefix, setPrefix] = useState(settings.receipt_prefix);

  const connected = !!settings.google_email;
  const freq = settings.backup_freq;
  const last = settings.last_backup ? new Date(settings.last_backup) : null;
  const lastText = last ? `${fmtDate(toISO(last), true)}, ${last.toTimeString().slice(0, 5)}` : 'Never';

  const connect = async () => {
    setBusy('connect');
    try {
      const email = await connectGoogle();
      if (email) await updateSetting('google_email', email);
    } catch (e: any) {
      Alert.alert('Could not connect', e?.message ?? 'Try again.');
    } finally { setBusy(null); }
  };

  const disconnect = () => Alert.alert('Disconnect Google?', 'Backups stop until you connect again. The sheet stays in your Google Drive.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Disconnect', style: 'destructive', onPress: async () => { await disconnectGoogle(); await updateSetting('google_email', ''); } },
  ]);

  const runBackup = async () => {
    setBusy('backup');
    try {
      const r = await backupNow(db);
      await reload();
      Alert.alert('Backup done', `${r.members} members and ${r.payments} payments saved to “MyGym Backup”.`);
    } catch (e: any) {
      Alert.alert('Backup failed', e?.message ?? 'Check your internet and try again.');
    } finally { setBusy(null); }
  };

  const runRestore = () => Alert.alert('Restore from Google Sheets?', 'Everything on this phone will be replaced with the data in your backup sheet.', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Restore', style: 'destructive', onPress: async () => {
        setBusy('restore');
        try {
          const r = await restoreFromSheet(db);
          await reload();
          Alert.alert('Restored', `${r.members} members and ${r.payments} payments restored.`);
        } catch (e: any) {
          Alert.alert('Restore failed', e?.message ?? 'Try again.');
        } finally { setBusy(null); }
      },
    },
  ]);

  const runDemo = () => Alert.alert('Load demo data?', 'Replaces everything on this phone with 3 sample gyms, 300 members and their payments. Use this only for testing.', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Load demo data', style: 'destructive', onPress: async () => {
        setBusy('demo');
        try {
          const r = await loadDemoData(db);
          setGymId(null);
          await reload();
          Alert.alert('Demo data loaded', `${r.gyms} gyms, ${r.members} members and ${r.payments} payments added.`);
        } catch (e: any) {
          Alert.alert('Could not load demo data', e?.message ?? 'Try again.');
        } finally { setBusy(null); }
      },
    },
  ]);

  const runClear = () => Alert.alert('Delete all data?', 'Removes every gym, member and payment from this phone. Your settings and Google backup sheet are kept. This cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Delete everything', style: 'destructive', onPress: async () => {
        setBusy('clear');
        try {
          await clearAllData(db);
          setGymId(null);
          await reload();
          Alert.alert('All data deleted', 'You can now add your real gyms and members.');
        } catch (e: any) {
          Alert.alert('Could not delete', e?.message ?? 'Try again.');
        } finally { setBusy(null); }
      },
    },
  ]);

  const toggleLock = async (on: boolean) => {
    if (on) router.push('/pin');
    else {
      await clearPin();
      await updateSetting('lock_enabled', '0');
    }
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconButton name="chevron-left" label="Back" onPress={() => router.back()} />
        <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink }}>Settings</Text>
      </View>

      <Section>Backup to Google Sheets</Section>
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: C.paidBg, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="grid" size={22} color={C.paidFg} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600', fontSize: 14, color: C.ink }}>{connected ? 'Connected' : 'Not connected'}</Text>
            <Muted>{connected ? settings.google_email : 'Connect your Google account to back up'}</Muted>
          </View>
          {connected
            ? <Button title="Disconnect" kind="outline" style={{ height: 36 }} onPress={disconnect} />
            : <Button title="Connect" kind="dark" style={{ height: 40 }} loading={busy === 'connect'} onPress={connect} />}
        </View>
        {connected && (
          <>
            <View style={{ backgroundColor: C.bg, borderRadius: 12, padding: 12, gap: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.ink }}>Sheet: “MyGym Backup”</Text>
              <Muted>Tabs: Gyms · Members · Payments · Settings</Muted>
              <Muted style={{ color: last ? C.paidFg : C.muted, fontWeight: '600' }}>Last backup: {lastText}</Muted>
            </View>
            <Toggle label="Auto backup" sub="Runs when the phone has internet" value={freq !== 'off'}
              onChange={(v) => updateSetting('backup_freq', v ? 'daily' : 'off')} />
            {freq !== 'off' && (
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Chip title="Daily" active={freq === 'daily'} onPress={() => updateSetting('backup_freq', 'daily')} />
                <Chip title="After every payment" active={freq === 'payment'} onPress={() => updateSetting('backup_freq', 'payment')} />
                <Chip title="Weekly" active={freq === 'weekly'} onPress={() => updateSetting('backup_freq', 'weekly')} />
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Backup now" kind="green" style={{ flex: 1, height: 48 }} loading={busy === 'backup'} onPress={runBackup}
                icon={<Feather name="upload" size={16} color="#FFF" />} />
              <Button title="Restore" kind="outline" style={{ flex: 1, height: 48 }} loading={busy === 'restore'} onPress={runRestore}
                icon={<Feather name="download" size={16} color={C.ink} />} />
            </View>
            {!!settings.backup_sheet_id && (
              <Text onPress={() => Linking.openURL(sheetUrl(settings.backup_sheet_id))} style={{ color: C.brand, fontWeight: '600', fontSize: 13 }}>
                Open sheet in Google Sheets
              </Text>
            )}
          </>
        )}
        <Muted>Member photos stay on this phone; they are not copied to the sheet.</Muted>
      </Card>

      <Section>Security</Section>
      <Card style={{ paddingVertical: 4 }}>
        <Toggle label="App lock" sub="4-digit PIN + fingerprint" value={settings.lock_enabled === '1'} onChange={toggleLock} />
        {settings.lock_enabled === '1' && <NavItem label="Change PIN" sub="Locks after 1 minute in the background" onPress={() => router.push('/pin')} />}
        <Toggle label="Hide amounts" sub="Shows ₹ •••• everywhere — useful at the front desk" value={settings.hide_amounts === '1'}
          onChange={(v) => updateSetting('hide_amounts', v ? '1' : '0')} />
      </Card>

      <Section>Gyms & plans</Section>
      <Card style={{ paddingVertical: 4 }}>
        <NavItem label="My gyms & plan fees" sub={`${gyms.length} ${gyms.length === 1 ? 'branch' : 'branches'} · Monthly, Quarterly, Half-yearly, Yearly`} onPress={() => router.push('/gyms')} last />
      </Card>

      <Section>Payments & reminders</Section>
      <Card style={{ gap: 12 }}>
        <Field label="Your UPI ID (shown in reminders)" value={upi} onChangeText={setUpi} onBlur={() => updateSetting('upi_id', upi.trim())}
          placeholder="yourname@okaxis" autoCapitalize="none" />
        <Field label="Receipt number prefix" value={prefix} onChangeText={setPrefix} onBlur={() => updateSetting('receipt_prefix', prefix.trim() || 'MG-')}
          autoCapitalize="characters" />
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: C.ink }}>Show as “due soon” within</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {['3', '5', '7', '10'].map((d) => (
              <Chip key={d} title={`${d} days`} active={settings.due_soon_days === d} onPress={() => updateSetting('due_soon_days', d)} />
            ))}
          </View>
        </View>
        <NavItem label="WhatsApp message templates" sub="Reminder and receipt" onPress={() => router.push('/templates')} last />
      </Card>

      <Section>Testing</Section>
      <Card style={{ gap: 12 }}>
        <Muted>Fill the app with 3 sample gyms and 100 members each, with random plans, payments, balances and due dates, to try out Reports and Reminders.</Muted>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="Load demo data" kind="dark" style={{ flex: 1, height: 48 }} loading={busy === 'demo'} onPress={runDemo} />
          <Button title="Delete all data" kind="danger" style={{ flex: 1, height: 48 }} loading={busy === 'clear'} onPress={runClear} />
        </View>
      </Card>

      <Muted style={{ textAlign: 'center', marginTop: 8 }}>MyGym 1.0 · data is stored on this phone</Muted>
    </Screen>
  );
}
