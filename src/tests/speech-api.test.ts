// /api/speech, /api/voices and the ElevenLabs adapter. fetch and WebSocket are fakes: these tests
// prove plumbing, routing, validation and error mapping — not real audio quality or live access.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/speech/route';
import { GET as getVoices } from '@/app/api/voices/route';
import { GET as getStatus } from '@/app/api/status/route';
import { resetSpeechBudget } from '@/server/elevenlabs/speech-request';
import { resetVoiceCache } from '@/server/elevenlabs/voices';
import { routeFor } from '@/server/elevenlabs/client';

const KEY = 'sk_test_SECRET_not_real_123';
const VOICE = 'voiceDefault01';
const ALT = 'voiceAlt02';
const MP3 = Uint8Array.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xfb, 0x90, 0x64]);
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');

const ENV_KEYS = [
  'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID', 'ELEVENLABS_MODEL_ID', 'ELEVENLABS_OUTPUT_FORMAT', 'ELEVENLABS_TIMEOUT_MS',
  'ELEVENLABS_ALLOWED_VOICE_IDS', 'ELEVENLABS_TRANSPORT', 'ELEVENLABS_DAILY_CHAR_BUDGET', 'APP_ACCESS_TOKEN',
];

// --- Fake WebSocket -----------------------------------------------------------------------------
type Frame = Record<string, unknown>;
type Script = (ws: FakeWebSocket, msg: Frame) => void;
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static script: Script = () => {};
  sent: Frame[] = [];
  closed = false;
  private listeners = new Map<string, Array<(e: { data?: unknown; code?: number }) => void>>();
  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
    setTimeout(() => this.emit('open', {}), 0);
  }
  addEventListener(type: string, fn: (e: { data?: unknown; code?: number }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  emit(type: string, e: { data?: unknown; code?: number }) { for (const fn of this.listeners.get(type) ?? []) fn(e); }
  reply(frame: Frame | string) { setTimeout(() => this.emit('message', { data: typeof frame === 'string' ? frame : JSON.stringify(frame) }), 0); }
  send(data: string) {
    const msg = JSON.parse(data) as Frame;
    this.sent.push(msg);
    FakeWebSocket.script(this, msg);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    setTimeout(() => this.emit('close', { code: 1000 }), 0);
  }
}
// Default provider behaviour: two audio chunks then is_final after close_socket.
const happyScript: Script = (ws, msg) => {
  if (msg.close_socket) {
    ws.reply({ audio: b64(MP3.slice(0, 7)) });
    ws.reply({ audio: b64(MP3.slice(7)), alignment: null });
    ws.reply({ is_final: true });
  }
};

// --- Helpers ------------------------------------------------------------------------------------
let ip = 0;
const speechBody = (over: Record<string, unknown> = {}) => ({
  utteranceId: 'u-1', reviewSnapshotId: 'r-1', sessionEpoch: 'e-1', exactText: "I'll be there at 3:15, Dr. Lee.", voiceChoiceId: null, ...over,
});
const post = (body: unknown, headers: Record<string, string> = {}, signal?: AbortSignal) => {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  ip += 1;
  return new Request('http://localhost:3000/api/speech', {
    method: 'POST', body: text, signal,
    headers: { 'content-type': 'application/json', host: 'localhost:3000', 'x-real-ip': `10.0.0.${ip}`, ...headers },
  });
};
const configure = (over: Record<string, string> = {}) => {
  process.env.ELEVENLABS_API_KEY = KEY;
  process.env.ELEVENLABS_VOICE_ID = VOICE;
  Object.assign(process.env, over);
};
const audioResponse = (bytes: Uint8Array = MP3, type = 'audio/mpeg') => new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]), { status: 200, headers: { 'content-type': type } });
const errorResponse = (status: number, body: unknown) => Response.json(body, { status });
const allHeaders = (res: Response) => JSON.stringify([...res.headers.entries()]);

