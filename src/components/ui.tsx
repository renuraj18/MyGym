import React, { useState } from 'react';
import {
  ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, StyleProp, StyleSheet, Switch, Text,
  TextInput, TextInputProps, View, ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { C } from '@/theme';
import { fmtDate, fromISO, toISO } from '@/lib/dates';
import { initials } from '@/lib/format';
import type { Gym, MemberStatus } from '@/db/repo';

export { Feather, MaterialCommunityIcons };

export function Screen({
  children, scroll = true, padded = true, footer,
}: { children: React.ReactNode; scroll?: boolean; padded?: boolean; footer?: React.ReactNode }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[padded && { padding: 20, paddingBottom: 120 }, { gap: 12 }]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, padded && { padding: 20 }]}>{children}</View>
      )}
      {footer}
    </SafeAreaView>
  );
}

export function Title({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={s.title}>{children}</Text>
      {right}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Muted({ children, style }: { children: React.ReactNode; style?: any }) {
  return <Text style={[s.muted, style]}>{children}</Text>;
}

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={s.label}>{children}</Text>;
}

export function Section({ children }: { children: React.ReactNode }) {
  return <Text style={s.section}>{children}</Text>;
}

type BtnKind = 'primary' | 'dark' | 'green' | 'outline' | 'danger';
export function Button({
  title, onPress, kind = 'primary', icon, disabled, loading, style,
}: {
  title: string; onPress?: () => void; kind?: BtnKind; icon?: React.ReactNode; disabled?: boolean;
  loading?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const bg = { primary: C.brand, dark: C.ink, green: C.green, outline: C.card, danger: C.card }[kind];
  const fg = kind === 'outline' ? C.ink : kind === 'danger' ? C.red : '#FFFFFF';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        (kind === 'outline' || kind === 'danger') && { borderWidth: 1, borderColor: C.border },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon}
      <Text style={[s.btnText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({
  name, onPress, label, bg = C.card, color = C.ink, size = 20,
}: { name: keyof typeof Feather.glyphMap; onPress?: () => void; label: string; bg?: string; color?: string; size?: number }) {
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={[s.iconBtn, { backgroundColor: bg }]}>
      <Feather name={name} size={size} color={color} />
    </Pressable>
  );
}

export function WhatsAppButton({ onPress, label, compact }: { onPress: () => void; label: string; compact?: boolean }) {
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress}
      style={[s.wa, compact && { paddingHorizontal: 0, width: 44, justifyContent: 'center' }]}>
      <MaterialCommunityIcons name="whatsapp" size={20} color={C.green} />
      {!compact && <Text style={{ color: C.green, fontWeight: '600', fontSize: 13 }}>Remind</Text>}
    </Pressable>
  );
}

export function Chip({ title, active, onPress }: { title: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!active }}
      style={[s.chip, active && { backgroundColor: C.ink, borderColor: C.ink }]}>
      <Text style={{ fontSize: 13, fontWeight: '500', color: active ? '#FFF' : C.ink }}>{title}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options, value, onChange, columns = 3, sub,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; columns?: number; sub?: Partial<Record<T, string>> }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={[s.seg, { width: `${100 / columns - 3}%` as any }, on && { backgroundColor: C.ink, borderColor: C.ink }]}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: on ? '#FFF' : C.ink }}>{o.label}</Text>
            {sub?.[o.value] ? <Text style={{ fontSize: 11, color: on ? C.darkMuted : C.muted }}>{sub[o.value]}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field({ label, style, ...props }: TextInputProps & { label?: string }) {
  return (
    <View style={{ gap: 8, flex: 1 }}>
      {label ? <Label>{label}</Label> : null}
      <TextInput placeholderTextColor="#8A8E96" style={[s.field, style]} {...props} />
    </View>
  );
}

export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 8, flex: 1 }}>
      <Label>{label}</Label>
      <Pressable onPress={() => setOpen(true)} style={[s.field, { justifyContent: 'center' }]} accessibilityRole="button">
        <Text style={{ fontSize: 15, color: C.ink }}>{fmtDate(value, true)}</Text>
      </Pressable>
      {open && (
        <DateTimePicker
          value={fromISO(value)}
          mode="date"
          display={Platform.OS === 'android' ? 'default' : 'inline'}
          onChange={(e, d) => {
            setOpen(false);
            if (e.type === 'set' && d) onChange(toISO(d));
          }}
        />
      )}
    </View>
  );
}

