import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

/**
 * Plans, prices and payment details come straight from the license server (GET /api/plans), so prices
 * can be changed on the admin page without a new app build. The last answer is cached for offline use.
 */

export type Plan = { id: 'yearly' | 'lifetime' | string; name: string; summary: string; price: string; amount: number | null };
export type PlanDetails = { plans: Plan[]; paymentInfo: string; upi: string; whatsapp: string; fetchedAt: number };

const CACHE_KEY = 'mygym_plans_v1';
const apiUrl = () => String((Constants.expoConfig?.extra as any)?.licenseApiUrl ?? '').replace(/\/$/, '');

const amountOf = (price: string) => {
  const n = Number(String(price ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function normalise(j: any): PlanDetails {
  const plans: Plan[] = Array.isArray(j?.plans)
    ? j.plans.map((p: any) => ({
      id: String(p.id ?? ''), name: String(p.name ?? ''), summary: String(p.summary ?? ''), price: String(p.price ?? ''),
      amount: typeof p.amount === 'number' ? p.amount : amountOf(p.price),
    }))
    : [];
  return {
    plans,
    paymentInfo: String(j?.paymentInfo ?? ''),
    upi: String(j?.upi ?? ''),
    whatsapp: String(j?.whatsapp ?? '').replace(/\D/g, ''),
    fetchedAt: Date.now(),
  };
}

export async function cachedPlans(): Promise<PlanDetails | null> {
  try {
    const raw = await SecureStore.getItemAsync(CACHE_KEY);
    return raw ? (JSON.parse(raw) as PlanDetails) : null;
  } catch {
    return null;
  }
}

/** Saves plan details that arrived with a license status reply. */
export async function savePlans(j: unknown) {
  const d = normalise(j);
  if (d.plans.length) await SecureStore.setItemAsync(CACHE_KEY, JSON.stringify(d));
}

/** Fetches the current plans from the license server; throws when offline. */
export async function fetchPlans(): Promise<PlanDetails> {
  const base = apiUrl();
  if (!base) throw new Error('License server is not set up in this build.');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(`${base}/api/plans`, { signal: ctrl.signal, headers: { 'cache-control': 'no-cache' } });
    if (!r.ok) throw new Error(`License server error ${r.status}`);
    const d = normalise(await r.json());
    await SecureStore.setItemAsync(CACHE_KEY, JSON.stringify(d));
    return d;
  } finally {
    clearTimeout(timer);
  }
}

/** The UPI payment link for a plan, with the amount filled in when the price has one. */
export function upiLink(d: PlanDetails, plan: Plan) {
  const params = [
    `pa=${encodeURIComponent(d.upi)}`,
    `pn=${encodeURIComponent('MyGym')}`,
    `cu=INR`,
    `tn=${encodeURIComponent(`MyGym ${plan.name} license`)}`,
    ...(plan.amount ? [`am=${plan.amount}`] : []),
  ];
  return `upi://pay?${params.join('&')}`;
}
