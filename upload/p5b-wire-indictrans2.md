# P5b: Wire IndicTrans2 into the app

Project: Private Translator, a browser app that translates on the person's own device. Keep a log in `worklog.md`. Nothing typed or translated may leave the device. No deployment config. Run this after P5a has proven the engine in the browser. It uses the engine module from P5a and the P3a results.

## Plan first

Before writing any code, write a plan in the worklog, no longer than 15 lines: what you will build and why, the logic, the files you will touch, how you will test, and what could go wrong. Think about these in particular:
- How does a new kind of engine sit beside the existing ones in the engine table and the worker protocol?
- How do the setup stages, Details, Cancel, the one tab lock, the crash flag and the version handshake apply to it?
- Each direction has its own model file set. How are saving, removing and the storage figures handled per model?
- Which pairs are not covered, and what happens to them?

Then build. If the plan shows this is too big for one sitting, do the first slice and say so.

## Goal

The 13 Indian languages (Hindi, Bengali, Gujarati, Kannada, Malayalam, Marathi, Nepali, Odia, Punjabi, Tamil, Telugu, Assamese, Urdu) use IndicTrans2 in both directions with English, instead of the full model or the quarantined Hindi model.

## Tasks

1. **Engine kind.** Add an IndicTrans2 engine kind to the worker and the engine table. English into any of the 13 uses the English to Indic model. Any of the 13 into English uses the Indic to English model. Pairs between two Indic languages are not covered, so they keep using the full model through the heavy download warning.
2. **Routing.** Remove the quarantine entries that these routes replace (Hindi, and any others). Update the quality table data and the engine table with the P3a scores.
3. **Setup experience.** The same transparent stages, progress, Details and Cancel as the other engines, for each model. Setup text names the pair and the size, for example "Setting up English to Hindi. This downloads a model once, about 280 MB." No heavy download warning for these routes.
4. **Picker and grid.** The note beside each of these languages shows the engine and size, for example "Fast, about 280 MB". Use the tier data if P4 has been done. Otherwise show "Fast", and mark Assamese to English and Telugu to English as approximate, since they were the two weak results.
5. **On this device.** List each saved IndicTrans2 model with its size and a Remove button. Erase everything removes them too. Storage figures stay right.
6. **Licenses.** IndicTrans2 is MIT licensed, from AI4Bharat. The browser versions are community exports. The JavaScript preprocessing is ported from other open source code. Add a notices file in the repo with each license and credit, show the model and its license in Details, and update the "Which models does it use?" answer.
7. **Protocol.** Bump the protocol version so the handshake still protects against stale code. Keep the one tab lock and the crash flag working for this engine.
8. **Check in the browser.** For each of the 13 languages, translate a sentence in both directions. Then check Cancel at each stage, a reload, offline translation after setup, engine switching with memory released, and the Details panel.

## Sweep

Check history, share links, batch mode, flagging, copy, download and listen with this engine. Check switching between this engine, the small European models and the full model. No hydration warnings, no flicker in the progress UI, no new third party requests, and Details never contains typed or translated text.

## Done when

All 13 languages work in both directions in the browser with honest setup and notes, and the sweep is clean.

## Report (short)

Your plan in three lines, what you built, what you verified, the measured browser speeds, anything that failed, and what you need from me.

## Do not

Change the other engines. Host models (that is P5c). Add deployment config.
