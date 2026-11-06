import React, { useEffect, useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Feather, Field, IconButton, Muted, Screen, Section } from '@/components/ui';
import { useLicense } from '@/context/license';
import { deviceInfo } from '@/lib/license';
import { fmtDate } from '@/lib/dates';
import { C } from '@/theme';

const priceNumber = (p: string) => {
  const n = Number(String(p).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export default function LicenseScreen() {
  const { view, refresh, activate } = useLicense();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState<'activate' | 'refresh' | null>(null);
  const [device, setDevice] = useState<{ id: string; model: string } | null>(null);

  useEffect(() => {
    deviceInfo().then(setDevice);
    refresh();
  }, [refresh]);

  const onActivate = async () => {
    if (key.replace(/[^A-Za-z0-9]/g, '').length !== 16) {
      return Alert.alert('Check the key', 'A license key has 16 letters and numbers, like ABCD-EFGH-JKLM-NPQR.');
    }
    setBusy('activate');
    try {
      const v = await activate(key);
      setKey('');
      Alert.alert('License activated', v.license?.expires
        ? `Thank you! MyGym is licensed till ${fmtDate(v.license.expires, true)}.`
        : 'Thank you! MyGym is licensed for life on this phone.');
    } catch (e: any) {
      Alert.alert('Could not activate', e?.message ?? 'Try again.');
    } finally { setBusy(null); }
  };

  const onRefresh = async () => {
    setBusy('refresh');
    await refresh();
    setBusy(null);
  };

  if (!view) return <Screen><Muted>Loading…</Muted></Screen>;

  const lic = view.license;
  const tone = view.state === 'active' ? [C.paidBg, C.paidFg] : view.state === 'trial' ? [C.dueBg, C.dueFg] : [C.overBg, C.overFg];
  const title = view.state === 'active'
    ? (lic?.expires ? `${lic.planName} license` : 'Lifetime license')
    : view.state === 'trial' ? 'Free trial' : (lic ? 'License expired' : 'Free trial ended');
  const detail = view.state === 'active'
    ? (lic?.expires ? `Valid till ${fmtDate(lic.expires, true)} · ${view.daysLeft} ${view.daysLeft === 1 ? 'day' : 'days'} left` : 'Never expires')
    : view.state === 'trial'
      ? `${view.daysLeft} ${view.daysLeft === 1 ? 'day' : 'days'} left · ends ${fmtDate(view.trialEnds, true)}`
      : lic?.revoked ? 'This license was cancelled. Contact support.'
        : `Ended ${fmtDate(lic?.expires ?? view.trialEnds, true)}. You can still view your data and back it up.`;

  const payUpi = (planName: string, price: string) => {
    const am = priceNumber(price);
    const url = `upi://pay?pa=${encodeURIComponent(view.upi)}&pn=${encodeURIComponent('MyGym')}&cu=INR&tn=${encodeURIComponent(`MyGym ${planName} license`)}${am ? `&am=${am}` : ''}`;
    Linking.openURL(url).catch(() => Alert.alert('No UPI app found', `Pay to UPI ID ${view.upi} from any UPI app.`));
  };

  const sendScreenshot = () => {
    const text = `Hi, I have paid for MyGym. Please send my license key.\nPhone: ${device?.model ?? ''}\nDevice ID: ${device?.id ?? ''}`;
    Linking.openURL(`https://wa.me/${view.whatsapp}?text=${encodeURIComponent(text)}`);
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconButton name="chevron-left" label="Back" onPress={() => router.back()} />
        <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink }}>MyGym license</Text>
      </View>

      <View style={{ backgroundColor: tone[0], borderRadius: 16, padding: 16, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Feather name={view.state === 'active' ? 'check-circle' : view.state === 'trial' ? 'clock' : 'alert-circle'} size={20} color={tone[1]} />
          <Text style={{ fontSize: 18, fontWeight: '700', color: tone[1] }}>{title}</Text>
        </View>
        <Text style={{ fontSize: 14, color: tone[1] }}>{detail}</Text>
        {lic && <Text style={{ fontSize: 13, color: tone[1] }}>Key {lic.key.slice(0, 4)}-••••-••••-{lic.key.slice(-4)}{lic.client ? ` · ${lic.client}` : ''}</Text>}
        {!view.verified && <Text style={{ fontSize: 12, color: tone[1] }}>Connect to the internet once so the trial can be confirmed.</Text>}
      </View>

      <Section>Enter license key</Section>
      <Card style={{ gap: 12 }}>
        <Field value={key} onChangeText={(t) => setKey(t.toUpperCase())} placeholder="ABCD-EFGH-JKLM-NPQR" autoCapitalize="characters" autoCorrect={false} />
        <Button title={view.state === 'active' ? 'Add key (renew)' : 'Activate'} loading={busy === 'activate'} onPress={onActivate} />
        <Muted>One key works on one phone. A yearly key entered before your license ends adds a year on top of the time left.</Muted>
      </Card>

      {view.state !== 'active' || lic?.expires ? (
        <>
          <Section>How to get a key</Section>
          <Card style={{ gap: 14 }}>
            {view.plans.map((p) => (
              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink }}>{p.name}{p.price ? ` · ${p.price}` : ''}</Text>
                  <Muted>{p.summary}</Muted>
                </View>
                {!!view.upi && <Button title="Pay by UPI" kind="dark" style={{ height: 40 }} onPress={() => payUpi(p.name, p.price)} />}
              </View>
            ))}
            {!!view.paymentInfo && <Muted>{view.paymentInfo}</Muted>}
            {!!view.upi && <Text style={{ fontSize: 13, color: C.ink }}>UPI ID: <Text style={{ fontWeight: '700' }}>{view.upi}</Text></Text>}
            {!!view.whatsapp && (
              <Button title="Send payment screenshot on WhatsApp" kind="green" onPress={sendScreenshot}
                icon={<Feather name="message-circle" size={16} color="#FFF" />} />
            )}
            {!view.plans.length && <Muted>Connect to the internet to see plans and prices.</Muted>}
          </Card>
        </>
      ) : null}

      <Button title="Check license status" kind="outline" loading={busy === 'refresh'} onPress={onRefresh} />
      {device && <Muted style={{ textAlign: 'center' }}>{device.model} · Device ID {device.id}</Muted>}
    </Screen>
  );
}
