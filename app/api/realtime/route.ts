import { env } from 'cloudflare:workers';
import { liveSession } from '@/lib/gpt-live';
const key = () =>
  (env as unknown as Record<string, string>).OPENAI_API_KEY ||
  process.env.OPENAI_API_KEY;
export async function GET() {
  return Response.json(
    { configured: !!key() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    return Response.json(
      { error: 'This request must come from Loop.' },
      { status: 403 },
    );
  if (!key())
    return Response.json(
      {
        error:
          'Live shopping is not configured yet. Please use text search for now.',
      },
      { status: 503 },
    );
  const sdp = await request.text();
  if (sdp.length > 50000 || !sdp.startsWith('v=0'))
    return Response.json(
      { error: 'Invalid connection request.' },
      { status: 400 },
    );
  try {
    const res = await fetch('https://api.openai.com/v1/live/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session: liveSession,
        transport: { type: 'webrtc', sdp },
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) {
      console.error('GPT-Live connection rejected', res.status);
      return Response.json(
        {
          error:
            res.status === 429
              ? 'Live shopping is busy or the API usage limit was reached. Please try again later.'
              : 'Live shopping could not connect. Please try again.',
        },
        { status: 502 },
      );
    }
    return new Response(await res.text(), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return Response.json(
      { error: 'The voice connection timed out. Please try again.' },
      { status: 504 },
    );
  }
}
