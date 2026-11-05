import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { listMembers, Member, paymentsBetween, PaymentWithMember } from '@/db/repo';
import { useApp } from '@/context/app';

/** Members (filtered by the selected gym) — reloads every time the screen comes into view. */
export function useMembers() {
  const db = useSQLiteContext();
  const { gymId } = useApp();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setMembers(await listMembers(db, gymId));
    setLoading(false);
  }, [db, gymId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  return { members, loading, reload: load };
}

export function usePayments(from: string, to: string, gymId: number | null) {
  const db = useSQLiteContext();
  const [payments, setPayments] = useState<PaymentWithMember[]>([]);
  const load = useCallback(async () => {
    setPayments(await paymentsBetween(db, from, to, gymId));
  }, [db, from, to, gymId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return { payments, reload: load };
}
