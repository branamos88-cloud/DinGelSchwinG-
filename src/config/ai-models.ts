export interface AIBackend {
  id: string;
  modelName: string;
  endpoint: string;
  specialization: string[];
  streamSupported: boolean;
  maxTokens: number;
}

export const MODEL_AGNES: AIBackend = {
  id: 'agnes-2.0-flash',
  modelName: 'sapiens-ai/agnes-2.0-flash',
  endpoint: '/rosetta-ai/v1/chat/agnes',
  specialization: ['netzwerk-analyse', 'geräte-kopplung', 'sensor-interpretation', '3d-raum-bewertung'],
  streamSupported: true,
  maxTokens: 4096,
};

export const MODEL_GLM: AIBackend = {
  id: 'glm-4.6v-flash-free',
  modelName: 'z-ai/glm-4.6v-flash-free',
  endpoint: '/rosetta-ai/v1/chat/glm',
  specialization: ['stream-verarbeitung', 'diagnose-echtzeit', 'replay-analyse', 'frequenz-überwachung'],
  streamSupported: true,
  maxTokens: 8192,
};

export const ROUTE_MAP: Record<string, AIBackend> = {
  'net-analysis': MODEL_AGNES,
  'device-pairing': MODEL_AGNES,
  'sensor-fusion': MODEL_AGNES,
  'stream-diagnostics': MODEL_GLM,
  'mesh-monitor': MODEL_GLM,
  'replay-editor': MODEL_GLM,
};
