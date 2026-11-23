import { Hono } from 'hono';

interface FakeResponse {
  status: number;
  body: unknown;
  delayMs?: number;
}

interface RecordedRequest {
  method: string;
  url: URL;
  headers: Headers;
  body: string;
  signal: AbortSignal;
}

export function createFakeTicketService() {
  const app = new Hono();
  const routes = new Map<string, FakeResponse[]>();
  const requests: RecordedRequest[] = [];

  app.all('*', async ({ req }) => {
    requests.push({
      method: req.method,
      url: new URL(req.url),
      headers: req.raw.headers,
      body: await req.text(),
      signal: req.raw.signal,
    });
    const reply = routes.get(`${req.method} ${req.path}`)?.shift();
    if (!reply) return new Response(null, { status: 500 });

    if (reply.delayMs !== undefined) {
      await new Promise<void>((resolve) => setTimeout(resolve, reply.delayMs));
    }
    return Response.json(reply.body, { status: reply.status });
  });

  const fetch: typeof globalThis.fetch = async (input, init) => app.request(input, init);

  return {
    fetch,
    requests,
    program(method: string, path: string, ...replies: FakeResponse[]) {
      routes.set(`${method} ${path}`, replies);
    },
  };
}
