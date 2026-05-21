/**
 * @file nvidia.stt.service.ts
 * @description Service layer for NVIDIA NIM Nemotron ASR Streaming integration.
 *
 * This service connects to NVIDIA's Nemotron ASR Streaming model
 * via gRPC (the Riva ASR protocol).
 *
 * ── Model ──────────────────────────────────────────────────────────────────
 * Model: nemotron-asr-streaming (Cache-Aware FastConformer-RNNT, 600M params)
 *
 * Why this model over the alternatives:
 *   - Cache-Aware streaming: processes ONLY new audio chunks, reusing cached
 *     encoder context. No redundant overlap computation like traditional
 *     buffered streaming. The note classifier fires on is_final=true
 *     results which are immutable and never revised.
 *   - Configurable chunk sizes: 80ms / 160ms / 560ms / 1120ms. We default to
 *     160ms — the optimal latency/accuracy trade-off for meeting notes.
 *   - Runs on NVIDIA Build cloud (no GPU needed, pay-per-use) or your own
 *     NIM container (full GPU control, zero per-request cost).
 *   - Punctuation and capitalisation natively supported — required for the
 *     note classifier's sentence-boundary detection.
 *
 * ── Transport: gRPC, not WebSocket ────────────────────────────────────────
 * NVIDIA Riva uses gRPC + Protocol Buffers as its primary protocol.
 * The HTTP/WebSocket endpoint (port 9000) is available for simple use cases,
 * but gRPC (port 50051) is the production path with full streaming support.
 *
 * This service layer handles all gRPC complexity internally. The WebSocket
 * proxy route (stream.route.ts) and all browser-facing code are unchanged —
 * they still speak the same ServerToClientWsMessage JSON protocol.
 *
 * ── Access modes ──────────────────────────────────────────────────────────
 * Controlled by NVIDIA_STT_MODE environment variable:
 *
 *   cloud (default):
 *     Endpoint: grpc.nvcf.nvidia.com:443 (SSL)
 *     Auth: NVIDIA_API_KEY + NVIDIA_FUNCTION_ID
 *     No GPU required. Managed by NVIDIA.
 *
 *   self-hosted:
 *     Endpoint: NVIDIA_NIM_HOST:NVIDIA_NIM_GRPC_PORT (default localhost:50051)
 *     Auth: NGC_API_KEY (only needed if NIM requires it)
 *     Requires a running NIM container:
 *       docker run --runtime=nvidia --gpus '"device=0"' \
 *         -e NGC_API_KEY -e NIM_TAGS_SELECTOR=mode=str \
 *         -p 50051:50051 nvcr.io/nim/nvidia/nemotron-asr-streaming:latest
 *
 * ── Architectural note ────────────────────────────────────────────────────
 * The proxy architecture is unchanged. The browser never speaks gRPC.
 * Browser → WebSocket (JSON) → Fastify proxy → gRPC → NVIDIA NIM
 * Transcripts flow back in reverse, transformed to ServerToClientWsMessage.
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { WebSocket } from '@fastify/websocket';
import type { ServerToClientWsMessage } from '@noteleaf/shared-types';
import { logger } from '../logger.js';

// ─── Proto loading ────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// In development: __dirname = apps/api/src/services → proto is ../riva_asr.proto
// In production:  __dirname = apps/api/dist/services → proto is ../riva_asr.proto
// Both resolve correctly because the Dockerfile copies riva_asr.proto into dist/.
const PROTO_PATH = resolve(__dirname, '../riva_asr.proto');

/**
 * Load and parse the Riva ASR proto at startup.
 * @grpc/proto-loader handles this dynamically — no code generation step needed.
 */
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase:     true,   // Preserve proto field names (snake_case)
  longs:        String, // Represent int64 as string to avoid JS precision issues
  enums:        String, // Represent enums as string names
  defaults:     true,   // Include default values in responses
  oneofs:       true,   // Include virtual oneof fields
});

const rivaProto = grpc.loadPackageDefinition(packageDefinition) as unknown as {
  nvidia: {
    riva: {
      asr: {
        RivaSpeechRecognition: grpc.ServiceClientConstructor;
      };
    };
  };
};

const RivaSpeechRecognition = rivaProto.nvidia.riva.asr.RivaSpeechRecognition;

// ─── Types ────────────────────────────────────────────────────────────────────

/** gRPC response shape from the Riva streaming API. Matches riva_asr.proto. */
interface RivaStreamingResult {
  alternatives?: Array<{
    transcript?: string;
    confidence?:  number;
  }>;
  is_final?:  boolean;
  stability?: number;
}

interface RivaStreamingResponse {
  results?: RivaStreamingResult[];
}

export interface StartSessionOptions {
  clientSocket:   WebSocket;
  userUuid:       string;
  sessionId:      string;
  languageCode:   string;
}

