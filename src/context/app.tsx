import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { Gym, getSettings, listGyms, setSetting, SETTING_DEFAULTS } from '@/db/repo';

type AppState = {
  ready: boolean;
  gyms: Gym[];
  settings: Record<string, string>;
  /** null = all gyms */
  gymId: number | null;
  setGymId: (id: number | null) => void;
  reload: () => Promise<void>;
  updateSetting: (key: string, value: string) => Promise<void>;
};

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const [ready, setReady] = useState(false);
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>(SETTING_DEFAULTS);
  const [gymId, setGymId] = useState<number | null>(null);

  const reload = useCallback(async () => {
    const [g, s] = await Promise.all([listGyms(db), getSettings(db)]);
    setGyms(g);
    setSettings(s);
    setReady(true);
  }, [db]);

  useEffect(() => {
    reload();
  }, [reload]);

  const updateSetting = useCallback(
    async (key: string, value: string) => {
      await setSetting(db, key, value);
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [db],
  );

  return (
    <Ctx.Provider value={{ ready, gyms, settings, gymId, setGymId, reload, updateSetting }}>
      {children}
    </Ctx.Provider>
  );
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
