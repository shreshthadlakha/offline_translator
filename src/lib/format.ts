/**
 * Byte formatting shared by the request log, the setup progress and the On
 * this device block. Decimal units (1 MB = 1,000,000 bytes), the same
 * convention the pinned model sizes, the README and the license notices
 * use, so one number can never mean two sizes (M-18).
 */

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1000) return `${Math.round(bytes)} B`;
  if (bytes < 1000 * 1000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  const mb = bytes / 1e6;
  if (mb < 10) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb)} MB`;
}

/** Whole megabytes, the way sizes are shown elsewhere in the app. */
export function mbWhole(bytes: number): string {
  return Math.max(0, Math.round(bytes / 1e6)).toString();
}

/** A clock like 0:45 or 12:03, for timers that run in view. */
export function clockMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Seconds as a plain number with one decimal: "0.4" or "7.2". */
export function secondsPrecise(ms: number): string {
  return (ms / 1000).toFixed(1);
}

/** Transfer speed: "1.2 MB/s". */
export function speed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "";
  return `${(bytesPerSecond / 1e6).toFixed(1)} MB/s`;
}

/** Remaining time, plain: "about 40 seconds", "about 1 second" or "about 3 minutes". */
export function eta(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return "";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    if (seconds === 1) return "about 1 second";
    return `about ${seconds} seconds`;
  }
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes === 1) return "about 1 minute";
  return `about ${minutes} minutes`;
}
