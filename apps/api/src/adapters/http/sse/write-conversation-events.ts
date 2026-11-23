import { type ConversationEvent, ErrorCode } from '@nexo/contracts';
import type { Context } from 'hono';
import { type SSEMessage, type SSEStreamingApi, streamSSE } from 'hono/streaming';
import type { ConversationEventBus } from '../../../application/ports/conversation-event-bus.ts';

const maxPendingWrites = 64;

function eventFrame(event: ConversationEvent): SSEMessage {
  return { event: event.type, data: JSON.stringify(event) };
}

function abortOnSignal(stream: SSEStreamingApi, signal: AbortSignal): () => void {
  const abort = () => {
    stream.abort();
  };
  if (signal.aborted) {
    abort();
  } else {
    signal.addEventListener('abort', abort, { once: true });
  }
  return () => {
    signal.removeEventListener('abort', abort);
  };
}

export function streamConversation(
  context: Context,
  callback: (stream: SSEStreamingApi) => Promise<void>,
): Response {
  return streamSSE(context, async (stream) => {
    try {
      await callback(stream);
    } catch {
      stream.abort();
    }
  });
}

export async function writeConversationEvents(
  stream: SSEStreamingApi,
  signal: AbortSignal,
  iterator: AsyncIterator<ConversationEvent, unknown>,
  first: IteratorResult<ConversationEvent, unknown>,
): Promise<void> {
  const detach = abortOnSignal(stream, signal);
  try {
    let result = first;
    while (!signal.aborted && !result.done) {
      await stream.writeSSE(eventFrame(result.value));
      if (stream.aborted) {
        break;
      }
      result = await iterator.next();
    }
  } catch {
    if (!stream.aborted) {
      await stream.writeSSE(
        eventFrame({
          type: 'error',
          code: ErrorCode.INTERNAL_ERROR,
          message: 'Erro interno do servidor',
        }),
      );
      await stream.writeSSE(eventFrame({ type: 'done' }));
    }
  } finally {
    detach();
    await iterator.return?.().catch(() => undefined);
  }
}

export async function subscribeToConversationEvents(
  stream: SSEStreamingApi,
  signal: AbortSignal,
  eventBus: ConversationEventBus,
  filter: { conversationId?: string },
  authorize: () => Promise<boolean>,
  pingIntervalMs = 25_000,
): Promise<void> {
  if (signal.aborted) {
    return;
  }

  let pendingWrites = 0;
  let writeTimeout: ReturnType<typeof setTimeout> | undefined;
  let writes = Promise.resolve();

  async function writeFrame(frame: SSEMessage) {
    if (stream.aborted) {
      return;
    }
    writeTimeout = setTimeout(() => {
      stream.abort();
    }, pingIntervalMs);
    await stream.writeSSE(frame);
  }

  function enqueue(frame: SSEMessage, needsAuthorization = true) {
    if (stream.aborted) {
      return;
    }
    if (pendingWrites + 1 >= maxPendingWrites) {
      stream.abort();
      return;
    }
    pendingWrites += 1;
    writes = writes
      .then(async () => {
        if (stream.aborted) {
          return;
        }
        if (needsAuthorization && !(await authorize())) {
          stream.abort();
          return;
        }
        await writeFrame(frame);
      })
      .catch(() => {
        stream.abort();
      })
      .finally(() => {
        clearTimeout(writeTimeout);
        writeTimeout = undefined;
        pendingWrites -= 1;
      });
  }

  let checkingSession = false;
  async function ping() {
    if (stream.aborted || checkingSession) {
      return;
    }
    checkingSession = true;
    try {
      if (await authorize()) {
        enqueue({ event: 'ping', data: '' }, pendingWrites > 0);
      } else {
        stream.abort();
      }
    } catch {
      stream.abort();
    } finally {
      checkingSession = false;
    }
  }

  const { promise, resolve } = Promise.withResolvers();
  stream.onAbort(() => {
    resolve(undefined);
  });
  const unsubscribe = eventBus.subscribe(filter, (event) => {
    enqueue(eventFrame(event));
  });
  const timer = setInterval(() => {
    void ping();
  }, pingIntervalMs);
  const detach = abortOnSignal(stream, signal);
  try {
    await promise;
  } finally {
    clearInterval(timer);
    clearTimeout(writeTimeout);
    detach();
    unsubscribe();
  }
}
