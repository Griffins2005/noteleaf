/**
 * @file index.ts
 * @description Public API for @noteleaf/shared-types.
 *
 * All type imports across the monorepo go through this file:
 *   import type { Session, Note, ApiResponse } from '@noteleaf/shared-types';
 *
 * Do NOT import from individual type files directly outside this package.
 * This maintains a stable public API and allows internal refactoring
 * without touching consumer imports.
 */

export type {
  // User domain
  StorageMode,
  LocalSaveMode,
  UserIdentity,
  UserPreferences,
} from './user.types.js';

export { defaultUserPreferences } from './user.types.js';

export type {
  // Note domain
  NoteType,
  Note,
  ClassifierInput,
  ClassifierOutput,
} from './note.types.js';

export type {
  // Session domain
  SessionStatus,
  AiSummary,
  TranscriptSegment,
  Session,
  SessionListItem,
  CreateSessionPayload,
  UpdateSessionPayload,
} from './session.types.js';

export type {
  // API contract
  ApiResponse,
  ApiError,
  GetSessionsResponse,
  GetSessionResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  UpdateSessionRequest,
  UpdateSessionResponse,
  DeleteSessionResponse,
  AddNotesRequest,
  AddNotesResponse,
  SummarizeRequest,
  SummarizeResponse,
  ClientToServerWsMessage,
  ServerToClientWsMessage,
  HealthCheckResponse,
} from './api.types.js';

export type {
  // Chat / Ask my notes
  ChatCitation,
  ChatMessage,
  AskNotesRequest,
  AskNotesResponse,
} from './chat.types.js';

export type {
  // Identity / email recovery
  SendCodeRequest,
  SendCodeResponse,
  VerifyCodeRequest,
  VerifyCodeResponse,
} from './identity.types.js';

export type {
  // NVIDIA NIM STT streaming
  NimSessionConfig,
  NimTranscriptAlternative,
  NimStreamingResult,
  NimStreamingResponse,
  NimAccessMode,
  NimServiceConfig,
} from './nvidia.stt.types.js';
