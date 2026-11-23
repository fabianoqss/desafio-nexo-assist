import { describe, expect, it } from 'vitest';
import { createInMemoryRateLimiter } from '../../../src/adapters/rate-limit/in-memory-rate-limiter.ts';

describe('createInMemoryRateLimiter', () => {
  it('permite dez requisições por minuto e libera ao expirar a janela', () => {
    const limiter = createInMemoryRateLimiter();
    const start = Date.parse('2026-11-23T12:00:30Z');

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(limiter.consume('login', 10, 60_000, new Date(start))).toEqual({
        allowed: true,
        retryAfterSeconds: 0,
      });
    }

    expect(limiter.consume('login', 10, 60_000, new Date(start + 59_999))).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
    expect(limiter.consume('login', 10, 60_000, new Date(start + 60_000))).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });

  it('mantém as janelas separadas por chave', () => {
    const limiter = createInMemoryRateLimiter();
    const start = new Date('2026-11-23T12:00:00Z');

    expect(limiter.consume('login:a', 1, 60_000, start).allowed).toBe(true);
    expect(limiter.consume('login:a', 1, 60_000, start)).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
    expect(limiter.consume('login:b', 1, 60_000, start).allowed).toBe(true);
  });

  it('descarta a janela que ainda permite requisições e preserva a bloqueada', () => {
    const limiter = createInMemoryRateLimiter({ maxKeys: 2 });
    const start = new Date('2026-11-23T12:00:00Z');

    expect(limiter.consume('blocked', 1, 60_000, start).allowed).toBe(true);
    expect(limiter.consume('available', 2, 60_000, start).allowed).toBe(true);
    expect(limiter.consume('new', 1, 60_000, start).allowed).toBe(true);

    expect(limiter.consume('blocked', 1, 60_000, start).allowed).toBe(false);
    expect(limiter.consume('available', 2, 60_000, start).allowed).toBe(false);
  });

  it('recusa uma chave nova até expirar a primeira janela quando todas bloqueiam', () => {
    const limiter = createInMemoryRateLimiter({ maxKeys: 2 });
    const start = Date.parse('2026-11-23T12:00:00Z');

    limiter.consume('long', 1, 60_000, new Date(start));
    limiter.consume('short', 2, 2_500, new Date(start));
    limiter.consume('short', 2, 2_500, new Date(start));

    expect(limiter.consume('new', 5, 60_000, new Date(start))).toEqual({
      allowed: false,
      retryAfterSeconds: 3,
    });
    expect(limiter.consume('new', 5, 60_000, new Date(start + 2_499))).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
    expect(limiter.consume('new', 5, 60_000, new Date(start + 2_500)).allowed).toBe(true);
    expect(limiter.consume('long', 1, 60_000, new Date(start + 2_500)).allowed).toBe(false);
  });

  it('remove janelas expiradas antes de descartar uma chave ativa', () => {
    const limiter = createInMemoryRateLimiter({ maxKeys: 3 });
    const start = Date.parse('2026-11-23T12:00:00Z');

    limiter.consume('active', 1, 60_000, new Date(start));
    limiter.consume('expired', 1, 1_000, new Date(start));
    limiter.consume('other', 1, 60_000, new Date(start));

    const later = new Date(start + 1_000);
    expect(limiter.consume('new', 1, 60_000, later).allowed).toBe(true);
    expect(limiter.consume('active', 1, 60_000, later).allowed).toBe(false);
  });

  it('informa pelo menos um segundo quando recusa no instante de expiração da janela', () => {
    const limiter = createInMemoryRateLimiter();
    const start = new Date('2026-11-23T12:00:00Z');
    const result = limiter.consume('login', 0, 0, start);

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it('reinicia uma janela curta expirada enquanto outra continua ativa', () => {
    const limiter = createInMemoryRateLimiter();
    const start = Date.parse('2026-11-23T12:00:00Z');

    expect(limiter.consume('login', 1, 1_000, new Date(start)).allowed).toBe(true);
    expect(limiter.consume('message', 1, 60_000, new Date(start)).allowed).toBe(true);
    expect(limiter.consume('login', 1, 1_000, new Date(start + 1_000)).allowed).toBe(true);
    expect(limiter.consume('message', 1, 60_000, new Date(start + 1_000))).toEqual({
      allowed: false,
      retryAfterSeconds: 59,
    });
  });
});
