import { createHash } from 'node:crypto';

const CONTACT_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b(?:https?:\/\/|www\.)\S+/gi,
  /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9?\d{4})[-.\s]?\d{4}\b/g,
  /\b(?:pix|whats(?:app)?|telefone|celular)\s*[:=-]?\s*\S+/gi,
];

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(ordered);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, ordered(child)]),
    );
  }
  return value;
}

export function digest(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(ordered(value)))
    .digest('hex');
}

export function sanitizeOpportunityText(value: string): string {
  return CONTACT_PATTERNS.reduce(
    (sanitized, pattern) => sanitized.replace(pattern, '[contato removido]'),
    value.trim(),
  );
}
