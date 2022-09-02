import * as fs from "fs";
import * as fsPromises from "fs/promises";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

import { ProtoGrpcType } from "../proto/speech_service";
import { TranscribeStreamRequest } from "../proto/soniox/speech_service/TranscribeStreamRequest";
import { TranscriptionConfig__Output } from "../proto/soniox/speech_service/TranscriptionConfig";
import { TranscribeAsyncRequest } from "../proto/soniox/speech_service/TranscribeAsyncRequest";
import { GetTranscribeAsyncStatusRequest } from "../proto/soniox/speech_service/GetTranscribeAsyncStatusRequest";
import { GetTranscribeAsyncResultRequest } from "../proto/soniox/speech_service/GetTranscribeAsyncResultRequest";
import { DeleteTranscribeAsyncFileRequest } from "../proto/soniox/speech_service/DeleteTranscribeAsyncFileRequest";
import { TranscribeRequest } from "../proto/soniox/speech_service/TranscribeRequest";
import { Result__Output } from "../proto/soniox/speech_service/Result";
import { TranscribeAsyncFileStatus__Output } from "../proto/soniox/speech_service/TranscribeAsyncFileStatus";
import { DeleteTranscribeAsyncFileResponse__Output } from "../proto/soniox/speech_service/DeleteTranscribeAsyncFileResponse";

import {
  GetConnectionDataResult,
  SpeechClientConfig,
  TranscribeStreamReturn,
} from "./speech_client.interface";
import { TranscribeAsyncResponse__Output } from "../proto/soniox/speech_service/TranscribeAsyncResponse";
import { GetTranscribeAsyncResultResponse__Output } from "../proto/soniox/speech_service/GetTranscribeAsyncResultResponse";
import { TranscribeStreamResponse__Output } from "../proto/soniox/speech_service/TranscribeStreamResponse";

const PROTO_PATH = __dirname + "/speech_service.proto";
const CHUNK_SIZE = 131072; // 128kb

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const proto = grpc.loadPackageDefinition(
  packageDefinition
) as unknown as ProtoGrpcType;
const speech_service_proto = proto.soniox.speech_service;

