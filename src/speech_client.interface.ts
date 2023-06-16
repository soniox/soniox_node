import type * as grpc from "@grpc/grpc-js";

export interface SpeechClientConfig {
  api_host?: string;
  api_key?: string;
}

export interface GetConnectionDataResult {
  host: string;
  credentials: grpc.ChannelCredentials;
}

export interface TranscribeStreamReturn {
  write: (audio: Buffer) => void;
  writeAsync: (audio: Buffer) => Promise<void>;
  end: () => void;
}

export interface CreateTemporaryApiKeyParams {
  usage_type: string,
  client_request_reference?: string,
}
