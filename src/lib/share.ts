/**
 * Share links. The payload { s: text, src, tgt } is JSON, compressed with
 * CompressionStream('deflate-raw') when available, encoded as base64url and
 * placed in the URL fragment, which browsers never send to a server.
 */

export type SharePayload = {
  s: string;
  src: string;
  tgt: string;
};

/** Beyond this total length the link is refused. */
export const MAX_SHARE_URL = 6000;

function hasCompression(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof CompressionStream === "function" &&
    typeof DecompressionStream === "function"
  );
}

async function pipe(bytes: Uint8Array, transform: "deflate-raw" | "deflate-raw-decode"): Promise<Uint8Array> {
  if (transform === "deflate-raw") {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return await readStream(stream);
  }
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return await readStream(stream);
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export type EncodeShareResult = { ok: true; hash: string; url: string } | { ok: false; reason: "too-long" };

export async function encodeShare(payload: SharePayload): Promise<EncodeShareResult> {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let version: "v0" | "v1";
  let encoded: Uint8Array;
  if (hasCompression()) {
    version = "v1";
    encoded = await pipe(bytes, "deflate-raw");
  } else {
    version = "v0";
    encoded = bytes;
  }
  const hash = `#s=${version}.${toBase64Url(encoded)}`;
  const base = typeof window !== "undefined" ? window.location.href.split("#")[0] : "";
  const url = `${base}${hash}`;
  if (url.length > MAX_SHARE_URL) return { ok: false, reason: "too-long" };
  return { ok: true, hash, url };
}

export async function decodeShareFragment(fragment: string): Promise<SharePayload | null> {
  const match = /^#s=(v[01])\.([\w-]+)$/.exec(fragment);
  if (!match) return null;
  const [, version, encoded] = match;
  try {
    let bytes = fromBase64Url(encoded);
    if (version === "v1") {
      if (!hasCompression()) return null;
      bytes = await pipe(bytes, "deflate-raw-decode");
    }
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as SharePayload;
    if (typeof parsed?.s !== "string" || typeof parsed?.src !== "string" || typeof parsed?.tgt !== "string") return null;
    if (parsed.s.length === 0 || parsed.s.length > 50000) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Read a share payload from the current location, then clean the address bar. */
export async function consumeShareFromLocation(): Promise<SharePayload | null> {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash.startsWith("#s=")) return null;
  const payload = await decodeShareFragment(hash);
  // The fragment never belonged to the server, and it shouldn't linger in the
  // address bar either. Remove it without adding a history entry.
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return payload;
}
