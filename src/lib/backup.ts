import type { SQLiteDatabase } from 'expo-sqlite';
import Constants from 'expo-constants';
import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { getSettings, setSetting } from '@/db/repo';

const DRIVE_FILE = 'https://www.googleapis.com/auth/drive.file';
const SCOPES = [DRIVE_FILE];
const NO_DRIVE_PERMISSION =
  'Google Drive permission was not given. Tap Connect again and tick the box for "Google Drive files that you use with this app".';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const TABLES = ['gyms', 'members', 'payments', 'settings'] as const;
const TAB: Record<(typeof TABLES)[number], string> = { gyms: 'Gyms', members: 'Members', payments: 'Payments', settings: 'Settings' };
// These describe the backup itself, so they are never overwritten by a restore.
const LOCAL_ONLY_SETTINGS = new Set(['google_email', 'backup_sheet_id', 'last_backup']);

let configured = false;
let currentToken = '';
function configure() {
  if (configured) return;
  const webClientId = (Constants.expoConfig?.extra as any)?.googleWebClientId as string | undefined;
  GoogleSignin.configure({ scopes: SCOPES, ...(webClientId ? { webClientId } : {}) });
  configured = true;
}

export async function connectGoogle(): Promise<string | null> {
  configure();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const res = await GoogleSignin.signIn();
  if (!isSuccessResponse(res)) return null;
  // Google lets people untick individual permissions; without Drive the backup can't be written.
  if (!res.data.scopes?.includes(DRIVE_FILE)) await askForDrive();
  return res.data.user.email;
}

async function askForDrive() {
  const r = await GoogleSignin.addScopes({ scopes: SCOPES });
  if (!r || !isSuccessResponse(r) || !r.data.scopes?.includes(DRIVE_FILE)) throw new Error(NO_DRIVE_PERMISSION);
}

export async function disconnectGoogle() {
  configure();
  try {
    const t = await GoogleSignin.getTokens();
    await GoogleSignin.clearCachedAccessToken(t.accessToken);
  } catch { /* not signed in */ }
  try { await GoogleSignin.signOut(); } catch { /* already signed out */ }
}

async function token(interactive: boolean): Promise<string> {
  configure();
  const silent = await GoogleSignin.signInSilently();
  if (silent.type !== 'success') throw new Error('Google account is not connected. Connect it in Settings.');
  if (!silent.data.scopes?.includes(DRIVE_FILE)) {
    if (!interactive) throw new Error(NO_DRIVE_PERMISSION);
    await askForDrive();
  }
  const t = await GoogleSignin.getTokens();
  currentToken = t.accessToken;
  return t.accessToken;
}

