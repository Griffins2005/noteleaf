/**
 * @file identity.types.ts
 * @description Types for the email-based UUID recovery system.
 *
 * Flow:
 *   1. Client sends email  → POST /api/identity/send-code
 *   2. Server stores a one-time 6-digit code (10 min TTL), emails it (logs it in dev)
 *   3. Client submits code → POST /api/identity/verify-code
 *   4. Server validates, returns the UUID linked to that email (or creates the link)
 */

export interface SendCodeRequest {
  email: string;
}

export interface SendCodeResponse {
  sent: true;
  /**
   * Only present in development (NODE_ENV !== 'production').
   * Allows end-to-end testing without an email provider.
   */
  devCode?: string;
}

export interface VerifyCodeRequest {
  email: string;
  code: string;
  /**
   * The caller's current UUID — only required when the email has never been
   * linked before (first-time link). Omit when recovering an existing UUID.
   */
  currentUuid?: string;
}

export interface VerifyCodeResponse {
  /** The UUID that should be used as the caller's identity. */
  uuid: string;
  /** true = email was just linked for the first time. false = existing link returned (recovery). */
  isNewLink: boolean;
}
