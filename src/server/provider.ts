import 'server-only';
// Generation adapters (Anthropic, OpenAI). Tool-free, structured output, and a shared
// validation loop with exactly one bounded repair attempt inside one time budget.
import Anthropic from '@anthropic-ai/sdk';
import type { ApiError, ReplyRequest, ReplyResponseData } from '@/core/types';
import { modelOutputJsonSchema } from '@/core/schemas';
import { buildReplyPayload, REPLY_SYSTEM_PROMPT } from './reply-prompt';
import { checkModelOutput } from './validation';
import type { ServerConfig } from './config';

export type ProviderResult = { ok: true; data: ReplyResponseData } | { ok: false; error: ApiError };

// One model call. 'retry' outcomes consume the single repair attempt; errors end the request.
type CallOutcome =
  | { kind: 'text'; text: string; model: string }
  | { kind: 'refusal' }
  | { kind: 'truncated' }
  | { kind: 'error'; result: ProviderResult };
type ModelCall = (content: string, signal: AbortSignal, timeoutMs: number) => Promise<CallOutcome>;

const err = (code: ApiError['code'], message: string, recoverable = true): ProviderResult => ({ ok: false, error: { code, message, recoverable } });

async function runWithRepair(request: ReplyRequest, cfg: ServerConfig, signal: AbortSignal, call: ModelCall): Promise<ProviderResult> {
  const deadline = Date.now() + cfg.generationTimeoutMs;
  const payload = JSON.stringify(buildReplyPayload(request));
  let problems: string[] | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < 1500) return err('TIMEOUT', 'The suggestion service took too long.');
    const content = problems
      ? `${payload}\n\nThe previous output was rejected by validation: ${JSON.stringify(problems)}. Return a corrected object.`
      : payload;
    const outcome = await call(content, signal, remaining);
    if (outcome.kind === 'error') return outcome.result;
    if (outcome.kind === 'refusal') return err('PROVIDER_REFUSAL', 'The suggestion service declined this request. Your own words and phrases still work.');
    if (outcome.kind === 'truncated') { problems = ['Output was cut off.']; continue; }
    let raw: unknown;
    try { raw = JSON.parse(outcome.text); } catch { problems = ['Output was not valid JSON.']; continue; }
    const checked = checkModelOutput(raw, request);
    if (checked.ok) {
      return { ok: true, data: { candidates: checked.output.candidates, source: 'live-model', model: outcome.model, repaired: attempt > 0 } };
    }
    problems = checked.problems;
  }
  return err('INVALID_MODEL_OUTPUT', 'The suggestions did not pass validation. Try again, guide the response, or use your own words.');
}

function mapAnthropicError(e: unknown): ProviderResult {
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

function anthropicCall(cfg: ServerConfig): ModelCall {
  // maxRetries 0: the application owns the single retry budget.
  const client = new Anthropic({ apiKey: cfg.anthropicKey, maxRetries: 0, timeout: cfg.generationTimeoutMs });
  return async (content, signal, timeoutMs) => {
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
        { signal, timeout: timeoutMs },
      );
      if (response.stop_reason === 'refusal') return { kind: 'refusal' };
      if (response.stop_reason === 'max_tokens') return { kind: 'truncated' };
      const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
      return { kind: 'text', text, model: response.model };
    } catch (e) {
      return { kind: 'error', result: mapAnthropicError(e) };
    }
  };
}

type OpenAIResponse = {
  model?: string;
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string; refusal?: string }> }>;
};

// OpenAI Responses API via fetch: strict json_schema output, store disabled, no tools.
function openaiCall(cfg: ServerConfig): ModelCall {
  return async (content, signal, timeoutMs) => {
    const timeout = AbortSignal.timeout(timeoutMs);
    let res: Response;
    try {
      res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.openaiKey}` },
        body: JSON.stringify({
          model: cfg.replyModel,
          instructions: REPLY_SYSTEM_PROMPT,
          input: content,
          store: false,
          max_output_tokens: 4000,
          text: { format: { type: 'json_schema', name: 'aac_candidates', schema: modelOutputJsonSchema, strict: true } },
          ...(cfg.replyReasoningEffort ? { reasoning: { effort: cfg.replyReasoningEffort } } : {}),
        }),
        signal: AbortSignal.any([signal, timeout]),
      });
    } catch {
      if (timeout.aborted) return { kind: 'error', result: err('TIMEOUT', 'The suggestion service took too long.') };
      if (signal.aborted) return { kind: 'error', result: err('TIMEOUT', 'The request was cancelled.') };
      return { kind: 'error', result: err('PROVIDER_UNAVAILABLE', 'Could not reach the suggestion service.') };
    }
    if (res.status === 429) return { kind: 'error', result: err('RATE_LIMITED', 'The suggestion service is busy. Try again shortly.') };
    if (res.status === 401 || res.status === 403) return { kind: 'error', result: err('PROVIDER_UNAVAILABLE', 'The server could not authenticate with the suggestion service.', false) };
    if (!res.ok) return { kind: 'error', result: err('PROVIDER_UNAVAILABLE', 'The suggestion service returned an error.') };
    let data: OpenAIResponse;
    try { data = (await res.json()) as OpenAIResponse; } catch { return { kind: 'truncated' }; }
    const parts = (data.output ?? []).filter((o) => o.type === 'message').flatMap((o) => o.content ?? []);
    if (parts.some((p) => p.type === 'refusal')) return { kind: 'refusal' };
    if (data.status === 'incomplete') return { kind: 'truncated' };
    const text = parts.filter((p) => p.type === 'output_text').map((p) => p.text ?? '').join('');
    return { kind: 'text', text, model: data.model ?? cfg.replyModel };
  };
}

export async function generateLive(request: ReplyRequest, cfg: ServerConfig, signal: AbortSignal): Promise<ProviderResult> {
  if (cfg.aiProvider === 'openai') return runWithRepair(request, cfg, signal, openaiCall(cfg));
  if (cfg.aiProvider === 'anthropic') return runWithRepair(request, cfg, signal, anthropicCall(cfg));
  return err('NOT_CONFIGURED', 'No supported AI provider is configured.', false);
}
