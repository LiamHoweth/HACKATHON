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
  const openaiKey = (env.OPENAI_API_KEY ?? '').trim();
  const replyModel = (env.REPLY_MODEL ?? '').trim();
  const transcriptionProvider = (env.TRANSCRIPTION_PROVIDER ?? '').trim().toLowerCase();
  // An OpenAI transcription provider may reuse OPENAI_API_KEY.
  const transcriptionKey = (env.TRANSCRIPTION_API_KEY ?? '').trim() || (transcriptionProvider === 'openai' ? openaiKey : '');
  const transcriptionModel = (env.TRANSCRIPTION_MODEL ?? '').trim();
  // Hinting the language skips auto-detection and stops short clips being guessed as another language.
  // "auto" (or an invalid value) sends no hint. The prompt is opt-in: it can be echoed back on noise.
  const langRaw = ((env.TRANSCRIPTION_LANGUAGE ?? '').trim() || 'en').toLowerCase().split('-')[0];
  const transcriptionLanguage = /^[a-z]{2,3}$/.test(langRaw) && langRaw !== 'auto' ? langRaw : '';
  const transcriptionPrompt = (env.TRANSCRIPTION_PROMPT ?? '').trim().slice(0, 200);
  const providerKey = aiProvider === 'anthropic' ? anthropicKey : aiProvider === 'openai' ? openaiKey : '';
  // ElevenLabs speech (server-side only). The voice id is not the API key.
  const elevenLabsKey = (env.ELEVENLABS_API_KEY ?? '').trim();
  const elevenLabsVoiceId = (env.ELEVENLABS_VOICE_ID ?? '').trim();
  const elevenLabsOutputFormat = (env.ELEVENLABS_OUTPUT_FORMAT ?? '').trim();
  const elevenLabsAllowedVoiceIds = [elevenLabsVoiceId, ...(env.ELEVENLABS_ALLOWED_VOICE_IDS ?? '').split(',').map((v) => v.trim())]
    .filter((v, i, all) => /^[A-Za-z0-9_-]{1,80}$/.test(v) && all.indexOf(v) === i);
  return {
    aiProvider,
    anthropicKey,
    openaiKey,
    replyModel,
    replyFallbacks: (env.REPLY_FALLBACKS ?? 'default').trim().toLowerCase() !== 'off',
    // Reasoning effort for OpenAI reply calls. Defaults to 'low' (the lowest gpt-6-astra accepts; 'minimal'/'none'
    // are rejected there). Set REPLY_REASONING_EFFORT=off to omit the parameter for models that do not support it.
    replyReasoningEffort: (() => {
      const v = (env.REPLY_REASONING_EFFORT ?? '').trim().toLowerCase();
      return v === 'off' ? '' : v || 'low';
    })(),
    // Output budget for one reply call: three short candidates need ~100-250 tokens including any reasoning.
    replyMaxOutputTokens: Math.round(num(env.REPLY_MAX_OUTPUT_TOKENS, 1200)),
    // Optional OpenAI service tier (e.g. 'priority' for lower latency at a higher price). Unset by default.
    replyServiceTier: (env.REPLY_SERVICE_TIER ?? '').trim().toLowerCase(),
    repliesConfigured: providerKey.length > 0 && replyModel.length > 0,
    transcriptionProvider,
    transcriptionKey,
    transcriptionModel,
    transcriptionLanguage,
    transcriptionPrompt,
    transcriptionBaseUrl: ((env.TRANSCRIPTION_BASE_URL ?? '').trim() || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    transcriptionConfigured: transcriptionProvider === 'openai' && transcriptionKey.length > 0 && transcriptionModel.length > 0,
    fixturesEnabled: (env.FIXTURES_ENABLED ?? 'true').trim().toLowerCase() !== 'false',
    generationTimeoutMs: num(env.GENERATION_TIMEOUT_MS, 15_000),
    transcriptionTimeoutMs: num(env.TRANSCRIPTION_TIMEOUT_MS, 20_000),
    maxAudioBytes: num(env.MAX_AUDIO_BYTES, 4_000_000),
    accessToken: (env.APP_ACCESS_TOKEN ?? '').trim(),
    elevenLabsKey,
    elevenLabsVoiceId,
    elevenLabsModelId: (env.ELEVENLABS_MODEL_ID ?? '').trim() || 'eleven_v4_turbo',
    // The route returns audio/mpeg, so only MP3 output formats are accepted.
    elevenLabsOutputFormat: /^mp3_\d{4,6}_\d{2,3}$/.test(elevenLabsOutputFormat) ? elevenLabsOutputFormat : 'mp3_44100_128',
    elevenLabsTimeoutMs: num(env.ELEVENLABS_TIMEOUT_MS, 15_000),
    elevenLabsAllowedVoiceIds,
    elevenLabsTransport: ((env.ELEVENLABS_TRANSPORT ?? '').trim().toLowerCase() === 'http' ? 'http' : 'ws') as 'ws' | 'http',
    elevenLabsDailyCharBudget: num(env.ELEVENLABS_DAILY_CHAR_BUDGET, 20_000),
    speechConfigured: elevenLabsKey.length > 0 && elevenLabsAllowedVoiceIds.includes(elevenLabsVoiceId),
  };
}
export type ServerConfig = ReturnType<typeof serverConfig>;
