import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@/components/ui';
import { useLicense } from '@/context/license';
import { C } from '@/theme';

/** Trial / renewal reminder on the Home screen. Hidden while a license has more than 15 days left. */
export function LicenseBanner() {
  const { view } = useLicense();
  if (!view) return null;
  if (view.state === 'active' && (view.daysLeft === null || view.daysLeft > 15)) return null;

  const days = view.daysLeft ?? 0;
  const dayText = `${days} ${days === 1 ? 'day' : 'days'}`;
  const [bg, fg, icon, text, action] =
    view.state === 'expired'
      ? [C.overBg, C.overFg, 'alert-circle', view.license ? 'License expired · view and backup only' : 'Free trial ended · view and backup only', 'Renew']
      : view.state === 'trial'
        ? [C.dueBg, C.dueFg, 'clock', `Free trial · ${dayText} left`, 'Buy license']
        : [C.dueBg, C.dueFg, 'clock', `License ends in ${dayText}`, 'Renew'];

  return (
    <Pressable onPress={() => router.push('/license')} accessibilityRole="button"
      style={{ backgroundColor: bg, borderRadius: 14, paddingHorizontal: 14, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Feather name={icon as any} size={18} color={fg} />
      <Text style={{ flex: 1, color: fg, fontSize: 13, fontWeight: '600' }}>{text}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <Text style={{ color: fg, fontSize: 13, fontWeight: '700' }}>{action}</Text>
        <Feather name="chevron-right" size={16} color={fg} />
      </View>
    </Pressable>
  );
}

/** Shown instead of an editing screen once the trial or license has ended. */
export function LicenseEnded({ what }: { what: string }) {
  const { view } = useLicense();
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: 24, justifyContent: 'center', gap: 14 }}>
      <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: C.overBg, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name="lock" size={26} color={C.overFg} />
      </View>
      <Text style={{ fontSize: 22, fontWeight: '700', color: C.ink }}>{view?.license ? 'Your license has expired' : 'Your free trial has ended'}</Text>
      <Text style={{ fontSize: 15, color: C.muted }}>To {what}, renew your MyGym license. Your members, reports and backups are still available.</Text>
      <Pressable onPress={() => router.replace('/license')} accessibilityRole="button"
        style={{ height: 52, borderRadius: 14, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 16 }}>Renew license</Text>
      </Pressable>
      <Pressable onPress={() => router.back()} accessibilityRole="button" style={{ height: 48, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: C.ink, fontWeight: '600' }}>Go back</Text>
      </Pressable>
    </View>
  );
}
