// Transcription adapter request shape with fetch mocked: language hint and optional prompt only.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { transcribe } from '@/server/transcription';
import { serverConfig, type ServerConfig } from '@/server/config';

const base = { transcriptionKey: 'test-key-not-real', transcriptionModel: 'test-model', transcriptionBaseUrl: 'https://example.test/v1', transcriptionTimeoutMs: 5000 };

async function sentForm(cfgOver: Partial<ServerConfig>) {
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    void init;
    return new Response(JSON.stringify({ text: ' Hello there. ' }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  const audio = new File([new Blob(['x'])], 'capture.m4a', { type: 'audio/mp4' });
  const res = await transcribe(audio, { ...base, transcriptionLanguage: '', transcriptionPrompt: '', ...cfgOver } as ServerConfig, new AbortController().signal);
  expect(res).toEqual({ ok: true, text: 'Hello there.' });
  return (fetchMock.mock.calls[0][1].body as FormData);
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('transcription request', () => {
  it('sends the language hint and no prompt by default', async () => {
    const form = await sentForm({ transcriptionLanguage: 'en' });
    expect(form.get('language')).toBe('en');
    expect(form.get('prompt')).toBeNull();
    expect(form.get('response_format')).toBe('json');
  });

  it('sends a prompt only when configured and omits the language when unset', async () => {
    const form = await sentForm({ transcriptionPrompt: 'Short everyday sentence.' });
    expect(form.get('language')).toBeNull();
    expect(form.get('prompt')).toBe('Short everyday sentence.');
  });
});

describe('transcription config', () => {
  it('defaults the language to en and normalises or disables it', () => {
    vi.stubEnv('TRANSCRIPTION_LANGUAGE', '');
    expect(serverConfig().transcriptionLanguage).toBe('en');
    vi.stubEnv('TRANSCRIPTION_LANGUAGE', 'es-MX');
    expect(serverConfig().transcriptionLanguage).toBe('es');
    vi.stubEnv('TRANSCRIPTION_LANGUAGE', 'auto');
    expect(serverConfig().transcriptionLanguage).toBe('');
    vi.stubEnv('TRANSCRIPTION_PROMPT', 'x'.repeat(500));
    expect(serverConfig().transcriptionPrompt).toHaveLength(200);
  });
});
