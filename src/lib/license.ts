import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import { addDays, daysBetween, today } from '@/lib/dates';
import { savePlans } from '@/lib/plans';

/**
 * Licensing: every phone gets a 7-day trial the first time it opens the app (tracked by the license
 * server, so reinstalling doesn't restart it). After that a Yearly or Lifetime key is needed to add
 * members or record payments; viewing, reports and backup always keep working.
 *
 * The last answer from the server is cached in secure storage so the app works offline. It is kept out
 * of the SQLite database so backups and restores never copy or overwrite it.
 */

const TRIAL_DAYS = 7;
const CACHE_KEY = 'mygym_license_v1';
const FIRST_OPEN_KEY = 'mygym_first_open';

export type { Plan } from '@/lib/plans';
import type { Plan } from '@/lib/plans';
export type LicenseInfo = { key: string; plan: 'yearly' | 'lifetime'; planName: string; expires: string | null; client: string; revoked: boolean };

type ServerStatus = {
  status: 'trial' | 'active' | 'expired';
  today: string;
  trialEnds: string;
  license: LicenseInfo | null;
  plans: Plan[];
  paymentInfo: string;
  upi?: string;
  whatsapp?: string;
};

type Cache = ServerStatus & { checkedAt: number };

export type LicenseView = {
  state: 'trial' | 'active' | 'expired';
  /** Days left in the trial or yearly license, counting today; null for lifetime. */
  daysLeft: number | null;
  trialEnds: string;
  license: LicenseInfo | null;
  plans: Plan[];
  paymentInfo: string;
  upi: string;
  whatsapp: string;
  /** False until the license server has answered at least once. */
  verified: boolean;
  checkedAt: number | null;
};

const apiUrl = () => String((Constants.expoConfig?.extra as any)?.licenseApiUrl ?? '').replace(/\/$/, '');

async function deviceId(): Promise<string> {
  const id = Platform.OS === 'android' ? Application.getAndroidId() : await Application.getIosIdForVendorAsync();
  if (id) return id;
  // Fallback: a random id kept in secure storage.
  let stored = await SecureStore.getItemAsync('mygym_device_id');
  if (!stored) {
    stored = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    await SecureStore.setItemAsync('mygym_device_id', stored);
  }
  return stored;
}

function deviceModel(): string {
  const c: any = Platform.constants ?? {};
  return [c.Brand, c.Model].filter(Boolean).join(' ') || Platform.OS;
}

async function readCache(): Promise<Cache | null> {
  try {
    const raw = await SecureStore.getItemAsync(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Cache) : null;
  } catch {
    return null;
  }
}

async function writeCache(s: ServerStatus) {
  await savePlans(s);
  await SecureStore.setItemAsync(CACHE_KEY, JSON.stringify({ ...s, checkedAt: Date.now() }));
}

async function firstOpen(): Promise<string> {
  let d = await SecureStore.getItemAsync(FIRST_OPEN_KEY);
  if (!d) {
    d = today();
    await SecureStore.setItemAsync(FIRST_OPEN_KEY, d);
  }
  return d;
}

/** Works out the state from the cached server answer using today's date, so it stays correct offline. */
export async function currentLicense(): Promise<LicenseView> {
  const cache = await readCache();
  // Never trust a phone date earlier than the last date the server told us (stops winding the clock back).
  const now = cache && cache.today > today() ? cache.today : today();

  if (!cache) {
    const trialEnds = addDays(await firstOpen(), TRIAL_DAYS - 1);
    const left = daysBetween(now, trialEnds) + 1;
    return {
      state: left > 0 ? 'trial' : 'expired', daysLeft: Math.max(0, left), trialEnds, license: null,
      plans: [], paymentInfo: '', upi: '', whatsapp: '', verified: false, checkedAt: null,
    };
  }

  const lic = cache.license;
  const licValid = !!lic && !lic.revoked && (lic.expires === null || lic.expires >= now);
  if (licValid) {
    return {
      state: 'active', daysLeft: lic!.expires === null ? null : daysBetween(now, lic!.expires) + 1, trialEnds: cache.trialEnds,
      license: lic, plans: cache.plans, paymentInfo: cache.paymentInfo, upi: cache.upi ?? '', whatsapp: cache.whatsapp ?? '', verified: true, checkedAt: cache.checkedAt,
    };
  }
  const trialLeft = daysBetween(now, cache.trialEnds) + 1;
  return {
    state: trialLeft > 0 ? 'trial' : 'expired', daysLeft: Math.max(0, trialLeft), trialEnds: cache.trialEnds,
    license: lic, plans: cache.plans, paymentInfo: cache.paymentInfo, upi: cache.upi ?? '', whatsapp: cache.whatsapp ?? '', verified: true, checkedAt: cache.checkedAt,
  };
}

async function post(path: string, body: Record<string, unknown>): Promise<ServerStatus> {
  const base = apiUrl();
  if (!base) throw new Error('License server is not set up in this build.');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || `License server error ${r.status}`);
    return j as ServerStatus;
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('The license server did not answer. Check your internet and try again.');
    if (e instanceof TypeError) throw new Error('No internet connection. Connect and try again.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const base = async () => ({ device: await deviceId(), model: deviceModel(), app: Application.nativeApplicationVersion ?? '' });

/** Asks the server for this phone's status. Throws when offline; the cached state is kept. */
export async function refreshLicense(): Promise<LicenseView> {
  await firstOpen();
  await writeCache(await post('/api/status', await base()));
  return currentLicense();
}

export async function activateLicense(key: string): Promise<LicenseView> {
  await writeCache(await post('/api/activate', { ...(await base()), key: key.trim() }));
  return currentLicense();
}

export const deviceInfo = async () => ({ id: await deviceId(), model: deviceModel() });

export const lastCheckedOver = (v: LicenseView, ms: number) => !v.checkedAt || Date.now() - v.checkedAt > ms;
