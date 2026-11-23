import { isIP } from 'node:net';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';

export function clientIp(context: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const forwardedFor = context.req.header('X-Forwarded-For');
    if (forwardedFor !== undefined) {
      const forwardedIp = forwardedFor.slice(forwardedFor.lastIndexOf(',') + 1).trim();
      if (isIP(forwardedIp) !== 0) {
        return forwardedIp;
      }
    }
  }

  try {
    const { address } = getConnInfo(context).remote;
    return address === undefined || address === '' ? 'unknown' : address;
  } catch {
    return 'unknown';
  }
}
