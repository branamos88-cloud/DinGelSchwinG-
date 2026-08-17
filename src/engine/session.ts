import { AppError } from '../domain/errors';
import { DEMO_USERS, JwtPayload, Role, decodeJwt } from '../domain/rbac';
import { store } from './store';

const SECRET = 'nexus-local-hs256-v1';

function b64url(data: string): string {
  return btoa(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(input: string): string {
  let h = 0x811c9dc5;
  const s = SECRET + '|' + input;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return b64url(String(h >>> 0));
}

export function issueToken(email: string, role: Role, hours = 8): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = { sub: email, role, iat: now, exp: now + hours * 3600 };
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = sign(`${header}.${body}`);
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) throw new AppError('AUTH_MISSING', 'Token fehlt oder ist ungültig');
  if (sign(`${parts[0]}.${parts[1]}`) !== parts[2]) {
    throw new AppError('AUTH_MISSING', 'Token-Signatur ungültig');
  }
  const payload = decodeJwt(token);
  if (payload.exp < Date.now() / 1000) throw new AppError('AUTH_EXPIRED', 'Sitzung abgelaufen');
  return payload;
}

export interface SessionState {
  token: string;
  user: JwtPayload;
}

export function login(email: string, password: string): SessionState {
  const rec = DEMO_USERS[email.trim().toLowerCase()];
  if (!rec || rec.password !== password) {
    throw new AppError('AUTH_MISSING', 'Ungültige Zugangsdaten');
  }
  const token = issueToken(email.trim().toLowerCase(), rec.role);
  store.set('token', token);
  return { token, user: verifyToken(token) };
}

export function logout(): void {
  store.del('token');
}

export function restoreSession(): SessionState | null {
  const token = store.get<string | null>('token', null);
  if (!token) return null;
  try {
    return { token, user: verifyToken(token) };
  } catch {
    store.del('token');
    return null;
  }
}
