import { serverConfig } from '@/server/config';
import { ACCESS_HEADER, accessCodeMatches } from '@/server/request-guards';

export const dynamic = 'force-dynamic';

// Configuration availability only. Never returns secret values. When the client sends an
// access code, reports whether it is valid so apps can show a connection check.
export async function GET(request: Request) {
  const cfg = serverConfig();
  const sent = request.headers.has(ACCESS_HEADER);
  return Response.json(
    {
      replies: { configured: cfg.repliesConfigured, provider: cfg.repliesConfigured ? cfg.aiProvider : null, model: cfg.repliesConfigured ? cfg.replyModel : null },
      transcription: { configured: cfg.transcriptionConfigured, provider: cfg.transcriptionConfigured ? cfg.transcriptionProvider : null },
      fixturesEnabled: cfg.fixturesEnabled,
      accessRequired: cfg.accessToken.length > 0 || process.env.NODE_ENV === 'production',
      accessCodeValid: sent ? accessCodeMatches(request, cfg) : null,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
