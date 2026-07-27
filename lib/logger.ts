/**
 * Minimal structured logger for production error handling. Never pass raw
 * API keys, tokens, or full request/response bodies from third-party
 * services into this — log a short message and, if useful, a status code
 * or error name only.
 *
 * In a real deployment you'd likely swap the console calls here for a
 * provider like Sentry, Logtail, or your host's log aggregation — this
 * keeps the interface stable so that swap is a one-file change.
 */

type LogContext = Record<string, string | number | boolean | undefined>;

function redact(context?: LogContext) {
  if (!context) return undefined;
  const clean: LogContext = {};
  for (const [key, value] of Object.entries(context)) {
    if (/key|token|secret|password|authorization/i.test(key)) {
      clean[key] = '[redacted]';
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

export const logger = {
  info(message: string, context?: LogContext) {
    console.log(JSON.stringify({ level: 'info', message, ...redact(context), timestamp: new Date().toISOString() }));
  },
  warn(message: string, context?: LogContext) {
    console.warn(JSON.stringify({ level: 'warn', message, ...redact(context), timestamp: new Date().toISOString() }));
  },
  error(message: string, context?: LogContext) {
    console.error(JSON.stringify({ level: 'error', message, ...redact(context), timestamp: new Date().toISOString() }));
  }
};
