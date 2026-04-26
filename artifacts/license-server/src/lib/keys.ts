import * as crypto from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // omit 0/O/1/I to avoid OCR confusion

/**
 * Generate a human-friendly licence key. 5 groups of 5 chars (25 chars +
 * 4 dashes = 29 chars total). Cryptographically random.
 *   Example: ABCDE-FGHJK-LMNPQ-RSTUV-WXYZ2
 */
export function generateLicenseKey(): string {
  const groups: string[] = [];
  for (let g = 0; g < 5; g++) {
    let group = "";
    const bytes = crypto.randomBytes(5);
    for (let i = 0; i < 5; i++) {
      group += ALPHABET[bytes[i] % ALPHABET.length];
    }
    groups.push(group);
  }
  return groups.join("-");
}

/** Normalise user-entered key (strip whitespace, uppercase, ensure dashes). */
export function normalizeLicenseKey(input: string): string {
  const cleaned = input.replace(/\s+/g, "").toUpperCase();
  // If user pasted without dashes, re-insert them.
  if (!cleaned.includes("-") && cleaned.length === 25) {
    return cleaned.match(/.{5}/g)!.join("-");
  }
  return cleaned;
}
