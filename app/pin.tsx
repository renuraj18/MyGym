import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useApp } from '@/context/app';
import { savePin } from '@/lib/lock';
import { IconButton, Screen } from '@/components/ui';
import { C } from '@/theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

export default function SetPin() {
  const { updateSetting } = useApp();
  const [first, setFirst] = useState<string | null>(null);
  const [pin, setPin] = useState('');

  const press = async (k: string) => {
    if (!k) return;
    if (k === 'del') return setPin((p) => p.slice(0, -1));
    const next = (pin + k).slice(0, 4);
    setPin(next);
    if (next.length < 4) return;
    if (first === null) {
      setFirst(next);
      setPin('');
    } else if (first === next) {
      await savePin(next);
      await updateSetting('lock_enabled', '1');
      Alert.alert('App lock on', 'MyGym will ask for this PIN or your fingerprint.');
      router.back();
    } else {
      Alert.alert('PINs did not match', 'Try again.');
      setFirst(null);
      setPin('');
    }
  };

  return (
    <Screen scroll={false}>
      <IconButton name="x" label="Cancel" onPress={() => router.back()} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: C.ink }}>{first === null ? 'Choose a 4-digit PIN' : 'Enter the PIN again'}</Text>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: C.ink, backgroundColor: i < pin.length ? C.ink : 'transparent' }} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 288, gap: 16, justifyContent: 'space-between' }}>
          {KEYS.map((k, i) => (
            <Pressable key={i} onPress={() => press(k)} disabled={!k} accessibilityLabel={k === 'del' ? 'Delete digit' : k || undefined}
              style={{ width: 80, height: 64, borderRadius: 32, backgroundColor: k && k !== 'del' ? C.card : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {k === 'del' ? <Feather name="delete" size={22} color={C.ink} /> : <Text style={{ fontSize: 26, color: C.ink }}>{k}</Text>}
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}