export interface SessionControllers {
  sendAudioChunk: (base64Audio: string) => void;
  closeSession:   () => Promise<void>;
}

// ─── Environment config ───────────────────────────────────────────────────────

type SttMode = 'cloud' | 'self-hosted';

function getConfig(): {
  mode:       SttMode;
  endpoint:   string;
  useSSL:     boolean;
  apiKey:     string;
  functionId: string;
} {
  const mode = (process.env['NVIDIA_STT_MODE'] ?? 'cloud') as SttMode;

  if (mode === 'self-hosted') {
    const host = process.env['NVIDIA_NIM_HOST']      ?? 'localhost';
    const port = process.env['NVIDIA_NIM_GRPC_PORT'] ?? '50051';
    return {
      mode,
      endpoint:   `${host}:${port}`,
      useSSL:     false,
      apiKey:     process.env['NGC_API_KEY'] ?? '',
      functionId: '',
    };
  }

  // Cloud mode — build.nvidia.com managed endpoint.
  const apiKey = process.env['NVIDIA_API_KEY'];
  if (!apiKey) {
    throw new Error(
      'NVIDIA_API_KEY is required for cloud STT mode. ' +
      'Get your key at https://build.nvidia.com — click "Get API Key" on the Nemotron ASR model page.',
    );
  }

  return {
    mode,
    endpoint:   'grpc.nvcf.nvidia.com:443',
    useSSL:     true,
    apiKey,
    functionId: process.env['NVIDIA_FUNCTION_ID'] ?? 'bb0837de-8c7b-481f-9ec8-ef5663e9c1fa',
  };
}

// ─── gRPC channel factory ─────────────────────────────────────────────────────

/**
 * Creates a gRPC channel to the NVIDIA NIM endpoint.
 *
 * Cloud mode: SSL channel with API key + function-id in call metadata.
 * Self-hosted: plaintext channel to local NIM container.
 */
function createGrpcClient(config: ReturnType<typeof getConfig>): InstanceType<grpc.ServiceClientConstructor> {
  const credentials = config.useSSL
    ? grpc.credentials.createSsl()
    : grpc.credentials.createInsecure();

  return new RivaSpeechRecognition(config.endpoint, credentials, {
    'grpc.max_receive_message_length': 64 * 1024 * 1024, // 64MB
    'grpc.max_send_message_length':    64 * 1024 * 1024,
  });
}

/**
 * Builds per-call metadata for cloud mode.
 * Self-hosted NIM typically does not require call-level metadata.
 */
function buildCallMetadata(config: ReturnType<typeof getConfig>): grpc.Metadata {
  const meta = new grpc.Metadata();
  if (config.mode === 'cloud') {
    meta.add('authorization', `Bearer ${config.apiKey}`);
    if (config.functionId) {
      meta.add('function-id', config.functionId);
    }
  } else if (config.apiKey) {
    // Self-hosted NIM may optionally require NGC auth
    meta.add('authorization', `Bearer ${config.apiKey}`);
  }
  return meta;
}

// ─── Send helper ──────────────────────────────────────────────────────────────

