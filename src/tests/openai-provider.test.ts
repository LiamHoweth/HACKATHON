// OpenAI Responses adapter with fetch mocked: proves request shape, parsing, refusal and
// repair handling — not real model behavior.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReplyRequest } from '@/core/types';
import { generateLive } from '@/server/provider';
import { serverConfig } from '@/server/config';
import { buildReplyPayload, REPLY_SYSTEM_PROMPT } from '@/server/reply-prompt';
import type { ServerConfig } from '@/server/config';

const cfg = {
  aiProvider: 'openai', anthropicKey: '', openaiKey: 'test-openai-key', replyModel: 'gpt-test',
  replyFallbacks: true, replyReasoningEffort: '', replyMaxOutputTokens: 1200, replyServiceTier: '', repliesConfigured: true, transcriptionProvider: '',
  transcriptionKey: '', transcriptionModel: '', transcriptionBaseUrl: '', transcriptionConfigured: false,
  fixturesEnabled: true, generationTimeoutMs: 15000, transcriptionTimeoutMs: 20000, maxAudioBytes: 4e6, accessToken: '',
} as ServerConfig;

const request: ReplyRequest = {
  identity: { sessionEpoch: 'e', workspaceId: 'w', requestId: 'r', contextRevision: 0, preferenceRevision: 0 },
  mode: 'live', anchor: { mode: 'reply', turnId: 't', turnContentRevision: 0 },
  activePartnerText: 'Are you coming to dinner tonight?', language: 'en-US', recentConversation: [],
  approvedProfile: [], guidance: { intent: null, wording: [], userTopicOrSeed: null, scope: { relationship: null, setting: null } },
  approvedPreferences: [], sessionStyleHints: [], rejected: [], refineTarget: null,
  lengthPolicy: { maxWords: 14, maxCharacters: 100 },
};
const GOOD = [
  { text: 'Yes, I will be there.', meaning: { act: 'accept', summary: 'Accept.' } },
  { text: 'Not tonight, sorry.', meaning: { act: 'decline', summary: 'Decline.' } },
  { text: 'Where is it?', meaning: { act: 'question', summary: 'Ask where.' } },
];
const reply = (content: unknown[], status = 'completed') =>
  new Response(JSON.stringify({ model: 'gpt-test-2026', status, output: [{ type: 'message', content }] }), { status: 200 });
const text = (candidates: unknown) => ({ type: 'output_text', text: JSON.stringify({ candidates }) });

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => vi.unstubAllGlobals());

describe('OpenAI Responses adapter', () => {
  it('sends a tool-free strict json_schema request with storage disabled and parses output', async () => {
    fetchMock.mockResolvedValueOnce(reply([text(GOOD)]));
    const res = await generateLive(request, cfg, new AbortController().signal);
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.data.source).toBe('live-model'); expect(res.data.model).toBe('gpt-test-2026'); }
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    const body = JSON.parse(init.body);
    expect(body.store).toBe(false);
    expect(body.tools).toBeUndefined();
    expect(body.text.format).toMatchObject({ type: 'json_schema', strict: true });
    expect(JSON.parse(body.input).activeQuestionFromPartner).toBe('Are you coming to dinner tonight?');
  });

  it('treats a refusal content item as PROVIDER_REFUSAL without retrying', async () => {
    fetchMock.mockResolvedValue(reply([{ type: 'refusal', refusal: 'No.' }]));
    const res = await generateLive(request, cfg, new AbortController().signal);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('PROVIDER_REFUSAL');
  });

  it('repairs once after invalid output, then succeeds', async () => {
    fetchMock.mockResolvedValueOnce(reply([text(GOOD.slice(0, 2))])).mockResolvedValueOnce(reply([text(GOOD)]));
    const res = await generateLive(request, cfg, new AbortController().signal);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.ok && res.data.repaired).toBe(true);
  });

  it('maps 429 to RATE_LIMITED and 401 to a non-recoverable error', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 429 }));
    let res = await generateLive(request, cfg, new AbortController().signal);
    expect(!res.ok && res.error.code).toBe('RATE_LIMITED');
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    res = await generateLive(request, cfg, new AbortController().signal);
    expect(!res.ok && res.error.recoverable).toBe(false);
  });
});

describe('latency tuning of the reply request', () => {
  const sent = async (c: ServerConfig, r: ReplyRequest = request) => {
    fetchMock.mockResolvedValueOnce(reply([text(GOOD)]));
    await generateLive(r, c, new AbortController().signal);
    return JSON.parse(fetchMock.mock.calls[0][1].body);
  };

  it('omits reasoning and service_tier when not configured and uses the configured output budget', async () => {
    const body = await sent(cfg);
    expect(body.reasoning).toBeUndefined();
    expect(body.service_tier).toBeUndefined();
    expect(body.max_output_tokens).toBe(1200);
  });

  it('sends reasoning effort, a tight output budget and an optional service tier from config', async () => {
    const body = await sent({ ...cfg, replyReasoningEffort: 'low', replyMaxOutputTokens: 900, replyServiceTier: 'priority' } as ServerConfig);
    expect(body.reasoning).toEqual({ effort: 'low' });
    expect(body.max_output_tokens).toBe(900);
    expect(body.service_tier).toBe('priority');
  });

  it('defaults to low reasoning effort and a 1200-token budget; REPLY_REASONING_EFFORT=off omits it', () => {
    vi.stubEnv('REPLY_REASONING_EFFORT', '');
    vi.stubEnv('REPLY_MAX_OUTPUT_TOKENS', '');
    vi.stubEnv('REPLY_SERVICE_TIER', '');
    expect(serverConfig()).toMatchObject({ replyReasoningEffort: 'low', replyMaxOutputTokens: 1200, replyServiceTier: '' });
    vi.stubEnv('REPLY_REASONING_EFFORT', 'off');
    expect(serverConfig().replyReasoningEffort).toBe('');
    vi.stubEnv('REPLY_REASONING_EFFORT', 'medium');
    expect(serverConfig().replyReasoningEffort).toBe('medium');
    vi.unstubAllEnvs();
  });

  it('keeps the payload compact: no blank fields and at most the latest 6 turns', () => {
    const turns = Array.from({ length: 10 }, (_, i) => ({ role: 'partner' as const, text: `turn ${i}`, source: 'partner-typed' as const }));
    const payload = buildReplyPayload({ ...request, recentConversation: turns }) as unknown as Record<string, unknown>;
    expect(payload.initiation).toBeUndefined();
    expect(payload.approvedProfile).toBeUndefined();
    expect(payload.rejected).toBeUndefined();
    expect((payload.recentConversation as Array<{ said: string }>).map((t) => t.said)).toEqual(['turn 4', 'turn 5', 'turn 6', 'turn 7', 'turn 8', 'turn 9']);
    expect(payload.activeQuestionFromPartner).toBe('Are you coming to dinner tonight?');
  });

  it('asks for most-likely-first ordering, a casual college-student voice and first-person replies', () => {
    expect(REPLY_SYSTEM_PROMPT).toMatch(/most natural, direct answer first/);
    expect(REPLY_SYSTEM_PROMPT).toMatch(/college student/);
    expect(REPLY_SYSTEM_PROMPT).toMatch(/No emojis, profanity/);
    expect(REPLY_SYSTEM_PROMPT).toMatch(/in the first person/);
    expect(REPLY_SYSTEM_PROMPT).toMatch(/Do not invent memories, relationships, symptoms/);
    expect(REPLY_SYSTEM_PROMPT).toMatch(/Offer meaningfully different possibilities/);
  });
});
