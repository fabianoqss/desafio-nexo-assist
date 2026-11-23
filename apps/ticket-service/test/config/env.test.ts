import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.ts';

const requiredEnv = {
  DATABASE_URL: 'postgres://x@localhost/x',
  TICKET_SERVICE_API_TOKEN: 't'.repeat(32),
};

describe('loadEnv', () => {
  it('aplica os padrões quando recebe apenas as variáveis obrigatórias', () => {
    expect(loadEnv(requiredEnv)).toEqual({
      ...requiredEnv,
      NODE_ENV: 'development',
      HOST: '0.0.0.0',
      PORT: 4001,
      FAILURE_RATE: 0,
      EXTRA_LATENCY_MS: 0,
      LOG_LEVEL: 'info',
    });
  });

  it('aceita valores explícitos e converte as variáveis numéricas', () => {
    expect(
      loadEnv({
        ...requiredEnv,
        DATABASE_URL: 'postgresql://x@localhost/x',
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '5000',
        FAILURE_RATE: '1',
        EXTRA_LATENCY_MS: '10000',
        LOG_LEVEL: 'warn',
      }),
    ).toEqual({
      ...requiredEnv,
      DATABASE_URL: 'postgresql://x@localhost/x',
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: 5000,
      FAILURE_RATE: 1,
      EXTRA_LATENCY_MS: 10000,
      LOG_LEVEL: 'warn',
    });
  });

  it('lista as variáveis inválidas sem vazar os valores', () => {
    const invalidToken = 's'.repeat(31);
    const invalidUrl = 'https://user:secret@localhost/x';
    const load = () =>
      loadEnv({
        DATABASE_URL: invalidUrl,
        TICKET_SERVICE_API_TOKEN: invalidToken,
      });

    expect(load).toThrow(/DATABASE_URL/);
    expect(load).toThrow(/TICKET_SERVICE_API_TOKEN/);
    expect(load).not.toThrow(invalidToken);
    expect(load).not.toThrow(invalidUrl);
  });

  it.each([' ', ','])('rejeita um token de 40 caracteres com %j', (separator) => {
    const token = 't'.repeat(20) + separator + 't'.repeat(19);

    expect(() => loadEnv({ ...requiredEnv, TICKET_SERVICE_API_TOKEN: token })).toThrow(
      /^Variáveis de ambiente inválidas: TICKET_SERVICE_API_TOKEN$/,
    );
  });

  it('aceita valores fracionários dentro do intervalo de latência', () => {
    expect(loadEnv({ ...requiredEnv, EXTRA_LATENCY_MS: '0.5' }).EXTRA_LATENCY_MS).toBe(0.5);
  });

  it.each([
    ['FAILURE_RATE', '1.5'],
    ['FAILURE_RATE', '-0.1'],
    ['FAILURE_RATE', ' '],
    ['EXTRA_LATENCY_MS', '10001'],
    ['EXTRA_LATENCY_MS', '-1'],
    ['PORT', '65536'],
    ['PORT', '4001.5'],
    ['NODE_ENV', 'staging'],
    ['LOG_LEVEL', 'unknown'],
  ])('rejeita %s fora dos valores aceitos', (name, value) => {
    expect(() => loadEnv({ ...requiredEnv, [name]: value })).toThrow(name);
  });

  it('exige a URL do banco e o token', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL.*TICKET_SERVICE_API_TOKEN/);
  });
});