let fetchMock: ReturnType<typeof vi.fn>;
let infoSpy: { mock: { calls: unknown[][] } };
let saved: Record<string, string | undefined> = {};
beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  ENV_KEYS.forEach((k) => delete process.env[k]);
  FakeWebSocket.instances = [];
  FakeWebSocket.script = happyScript;
  vi.stubGlobal('WebSocket', FakeWebSocket);
  fetchMock = vi.fn(async () => audioResponse());
  vi.stubGlobal('fetch', fetchMock);
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  resetSpeechBudget();
  resetVoiceCache();
});
afterEach(() => {
  ENV_KEYS.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k])));
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
const logs = () => infoSpy.mock.calls.map((c) => String(c[0])).join('\n');
const errorOf = async (res: Response) => ((await res.json()) as { ok: boolean; error: { code: string; message: string; recoverable: boolean } });

// --- Tests --------------------------------------------------------------------------------------
describe('POST /api/speech configuration and access', () => {
  it('returns NOT_CONFIGURED without a key or voice id and never calls the provider', async () => {
    let res = await POST(post(speechBody()));
    expect(res.status).toBe(503);
    expect((await errorOf(res)).error.code).toBe('NOT_CONFIGURED');
    process.env.ELEVENLABS_API_KEY = KEY; // key without a voice id is still not configured
    res = await POST(post(speechBody()));
    expect(res.status).toBe(503);
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires the access code in production, like /api/replies', async () => {
    configure();
    vi.stubEnv('NODE_ENV', 'production');
    let res = await POST(post(speechBody()));
    expect(res.status).toBe(401); // no APP_ACCESS_TOKEN on a deployed server
    process.env.APP_ACCESS_TOKEN = 'letmein';
    res = await POST(post(speechBody(), { 'x-still-here-access': 'wrong' }));
    expect(res.status).toBe(401);
    expect((await errorOf(res)).error.code).toBe('UNAUTHORIZED');
    expect(FakeWebSocket.instances).toHaveLength(0);
    res = await POST(post(speechBody(), { 'x-still-here-access': 'letmein' }));
    expect(res.status).toBe(200);
  });

  it('rejects oversized, malformed and invalid bodies before any provider call', async () => {
    configure();
    let res = await POST(post({ ...speechBody(), exactText: 'a'.repeat(5000) }));
    expect(res.status).toBe(413);
    res = await POST(post('{not json'));
    expect(res.status).toBe(400);
    for (const bad of [
      { exactText: '   ' }, { exactText: '' }, { exactText: 'a'.repeat(501) }, { exactText: 'line one\nline two' },
      { exactText: 'bell\u0007' }, { utteranceId: '' }, { utteranceId: 'x'.repeat(81) }, { voiceChoiceId: 7 }, { extra: 'field' },
    ]) {
      res = await POST(post(speechBody(bad)));
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect((await errorOf(res)).error.code).toBe('INVALID_INPUT');
    }
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('accepts only server-approved voices; null selects the default', async () => {
    configure({ ELEVENLABS_ALLOWED_VOICE_IDS: `${ALT}, bad id!` });
    let res = await POST(post(speechBody({ voiceChoiceId: 'someone-elses-voice' })));
    expect(res.status).toBe(400);
    expect(FakeWebSocket.instances).toHaveLength(0);
    res = await POST(post(speechBody({ voiceChoiceId: ALT })));
    expect(res.status).toBe(200);
    expect(FakeWebSocket.instances[0].sent[0].voices).toEqual([ALT]);
    res = await POST(post(speechBody({ voiceChoiceId: null })));
    expect(FakeWebSocket.instances[1].sent[0].voices).toEqual([VOICE]);
  });

  it('enforces the per-process daily character budget', async () => {
    configure({ ELEVENLABS_DAILY_CHAR_BUDGET: '50' });
    const text = 'a'.repeat(30);
    expect((await POST(post(speechBody({ exactText: text })))).status).toBe(200);
    const res = await POST(post(speechBody({ exactText: text })));
    expect(res.status).toBe(429);
    expect((await errorOf(res)).error).toMatchObject({ code: 'RATE_LIMITED', recoverable: false });
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('rate limits a single client', async () => {
    configure();
    const headers = { 'x-real-ip': '192.0.2.77' };
    const statuses: number[] = [];
    for (let i = 0; i < 21; i += 1) statuses.push((await POST(post(speechBody({ exactText: 'Hi.' }), headers))).status);
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});

describe('ElevenLabs Text to Dialogue WebSocket (default for eleven_v4_turbo)', () => {
  it('TTS-02 v4 Turbo uses the TTD WebSocket URL, never the TTS stream-input socket', async () => {
    configure();
    const res = await POST(post(speechBody()));
    expect(res.status).toBe(200);
    const url = FakeWebSocket.instances[0].url;
    expect(url).toBe('wss://api.elevenlabs.io/v1/text-to-dialogue/stream-input?model_id=eleven_v4_turbo&output_format=mp3_44100_128');
    expect(url).not.toMatch(/text-to-speech/);
    expect(fetchMock).not.toHaveBeenCalled();
    // Even when HTTP is preferred, v4 Turbo stays on the TTD socket (it has no HTTP route).
    process.env.ELEVENLABS_TRANSPORT = 'http';
    await POST(post(speechBody()));
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(routeFor('eleven_v4_turbo', 'http')).toEqual({ transport: 'ws' });
    expect(routeFor('eleven_v4', 'http')).toEqual({ transport: 'http', endpoint: 'dialogue' });
    expect(routeFor('eleven_flash_v2_5', 'ws')).toEqual({ transport: 'http', endpoint: 'tts' });
  });

  it('TTS-03 sends exactly the confirmed text with one registered voice, then flushes and closes', async () => {
    configure();
    const exactText = "  Only if I get to pick the movie… ¿sí? ";
    const res = await POST(post(speechBody({ exactText })));
    expect(res.status).toBe(200);
    const sent = FakeWebSocket.instances[0].sent;
    expect(sent).toEqual([
      { voices: [VOICE], xi_api_key: KEY },
      { inputs: [{ text: exactText, voice_id: VOICE }], flush: true },
      { close_socket: true },
    ]);
  });

  it('returns the complete MP3 with no-store, model and utterance headers', async () => {
    configure();
    const res = await POST(post(speechBody({ utteranceId: 'utt 42' })));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-still-here-model')).toBe('eleven_v4_turbo');
    expect(decodeURIComponent(res.headers.get('x-still-here-utterance-id') ?? '')).toBe('utt 42');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(MP3);
  });

  it('TTS-01 the key never appears in responses, headers, the socket URL or logs; the text is never logged', async () => {
    configure();
    const text = 'Please don’t change my medication.';
    const ok = await POST(post(speechBody({ exactText: text })));
    expect(allHeaders(ok)).not.toContain(KEY);
    expect(FakeWebSocket.instances[0].url).not.toContain(KEY);
    FakeWebSocket.script = (ws, msg) => { if (msg.close_socket) ws.reply({ error: 'authentication_required', message: `Invalid key ${KEY}`, code: 1008 }); };
    const bad = await POST(post(speechBody({ exactText: text })));
    const body = await bad.text();
    expect(body).not.toContain(KEY);
    expect(body).not.toContain('Invalid key');
    expect(allHeaders(bad)).not.toContain(KEY);
    expect(logs()).not.toContain(KEY);
    expect(logs()).not.toContain(text);
    expect(logs()).toContain('"chars":34');
  });

  it('TTS-06 maps socket errors, early close, timeout and malformed audio to safe codes', async () => {
    configure({ ELEVENLABS_TIMEOUT_MS: '60' });
    const cases: Array<[Script, string, number]> = [
      [(ws, m) => { if (m.close_socket) ws.reply({ error: 'authentication_required', message: 'x', code: 1008 }); }, 'PROVIDER_UNAVAILABLE', 502],
      [(ws, m) => { if (m.close_socket) ws.reply({ error: 'quota_exceeded', message: 'x', code: 1008 }); }, 'RATE_LIMITED', 429],
      [(ws, m) => { if (m.close_socket) ws.reply({ error: 'rate_limit_exceeded', message: 'x', code: 1013 }); }, 'RATE_LIMITED', 429],
      [(ws, m) => { if (m.close_socket) ws.reply({ error: 'voice_not_found', message: 'x', code: 1008 }); }, 'PROVIDER_UNAVAILABLE', 502],
      [(ws, m) => { if (m.close_socket) { ws.reply({ audio: b64(MP3) }); ws.close(); } }, 'PROVIDER_UNAVAILABLE', 502], // no is_final
      [() => {}, 'TIMEOUT', 502], // provider never answers
      [(ws, m) => { if (m.close_socket) { ws.reply({ audio: b64(new TextEncoder().encode('<html>nope</html>')) }); ws.reply({ is_final: true }); } }, 'PROVIDER_UNAVAILABLE', 502],
      [(ws, m) => { if (m.close_socket) ws.reply('not json'); }, 'PROVIDER_UNAVAILABLE', 502],
      [(ws, m) => { if (m.close_socket) ws.reply({ is_final: true }); }, 'PROVIDER_UNAVAILABLE', 502], // no audio
    ];
    for (const [script, code, status] of cases) {
      FakeWebSocket.script = script;
      const res = await POST(post(speechBody()));
      expect(res.status, script.toString()).toBe(status);
      expect((await errorOf(res)).error.code).toBe(code);
    }
    expect(FakeWebSocket.instances.every((ws) => ws.closed)).toBe(true);
  });

  it('aborts the upstream socket when the client request is cancelled', async () => {
    configure();
    FakeWebSocket.script = () => {};
    const controller = new AbortController();
    const pending = POST(post(speechBody(), {}, controller.signal));
    await new Promise((r) => setTimeout(r, 5));
    controller.abort();
    const res = await pending;
    expect(res.status).toBe(499);
    expect(FakeWebSocket.instances[0].closed).toBe(true);
  });
});

describe('ElevenLabs HTTP fallback', () => {
  it('eleven_v4 over HTTP posts exactly the text to /v1/text-to-dialogue with the key header', async () => {
    configure({ ELEVENLABS_MODEL_ID: 'eleven_v4', ELEVENLABS_TRANSPORT: 'http' });
    const res = await POST(post(speechBody({ exactText: 'Hey, how was your day?' })));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-still-here-model')).toBe('eleven_v4');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.elevenlabs.io/v1/text-to-dialogue?output_format=mp3_44100_128');
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe(KEY);
    expect(JSON.parse(String(init.body))).toEqual({ inputs: [{ text: 'Hey, how was your day?', voice_id: VOICE }], model_id: 'eleven_v4' });
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('eleven_flash_v2_5 uses POST /v1/text-to-speech/{voice_id}', async () => {
    configure({ ELEVENLABS_MODEL_ID: 'eleven_flash_v2_5' });
    await POST(post(speechBody({ exactText: "I don't agree with that." })));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`);
    expect(JSON.parse(String(init.body))).toEqual({ text: "I don't agree with that.", model_id: 'eleven_flash_v2_5' });
  });

  it('TTS-06 maps 401/403/429/quota/voice-not-found/5xx/timeout/malformed audio without leaking provider bodies', async () => {
    configure({ ELEVENLABS_MODEL_ID: 'eleven_v4', ELEVENLABS_TRANSPORT: 'http', ELEVENLABS_TIMEOUT_MS: '60' });
    const leak = `provider secret detail ${KEY}`;
    const hang = (_url: string, init: RequestInit) => new Promise<Response>((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
    const cases: Array<[() => Promise<Response> | ((u: string, i: RequestInit) => Promise<Response>), string, number, boolean]> = [
      [async () => errorResponse(401, { detail: { status: 'invalid_api_key', message: leak } }), 'PROVIDER_UNAVAILABLE', 502, false],
      [async () => errorResponse(403, { detail: { status: 'missing_permissions', message: leak } }), 'PROVIDER_UNAVAILABLE', 502, false],
      [async () => errorResponse(429, { detail: { status: 'too_many_concurrent_requests', message: leak } }), 'RATE_LIMITED', 429, true],
      [async () => errorResponse(401, { detail: { status: 'quota_exceeded', message: leak } }), 'RATE_LIMITED', 429, false],
      [async () => errorResponse(404, { detail: { status: 'voice_not_found', message: leak } }), 'PROVIDER_UNAVAILABLE', 502, false],
      [async () => errorResponse(500, { detail: leak }), 'PROVIDER_UNAVAILABLE', 502, true],
      [async () => new Response('<html>gateway</html>', { status: 503 }), 'PROVIDER_UNAVAILABLE', 502, true],
      [hang as never, 'TIMEOUT', 502, true],
      [async () => audioResponse(new TextEncoder().encode('{"oops":true}'), 'application/json'), 'PROVIDER_UNAVAILABLE', 502, true],
      [async () => audioResponse(new TextEncoder().encode('not an mp3 at all')), 'PROVIDER_UNAVAILABLE', 502, true],
      [async () => { throw new TypeError('fetch failed'); }, 'PROVIDER_UNAVAILABLE', 502, true],
    ];
    for (const [impl, code, status, recoverable] of cases) {
      fetchMock.mockImplementationOnce(impl as never);
      const res = await POST(post(speechBody()));
      const text = await res.text();
      expect(res.status, text).toBe(status);
      const body = JSON.parse(text) as { error: { code: string; recoverable: boolean } };
      expect(body.error.code).toBe(code);
      expect(body.error.recoverable).toBe(recoverable);
      expect(text).not.toContain(KEY);
      expect(text).not.toContain('provider secret');
    }
    expect(logs()).not.toContain(KEY);
  });
});

describe('GET /api/voices and /api/status', () => {
  const voicesReq = (headers: Record<string, string> = {}) => {
    ip += 1;
    return new Request('http://localhost:3000/api/voices', { headers: { host: 'localhost:3000', 'x-real-ip': `10.1.0.${ip}`, ...headers } });
  };

  it('returns NOT_CONFIGURED without ElevenLabs configuration', async () => {
    const res = await getVoices(voicesReq());
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists only approved voices with names from GET /v2/voices, cached, without exposing the key', async () => {
    configure({ ELEVENLABS_ALLOWED_VOICE_IDS: `${ALT},voiceGone03` });
    fetchMock.mockImplementation(async () => Response.json({
      voices: [
        { voice_id: VOICE, name: 'Calm adult', description: 'Relaxed, neutral', category: 'premade', labels: {} },
        { voice_id: ALT, name: 'Warm adult', description: null, category: 'premade', labels: {} },
        { voice_id: 'notApproved', name: 'Other', description: null },
      ],
      has_more: false, next_page_token: null,
    }));
    const res = await getVoices(voicesReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: true; data: { voices: unknown[]; defaultVoiceId: string } };
    expect(body.data).toEqual({
      voices: [
        { id: VOICE, name: 'Calm adult', description: 'Relaxed, neutral' },
        { id: ALT, name: 'Warm adult', description: null },
      ],
      defaultVoiceId: VOICE,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/api\.elevenlabs\.io\/v2\/voices\?/);
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe(KEY);
    expect(allHeaders(res) + JSON.stringify(body)).not.toContain(KEY);
    await getVoices(voicesReq());
    expect(fetchMock).toHaveBeenCalledTimes(1); // cached
  });

  it('falls back to generic names when the voice listing fails, and gates production access', async () => {
    configure();
    fetchMock.mockImplementation(async () => errorResponse(401, { detail: { status: 'invalid_api_key' } }));
    const res = await getVoices(voicesReq());
    expect(((await res.json()) as { data: { voices: unknown[] } }).data.voices).toEqual([{ id: VOICE, name: 'Default voice', description: null }]);
    vi.stubEnv('NODE_ENV', 'production');
    process.env.APP_ACCESS_TOKEN = 'letmein';
    expect((await getVoices(voicesReq())).status).toBe(401);
    expect((await getVoices(voicesReq({ 'x-still-here-access': 'letmein' }))).status).toBe(200);
  });

  it('/api/status reports speech configuration and hides the model in production without a valid code', async () => {
    const statusReq = (headers: Record<string, string> = {}) => new Request('http://localhost:3000/api/status', { headers: { host: 'localhost:3000', ...headers } });
    let body = (await (await getStatus(statusReq())).json()) as { speech: unknown };
    expect(body.speech).toEqual({ configured: false, provider: null, model: null });
    configure();
    body = (await (await getStatus(statusReq())).json()) as { speech: unknown };
    expect(body.speech).toEqual({ configured: true, provider: 'elevenlabs', model: 'eleven_v4_turbo' });
    vi.stubEnv('NODE_ENV', 'production');
    process.env.APP_ACCESS_TOKEN = 'letmein';
    const res = await getStatus(statusReq());
    const text = await res.text();
    expect(JSON.parse(text).speech).toEqual({ configured: true, provider: 'elevenlabs', model: null });
    expect(text).not.toContain(KEY);
    body = (await (await getStatus(statusReq({ 'x-still-here-access': 'letmein' }))).json()) as { speech: unknown };
    expect(body.speech).toEqual({ configured: true, provider: 'elevenlabs', model: 'eleven_v4_turbo' });
  });
});
