interface NDEFReadingEvent extends Event {
  serialNumber: string;
  message: { records: Array<{ recordType: string; data: DataView; mediaType?: string }> };
}

interface NDEFReader {
  scan(opts?: { signal?: AbortSignal }): Promise<void>;
  write(message: unknown): Promise<void>;
  onreading: ((ev: NDEFReadingEvent) => void) | null;
  onreadingerror: ((ev: Event) => void) | null;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}

interface NDEFReaderConstructor {
  new (): NDEFReader;
}

interface Navigator {
  usb?: {
    getDevices(): Promise<Array<{ vendorId: number; productId: number; productName?: string; serialNumber?: string }>>;
    requestDevice(opts: { filters: Array<{ vendorId?: number }> }): Promise<unknown>;
  };
  bluetooth?: {
    requestDevice(opts: {
      acceptAllDevices?: boolean;
      optionalServices?: string[];
      filters?: Array<{ namePrefix?: string; services?: string[] }>;
    }): Promise<{
      id: string;
      name?: string;
      gatt?: { connected: boolean; connect(): Promise<unknown>; disconnect(): void };
    }>;
    getAvailability?: () => Promise<boolean>;
  };
}

interface Window {
  NDEFReader?: NDEFReaderConstructor;
}

interface DeviceOrientationEvent {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}
