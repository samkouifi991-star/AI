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
    // `message` collides with the logger's own top-level event-name
    // argument below (`{ level, message, ...redact(context), timestamp }`)
    // — since this spread lands after `message`, a context object with
    // its own `message` key (e.g. `{ message: err.message }`, used all
    // over this codebase) silently overwrites the event name with the
    // raw error text instead of sitting alongside it. That's exactly
    // backwards: the event name is what makes a log line greppable and
    // alertable; renamed rather than dropped so no call site needs to
    // change and no information is lost.
    const safeKey = key === 'message' ? 'error_message' : key;
    if (/key|token|secret|password|authorization/i.test(safeKey)) {
      clean[safeKey] = '[redacted]';
    } else {
      clean[safeKey] = value;
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
