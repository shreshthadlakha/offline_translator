/// <reference lib="webworker" />
/**
 * Request reporting inside the translation worker.
 *
 * Wraps the worker's fetch and reports every request back to the page for the
 * "Check for yourself" panel, with only the origin, the path and the size.
 * Query strings are stripped before anything leaves the worker, and request
 * bodies and response contents are never touched: the original Response
 * object is passed straight through, so the download path itself is unchanged.
 *
 * This module must be imported first in translator.worker.ts, before the
 * transformers library is evaluated, so every fetch it makes goes through
 * here.
 */

import type { WorkerToMain } from "./protocol";

function postReport(url: string, finalUrl: string, size: number): void {
  try {
    (self as unknown as { postMessage: (message: WorkerToMain) => void }).postMessage({
      type: "netlog",
      url,
      finalUrl,
      size,
    });
  } catch {
    // Reporting is best effort. The fetch itself is what matters.
  }
}

function requestUrlOf(input: RequestInfo | URL): string {
  try {
    if (typeof input === "string") return new URL(input, self.location.href).href;
    if (input instanceof URL) return input.href;
    return input.url;
  } catch {
    return "";
  }
}

function stripQuery(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function sizeOf(response: Response): number {
  try {
    const header = response.headers.get("content-length");
    if (header == null) return 0;
    const size = Number(header);
    return Number.isFinite(size) && size >= 0 ? size : 0;
  } catch {
    return 0;
  }
}

export function installNetworkReporting(): void {
  const original = globalThis.fetch;
  if (typeof original !== "function") return;

  globalThis.fetch = function reportedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const requestUrl = requestUrlOf(input);
    return original.call(globalThis, input, init).then(
      (response) => {
        const finalUrl =
          typeof input === "string"
            ? new URL(input, self.location.href).href
            : input instanceof URL
              ? input.href
              : input.url;
        postReport(stripQuery(requestUrl), stripQuery(response.url || finalUrl), sizeOf(response));
        return response;
      },
      (error: unknown) => {
        postReport(stripQuery(requestUrl), stripQuery(requestUrl), 0);
        throw error;
      },
    );
  };
}

installNetworkReporting();
