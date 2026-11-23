import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

const cookieName = 'nexo_session';
const cookieOptions = { prefix: 'host', httpOnly: true, sameSite: 'Lax' } as const;

export function getSessionCookie(context: Context): string | undefined {
  return getCookie(context, cookieName, cookieOptions.prefix);
}

export function setSessionCookie(context: Context, token: string, maxAge: number): void {
  setCookie(context, cookieName, token, { ...cookieOptions, maxAge });
}

export function clearSessionCookie(context: Context): void {
  deleteCookie(context, cookieName, cookieOptions);
}
