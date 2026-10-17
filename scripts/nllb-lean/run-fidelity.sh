#!/bin/sh
# Builds and runs the P12 fidelity harness: the real lean engine module on
# ten fixed sentences per direction, compared byte for byte against the
# stored Node harness (pipeline) outputs.
set -e
cd "$(dirname "$0")/../.."

# The register hook aliases the engine's onnxruntime-web import to the Node
# shim (scripts/nllb-lean/ort-shim.mjs).
cat > scripts/nllb-lean/fidelity-register.mjs <<'EOF'
import { register } from "node:module";
register(new URL("./fidelity-hooks.mjs", import.meta.url));
EOF

npx esbuild scripts/nllb-lean/fidelity-entry.ts \
  --bundle --platform=node --format=esm --target=es2022 \
  --external:onnxruntime-web --external:@huggingface/transformers \
  --outfile=scripts/nllb-lean/cache/fidelity-bundle.mjs

node --expose-gc --import ./scripts/nllb-lean/fidelity-register.mjs scripts/nllb-lean/cache/fidelity-bundle.mjs
