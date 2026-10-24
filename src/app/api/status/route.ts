import { serverConfig } from '@/server/config';
import { ACCESS_HEADER, verifyAccessCode } from '@/server/request-guards';

export const dynamic = 'force-dynamic';

// Configuration availability only. Never returns secret values. When the client sends an
// access code, reports whether it is valid so apps can show a connection check.
export async function GET(request: Request) {
  const cfg = serverConfig();
  const sent = request.headers.has(ACCESS_HEADER);
  const verdict = sent && cfg.accessToken ? verifyAccessCode(request, cfg) : null;
  const production = process.env.NODE_ENV === 'production';
  const reveal = !production || verdict === 'ok';
  return Response.json(
    {
      replies: {
        configured: cfg.repliesConfigured,
        provider: cfg.repliesConfigured && reveal ? cfg.aiProvider : null,
        model: cfg.repliesConfigured && reveal ? cfg.replyModel : null,
      },
      transcription: { configured: cfg.transcriptionConfigured, provider: cfg.transcriptionConfigured ? cfg.transcriptionProvider : null },
      fixturesEnabled: cfg.fixturesEnabled,
      accessRequired: cfg.accessToken.length > 0 || production,
      accessCodeValid: !sent ? null : verdict === 'ok',
      accessCodeThrottled: verdict === 'throttled',
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
