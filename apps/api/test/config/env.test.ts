import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.ts';

const requiredEnv = {
  DATABASE_URL: 'postgresql://localhost/nexo_test',
  TICKET_SERVICE_URL: 'http://localhost:4001',
  TICKET_SERVICE_API_TOKEN: 't'.repeat(32),
  WEB_ORIGIN: 'http://localhost:5173',
};

describe('loadEnv', () => {
  it('aplica os padrões com apenas as variáveis obrigatórias', () => {
    expect(loadEnv(requiredEnv)).toEqual({
      ...requiredEnv,
      NODE_ENV: 'development',
      HOST: '0.0.0.0',
      PORT: 4000,
      SESSION_TTL_HOURS: 12,
      TRUST_PROXY: false,
      LOG_LEVEL: 'info',
    });
  });

  it('aceita configurações explícitas e converte os tipos', () => {
    expect(
      loadEnv({
        ...requiredEnv,
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '8080',
        TICKET_SERVICE_URL: 'https://tickets.example',
        WEB_ORIGIN: 'https://app.example',
        SESSION_TTL_HOURS: '72',
        TRUST_PROXY: 'true',
        LOG_LEVEL: 'warn',
      }),
    ).toEqual({
      ...requiredEnv,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: 8080,
      TICKET_SERVICE_URL: 'https://tickets.example',
      WEB_ORIGIN: 'https://app.example',
      SESSION_TTL_HOURS: 72,
      TRUST_PROXY: true,
      LOG_LEVEL: 'warn',
    });
  });

  it('aceita TRUST_PROXY=false e uma sessão de uma hora', () => {
    expect(loadEnv({ ...requiredEnv, TRUST_PROXY: 'false', SESSION_TTL_HOURS: '1' })).toMatchObject(
      {
        TRUST_PROXY: false,
        SESSION_TTL_HOURS: 1,
      },
    );
  });

  it.each([
    ['WEB_ORIGIN', 'http://localhost:5173/app'],
    ['WEB_ORIGIN', 'https://app.example?query=value'],
    ['WEB_ORIGIN', 'https://app.example#fragment'],
    ['WEB_ORIGIN', 'https://user@app.example'],
    ['WEB_ORIGIN', 'https://:password@app.example'],
    ['WEB_ORIGIN', 'file:///'],
    ['DATABASE_URL', 'https://user:password@db.example/db'],
    ['TICKET_SERVICE_URL', 'ftp://tickets.example'],
    ['TICKET_SERVICE_URL', 'https://user@tickets.example'],
    ['TICKET_SERVICE_URL', 'https://:password@tickets.example'],
    ['TICKET_SERVICE_API_TOKEN', 't'.repeat(31)],
    ['TICKET_SERVICE_API_TOKEN', 't'.repeat(32) + ',tail'],
    ['TICKET_SERVICE_API_TOKEN', 't'.repeat(32) + ' tail'],
    ['TICKET_SERVICE_API_TOKEN', 't'.repeat(32) + 'é'],
    ['TICKET_SERVICE_API_TOKEN', 't'.repeat(32) + '\u007f'],
    ['TICKET_SERVICE_API_TOKEN', 't'.repeat(32) + '\u0000'],
    ['SESSION_TTL_HOURS', '0'],
    ['SESSION_TTL_HOURS', '73'],
    ['SESSION_TTL_HOURS', '12.5'],
    ['SESSION_TTL_HOURS', '0x10'],
    ['SESSION_TTL_HOURS', '1e1'],
    ['TRUST_PROXY', '1'],
    ['TRUST_PROXY', 'TRUE'],
    ['PORT', '65536'],
    ['PORT', '0x10'],
    ['PORT', '1e1'],
    ['PORT', ' 4000 '],
    ['NODE_ENV', 'staging'],
    ['LOG_LEVEL', 'verbose'],
  ])('identifica %s quando recebe um valor inválido', (name, value) => {
    expect(() => loadEnv({ ...requiredEnv, [name]: value })).toThrow(
      new Error(`Variáveis de ambiente inválidas: ${name}`),
    );
  });

  it('lista as variáveis inválidas sem incluir os valores', () => {
    expect(() =>
      loadEnv({
        ...requiredEnv,
        DATABASE_URL: 'https://user:password@db.example/db',
        TICKET_SERVICE_API_TOKEN: 'segredo-invalido',
      }),
    ).toThrow(/^Variáveis de ambiente inválidas: DATABASE_URL, TICKET_SERVICE_API_TOKEN$/);
  });
});
