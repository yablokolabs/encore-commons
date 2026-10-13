/**
 * Input hardening.
 *
 * Participant text and provider text are DATA, never instructions. These helpers
 * bound size, strip control characters and neutralise the shapes most often used
 * to smuggle instructions into a downstream prompt.
 */

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const INSTRUCTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
  /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions?|rules?)/gi,
  /you\s+are\s+now\s+(a|an|the)\s+/gi,
  /system\s*prompt/gi,
  /\bsystem\s*:\s*/gi,
  /\bassistant\s*:\s*/gi,
  /<\/?(system|assistant|instructions?)>/gi,
  /reveal\s+(your\s+)?(system\s+)?prompt/gi,
];

export interface SanitiseResult {
  value: string;
  /** Shapes that were neutralised, for the trace. Never the raw input. */
  findings: string[];
}

export function sanitiseUserText(input: string, maxLength = 120): SanitiseResult {
  const findings: string[] = [];
  let value = input.replace(CONTROL_CHARS, " ").normalize("NFKC");
  value = value.replace(/[\u200B-\u200D\uFEFF]/g, "");
  for (const pattern of INSTRUCTION_PATTERNS) {
    if (pattern.test(value)) {
      findings.push(`instruction-like pattern neutralised: ${pattern.source}`);
      value = value.replace(pattern, "[redacted]");
    }
    pattern.lastIndex = 0;
  }
  value = value.replace(/[<>]/g, "").trim().replace(/\s+/g, " ");
  if (value.length > maxLength) {
    value = `${value.slice(0, maxLength)}…`;
    findings.push(`truncated to ${maxLength} characters`);
  }
  return { value, findings };
}

/** True when a string looks like it is trying to instruct the model. */
export function looksLikeInjection(input: string): boolean {
  return INSTRUCTION_PATTERNS.some((p) => {
    const hit = p.test(input);
    p.lastIndex = 0;
    return hit;
  });
}

/**
 * Redaction for anything that leaves the process: logs, trace rows, exports.
 * Provider keys are never logged, but this is the second line of defence.
 */
export function redactSecrets(input: string): string {
  return input
    .replace(/(x-api-key|authorization|api[_-]?key)["'\s:=]+[A-Za-z0-9._\-]{8,}/gi, "$1 [redacted]")
    .replace(/\b(sk|pk|ghp|gho|xox[baprs])[-_][A-Za-z0-9._-]{10,}/gi, "[redacted]")
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, "[redacted]");
}
