import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { router } from 'expo-router';
import { activateLicense, currentLicense, lastCheckedOver, LicenseView, refreshLicense } from '@/lib/license';

type LicenseState = {
  view: LicenseView | null;
  /** True during the trial and with a valid license. */
  canEdit: boolean;
  refresh: () => Promise<void>;
  activate: (key: string) => Promise<LicenseView>;
  /** Call before any change; shows the renew prompt and returns false when the license has ended. */
  requireEdit: () => boolean;
};

const Ctx = createContext<LicenseState | null>(null);
const RECHECK_MS = 6 * 3600_000;

export function LicenseProvider({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState<LicenseView | null>(null);

  const refresh = useCallback(async () => {
    try {
      setView(await refreshLicense());
    } catch {
      setView(await currentLicense()); // offline: keep using the last known state
    }
  }, []);

  useEffect(() => {
    (async () => {
      const v = await currentLicense();
      setView(v);
      if (lastCheckedOver(v, RECHECK_MS)) refresh();
    })();
    const sub = AppState.addEventListener('change', async (s) => {
      if (s !== 'active') return;
      const v = await currentLicense();
      setView(v);
      if (lastCheckedOver(v, RECHECK_MS)) refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const activate = useCallback(async (key: string) => {
    const v = await activateLicense(key);
    setView(v);
    return v;
  }, []);

  const canEdit = !view || view.state !== 'expired';

  const requireEdit = useCallback(() => {
    if (!view || view.state !== 'expired') return true;
    Alert.alert(
      view.license ? 'License expired' : 'Free trial ended',
      'You can still view members, reports and back up your data. To add members or record payments, renew your MyGym license.',
      [{ text: 'Not now', style: 'cancel' }, { text: 'Renew', onPress: () => router.push('/license') }],
    );
    return false;
  }, [view]);

  return <Ctx.Provider value={{ view, canEdit, refresh, activate, requireEdit }}>{children}</Ctx.Provider>;
}

export function useLicense(): LicenseState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLicense must be used inside LicenseProvider');
  return v;
}
