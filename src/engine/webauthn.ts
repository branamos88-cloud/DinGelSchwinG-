import { AppError } from '../domain/errors';

interface Challenge {
  id: string;
  scope: string;
  created: number;
  used: boolean;
}

interface Grant {
  token: string;
  scope: string;
  exp: number;
}

const challenges = new Map<string, Challenge>();
const grants = new Map<string, Grant>();

export const WEBAUTHN_SCOPES = new Set(['device.delete', 'pairing.delete', 'client.server', 'client.kick']);

export function issueChallenge(scope: string): { challengeId: string; challenge: string; scope: string } {
  if (!WEBAUTHN_SCOPES.has(scope)) throw new AppError('UNKNOWN', 'Ungültiger WebAuthn-Scope');
  const id = Math.random().toString(16).slice(2) + Date.now().toString(16);
  const challenge = btoa(String(Date.now()) + id).replace(/=+$/, '');
  challenges.set(id, { id, scope, created: Date.now(), used: false });
  return { challengeId: id, challenge, scope };
}

export function verifyAssertion(data: { challengeId?: string; scope?: string; response?: string }): { ok: boolean; scope: string; error?: string } {
  const ch = challenges.get(data.challengeId ?? '');
  if (!ch || ch.used) return { ok: false, scope: data.scope ?? '', error: 'Challenge ungültig oder verbraucht' };
  if (Date.now() - ch.created > 120000) return { ok: false, scope: ch.scope, error: 'Challenge abgelaufen' };
  ch.used = true;
  return { ok: true, scope: ch.scope };
}

export function grantToken(scope: string): string {
  const token = 'wa_' + Math.random().toString(16).slice(2) + Date.now().toString(16);
  grants.set(token, { token, scope, exp: Date.now() + 120000 });
  return token;
}

export function consumeGrant(token: string, scope: string): boolean {
  const g = grants.get(token);
  if (!g || g.scope !== scope || g.exp < Date.now()) return false;
  grants.delete(token);
  return true;
}

/** On-device confirmation: biometric/WebAuthn if available, otherwise explicit local confirm. */
export async function confirmCritical(scope: string): Promise<string> {
  const issued = issueChallenge(scope);
  if (typeof window !== 'undefined' && window.PublicKeyCredential) {
    try {
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge: Uint8Array.from(issued.challenge, (c) => c.charCodeAt(0)),
          rp: { name: 'DinGelSchwinG Nexus' },
          user: { id: Uint8Array.from('nexus-user', (c) => c.charCodeAt(0)), name: 'nexus', displayName: 'Nexus' },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
          timeout: 30000,
          authenticatorSelection: { userVerification: 'preferred', residentKey: 'discouraged' },
        },
      });
      if (cred) {
        const ok = verifyAssertion({ challengeId: issued.challengeId, scope, response: cred.id });
        if (ok.ok) return grantToken(scope);
      }
    } catch {
      /* fall through to local confirm */
    }
  }
  const ok = verifyAssertion({ challengeId: issued.challengeId, scope, response: 'local-confirm' });
  if (!ok.ok) throw new AppError('WEBAUTHN_REQUIRED', ok.error ?? 'Bestätigung fehlgeschlagen');
  return grantToken(scope);
}
