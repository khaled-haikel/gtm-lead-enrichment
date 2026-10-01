import { createHash, timingSafeEqual } from "node:crypto";

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

// Checks an Authorization header against the expected bearer token in constant time. Both
// sides are hashed first, so the comparison does not leak the token's length either.
export function hasValidBearerToken(authorization: string | null, expectedToken: string): boolean {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? "");
  if (!match) return false;
  return timingSafeEqual(sha256(match[1]), sha256(expectedToken));
}
