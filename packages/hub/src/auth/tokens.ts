import { createHash, randomBytes } from "crypto";

/**
 * Hash a token using SHA-256, returning a hex digest.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Generate a new random token with an "rc_" prefix followed by 24 random bytes (hex).
 */
export function generateToken(): string {
  const randomPart = randomBytes(24).toString("hex");
  return `rc_${randomPart}`;
}

/**
 * Validate a raw token against a stored hash.
 */
export function validateToken(rawToken: string, storedHash: string): boolean {
  return hashToken(rawToken) === storedHash;
}
