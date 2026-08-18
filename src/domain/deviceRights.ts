import { Role } from './rbac';
import { DeviceAction, DeviceResource } from './types';
import { RbacError } from './errors';

export const DEVICE_CRUD: Record<Role, Partial<Record<DeviceResource, DeviceAction[]>>> = {
  [Role.GUEST]: {
    network: [DeviceAction.READ],
  },
  [Role.OPERATOR]: {
    hardware: [DeviceAction.READ],
    network: [DeviceAction.READ],
  },
  [Role.SERVICE]: {
    hardware: [DeviceAction.READ, DeviceAction.WRITE, DeviceAction.UPDATE, DeviceAction.DELETE],
    dongle: [DeviceAction.READ, DeviceAction.WRITE, DeviceAction.UPDATE, DeviceAction.DELETE],
    ble_token: [DeviceAction.READ],
    ntag: [DeviceAction.READ],
    network: [DeviceAction.READ],
  },
  [Role.DEVELOPER]: {
    hardware: [DeviceAction.READ, DeviceAction.WRITE, DeviceAction.UPDATE, DeviceAction.DELETE],
    dongle: [DeviceAction.READ, DeviceAction.WRITE, DeviceAction.UPDATE, DeviceAction.DELETE],
    ble_token: [DeviceAction.READ, DeviceAction.WRITE, DeviceAction.UPDATE, DeviceAction.DELETE],
    ntag: [DeviceAction.READ, DeviceAction.WRITE, DeviceAction.UPDATE, DeviceAction.DELETE],
    network: [DeviceAction.READ, DeviceAction.WRITE, DeviceAction.UPDATE, DeviceAction.DELETE],
  },
  [Role.EXPERT]: {
    hardware: [DeviceAction.READ, DeviceAction.WRITE, DeviceAction.UPDATE, DeviceAction.DELETE],
    dongle: [DeviceAction.READ, DeviceAction.WRITE, DeviceAction.UPDATE, DeviceAction.DELETE],
    ble_token: [DeviceAction.READ, DeviceAction.WRITE, DeviceAction.UPDATE, DeviceAction.DELETE],
    ntag: [DeviceAction.READ, DeviceAction.WRITE, DeviceAction.UPDATE, DeviceAction.DELETE],
    network: [DeviceAction.READ, DeviceAction.WRITE, DeviceAction.UPDATE, DeviceAction.DELETE],
  },
  [Role.EMERGENCY]: {
    hardware: [DeviceAction.READ, DeviceAction.WRITE, DeviceAction.UPDATE, DeviceAction.DELETE],
    dongle: [DeviceAction.READ, DeviceAction.WRITE, DeviceAction.UPDATE, DeviceAction.DELETE],
    ble_token: [DeviceAction.READ, DeviceAction.WRITE, DeviceAction.UPDATE, DeviceAction.DELETE],
    ntag: [DeviceAction.READ, DeviceAction.WRITE, DeviceAction.UPDATE, DeviceAction.DELETE],
    network: [DeviceAction.READ, DeviceAction.WRITE, DeviceAction.UPDATE, DeviceAction.DELETE],
  },
};

export function resourceForNodeKind(kind: string): DeviceResource {
  switch (kind) {
    case 'dongle':
      return 'dongle';
    case 'ble':
      return 'ble_token';
    case 'ntag':
      return 'ntag';
    case 'network':
    case 'wifi':
      return 'network';
    case 'hardware':
    default:
      return 'hardware';
  }
}

export function deviceRightsFor(role: Role, resource: DeviceResource): DeviceAction[] {
  return DEVICE_CRUD[role]?.[resource] ?? [];
}

export function canDeviceAction(role: Role, resource: DeviceResource, action: DeviceAction): boolean {
  return deviceRightsFor(role, resource).includes(action);
}

export function requireDeviceAction(role: Role, resource: DeviceResource, action: DeviceAction): void {
  if (!canDeviceAction(role, resource, action)) {
    throw new RbacError(`Device-CRUD verweigert: Rolle "${role}" darf "${action}" auf "${resource}" nicht ausführen`);
  }
}
