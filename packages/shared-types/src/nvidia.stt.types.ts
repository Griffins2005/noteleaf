/**
 * @file nvidia.stt.types.ts
 * @description Type definitions for the NVIDIA NIM Nemotron ASR Streaming integration.
 *
 * These types model the gRPC messages that the Riva ASR service sends back
 * during a live StreamingRecognize session. The Fastify proxy at
 * apps/api/src/routes/stt/stream.route.ts receives these, transforms them
 * into ServerToClientWsMessage shapes, and forwards them to the browser.
 *
 * Transport: gRPC + Protocol Buffers (not WebSocket JSON).
 * Proto:     apps/api/src/proto/riva_asr.proto
 * Client:    @grpc/grpc-js + @grpc/proto-loader (dynamic loading)
 *
 * Model: nemotron-asr-streaming (Cache-Aware FastConformer-RNNT, 600M params)
 *   Endpoint (cloud):       grpc.nvcf.nvidia.com:443 (SSL)
 *   Endpoint (self-hosted): localhost:50051 (plaintext)
 *   Function ID (cloud):    bb0837de-8c7b-481f-9ec8-ef5663e9c1fa
 *
 * Key properties:
 *   - Cache-Aware streaming: is_final=true results are immutable and never
 *     revised, enabling immediate note classification without race conditions.
 *   - Configurable chunk sizes: 80ms / 160ms / 560ms / 1120ms.
 *     160ms is the default — optimal latency/accuracy trade-off.
 *   - Self-hostable on NVIDIA GPUs: zero per-request cost at scale,
 *     full data control.
 *   - NVIDIA Build cloud fallback: no GPU required for initial deployment.
 */

// ─── Session configuration ────────────────────────────────────────────────────

/**
 * Configuration sent to NVIDIA NIM to open a new streaming ASR session.
 * Maps to the StreamingRecognitionConfig + RecognitionConfig proto messages.
 */
export interface NimSessionConfig {
  /**
   * BCP-47 language code. Default: 'en-US'.
   * Riva will automatically resample audio if the sample rate doesn't match.
   */
  languageCode: string;

  /**
   * Sample rate of the audio being sent (Hz). Should match MediaRecorder output.
   * Default: 16000. Riva accepts 8000–48000Hz; 16kHz is the model's native rate.
   */
  sampleRateHz: number;

  /**
   * Chunk size for the Cache-Aware streaming model.
   * Controls the latency/accuracy trade-off:
   *   - '80':   ~80ms latency, slightly lower accuracy
   *   - '160':  ~160ms latency, good accuracy (default for Noteleaf)
   *   - '560':  ~560ms latency, higher accuracy
   *   - '1120': ~1.1s latency, highest accuracy (batch-like)
   */
  chunkSizeMs: '80' | '160' | '560' | '1120';

  /**
   * Whether to return interim (partial) results between finals.
   * Set to true to drive the live transcript bar. Finals fire when Riva
   * detects a natural speech segment boundary.
   */
  interimResults: boolean;
}

// ─── gRPC streaming event types ───────────────────────────────────────────────

/**
 * A single recognition alternative from Riva.
 * Matches SpeechRecognitionAlternative in riva_asr.proto.
 */
export interface NimTranscriptAlternative {
  /** The transcribed text with punctuation and capitalisation. */
  transcript: string;

  /**
   * Confidence score 0.0–1.0.
   * Only reliably set when is_final === true.
   * Used by the note classifier's quality gate (MIN_CONFIDENCE = 0.5).
   */
  confidence: number;
}

/**
 * A single streaming recognition result from Riva.
 * Matches StreamingRecognitionResult in riva_asr.proto.
 */
export interface NimStreamingResult {
  /** The top transcription alternative. Always use index [0]. */
  alternatives: NimTranscriptAlternative[];

  /**
   * Whether this is a final, immutable result.
   *
   * CRITICAL: Only is_final === true results are fed to the note classifier.
   * is_final === false (interim) results update only the live transcript bar.
   *
   * Riva's Cache-Aware model provides this natively via the gRPC stream.
   */
  is_final: boolean;

  /**
   * Stability estimate for interim results (0.0 = unstable, 1.0 = stable).
   * Not used by Noteleaf but available for future UI feedback.
   */
  stability?: number;
}

/**
 * The full response message from a StreamingRecognize gRPC call.
 * Matches StreamingRecognizeResponse in riva_asr.proto.
 */
export interface NimStreamingResponse {
  /** One or more results for the current audio segment. */
  results?: NimStreamingResult[];
}

// ─── Access modes ────────────────────────────────────────────────────────────

/**
 * How the NVIDIA STT service connects to the NIM endpoint.
 *
 * - 'cloud':       NVIDIA Build managed endpoint (grpc.nvcf.nvidia.com:443).
 *                  Requires NVIDIA_API_KEY. No GPU needed.
 * - 'self-hosted': Your own NIM container on a GPU machine.
 *                  Requires NVIDIA_NIM_HOST and NVIDIA_NIM_GRPC_PORT.
 *                  Optionally NGC_API_KEY if the NIM requires auth.
 */
export type NimAccessMode = 'cloud' | 'self-hosted';

/**
 * Resolved service configuration derived from environment variables.
 */
export interface NimServiceConfig {
  mode:       NimAccessMode;
  /** Full gRPC endpoint string. e.g. 'grpc.nvcf.nvidia.com:443' or 'localhost:50051' */
  endpoint:   string;
  /** Whether to use SSL for the gRPC channel. Always true for cloud mode. */
  useSSL:     boolean;
  /** API key — nvapi-* for cloud, NGC key for self-hosted. */
  apiKey:     string;
  /** NVIDIA Cloud Function ID. Only used in cloud mode. */
  functionId: string;
}
