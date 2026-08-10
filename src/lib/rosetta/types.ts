export interface ConverterRequest {
  route: string;
  payload: unknown;
  modelPref?: string;
}

export interface ConverterResponse {
  route: string;
  backendId: string;
  result: unknown;
  latencyMs: number;
  streamChunk?: boolean;
}

export interface StreamChunk {
  chunkId: string;
  data: string;
  done: boolean;
}
