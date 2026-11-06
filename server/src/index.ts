// MyGym license server (Cloudflare Worker + KV).
//
// App endpoints (no auth, identified by the phone's device id):
//   POST /api/status   { device, model?, app? }  -> registers the phone (starts its 7-day trial once) and returns its status
//   POST /api/activate { device, key }            -> binds a license key to the phone and returns its status
//   GET  /api/plans                               -> plans, prices and how to pay
// Admin (HTTP Basic auth with ADMIN_PASSWORD, page at /admin):
//   GET  /admin/api/data                          -> all licenses and phones
//   POST /admin/api/licenses                      { plan, client, phone, note } -> new key
//   POST /admin/api/licenses/<KEY>/<action>       action: reset | revoke | restore | delete
//   POST /admin/api/devices/<ID>/extend-trial     { days }

import { ADMIN_HTML } from './admin';

export interface Env {
  LICENSES: KVNamespace;
  ADMIN_PASSWORD?: string;
  PAYMENT_INFO?: string;
  PRICE_YEARLY?: string;
  PRICE_LIFETIME?: string;
  UPI_ID?: string;
  WHATSAPP?: string;
}

type Plan = 'yearly' | 'lifetime';

interface License {
  key: string;
  plan: Plan;
  client: string;
  phone: string;
  note: string;
  createdAt: number;
  device: string | null; // the one phone this key is locked to
  model: string | null;
  activatedAt: number | null;
  expires: string | null; // last valid day (IST, YYYY-MM-DD); null = lifetime
  revoked: boolean;
  lastCheck: number | null;
}

interface Device {
  id: string;
  model: string | null;
  app: string | null;
  firstSeen: number;
  lastSeen: number;
  trialEnds: string; // last day of the trial (IST)
  license: string | null; // key of the license in use
}

const TRIAL_DAYS = 7;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LAST_SEEN_EVERY = 6 * 3600_000;
const DEFAULT_PAYMENT_INFO = 'Pay by GPay / UPI and send the screenshot on WhatsApp. You will receive a license key to enter in the app.';

const PLAN_NAMES: Record<Plan, string> = { yearly: 'Yearly', lifetime: 'Lifetime' };

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    try {
      if (pathname === '/api/status' && req.method === 'POST') return await status(req, env);
      if (pathname === '/api/activate' && req.method === 'POST') return await activate(req, env);
      if (pathname === '/api/plans' && req.method === 'GET') return json(await plansInfo(env));
      if (pathname === '/admin' || pathname.startsWith('/admin/')) {
        const denied = auth(req, env);
        if (denied) return denied;
        if (pathname === '/admin' && req.method === 'GET') {
          return new Response(ADMIN_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
        }
        if (req.headers.get('x-admin') !== '1') return new Response('Forbidden', { status: 403 });
        return await admin(req, env, pathname);
      }
      return new Response('MyGym license server');
    } catch (e) {
      return json({ error: 'Server error' }, 500);
    }
  },
};

// ---------- app endpoints ----------

/** Plans and payment details. Edited on the admin page (stored in KV); wrangler.toml [vars] are the defaults. */
interface PlanConfig {
  yearlyPrice: string;
  yearlySummary: string;
  lifetimePrice: string;
  lifetimeSummary: string;
  paymentInfo: string;
  upi: string;
  whatsapp: string;
}

function defaultConfig(env: Env): PlanConfig {
  return {
    yearlyPrice: env.PRICE_YEARLY?.trim() || '',
    yearlySummary: '12 months from activation',
    lifetimePrice: env.PRICE_LIFETIME?.trim() || '',
    lifetimeSummary: 'Pay once, never expires',
    paymentInfo: env.PAYMENT_INFO?.trim() || DEFAULT_PAYMENT_INFO,
    upi: env.UPI_ID?.trim() || '',
    whatsapp: (env.WHATSAPP ?? '').replace(/\D/g, ''),
  };
}

async function getConfig(env: Env): Promise<PlanConfig> {
  const saved = (await env.LICENSES.get<Partial<PlanConfig>>('config:plans', 'json')) ?? {};
  return { ...defaultConfig(env), ...saved };
}

/** What the app shows on its License screen (GET /api/plans, and included in every status reply). */
async function plansInfo(env: Env) {
  const c = await getConfig(env);
  return {
    plans: [
      { id: 'yearly', name: 'Yearly', summary: c.yearlySummary, price: c.yearlyPrice, amount: rupees(c.yearlyPrice) },
      { id: 'lifetime', name: 'Lifetime', summary: c.lifetimeSummary, price: c.lifetimePrice, amount: rupees(c.lifetimePrice) },
    ],
    paymentInfo: c.paymentInfo,
    upi: c.upi,
    whatsapp: c.whatsapp,
  };
}

