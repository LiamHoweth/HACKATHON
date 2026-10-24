import 'server-only';

// Server-side configuration. Never import this from client code.
const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export function serverConfig() {
  const env = process.env;
  const aiProvider = (env.AI_PROVIDER ?? '').trim().toLowerCase();
  const anthropicKey = (env.ANTHROPIC_API_KEY ?? '').trim();
  const replyModel = (env.REPLY_MODEL ?? '').trim();
  const transcriptionProvider = (env.TRANSCRIPTION_PROVIDER ?? '').trim().toLowerCase();
  const transcriptionKey = (env.TRANSCRIPTION_API_KEY ?? '').trim();
  const transcriptionModel = (env.TRANSCRIPTION_MODEL ?? '').trim();
  return {
    aiProvider,
    anthropicKey,
    replyModel,
    replyFallbacks: (env.REPLY_FALLBACKS ?? 'default').trim().toLowerCase() !== 'off',
    repliesConfigured: aiProvider === 'anthropic' && anthropicKey.length > 0 && replyModel.length > 0,
    transcriptionProvider,
    transcriptionKey,
    transcriptionModel,
    transcriptionBaseUrl: (env.TRANSCRIPTION_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, ''),
    transcriptionConfigured: transcriptionProvider === 'openai' && transcriptionKey.length > 0 && transcriptionModel.length > 0,
    fixturesEnabled: (env.FIXTURES_ENABLED ?? 'true').trim().toLowerCase() !== 'false',
    generationTimeoutMs: num(env.GENERATION_TIMEOUT_MS, 15_000),
    transcriptionTimeoutMs: num(env.TRANSCRIPTION_TIMEOUT_MS, 20_000),
    maxAudioBytes: num(env.MAX_AUDIO_BYTES, 4_000_000),
    accessToken: (env.APP_ACCESS_TOKEN ?? '').trim(),
  };
}
export type ServerConfig = ReturnType<typeof serverConfig>;