export function Toggle({ label, sub, value, onChange }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={s.item}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 14, color: C.ink }}>{label}</Text>
        {sub ? <Muted>{sub}</Muted> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: C.green, false: C.border }} thumbColor="#FFF" />
    </View>
  );
}

export function NavItem({ label, sub, onPress, last }: { label: string; sub?: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[s.item, last && { borderBottomWidth: 0 }]} accessibilityRole="button">
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 14, color: C.ink }}>{label}</Text>
        {sub ? <Muted>{sub}</Muted> : null}
      </View>
      <Feather name="chevron-right" size={18} color={C.muted} />
    </Pressable>
  );
}

const STATUS_COLORS: Record<string, [string, string]> = {
  paid: [C.paidBg, C.paidFg],
  new: ['#ECEAE3', C.ink],
  duesoon: [C.dueBg, C.dueFg],
  overdue: [C.overBg, C.overFg],
  expired: ['#ECEAE3', C.muted],
  balance: [C.dueBg, C.dueFg],
};

export function statusColors(st: MemberStatus, balance = 0): [string, string] {
  if (st.kind === 'paid' && balance > 0) return STATUS_COLORS.balance;
  return STATUS_COLORS[st.kind];
}

export function Badge({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ color: fg, fontSize: 11, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

export function Avatar({ name, uri, size = 40, bg = '#ECEAE3', fg = C.ink }: { name: string; uri?: string | null; size?: number; bg?: string; fg?: string }) {
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.border }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: fg, fontWeight: '700', fontSize: size * 0.33 }}>{initials(name)}</Text>
    </View>
  );
}

export function GymPicker({
  gyms, value, onChange, allowAll, label,
}: { gyms: Gym[]; value: number | null; onChange: (id: number | null) => void; allowAll?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  const current = value ? gyms.find((g) => g.id === value)?.name ?? 'Select gym' : allowAll ? `All gyms (${gyms.length})` : 'Select gym';
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={s.picker} accessibilityRole="button" accessibilityLabel={label ?? 'Choose gym'}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: C.ink }}>{label ? `${label}: ` : ''}{current}</Text>
        <Feather name="chevron-down" size={16} color={C.ink} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <View style={s.sheet}>
            {allowAll && (
              <Pressable style={s.sheetItem} onPress={() => { onChange(null); setOpen(false); }}>
                <Text style={[s.sheetText, value === null && { color: C.brand }]}>All gyms</Text>
              </Pressable>
            )}
            {gyms.map((g) => (
              <Pressable key={g.id} style={s.sheetItem} onPress={() => { onChange(g.id); setOpen(false); }}>
                <Text style={[s.sheetText, value === g.id && { color: C.brand }]}>{g.name}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <View style={{ padding: 24, alignItems: 'center' }}>
      <Text style={{ color: C.muted, textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

export const s = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '700', color: C.ink },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16 },
  muted: { fontSize: 12, color: C.muted },
  label: { fontSize: 13, fontWeight: '600', color: C.ink },
  section: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', color: C.muted, marginTop: 6 },
  btn: { height: 52, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  btnText: { fontSize: 15, fontWeight: '600' },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  wa: { height: 40, minWidth: 44, paddingHorizontal: 12, borderRadius: 20, backgroundColor: C.greenSoft, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, justifyContent: 'center' },
  seg: { minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  field: { height: 52, borderRadius: 14, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, fontSize: 15, color: C.ink },
  item: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 8 },
  picker: { height: 44, borderRadius: 22, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, gap: 8, alignSelf: 'stretch' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingVertical: 8, paddingBottom: 32 },
  sheetItem: { paddingHorizontal: 24, paddingVertical: 16 },
  sheetText: { fontSize: 16, fontWeight: '500', color: C.ink },
});