async function api(tok: string, url: string, method = 'GET', body?: unknown) {
  const send = (t: string) => fetch(url, {
    method,
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let r = await send(currentToken || tok);
  if (r.status === 401) {
    // Android caches access tokens; a revoked or expired one must be cleared before a new one is issued.
    try { await GoogleSignin.clearCachedAccessToken(currentToken || tok); } catch { /* ignore */ }
    currentToken = (await GoogleSignin.getTokens()).accessToken;
    r = await send(currentToken);
  }
  if (!r.ok) {
    const text = await r.text();
    if (r.status === 401) throw new Error('Google sign-in has expired. Tap Disconnect, then Connect again.');
    if (r.status === 403 && /PERMISSION_DENIED|insufficient|does not have permission/i.test(text)) {
      throw new Error(NO_DRIVE_PERMISSION);
    }
    throw new Error(`Google Sheets error ${r.status}: ${text.slice(0, 200)}`);
  }
  return r.json();
}

async function ensureSheet(db: SQLiteDatabase, tok: string): Promise<string> {
  const s = await getSettings(db);
  if (s.backup_sheet_id) {
    try {
      await api(tok, `${SHEETS}/${s.backup_sheet_id}?fields=spreadsheetId`);
      return s.backup_sheet_id;
    } catch { /* deleted or no access — make a new one */ }
  }
  const created = await api(tok, SHEETS, 'POST', {
    properties: { title: 'MyGym Backup' },
    sheets: TABLES.map((t) => ({ properties: { title: TAB[t] } })),
  });
  await setSetting(db, 'backup_sheet_id', created.spreadsheetId);
  return created.spreadsheetId;
}

async function columns(db: SQLiteDatabase, table: string): Promise<string[]> {
  const info = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return info.map((c) => c.name);
}

export type BackupResult = { members: number; payments: number; at: string };

export async function backupNow(db: SQLiteDatabase, interactive = true): Promise<BackupResult> {
  const tok = await token(interactive);
  const id = await ensureSheet(db, tok);
  const data: { range: string; values: (string | number)[][] }[] = [];
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const cols = await columns(db, t);
    let rows = await db.getAllAsync<Record<string, any>>(`SELECT * FROM ${t}`);
    if (t === 'settings') rows = rows.filter((r) => !LOCAL_ONLY_SETTINGS.has(r.key));
    counts[t] = rows.length;
    data.push({ range: `${TAB[t]}!A1`, values: [cols, ...rows.map((r) => cols.map((c) => (r[c] ?? '') as string | number))] });
  }
  await api(tok, `${SHEETS}/${id}/values:batchClear`, 'POST', { ranges: TABLES.map((t) => TAB[t]) });
  await api(tok, `${SHEETS}/${id}/values:batchUpdate`, 'POST', { valueInputOption: 'RAW', data });
  const at = new Date().toISOString();
  await setSetting(db, 'last_backup', at);
  return { members: counts.members, payments: counts.payments, at };
}

/** Replaces everything on this phone with what is in the backup sheet. */
export async function restoreFromSheet(db: SQLiteDatabase): Promise<BackupResult> {
  const tok = await token(true);
  const s = await getSettings(db);
  if (!s.backup_sheet_id) throw new Error('No backup sheet found. Run a backup first, or reconnect the account that has it.');
  const qs = TABLES.map((t) => `ranges=${encodeURIComponent(TAB[t])}`).join('&');
  const res = await api(tok, `${SHEETS}/${s.backup_sheet_id}/values:batchGet?${qs}&valueRenderOption=UNFORMATTED_VALUE`);
  const byTab: Record<string, any[][]> = {};
  TABLES.forEach((t, i) => { byTab[t] = res.valueRanges?.[i]?.values ?? []; });
  if ((byTab.gyms?.length ?? 0) < 2) throw new Error('The backup sheet has no gyms in it, so nothing was restored.');

  await db.withExclusiveTransactionAsync(async (tx) => {
    // Delete children first and insert parents first (TABLES order), so foreign keys stay valid.
    for (const t of ['payments', 'members', 'gyms'] as const) await tx.runAsync(`DELETE FROM ${t}`);
    await tx.runAsync(`DELETE FROM settings WHERE key NOT IN ('google_email','backup_sheet_id','last_backup')`);
    for (const t of TABLES) {
      const [header, ...rows] = byTab[t];
      if (!header) continue;
      const valid = new Set(await columns(tx as unknown as SQLiteDatabase, t));
      const cols = (header as string[]).filter((c) => valid.has(c));
      const idx = cols.map((c) => (header as string[]).indexOf(c));
      const sql = `INSERT OR REPLACE INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`;
      for (const r of rows) {
        if (t === 'settings' && LOCAL_ONLY_SETTINGS.has(String(r[idx[cols.indexOf('key')]]))) continue;
        await tx.runAsync(sql, ...idx.map((i) => (r[i] === '' || r[i] === undefined ? null : r[i])));
      }
    }
  });
  return { members: Math.max(0, byTab.members.length - 1), payments: Math.max(0, byTab.payments.length - 1), at: new Date().toISOString() };
}

export function sheetUrl(id: string) {
  return `https://docs.google.com/spreadsheets/d/${id}`;
}

/** Called on app start / resume, and after each payment when that option is chosen. Never throws. */
export async function maybeAutoBackup(db: SQLiteDatabase, reason: 'open' | 'payment'): Promise<void> {
  try {
    const s = await getSettings(db);
    if (!s.google_email || s.backup_freq === 'off') return;
    if (reason === 'payment') {
      if (s.backup_freq !== 'payment') return;
    } else {
      const last = s.last_backup ? new Date(s.last_backup).getTime() : 0;
      const gap = s.backup_freq === 'weekly' ? 7 * 86400000 : s.backup_freq === 'daily' ? 86400000 : 86400000;
      if (Date.now() - last < gap) return;
    }
    await backupNow(db, false);
  } catch {
    // Offline or token expired: the next open will try again.
  }
}
