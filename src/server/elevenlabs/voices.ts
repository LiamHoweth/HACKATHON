import 'server-only';
// Server-approved voice list. Only ELEVENLABS_VOICE_ID and ELEVENLABS_ALLOWED_VOICE_IDS are ever
// offered or accepted; names come from GET /v2/voices when it is reachable (cached ~10 min).
import type { VoiceOption } from '@/core/types';
import type { ServerConfig } from '../config';
import { deadline, ELEVENLABS_API } from './shared';

const CACHE_MS = 10 * 60_000;
const MAX_PAGES = 5;
let cache: { key: string; at: number; voices: VoiceOption[] } | null = null;

export function resetVoiceCache() { cache = null; }

/** Resolves a client voice choice to a server-approved id; null picks the default. */
export function approvedVoiceId(choice: string | null, cfg: ServerConfig): string | null {
  if (choice === null) return cfg.elevenLabsVoiceId || null;
  return cfg.elevenLabsAllowedVoiceIds.includes(choice) ? choice : null;
}

type V2Voice = { voice_id?: unknown; name?: unknown; description?: unknown };
const clip = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);

async function fetchNames(cfg: ServerConfig, wanted: Set<string>, fetchImpl: typeof fetch): Promise<Map<string, V2Voice> | null> {
  const found = new Map<string, V2Voice>();
  const d = deadline(undefined, Math.min(cfg.elevenLabsTimeoutMs, 10_000));
  try {
    let token: string | null = null;
    for (let page = 0; page < MAX_PAGES && found.size < wanted.size; page += 1) {
      const q = new URLSearchParams({ page_size: '100', include_total_count: 'false' });
      if (token) q.set('next_page_token', token);
      const res = await fetchImpl(`${ELEVENLABS_API}/v2/voices?${q}`, {
        headers: { 'xi-api-key': cfg.elevenLabsKey, accept: 'application/json' }, signal: d.signal, cache: 'no-store',
      });
      if (!res.ok) { await res.body?.cancel().catch(() => {}); return null; }
      const body = (await res.json()) as { voices?: unknown; has_more?: unknown; next_page_token?: unknown };
      if (!Array.isArray(body.voices)) return null;
      for (const v of body.voices as V2Voice[]) if (typeof v?.voice_id === 'string' && wanted.has(v.voice_id)) found.set(v.voice_id, v);
      token = body.has_more === true && typeof body.next_page_token === 'string' ? body.next_page_token : null;
      if (!token) break;
    }
    return found;
  } catch {
    return null;
  } finally {
    d.done();
  }
}

/**
 * The approved voices, in configured order. If the account listing is reachable, ids it does not
 * contain are dropped (except the default, so a missing default surfaces as a speech error rather
 * than an empty picker). If it is unreachable, generic names are used and nothing is cached.
 */
export async function listApprovedVoices(cfg: ServerConfig, fetchImpl: typeof fetch = fetch): Promise<VoiceOption[]> {
  const ids = cfg.elevenLabsAllowedVoiceIds;
  const key = ids.join(',');
  if (cache && cache.key === key && Date.now() - cache.at < CACHE_MS) return cache.voices;
  const names = await fetchNames(cfg, new Set(ids), fetchImpl);
  const voices: VoiceOption[] = ids
    .filter((id) => !names || names.has(id) || id === cfg.elevenLabsVoiceId)
    .map((id, i) => {
      const v = names?.get(id);
      return {
        id,
        name: clip(v?.name, 60) ?? (id === cfg.elevenLabsVoiceId ? 'Default voice' : `Voice ${i + 1}`),
        description: clip(v?.description, 160),
      };
    });
  if (names) cache = { key, at: Date.now(), voices };
  return voices;
}