function rupees(price: string): number | null {
  const n = Number(String(price).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function normDevice(d: unknown): string {
  const s = String(d ?? '').trim();
  return /^[A-Za-z0-9._-]{6,64}$/.test(s) ? s : '';
}

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '') || null;

async function getDevice(env: Env, id: string) {
  return (await env.LICENSES.get<Device>(`dev:${id}`, 'json')) ?? null;
}

async function getLicense(env: Env, key: string) {
  return key ? ((await env.LICENSES.get<License>(`lic:${key}`, 'json')) ?? null) : null;
}

/** Registers a phone the first time it is seen (that day starts its trial). */
async function touchDevice(env: Env, id: string, body: Record<string, unknown>): Promise<Device> {
  const now = Date.now();
  let dev = await getDevice(env, id);
  if (!dev) {
    dev = {
      id,
      model: clip(body.model, 80),
      app: clip(body.app, 20),
      firstSeen: now,
      lastSeen: now,
      trialEnds: addDays(todayIST(), TRIAL_DAYS - 1),
      license: null,
    };
    await env.LICENSES.put(`dev:${id}`, JSON.stringify(dev));
    return dev;
  }
  const app = clip(body.app, 20);
  if (now - dev.lastSeen > LAST_SEEN_EVERY || (app && app !== dev.app)) {
    dev.lastSeen = now;
    if (app) dev.app = app;
    await env.LICENSES.put(`dev:${id}`, JSON.stringify(dev));
  }
  return dev;
}

async function describe(env: Env, dev: Device, lic: License | null) {
  const today = todayIST();
  const usable = lic && !lic.revoked && lic.device === dev.id && (lic.expires === null || lic.expires >= today);
  let state: 'active' | 'trial' | 'expired';
  if (usable) state = 'active';
  else if (dev.trialEnds >= today) state = 'trial';
  else state = 'expired';
  return {
    status: state,
    today,
    trialEnds: dev.trialEnds,
    license: lic && lic.device === dev.id
      ? { key: lic.key, plan: lic.plan, planName: PLAN_NAMES[lic.plan], expires: lic.expires, client: lic.client, revoked: lic.revoked }
      : null,
    ...(await plansInfo(env)),
  };
}

async function status(req: Request, env: Env) {
  const body = await readBody(req);
  const id = normDevice(body?.device);
  if (!body || !id) return json({ error: 'Bad request' }, 400);
  const dev = await touchDevice(env, id, body);
  const lic = await getLicense(env, dev.license ?? '');
  if (lic && lic.device === id && (!lic.lastCheck || Date.now() - lic.lastCheck > LAST_SEEN_EVERY)) {
    lic.lastCheck = Date.now();
    await env.LICENSES.put(`lic:${lic.key}`, JSON.stringify(lic));
  }
  return json(await describe(env, dev, lic));
}

async function activate(req: Request, env: Env) {
  const body = await readBody(req);
  const id = normDevice(body?.device);
  const key = normKey(body?.key);
  if (!body || !id) return json({ error: 'Bad request' }, 400);
  if (!key) return json({ error: 'That is not a valid license key. It looks like ABCD-EFGH-JKLM-NPQR.' }, 400);

  const lic = await getLicense(env, key);
  if (!lic) return json({ error: 'This license key was not found. Check it and try again.' }, 404);
  if (lic.revoked) return json({ error: 'This license key has been cancelled. Please contact support.' }, 403);
  if (lic.device && lic.device !== id) {
    return json({ error: 'This license key is already in use on another phone. Contact support to move it to this phone.' }, 409);
  }

  const dev = await touchDevice(env, id, body);
  const today = todayIST();
  if (!lic.activatedAt) {
    // First activation: a yearly key adds a year on top of any time left on the phone's current yearly license.
    let start = today;
    const current = await getLicense(env, dev.license ?? '');
    if (current && current.key !== lic.key && current.device === id && !current.revoked) {
      if (current.expires === null && lic.plan === 'yearly') {
        return json({ error: 'This phone already has a lifetime license, so it does not need a yearly key.' }, 409);
      }
      if (current.expires && current.expires >= today) start = addDays(current.expires, 1);
    }
    lic.activatedAt = Date.now();
    lic.expires = lic.plan === 'lifetime' ? null : addDays(addYears(start, 1), -1);
  }
  // A key moved to a new phone (admin reset) keeps the expiry it already had.
  lic.device = id;
  lic.model = clip(body.model, 80);
  lic.lastCheck = Date.now();
  dev.license = lic.key;
  await env.LICENSES.put(`lic:${lic.key}`, JSON.stringify(lic));
  await env.LICENSES.put(`dev:${id}`, JSON.stringify(dev));
  return json(await describe(env, dev, lic));
}

// ---------- admin ----------

async function listAll<T>(env: Env, prefix: string): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.LICENSES.list({ prefix, cursor });
    const values = await Promise.all(page.keys.map((k) => env.LICENSES.get<T>(k.name, 'json')));
    for (const v of values) if (v) out.push(v);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}

