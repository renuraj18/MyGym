import React, { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { migrate } from '@/db/schema';
import { AppProvider, useApp } from '@/context/app';
import { LockScreen } from '@/components/LockScreen';
import { hasPin } from '@/lib/lock';
import { maybeAutoBackup } from '@/lib/backup';
import { C } from '@/theme';

function Gate({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const { ready, settings } = useApp();
  const [locked, setLocked] = useState<boolean | null>(null);
  const backgroundAt = useRef<number | null>(null);
  const lockOn = settings.lock_enabled === '1';
  const timeout = Number(settings.lock_timeout_sec || '60') * 1000;

  useEffect(() => {
    if (!ready) return;
    (async () => setLocked(lockOn && (await hasPin())))();
    maybeAutoBackup(db, 'open');
    // Only on first ready: later toggles of the lock setting shouldn't lock the screen immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'background') backgroundAt.current = Date.now();
      if (state === 'active') {
        const away = backgroundAt.current ? Date.now() - backgroundAt.current : 0;
        backgroundAt.current = null;
        if (lockOn && away > timeout && (await hasPin())) setLocked(true);
        if (away > 0) maybeAutoBackup(db, 'open');
      }
    });
    return () => sub.remove();
  }, [db, lockOn, timeout]);

  if (!ready || locked === null) return null;
  return (
    <>
      {children}
      {locked && <LockScreen onUnlock={() => setLocked(false)} />}
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName="mygym.db" onInit={migrate}>
        <AppProvider>
          <StatusBar style="dark" />
          <Gate>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: C.bg },
                animation: 'slide_from_right',
              }}
            />
          </Gate>
        </AppProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}
