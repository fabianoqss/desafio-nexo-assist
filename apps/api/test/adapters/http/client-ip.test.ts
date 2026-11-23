import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { clientIp } from '../../../src/adapters/http/client-ip.ts';

const socketBindings = { incoming: { socket: { remoteAddress: '192.0.2.20' } } };

function appWithTrustProxy(trustProxy: boolean) {
  const app = new Hono();
  app.get('/', (context) => context.text(clientIp(context, trustProxy)));
  return app;
}

describe('clientIp', () => {
  it('ignora X-Forwarded-For sem proxy confiável e usa o endereço do socket', async () => {
    const response = await appWithTrustProxy(false).request(
      '/',
      { headers: { 'X-Forwarded-For': '198.51.100.4' } },
      socketBindings,
    );

    expect(await response.text()).toBe('192.0.2.20');
  });

  it('usa o último endereço encaminhado por um proxy confiável', async () => {
    const response = await appWithTrustProxy(true).request(
      '/',
      { headers: { 'X-Forwarded-For': '1.1.1.1, 203.0.113.5' } },
      socketBindings,
    );

    expect(await response.text()).toBe('203.0.113.5');
  });

  it.each(['2001:DB8::1', '2001:0db8::1', '2001:db8:0:0:0:0:0:1'])(
    'usa a mesma forma canônica para o endereço IPv6 %s',
    async (address) => {
      const forwarded = await appWithTrustProxy(true).request('/', {
        headers: { 'X-Forwarded-For': address },
      });
      const direct = await appWithTrustProxy(false).request(
        '/',
        {},
        { incoming: { socket: { remoteAddress: address } } },
      );

      expect(await forwarded.text()).toBe('2001:db8::1');
      expect(await direct.text()).toBe('2001:db8::1');
    },
  );

  it.each([
    { description: 'vazio', forwardedFor: '1.1.1.1, ' },
    { description: 'inválido', forwardedFor: '1.1.1.1, exemplo' },
    { description: 'com 100 mil caracteres', forwardedFor: 'x'.repeat(100_000) },
  ])(
    'recorre ao socket quando o último endereço encaminhado é $description',
    async ({ forwardedFor }) => {
      const response = await appWithTrustProxy(true).request(
        '/',
        { headers: { 'X-Forwarded-For': forwardedFor } },
        socketBindings,
      );

      expect(await response.text()).toBe('192.0.2.20');
    },
  );

  it('retorna unknown em app.request() sem socket e sem proxy confiável', async () => {
    const response = await appWithTrustProxy(false).request('/', {
      headers: { 'X-Forwarded-For': '198.51.100.4' },
    });

    expect(await response.text()).toBe('unknown');
  });

  it.each([undefined, ''])(
    'retorna unknown quando o endereço do socket é %j',
    async (remoteAddress) => {
      const response = await appWithTrustProxy(true).request(
        '/',
        {},
        { incoming: { socket: { remoteAddress } } },
      );

      expect(await response.text()).toBe('unknown');
    },
  );
});