async function admin(req: Request, env: Env, pathname: string): Promise<Response> {
  if (pathname === '/admin/api/data' && req.method === 'GET') {
    const [licenses, devices] = await Promise.all([listAll<License>(env, 'lic:'), listAll<Device>(env, 'dev:')]);
    licenses.sort((a, b) => b.createdAt - a.createdAt);
    devices.sort((a, b) => b.lastSeen - a.lastSeen);
    const config = await getConfig(env);
    return json({ today: todayIST(), licenses, devices, config, ...(await plansInfo(env)) });
  }

  if (pathname === '/admin/api/config' && req.method === 'POST') {
    const body = (await readBody(req)) ?? {};
    const cur = await getConfig(env);
    const str = (k: keyof PlanConfig, n: number) => (typeof body[k] === 'string' ? String(body[k]).trim().slice(0, n) : cur[k]);
    const next: PlanConfig = {
      yearlyPrice: str('yearlyPrice', 30),
      yearlySummary: str('yearlySummary', 80),
      lifetimePrice: str('lifetimePrice', 30),
      lifetimeSummary: str('lifetimeSummary', 80),
      paymentInfo: str('paymentInfo', 400),
      upi: str('upi', 60),
      whatsapp: str('whatsapp', 20).replace(/\D/g, ''),
    };
    await env.LICENSES.put('config:plans', JSON.stringify(next));
    return json(next);
  }

  if (pathname === '/admin/api/licenses' && req.method === 'POST') {
    const body = (await readBody(req)) ?? {};
    const plan = body.plan === 'lifetime' ? 'lifetime' : body.plan === 'yearly' ? 'yearly' : null;
    const client = clip(body.client, 80);
    if (!plan || !client) return json({ error: 'Choose a plan and enter the gym or owner name.' }, 400);
    let key = newKey();
    while (await env.LICENSES.get(`lic:${key}`)) key = newKey();
    const lic: License = {
      key, plan, client, phone: clip(body.phone, 20) ?? '', note: clip(body.note, 200) ?? '',
      createdAt: Date.now(), device: null, model: null, activatedAt: null, expires: null, revoked: false, lastCheck: null,
    };
    await env.LICENSES.put(`lic:${key}`, JSON.stringify(lic));
    return json(lic);
  }

  const lm = pathname.match(/^\/admin\/api\/licenses\/([A-Z0-9-]+)\/(reset|revoke|restore|delete)$/);
  if (lm && req.method === 'POST') {
    const lic = await getLicense(env, normKey(lm[1]));
    if (!lic) return json({ error: 'Not found' }, 404);
    const action = lm[2];
    if (action === 'delete') {
      if (lic.device) return json({ error: 'Only unused keys can be deleted. Revoke it instead.' }, 409);
      await env.LICENSES.delete(`lic:${lic.key}`);
      return json({ ok: true });
    }
    if (action === 'reset') {
      // Frees the key so it can be activated on a new phone; the expiry date stays the same.
      if (lic.device) {
        const dev = await getDevice(env, lic.device);
        if (dev && dev.license === lic.key) {
          dev.license = null;
          await env.LICENSES.put(`dev:${dev.id}`, JSON.stringify(dev));
        }
      }
      lic.device = null;
      lic.model = null;
    }
    if (action === 'revoke') lic.revoked = true;
    if (action === 'restore') lic.revoked = false;
    await env.LICENSES.put(`lic:${lic.key}`, JSON.stringify(lic));
    return json(lic);
  }

  const dm = pathname.match(/^\/admin\/api\/devices\/([A-Za-z0-9._-]+)\/extend-trial$/);
  if (dm && req.method === 'POST') {
    const dev = await getDevice(env, dm[1]);
    if (!dev) return json({ error: 'Not found' }, 404);
    const body = (await readBody(req)) ?? {};
    const days = Math.max(1, Math.min(90, Number(body.days) || 7));
    const base = dev.trialEnds >= todayIST() ? dev.trialEnds : todayIST();
    dev.trialEnds = addDays(base, days);
    await env.LICENSES.put(`dev:${dev.id}`, JSON.stringify(dev));
    return json(dev);
  }

  return json({ error: 'Not found' }, 404);
}

function auth(req: Request, env: Env): Response | null {
  if (!env.ADMIN_PASSWORD) return new Response('ADMIN_PASSWORD is not set', { status: 503 });
  const header = req.headers.get('authorization') ?? '';
  let pass = '';
  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      pass = decoded.slice(decoded.indexOf(':') + 1);
    } catch { /* bad header */ }
  }
  if (!safeEqual(pass, env.ADMIN_PASSWORD)) {
    return new Response('Sign in', { status: 401, headers: { 'www-authenticate': 'Basic realm="MyGym license admin", charset="UTF-8"' } });
  }
  return null;
}

// ---------- helpers ----------

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function newKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-');
}

function normKey(k: unknown) {
  const s = String(k ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length === 16 ? s.match(/.{4}/g)!.join('-') : '';
}

function todayIST() {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function addYears(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCFullYear(d.getUTCFullYear() + n);
  if (d.getUTCDate() !== day) d.setUTCDate(0); // 29 Feb -> 28 Feb
  return d.toISOString().slice(0, 10);
}
