// Runtime shim: the lean engine imports "onnxruntime-web" (the browser
// runtime). In Node the equivalent is onnxruntime-node; this module maps the
// surface the engine uses, translating the browser execution provider name
// ("wasm") to the Node one ("cpu"). The fidelity comparison then runs the
// same engine code the worker ships.
import * as ort from "onnxruntime-node";

export const Tensor = ort.Tensor;

export const InferenceSession = {
  create: async (buffer, options = {}) => {
    const { executionProviders, ...rest } = options ?? {};
    // Normalize ArrayBuffer -> Uint8Array view (no copy) for the Node binding.
    const data = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
    return ort.InferenceSession.create(data, { ...rest, executionProviders: ["cpu"] });
  },
};
