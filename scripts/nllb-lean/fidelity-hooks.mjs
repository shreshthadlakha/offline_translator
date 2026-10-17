// Module resolve hook for the fidelity harness: rewrites the engine's
// "onnxruntime-web" import to the Node shim, so the exact engine module the
// worker ships runs under Node with onnxruntime-node.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "onnxruntime-web") {
    return { shortCircuit: true, url: new URL("./ort-shim.mjs", import.meta.url).href };
  }
  return nextResolve(specifier, context);
}
