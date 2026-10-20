/**
 * Type declarations for the direct "onnxruntime-web" import used by the
 * worker engines. The package ships its types at types.d.ts, but its
 * package.json "exports" map does not expose them to bundler resolution, so
 * TypeScript sees the module as implicit any. The declarations are re-exported
 * here through the filesystem path (the same package-lock pins the exact
 * version, so the path is stable).
 */
declare module "onnxruntime-web" {
  export * from "../../node_modules/onnxruntime-web/types.d.ts";
}
