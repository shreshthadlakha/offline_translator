#!/usr/bin/env python3
"""P3a golden reference: runs the REAL IndicTransProcessor (IndicTransToolkit,
compiled Cython) on the benchmark data so the JavaScript port can be diffed
against it. Two phases:

  preprocess  -> scripts/benchmark/p3a-golden-pre.json
                 {direction: {id: {"pre": str, "phMap": {...}}}}
  postprocess -> reads raw model outputs from a node harness state JSON
                 (outputs field), applies postprocess_batch, writes
                 p3a-golden-post.json {direction: {id: str}}

Usage: python3 p3a-golden.py preprocess
       python3 p3a-golden.py postprocess <state.json> <direction> <out.json>
"""
import json
import sys
import types
import os

BENCH = os.path.dirname(os.path.abspath(__file__))
FLORES = os.path.join(BENCH, "data/flores200_dataset/devtest/{}.devtest")

DIRECTIONS = {
    "en-ur": ("eng_Latn", "urd_Arab"),
    "ur-en": ("urd_Arab", "eng_Latn"),
    "en-ta": ("eng_Latn", "tam_Taml"),
    "ta-en": ("tam_Taml", "eng_Latn"),
    "en-bn": ("eng_Latn", "ben_Beng"),
    "bn-en": ("ben_Beng", "eng_Latn"),
}


def load_processor():
    stub = types.ModuleType("transformers")
    stu = types.ModuleType("transformers.tokenization_utils")
    stu.PreTrainedTokenizerBase = type("PreTrainedTokenizerBase", (), {})
    stub.tokenization_utils = stu
    sys.modules["transformers"] = stub
    sys.modules["transformers.tokenization_utils"] = stu
    import importlib.machinery, importlib.util
    pkg = "/home/z/.venv/lib/python3.12/site-packages/IndicTransToolkit"
    so = os.path.join(pkg, "processor.cpython-312-x86_64-linux-gnu.so")
    loader = importlib.machinery.ExtensionFileLoader("IndicTransToolkit.processor", so)
    spec = importlib.util.spec_from_loader("IndicTransToolkit.processor", loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod.IndicProcessor(inference=True)


def flores_lines(code):
    with open(FLORES.format(code), encoding="utf-8") as f:
        return f.read().rstrip("\n").split("\n")


def phase_preprocess():
    ip = load_processor()
    sample = json.load(open(os.path.join(BENCH, "sample.json")))
    out = {}
    for dkey, (src, tgt) in DIRECTIONS.items():
        src_lines = flores_lines(src)
        sents = [src_lines[i] for i in sample["ids"]]
        # one batch call per sentence: pre -> (queue holds its map) -> post
        # pulls it. We keep pre and post paired per sentence so the internal
        # placeholder queue stays in sync exactly like translate.py does.
        out[dkey] = {}
        for i, s in zip(sample["ids"], sents):
            r = ip.preprocess_batch([s], src_lang=src, tgt_lang=tgt)[0]
            out[dkey][str(i)] = {"pre": r}
        print(f"[golden] {dkey}: {len(sents)} sentences preprocessed")
    with open(os.path.join(BENCH, "p3a-golden-pre.json"), "w", encoding="utf8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("[golden] wrote p3a-golden-pre.json")


def phase_postprocess(state_path, dkey, out_path):
    state_raw = json.load(open(state_path))
    tgt = state_raw["tgt"]
    src = state_raw["src"]
    ip = load_processor()
    state = json.load(open(state_path))
    raw = state["outputs"]
    sample = json.load(open(os.path.join(BENCH, "sample.json")))
    src_lines = flores_lines(src)
    results = {}
    for i in sample["ids"]:
        sent = src_lines[i]
        raw_out = raw.get(str(i))
        if raw_out is None:
            raw_out = raw.get(i)
        if raw_out is None:
            results[str(i)] = None
            continue
        # pair pre + post so the internal queue provides this sentence's map
        ip.preprocess_batch([sent], src_lang=src, tgt_lang=tgt)
        post = ip.postprocess_batch([raw_out], lang=tgt)[0]
        results[str(i)] = post
    with open(out_path, "w", encoding="utf8") as f:
        json.dump(results, f, ensure_ascii=False, indent=1)
    print(f"[golden] wrote {out_path} ({len(results)} sentences)")


if __name__ == "__main__":
    if sys.argv[1] == "preprocess":
        phase_preprocess()
    else:
        phase_postprocess(sys.argv[2], sys.argv[3], sys.argv[4])
