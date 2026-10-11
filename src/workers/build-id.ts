/**
 * The build id. scripts/build-worker.mjs rewrites this file every time the
 * worker is bundled, so the worker bundle and the app share one id. The
 * version handshake compares them; a mismatch means the files on the device
 * are out of date with each other.
 */

export const BUILD_ID = "202610111614-38ss7k";
