/**
 * In memory translation cache. Keyed by language pair plus sentence, with
 * least recently used eviction. A sentence is never translated twice for the
 * same pair while it stays cached.
 */

const CAP = 2000;

export class TranslationCache {
  private map = new Map<string, string>();

  private key(src: string, tgt: string, sentence: string): string {
    return `${src}|${tgt}|${sentence}`;
  }

  get(src: string, tgt: string, sentence: string): string | undefined {
    const k = this.key(src, tgt, sentence);
    const value = this.map.get(k);
    if (value === undefined) return undefined;
    // Refresh recency.
    this.map.delete(k);
    this.map.set(k, value);
    return value;
  }

  set(src: string, tgt: string, sentence: string, translation: string): void {
    const k = this.key(src, tgt, sentence);
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, translation);
    if (this.map.size > CAP) {
      // Evict the least recently used entry.
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

/** Shared cache instance for the translate view and batch mode. */
export const translationCache = new TranslationCache();
