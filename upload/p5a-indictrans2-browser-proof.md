# P5a: Prove IndicTrans2 in the browser

Project: Private Translator, a browser app that translates on the person's own device. Keep a log in `worklog.md`. Nothing typed or translated may leave the device. No deployment config. This prompt builds on P3a: the JavaScript IndicProcessor port, the tokenizer approach, the Node harness, the golden files, and the community int8 ONNX models (en to Indic and Indic to en).

## Plan first

Before writing any code, write a plan in the worklog, no longer than 15 lines: what you will build and why, the logic, the files you will touch, how you will test, and what could go wrong. Think about these in particular:
- P3a only ran in Node with a native runtime. Which parts of the Node harness can move into a Web Worker unchanged, and which need rewriting for the browser runtime already used by the app?
- How will model files be fetched, cached and reported on, using the same aggregated progress scheme as the other engines?
- How is the generation loop (encoder, decoder, decoder with past) run with onnxruntime-web, and what are the memory and thread limits?
- What should be measured, and what counts as good enough?

Then build. If the plan shows this is too big for one sitting, do the first slice and say so.

## Goal

Find out whether IndicTrans2 works well in the browser, before any app wiring. Browser speed and memory are the main unknowns.

## Tasks

1. **Browser engine module.** Put the IndicTrans2 pipeline in a module that runs inside a Web Worker: file fetching with the Cache API under its own cache name, aggregated progress, the JavaScript preprocessing and postprocessing, the tokenizer, and greedy generation with the cache of past values, using the same onnxruntime-web and self hosted runtime files the app already uses.
2. **Dev test page.** A development only page or harness that loads the module and translates text, with a visible banner. It must not be reachable in a production build.
3. **Golden checks in the browser.** Run the preprocessing and postprocessing against the Python golden files for English and Hindi, Urdu, Tamil and Bengali, both directions. Results must be byte identical, except for the known placeholder numbering case from P3a.
4. **Quality parity.** Translate the 200 sentence sample in the browser for English to Hindi and Hindi to English, and compare chrF++ with the Node results from P3a. Report the difference.
5. **Measure in the browser:** download size and time, time to load from the cache, memory used, time for the first sentence, median seconds per sentence, and behaviour over a long run. Report how much slower or heavier it is than Node and why.
6. Keep all code in a module the app can import later. No app interface changes, no routing changes.

## Done when

The golden checks pass in the browser, the quality matches Node within about 0.3 chrF++, and the measurements are reported.

## Report (short)

Your plan in three lines, the golden results, the quality comparison, the measurements, anything that failed, and what you need from me.

## Do not

Change the app's routing or interface. Skip the golden checks. Fetch anything from a third party at runtime other than the model files.
