import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { biometricsAvailable, checkPin, clearPin, unlockWithBiometrics } from '@/lib/lock';
import { useApp } from '@/context/app';
import { C } from '@/theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'];

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { updateSetting } = useApp();
  const [pin, setPin] = useState('');
  const [bio, setBio] = useState(false);
  const [error, setError] = useState('');

  const tryBio = async () => {
    if (await unlockWithBiometrics()) onUnlock();
  };

  useEffect(() => {
    (async () => {
      const ok = await biometricsAvailable();
      setBio(ok);
      if (ok) tryBio();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const press = async (k: string) => {
    setError('');
    if (k === 'bio') return tryBio();
    if (k === 'del') return setPin((p) => p.slice(0, -1));
    const next = (pin + k).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      if (await checkPin(next)) onUnlock();
      else {
        setError('Wrong PIN, try again');
        setPin('');
      }
    }
  };

  const forgot = async () => {
    const ok = await unlockWithBiometrics(true);
    if (!ok) {
      Alert.alert('Could not verify', 'Use your phone’s fingerprint or screen lock to reset the PIN.');
      return;
    }
    await clearPin();
    await updateSetting('lock_enabled', '0');
    Alert.alert('PIN removed', 'App lock is now off. Set a new PIN in Settings → Security.');
    onUnlock();
  };

  return (
    <View style={st.wrap}>
      <View style={{ alignItems: 'center', gap: 12 }}>
        <View style={st.logo}><MaterialCommunityIcons name="dumbbell" size={32} color="#FFF" /></View>
        <Text style={{ color: '#FFF', fontSize: 24, fontWeight: '700' }}>MyGym</Text>
        <Text style={{ color: C.darkMuted, fontSize: 14 }}>Enter your PIN</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 16 }} accessibilityLabel={`${pin.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[st.dot, i < pin.length && { backgroundColor: '#FFF', borderColor: '#FFF' }]} />
        ))}
      </View>
      <Text style={{ color: '#FCA5A5', minHeight: 18 }}>{error}</Text>
      <View style={st.pad}>
        {KEYS.map((k) => {
          if (k === 'bio' && !bio) return <View key={k} style={st.key} />;
          return (
            <Pressable key={k} onPress={() => press(k)} style={[st.key, (k === 'bio' || k === 'del') && { backgroundColor: 'transparent' }]}
              accessibilityRole="button" accessibilityLabel={k === 'bio' ? 'Unlock with fingerprint' : k === 'del' ? 'Delete digit' : k}>
              {k === 'bio' ? <MaterialCommunityIcons name="fingerprint" size={32} color="#FDBA8C" />
                : k === 'del' ? <Feather name="delete" size={24} color="#FFF" />
                : <Text style={{ color: '#FFF', fontSize: 26 }}>{k}</Text>}
            </Pressable>
          );
        })}
      </View>
      <Pressable onPress={forgot} style={{ padding: 12 }} accessibilityRole="button">
        <Text style={{ color: '#FDBA8C', fontWeight: '600' }}>Forgot PIN?</Text>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, backgroundColor: C.dark, alignItems: 'center', justifyContent: 'center', gap: 24, padding: 32, zIndex: 100 },
  logo: { width: 64, height: 64, borderRadius: 18, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: C.darkMuted },
  pad: { flexDirection: 'row', flexWrap: 'wrap', width: 288, gap: 16, justifyContent: 'space-between' },
  key: { width: 80, height: 64, borderRadius: 32, backgroundColor: C.dark2, alignItems: 'center', justifyContent: 'center' },
});
