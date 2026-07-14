import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { subscribe, ensureConnected } from '@/lib/callmonitor';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  ensureConnected();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const unsubscribe = subscribe((event) => {
        const data = JSON.stringify(event);
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      });

      // Cleanup on close
      const interval = setInterval(() => {
        try { controller.enqueue(encoder.encode(': ping\n\n')); }
        catch { clearInterval(interval); unsubscribe(); }
      }, 30_000);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
