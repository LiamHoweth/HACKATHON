import { serverConfig } from '@/server/config';

export const dynamic = 'force-dynamic';

// Configuration availability only. Never returns secret values.
export async function GET() {
  const cfg = serverConfig();
  return Response.json(
    {
      replies: { configured: cfg.repliesConfigured, provider: cfg.repliesConfigured ? cfg.aiProvider : null, model: cfg.repliesConfigured ? cfg.replyModel : null },
      transcription: { configured: cfg.transcriptionConfigured, provider: cfg.transcriptionConfigured ? cfg.transcriptionProvider : null },
      fixturesEnabled: cfg.fixturesEnabled,
      accessRequired: cfg.accessToken.length > 0,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