async function asyncWriteRequest<RequestType>(
  call: grpc.ClientWritableStream<RequestType>,
  request: RequestType
) {
  await new Promise<void>((resolve, reject) => {
    call.write(request, (error: Error | null | undefined) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

export class SpeechClient {
  private config = {
    api_host: process.env.SONIOX_API_HOST || "https://api.soniox.com:443",
    api_key: process.env.SONIOX_API_KEY || "",
  } as SpeechClientConfig;

  private connection = this._getConnectionData(this.config.api_host);

  public client = new speech_service_proto.SpeechService(
    this.connection.host,
    this.connection.credentials
  );

  private defaultRequestConfig: TranscriptionConfig__Output = {
    audio_format: "",
    sample_rate_hertz: 0,
    num_audio_channels: 0,
    include_nonfinal: false,
    enable_separate_recognition_per_channel: false,
    speech_context: null,
    enable_profanity_filter: false,
    content_moderation_phrases: [],
    enable_streaming_speaker_diarization: false,
    enable_global_speaker_diarization: false,
    min_num_speakers: 0,
    max_num_speakers: 0,
    enable_speaker_identification: false,
    cand_speaker_names: [],
    model: "",
    enable_dictation: false,
    transcribe_async_mode: "",
  };

  constructor(config?: SpeechClientConfig) {
    if (config?.api_host) {
      this.config.api_host = config.api_host;
    }
    if (config?.api_key) {
      this.config.api_key = config.api_key;
    }
    if (!this.config.api_host) {
      throw new Error('Missing "api_host".');
    }
    if (!this.config.api_key) {
      throw new Error('Missing "api_key".');
    }
  }

  private _getConnectionData(
    host: string | undefined
  ): GetConnectionDataResult {
    if (!host) {
      throw new Error('Missing "api_host".');
    }

    if (host.startsWith("http://")) {
      return {
        host: host.substring(7),
        credentials: grpc.credentials.createInsecure(),
      };
    } else if (host.startsWith("https://")) {
      return {
        host: host.substring(8),
        credentials: grpc.credentials.createSsl(),
      };
    }

    return {
      host,
      credentials: grpc.credentials.createInsecure(),
    };
  }

  private _validateConfig(config: TranscriptionConfig__Output) {
    for (const [key, value] of Object.entries(config)) {
      if (!this.defaultRequestConfig.hasOwnProperty(key)) {
        throw new Error(
          `Invalid config parameter "${key}" with value "${value}".`
        );
      }
    }
  }

  public transcribeFileShort = async (
    file_path: string,
    config: TranscriptionConfig__Output
  ): Promise<Result__Output | Result__Output[]> => {
    if (!file_path) {
      throw new Error('Missing "file_path".');
    }

    config = {
      ...this.defaultRequestConfig,
      ...config,
    };
    this._validateConfig(config);

    const audio = await fsPromises.readFile(file_path);

    return await new Promise((resolve, reject) => {
      const transcribeRequest: TranscribeRequest = {
        api_key: this.config.api_key,
        config,
        audio: new Uint8Array(audio),
      };

      this.client.Transcribe(transcribeRequest, (error, response) => {
        if (error || !response) {
          reject(error || "Response is undefined");
          return;
        }
        if (config.enable_separate_recognition_per_channel) {
          if (response.channel_results.length == 0) {
            reject("Response does not contain channel_results.");
            return;
          }
          resolve(response.channel_results);
        } else {
          if (response.result == null) {
            reject("Response does not contain result.");
            return;
          }
          resolve(response.result);
        }
      });
    });
  };

  public transcribeFileAsync = async (
    file_path: string,
    reference_name: string,
    config: TranscriptionConfig__Output
  ): Promise<string> => {
    if (!file_path) {
      throw new Error('Missing "file_path".');
    }
    if (!reference_name) {
      throw new Error('Missing "reference_name".');
    }

    config = {
      ...this.defaultRequestConfig,
      ...config,
    };
    this._validateConfig(config);

    const audioStream = fs.createReadStream(file_path, {
      highWaterMark: CHUNK_SIZE,
    });

    let callArray: grpc.ClientWritableStream<TranscribeAsyncRequest>[] = [];
    const callPromise = new Promise<TranscribeAsyncResponse__Output>((resolve, reject) => {
      callArray.push(this.client.TranscribeAsync((error, response) => {
        if (error) {
          reject(error);
          return;
        }
        if (!response) {
          reject("missing response");
          return;
        }
        resolve(response);
      }));
    });
    const call = callArray[0];

    const firstRequest: TranscribeAsyncRequest = {
      api_key: this.config.api_key,
      reference_name,
      config,
    };
    await asyncWriteRequest(call, firstRequest);

    for await (const audioChunk of audioStream) {
      const audioRequest: TranscribeAsyncRequest = {
        audio: new Uint8Array(audioChunk),
      };
      await asyncWriteRequest(call, audioRequest);
    }

    call.end();

    const response = await callPromise;

    return response.file_id;
  };

  public getTranscribeAsyncStatus = async (
    file_id: string
  ): Promise<TranscribeAsyncFileStatus__Output> => {
    if (!file_id) {
      throw new Error('Missing "file_id".');
    }

    const request: GetTranscribeAsyncStatusRequest = {
      api_key: this.config.api_key,
      file_id,
    };

    return await new Promise((resolve, reject) => {
      this.client.GetTranscribeAsyncStatus(
        request,
        (error, response) => {
          if (error) {
            reject(error);
            return;
          }
          if (!response) {
            reject("missing response");
            return;
          }
          if (response.files.length !== 1) {
            reject("Unexpected number of files returned.");
            return;
          }
          resolve(response.files[0]);
        }
      );
    });
  };

  public getTranscribeAsyncResult = async (
    file_id: string
  ): Promise<Result__Output | Result__Output[]> => {
    if (!file_id) {
      throw new Error('Missing "file_id".');
    }

    const request: GetTranscribeAsyncResultRequest = {
      api_key: this.config.api_key,
      file_id,
    };

    return await new Promise((resolve, reject) => {
      let call = this.client.GetTranscribeAsyncResult(request);

      let channelResults = new Map<number, Result__Output>();
      let result: Result__Output | null = null;

      call.on("data", function (response: GetTranscribeAsyncResultResponse__Output) {
        if (!response.result) {
          return;
        }
        if (response.separate_recognition_per_channel) {
          const chResult = channelResults.get(response.result.channel);
          if (!chResult) {
            channelResults.set(response.result.channel, response.result);
          } else {
            for (let word of response.result.words) {
              chResult.words.push(word);
            }
            chResult.final_proc_time_ms = response.result.final_proc_time_ms;
            chResult.total_proc_time_ms = response.result.total_proc_time_ms;
            chResult.speakers = response.result.speakers;
          }
        } else {
          if (!result) {
            result = response.result;
          } else {
            for (let word of response.result.words) {
              result.words.push(word);
            }
            result.final_proc_time_ms = response.result.final_proc_time_ms;
            result.total_proc_time_ms = response.result.total_proc_time_ms;
            result.speakers = response.result.speakers;
          }
        }
      });

      call.on("error", function (error) {
        reject(error);
      });

      call.on("end", function () {
        if (channelResults.size > 0) {
          const channelResultsArr = Array.from(channelResults.values());
          channelResultsArr.sort((a, b) => {
            if (a.channel < b.channel) {
              return -1;
            }
            if (a.channel > b.channel) {
              return 1;
            }
            return 0;
          });
          resolve(channelResultsArr);
        } else if (result) {
          resolve(result);
        } else {
          reject("no results received");
        }
      });
    });
  };

  public deleteTranscribeAsyncFile = async (
    file_id: string
  ): Promise<DeleteTranscribeAsyncFileResponse__Output> => {
    if (!file_id) {
      throw new Error('Missing "file_id".');
    }

    const request: DeleteTranscribeAsyncFileRequest = {
      api_key: this.config.api_key,
      file_id,
    };

    return await new Promise((resolve, reject) => {
      this.client.DeleteTranscribeAsyncFile(
        request,
        (error, response) => {
          if (error) {
            reject(error);
            return;
          }
          if (!response) {
            reject("missing response");
            return;
          }
          resolve(response);
        }
      );
    });
  };

  public transcribeStream = (
    config: TranscriptionConfig__Output,
    onData: (result: Result__Output) => void,
    onEnd: (error: any) => void
  ): TranscribeStreamReturn => {
    if (!onData) {
      throw new Error('Missing "onData" callback handler.');
    }
    if (!onEnd) {
      throw new Error('Missing "onEnd" callback handler.');
    }

    config = {
      ...this.defaultRequestConfig,
      ...config,
    };
    this._validateConfig(config);

    let call = this.client.TranscribeStream();

    const write = (audio: Buffer) => {
      const request: TranscribeStreamRequest = {
        audio,
      };
      call.write(request);
    };

    const writeAsync = async (audio: Buffer) => {
      const request: TranscribeStreamRequest = {
        audio,
      };
      await asyncWriteRequest(call, request);
    };

    const end = () => {
      call.end();
    };

    (async () => {
      try {
        const request: TranscribeStreamRequest = {
          api_key: this.config.api_key,
          config,
        };
        await asyncWriteRequest(call, request);

        for await (const responseAny of call) {
          const response = responseAny as TranscribeStreamResponse__Output;
          if (response.result) {
            onData(response.result);
          }
        }
      } catch (error) {
        onEnd(error);
        return;
      }

      onEnd(null);
    })();

    return {
      write,
      writeAsync,
      end,
    };
  };
}
