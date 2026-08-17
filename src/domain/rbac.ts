import { RbacError } from './errors';

export enum Role {
  GUEST = 'guest',
  OPERATOR = 'operator',
  SERVICE = 'service',
  DEVELOPER = 'developer',
  EXPERT = 'expert',
  EMERGENCY = 'emergency',
}

export const ROLE_LEVELS: Record<Role, number> = {
  [Role.GUEST]: 0,
  [Role.OPERATOR]: 1,
  [Role.SERVICE]: 2,
  [Role.DEVELOPER]: 3,
  [Role.EXPERT]: 4,
  [Role.EMERGENCY]: 5,
};

export type Action =
  | 'terminal.diagnostics'
  | 'terminal.interactive'
  | 'terminal.dongle.flash'
  | 'terminal.network.ssh'
  | 'signal.analyze'
  | 'ai.finetune'
  | 'emergency.override';

const ACTION_MATRIX: Record<Action, Role[]> = {
  'terminal.diagnostics': [Role.OPERATOR, Role.SERVICE, Role.DEVELOPER, Role.EXPERT, Role.EMERGENCY],
  'terminal.interactive': [Role.SERVICE, Role.DEVELOPER, Role.EXPERT, Role.EMERGENCY],
  'terminal.dongle.flash': [Role.DEVELOPER, Role.EXPERT, Role.EMERGENCY],
  'terminal.network.ssh': [Role.DEVELOPER, Role.EXPERT, Role.EMERGENCY],
  'signal.analyze': [Role.SERVICE, Role.DEVELOPER, Role.EXPERT, Role.EMERGENCY],
  'ai.finetune': [Role.EXPERT, Role.EMERGENCY],
  'emergency.override': [Role.EMERGENCY],
};

export interface JwtPayload {
  sub: string;
  role: Role;
  iat: number;
  exp: number;
}

function b64urlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return atob(b64);
}

export function decodeJwt(token: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length < 2) throw new RbacError('Ungültiges Token');
  const json = b64urlDecode(parts[1]);
  const payload = JSON.parse(json) as JwtPayload;
  if (payload.exp && payload.exp * (payload.exp > 1e12 ? 1 : 1000) < Date.now() && payload.exp < Date.now() / 1000) {
    // exp is seconds
  }
  if (typeof payload.exp === 'number' && payload.exp < Date.now() / 1000) {
    throw new RbacError('Token abgelaufen');
  }
  return payload;
}

export function requireRole(token: string, minRole: Role): JwtPayload {
  const payload = decodeJwt(token);
  if (ROLE_LEVELS[payload.role] < ROLE_LEVELS[minRole]) {
    throw new RbacError(
      `RBAC-Verletzung: benötigt ${minRole} (L${ROLE_LEVELS[minRole]}), hat ${payload.role} (L${ROLE_LEVELS[payload.role]})`,
    );
  }
  return payload;
}

export function requireAction(token: string, action: Action): JwtPayload {
  const payload = decodeJwt(token);
  const allowed = ACTION_MATRIX[action];
  if (!allowed.includes(payload.role)) {
    throw new RbacError(`Aktion "${action}" nicht erlaubt für Rolle "${payload.role}"`);
  }
  return payload;
}

export function canAction(role: Role, action: Action): boolean {
  return ACTION_MATRIX[action].includes(role);
}

export const ROLE_LABELS: Record<Role, string> = {
  [Role.GUEST]: 'Gast',
  [Role.OPERATOR]: 'Operator',
  [Role.SERVICE]: 'Service',
  [Role.DEVELOPER]: 'Entwickler',
  [Role.EXPERT]: 'Expert',
  [Role.EMERGENCY]: 'Notfall',
};

export const DEMO_USERS: Record<string, { role: Role; password: string; name: string }> = {
  'guest@local': { role: Role.GUEST, password: 'pwd_guest', name: 'Gast' },
  'operator@example.com': { role: Role.OPERATOR, password: 'pwd_operator', name: 'Operator' },
  'service@example.com': { role: Role.SERVICE, password: 'pwd_service', name: 'Service' },
  'developer@example.com': { role: Role.DEVELOPER, password: 'pwd_developer', name: 'Developer' },
  'expert@example.com': { role: Role.EXPERT, password: 'pwd_expert', name: 'Expert' },
  'emergency@example.com': { role: Role.EMERGENCY, password: 'pwd_emergency', name: 'Emergency' },
};
