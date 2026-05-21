/**
 * @file logger.ts
 * @description Structured logger configuration using Pino.
 *
 * - Development: pretty-printed, human-readable output with colours.
 * - Production:  raw JSON output, suitable for ingestion by Datadog,
 *                Logtail, CloudWatch, or any log aggregator.
 *
 * Usage:
 *   import { logger } from '../logger.js';
 *   logger.info({ sessionId }, 'Session created');
 *   logger.error({ err, sessionId }, 'Failed to save notes');
 */

import pino, { type LoggerOptions } from 'pino';

const isDevelopment = process.env['NODE_ENV'] !== 'production';

const loggerOptions: LoggerOptions = {
  level: isDevelopment ? 'debug' : 'info',

  // Base fields added to every log line.
  base: {
    service: 'noteleaf-api',
    env: process.env['NODE_ENV'] ?? 'unknown',
  },

  // Redact sensitive fields that should never appear in logs.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.apiKey',
      '*.password',
      '*.token',
    ],
    censor: '[REDACTED]',
  },
};

// Pretty-print in development for readability.
// In production, pino-pretty is NOT used — raw JSON goes to stdout.
if (isDevelopment) {
  loggerOptions.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
    },
  };
}

export const logger = pino(loggerOptions);

export type Logger = typeof logger;
