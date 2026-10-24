import 'server-only';
// Anthropic generation adapter. Tool-free, structured output, one bounded repair attempt.
import Anthropic from '@anthropic-ai/sdk';
import type { ApiError, ReplyRequest, ReplyResponseData } from '@/core/types';
import { modelOutputJsonSchema } from '@/core/schemas';
import { buildReplyPayload, REPLY_SYSTEM_PROMPT } from './reply-prompt';
import { checkModelOutput } from './validation';
import type { ServerConfig } from './config';

export type ProviderResult = { ok: true; data: ReplyResponseData } | { ok: false; error: ApiError };

const err = (code: ApiError['code'], message: string, recoverable = true): ProviderResult => ({ ok: false, error: { code, message, recoverable } });

function mapError(e: unknown): ProviderResult {
  if (e instanceof Anthropic.APIConnectionTimeoutError) return err('TIMEOUT', 'The suggestion service took too long.');
  if (e instanceof Anthropic.APIUserAbortError) return err('TIMEOUT', 'The request was cancelled.');
  if (e instanceof Anthropic.RateLimitError) return err('RATE_LIMITED', 'The suggestion service is busy. Try again shortly.');
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return err('PROVIDER_UNAVAILABLE', 'The server could not authenticate with the suggestion service.', false);
  }
  if (e instanceof Anthropic.APIConnectionError) return err('PROVIDER_UNAVAILABLE', 'Could not reach the suggestion service.');
  if (e instanceof Anthropic.APIError) return err('PROVIDER_UNAVAILABLE', 'The suggestion service returned an error.');
  return err('PROVIDER_UNAVAILABLE', 'Unexpected error from the suggestion service.');
}

export async function generateLive(request: ReplyRequest, cfg: ServerConfig, signal: AbortSignal): Promise<ProviderResult> {
  // maxRetries 0: the application owns the single retry budget (one repair attempt).
  const client = new Anthropic({ apiKey: cfg.anthropicKey, maxRetries: 0, timeout: cfg.generationTimeoutMs });
  const deadline = Date.now() + cfg.generationTimeoutMs;
  const payload = JSON.stringify(buildReplyPayload(request));
  let problems: string[] | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < 1500) return err('TIMEOUT', 'The suggestion service took too long.');
    const content = problems
      ? `${payload}\n\nThe previous output was rejected by validation: ${JSON.stringify(problems)}. Return a corrected object.`
      : payload;
    try {
      const response = await client.beta.messages.create(
        {
          model: cfg.replyModel,
          max_tokens: 4000,
          system: REPLY_SYSTEM_PROMPT,
          messages: [{ role: 'user', content }],
          output_config: { effort: 'low', format: { type: 'json_schema', schema: modelOutputJsonSchema as unknown as Record<string, unknown> } },
          ...(cfg.replyFallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
        },
        { signal, timeout: remaining },
      );
      if (response.stop_reason === 'refusal') return err('PROVIDER_REFUSAL', 'The suggestion service declined this request. Your own words and phrases still work.');
      if (response.stop_reason === 'max_tokens') { problems = ['Output was cut off.']; continue; }
      const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
      let raw: unknown;
      try { raw = JSON.parse(text); } catch { problems = ['Output was not valid JSON.']; continue; }
      const checked = checkModelOutput(raw, request);
      if (checked.ok) {
        return { ok: true, data: { candidates: checked.output.candidates, source: 'live-model', model: response.model, repaired: attempt > 0 } };
      }
      problems = checked.problems;
    } catch (e) {
      return mapError(e);
    }
  }
  return err('INVALID_MODEL_OUTPUT', 'The suggestions did not pass validation. Try again, guide the response, or use your own words.');
}
