import { isVetoSession, type VetoSession } from "./state";

/**
 * Issue and verify the session token the client carries.
 *
 * The token is the session state, gzipped and signed with HMAC-SHA256. It exists
 * because Cloudflare Workers serve a request from whichever isolate is nearest:
 * a veto cannot rely on the plan request having filled that isolate's memory.
 * See `lib/session/state.ts` for the measurements behind that.
 *
 * Two properties matter and both are load-bearing:
 *
 *  1. The signature is verified BEFORE the payload is decompressed. An
 *     unverified body is attacker-controlled bytes, so inflating it first would
 *     hand anyone a decompression bomb. Verification is cheap; inflation is not.
 *  2. The token is signed, not encrypted. It carries pseudonymous labels,
 *     provider entity ids and affinity numbers — the same data the client already
 *     holds and already sends back — so confidentiality is not the goal and no
 *     claim of it is made. Integrity is the goal: a tampered token fails
 *     verification and the veto is dismissed.
 *
 * When `ENCORE_SESSION_SECRET` is absent the token is simply not issued, and the
 * caller falls back to process memory. That is the correct behaviour for a local
 * single-process run, and it is why the deployed Worker sets the secret.
 */

/** Version prefix, so a future format change can be rejected rather than misread. */
const VERSION = 1;

/** Matches the session store's TTL: a token cannot outlive the session it carries. */
const TTL_MS = 1000 * 60 * 60 * 3;

/** Cheap rejection before any crypto or inflation work. 19 KB is the real size. */
const MAX_TOKEN_CHARS = 128 * 1024;

interface TokenPayload {
  v: number;
  exp: number;
  s: VetoSession;
}

type StreamCtor = new (format: string) => TransformStream<Uint8Array, Uint8Array>;

const CompressionStreamCtor = (
  globalThis as unknown as { CompressionStream?: StreamCtor }
).CompressionStream;
const DecompressionStreamCtor = (
  globalThis as unknown as { DecompressionStream?: StreamCtor }
).DecompressionStream;

/** RFC 4648 base64url, implemented here so there is no Buffer/btoa split by runtime. */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function base64urlEncode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += ALPHABET[b0 >> 2];
    out += ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 === undefined) break;
    out += ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 === undefined) break;
    out += ALPHABET[b2 & 0x3f];
  }
  return out;
}

function base64urlDecode(value: string): Uint8Array {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of value) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error("invalid base64url");
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

async function gzip(input: Uint8Array): Promise<Uint8Array> {
  if (!CompressionStreamCtor) throw new Error("CompressionStream unavailable");
  const stream = new Blob([input as BlobPart])
    .stream()
    .pipeThrough(new CompressionStreamCtor("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(input: Uint8Array): Promise<Uint8Array> {
  if (!DecompressionStreamCtor) throw new Error("DecompressionStream unavailable");
  const stream = new Blob([input as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStreamCtor("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function secret(): string | null {
  const value = process.env.ENCORE_SESSION_SECRET;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function hmacKey(key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * Sign a session into a token, or `null` when no secret is configured.
 *
 * `null` is not a failure: it means this deployment has no signing key, so the
 * session stays in process memory only.
 */
export async function issueSessionToken(
  session: VetoSession,
  now: number = Date.now(),
): Promise<string | null> {
  const key = secret();
  if (key === null || !CompressionStreamCtor) return null;
  const payload: TokenPayload = { v: VERSION, exp: now + TTL_MS, s: session };
  const body = base64urlEncode(await gzip(new TextEncoder().encode(JSON.stringify(payload))));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(key),
    new TextEncoder().encode(body),
  );
  return `${body}.${base64urlEncode(new Uint8Array(signature))}`;
}

/**
 * Verify a token and return the session it carries, or `null` for anything
 * untrusted, expired, malformed or signed with a different key.
 *
 * Every failure path returns the same `null` on purpose: a caller cannot act
 * differently on "wrong signature" than on "expired", and the client is told
 * only that the session is no longer available.
 */
export async function readSessionToken(
  token: string | undefined,
  now: number = Date.now(),
): Promise<VetoSession | null> {
  const key = secret();
  if (key === null || !DecompressionStreamCtor) return null;
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_CHARS) {
    return null;
  }
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  let verified = false;
  try {
    verified = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(key),
      base64urlDecode(signature) as unknown as BufferSource,
      new TextEncoder().encode(body) as unknown as BufferSource,
    );
  } catch {
    return null;
  }
  // Signature first. The payload is only inflated once it is proven ours.
  if (!verified) return null;
  try {
    const decoded = JSON.parse(new TextDecoder().decode(await gunzip(base64urlDecode(body)))) as
      | TokenPayload
      | null;
    if (decoded === null || decoded.v !== VERSION) return null;
    if (typeof decoded.exp !== "number" || decoded.exp <= now) return null;
    if (!isVetoSession(decoded.s)) return null;
    return decoded.s;
  } catch {
    return null;
  }
}
