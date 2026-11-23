import pino, { type Logger } from 'pino';

export function createLogger(level: string): Logger {
  return pino({
    level,
    redact: [
      'authorization',
      '*.authorization',
      'req.headers.authorization',
      'request.headers.authorization',
    ],
  });
}
