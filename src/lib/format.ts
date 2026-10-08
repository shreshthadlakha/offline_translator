/**
 * Byte formatting shared by the request log and the On this device block.
 * Uses the same 1024 based MB the setup progress uses, so the numbers agree.
 */

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  if (mb < 10) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb)} MB`;
}

/** Whole megabytes, the way sizes are shown elsewhere in the app. */
export function mbWhole(bytes: number): string {
  return Math.max(0, Math.round(bytes / (1024 * 1024))).toString();
}

/** Megabytes with one decimal, for small models where whole numbers are too
 * coarse: "108.4 MB". */
export function mbPrecise(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 100) return Math.round(mb).toString();
  return mb.toFixed(1);
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
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
}

/** Remaining time, plain: "about 40 s" or "about 3 min". */
export function eta(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return "";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `about ${seconds} s`;
  return `about ${Math.max(1, Math.round(seconds / 60))} min`;
}
