/**
 * Strips sensitive data out of free-form caller text before it's stored
 * anywhere (e.g. a knowledge_gaps.question). Callers occasionally blurt out
 * a card number, a password, or a PIN while asking an unrelated question —
 * none of that should ever land in a table a business owner browses.
 */

const CARD_NUMBER = /\b(?:\d[ -]?){13,19}\b/g;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
const CREDENTIAL_WITH_VALUE =
  /\b(password|passcode|pin|cvv|cvc|security code|api key|secret|auth token)\b\s*(?:is|:|=)?\s*[:\-]?\s*(\S+)/gi;

export function redactSensitive(text: string): { text: string; redacted: boolean } {
  if (!text) return { text, redacted: false };

  let redacted = false;
  let result = text;

  result = result.replace(CARD_NUMBER, () => {
    redacted = true;
    return '[REDACTED CARD NUMBER]';
  });

  result = result.replace(SSN, () => {
    redacted = true;
    return '[REDACTED SSN]';
  });

  result = result.replace(CREDENTIAL_WITH_VALUE, (_match, label: string) => {
    redacted = true;
    return `${label} [REDACTED]`;
  });

  return { text: result, redacted };
}
