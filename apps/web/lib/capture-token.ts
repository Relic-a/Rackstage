import "server-only";

import crypto from "node:crypto";

type CaptureClaims = {
  storeId: string;
  expiresAt: number;
  nonce: string;
};

const TOKEN_VERSION = "v1";
const DEFAULT_LIFETIME_SECONDS = 60 * 60 * 24 * 30;

function signingSecret() {
  const secret = process.env.CAPTURE_LINK_SECRET || process.env.SUPABASE_SECRET_KEY;
  if (!secret || secret.length < 32) throw new Error("Set CAPTURE_LINK_SECRET to a random value of at least 32 characters.");
  return secret;
}

function encode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function signature(payload: string) {
  return encode(crypto.createHmac("sha256", signingSecret()).update(`${TOKEN_VERSION}.${payload}`).digest());
}

export function createCaptureToken(storeId: string, lifetimeSeconds = DEFAULT_LIFETIME_SECONDS) {
  const claims: CaptureClaims = {
    storeId,
    expiresAt: Math.floor(Date.now() / 1000) + lifetimeSeconds,
    nonce: crypto.randomBytes(18).toString("base64url"),
  };
  const payload = encode(JSON.stringify(claims));
  return `${TOKEN_VERSION}.${payload}.${signature(payload)}`;
}

export function verifyCaptureToken(token: string | null | undefined): CaptureClaims | null {
  if (!token) return null;
  const [version, payload, suppliedSignature, ...extra] = token.split(".");
  if (version !== TOKEN_VERSION || !payload || !suppliedSignature || extra.length) return null;
  const expectedSignature = signature(payload);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<CaptureClaims>;
    if (!claims.storeId || !claims.nonce || !claims.expiresAt || claims.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    return claims as CaptureClaims;
  } catch {
    return null;
  }
}

export function captureTokenFrom(request: Request) {
  return request.headers.get("x-rackstage-capture-token");
}
