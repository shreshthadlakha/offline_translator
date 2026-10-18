// Inspect the encoder + merged decoder session IO names (research artifact).
import * as ort from 'onnxruntime-node';

const enc = await ort.InferenceSession.create('scripts/nllb-lean/cache/encoder_model_quantized.onnx', {
  executionProviders: ['cpu'], graphOptimizationLevel: 'disabled', enableCpuMemArena: false, enableMemPattern: false,
});
console.log('ENC inputs :', JSON.stringify(enc.inputNames));
console.log('ENC outputs:', JSON.stringify(enc.outputNames));
await enc.release();

const dec = await ort.InferenceSession.create('scripts/nllb-lean/cache/decoder_model_merged_quantized.onnx', {
  executionProviders: ['cpu'], graphOptimizationLevel: 'disabled', enableCpuMemArena: false, enableMemPattern: false,
});
console.log('DEC inputs :', JSON.stringify(dec.inputNames));
console.log('DEC outputs:', JSON.stringify(dec.outputNames));
await dec.release();