function sendToClient(socket: WebSocket, message: ServerToClientWsMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

// ─── Service class ────────────────────────────────────────────────────────────

export class NvidiaSttService {
  private readonly config: ReturnType<typeof getConfig>;

  constructor() {
    this.config = getConfig();
    logger.info(
      { mode: this.config.mode, endpoint: this.config.endpoint },
      'NVIDIA STT service initialised',
    );
  }

  /**
   * Opens a new streaming ASR session with NVIDIA NIM.
   *
   * Protocol flow:
   *   1. Create gRPC client and open a StreamingRecognize bidi-stream.
   *   2. Send the StreamingRecognitionConfig as the FIRST message (no audio).
   *   3. As audio chunks arrive from the browser proxy, write them as
   *      subsequent StreamingRecognizeRequest messages with audio_content only.
   *   4. Process StreamingRecognizeResponse events — send interim transcripts
   *      to the browser for the live bar, send finals to the note classifier.
   *   5. On closeSession(), end the write-side of the stream. The NIM will
   *      flush any remaining audio and close the read side.
   *
   * @returns SessionControllers — sendAudioChunk and closeSession functions
   *          for the WebSocket proxy route to call.
   */
  async startSession(options: StartSessionOptions): Promise<SessionControllers> {
    const { clientSocket, userUuid, sessionId, languageCode } = options;

    logger.info(
      { sessionId, userUuid, languageCode, mode: this.config.mode },
      'Opening NVIDIA NIM streaming ASR session',
    );

    const client   = createGrpcClient(this.config);
    const metadata = buildCallMetadata(this.config);

    // Open the bidirectional streaming call.
    // The stream object is both a writable (for sending audio) and
    // a readable (for receiving transcripts).
    const stream = (client as unknown as {
      StreamingRecognize: (meta: grpc.Metadata) => grpc.ClientDuplexStream<unknown, RivaStreamingResponse>;
    }).StreamingRecognize(metadata);

    let sessionDurationMs = 0;
    const sessionStartMs  = Date.now();
    let isClosed          = false;
    let audioChunkCount   = 0;

    // ── Outgoing event handlers ───────────────────────────────────────────

    stream.on('data', (response: RivaStreamingResponse) => {
      if (!response.results?.length) return;

      for (const result of response.results) {
        const transcript = result.alternatives?.[0]?.transcript ?? '';
        // Default to 1.0 — if NIM marks a segment is_final but omits confidence,
        // the proto3 default (0.0) would cause the note classifier to silently
        // discard it. A final result without confidence is still trustworthy.
        const confidence = result.alternatives?.[0]?.confidence || 1.0;

        if (!transcript) continue;

        if (result.is_final) {
          // Final transcript — immutable, safe to feed to the note classifier.
          sendToClient(clientSocket, {
            type:       'final_transcript',
            text:        transcript,
            audioStart:  0,               // Riva doesn't provide chunk-level offsets
            audioEnd:    Date.now() - sessionStartMs,
            confidence,
          });

          logger.info(
            { sessionId, text: transcript.slice(0, 80), confidence },
            'Final transcript received from NVIDIA NIM',
          );
        } else {
          // Interim transcript — may change. Display only, never classify.
          sendToClient(clientSocket, {
            type:       'partial_transcript',
            text:        transcript,
            audioStart:  0,
          });
        }
      }
    });

    stream.on('error', (err: Error) => {
      // gRPC error codes are on err.code for grpc-js errors
      const grpcCode = (err as unknown as { code?: number }).code;
      logger.error({ err, sessionId, grpcCode }, 'NVIDIA NIM gRPC stream error');

      sendToClient(clientSocket, {
        type:    'error',
        code:    `NVIDIA_GRPC_${grpcCode ?? 'UNKNOWN'}`,
        message: 'Speech recognition error. Please stop and restart recording.',
      });
    });

    stream.on('end', () => {
      sessionDurationMs = Date.now() - sessionStartMs;
      logger.info(
        { sessionId, durationMs: sessionDurationMs },
        'NVIDIA NIM gRPC stream ended',
      );
      sendToClient(clientSocket, {
        type:       'session_ended',
        durationMs:  sessionDurationMs,
      });
    });

    // ── Send config as the first (and only config) message ────────────────

    // The first StreamingRecognizeRequest MUST contain only streaming_config.
    // Subsequent requests MUST contain only audio_content. This is enforced
    // by the proto's oneof streaming_request constraint.
    const configMessage = {
      streaming_config: {
        config: {
          encoding:                   'LINEAR_PCM',  // MediaRecorder → PCM via our conversion
          sample_rate_hertz:          16000,
          language_code:              languageCode,
          max_alternatives:           1,
          enable_automatic_punctuation: true,         // Required for note classifier
          enable_word_time_offsets:   false,          // Not used in v1
          custom_configuration: {
            // 160ms chunk size — optimal latency/accuracy for meeting notes.
            // Options: "80", "160", "560", "1120" (milliseconds).
            chunk_size_ms: '160',
          },
        },
        interim_results: true,  // Enable live transcript bar updates
      },
    };

    stream.write(configMessage);

    // Signal to the proxy that the NIM session is ready for audio.
    sendToClient(clientSocket, { type: 'session_ready' });

    // ── Return controllers for the proxy route ────────────────────────────

    return {
      /**
       * Forward a base64-encoded LINEAR_PCM chunk to NVIDIA NIM.
       * The browser captures raw 16-bit LE PCM at 16kHz via AudioWorklet
       * (pcm-processor.js) so no server-side conversion is needed.
       */
      sendAudioChunk: (base64Audio: string): void => {
        if (isClosed) return;

        const audioBuffer = Buffer.from(base64Audio, 'base64');

        if (!audioChunkCount) {
          logger.info({ sessionId, bytes: audioBuffer.length }, 'First audio chunk received from browser');
        }
        audioChunkCount++;

        stream.write({ audio_content: audioBuffer });
      },

      /**
       * Gracefully close the ASR session.
       * Ends the write side of the gRPC stream, which signals to the NIM
       * that no more audio is coming. The NIM flushes its buffer and sends
       * any remaining final transcripts before ending the read side.
       */
      closeSession: async (): Promise<void> => {
        if (isClosed) return;
        isClosed = true;

        return new Promise<void>((resolve) => {
          stream.end(() => {
            logger.info({ sessionId }, 'NVIDIA NIM session closed cleanly');
            resolve();
          });
        });
      },
    };
  }
}

/** Singleton instance — created once, shared across all route handlers. */
export const nvidiaSttService = new NvidiaSttService();
