/**
 * Development only test model support.
 *
 * The sandbox (and small machines generally) cannot hold the real 600M
 * parameter model, so a small real translation model can be enabled with
 * NEXT_PUBLIC_DEBUG_MODEL=Xenova/opus-mt-en-fr. It exercises the real worker,
 * real downloads from the Hugging Face Hub, real caching, progress,
 * initialisation, warm up, translation and reload behaviour.
 *
 * It can never be active in a production build: the constant compiles to null
 * unless this is a development build.
 */

export const DEBUG_MODEL: string | null =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEBUG_MODEL
    ? process.env.NEXT_PUBLIC_DEBUG_MODEL
    : null;

/** The cache the worker uses for the debug model. Separate from the real one. */
export const DEBUG_CACHE_NAME = "pt-model-debug";

/**
 * Expected download size, used for the storage pre check and honest copy.
 * Rounded up on purpose: it is a gate, not a measurement.
 */
export const DEBUG_MODEL_APPROX_BYTES = 150 * 1024 * 1024;

/** The only pair the debug model can translate. */
export const DEBUG_PAIR = { src: "eng_Latn", tgt: "fra_Latn" } as const;

export const DEBUG_MODEL_ID = DEBUG_MODEL ?? "";
