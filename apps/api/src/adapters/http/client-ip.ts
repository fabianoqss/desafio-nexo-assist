import { isIP } from 'node:net';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';

function canonicalIp(ip: string): string | undefined {
  switch (isIP(ip)) {
    case 4:
      return ip;
    case 6: {
      const [address = ip] = ip.split('%', 1);
      return new URL(`http://[${address}]`).hostname.slice(1, -1);
    }
  }
}

export function clientIp(context: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const forwardedFor = context.req.header('X-Forwarded-For');
    if (forwardedFor !== undefined) {
      const forwardedIp = canonicalIp(forwardedFor.slice(forwardedFor.lastIndexOf(',') + 1).trim());
      if (forwardedIp !== undefined) {
        return forwardedIp;
      }
    }
  }

  try {
    const { address } = getConnInfo(context).remote;
    return canonicalIp(address ?? '') ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
