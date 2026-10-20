# P2b: Act on the P2 results

Project: Private Translator, a browser app that translates on the person's own device. Keep a log in `worklog.md`. Nothing typed or translated may leave the device. No deployment config. This prompt uses `quality-table.json` and the bar from P2, and the runner from P1.

## Plan first

Before writing any code, write a plan in the worklog, no longer than 15 lines: what you will change and why, the logic, the files you will touch, how you will test, and what could go wrong. Think about these in particular:
- How can a route be switched off without deleting its engine, so a later prompt can bring it back?
- Where should the punctuation step live so the app and the benchmark use the same code?
- Which directions need re-scoring after the change, and how long will that take?

Then build. If the plan shows this is too big for one sitting, do the first slice and say so.

## Why

P2 found that 23 of the 54 small model directions fail the bar, some badly: invented words, dropped clauses, sentences cut off mid word. Nothing should ship below the bar. P2 also showed that the sanity flag for a missing final punctuation mark mislabels Arabic and Chinese, whose outputs are mostly complete.

## Tasks

1. **Quarantine failing routes.** Every direction with a verdict of fail in `quality-table.json` stops using its small model. It falls back to the full model through the existing heavy download warning. Keep the engine code and data. Mark each disabled entry in the engine table with a reason and the P2 gap, so a later prompt can switch it back on. Pass and borderline routes stay as they are.
2. **Fix the flag.** A missing final punctuation mark alone is not a quality flag. Track it as a separate count. Keep the truncation flag for output that really stops mid word, and skip that check for scripts written without spaces.
3. **Restore final punctuation in the app.** If the source sentence ended with a terminal mark and the output has none, add the matching mark for the target language (for example the full width full stop in Chinese and Japanese, the danda in Hindi). Write it as one small function with tests per script, used by both the app and the benchmark runner.
4. **Re-score** only the directions that were flagged mostly for punctuation (for example English and Arabic, English and Chinese, and any other direction over 2% flags with a gap inside the bar). Use the P1 runner with the new step. Update `quality-table.md` and `.json`.
5. **Calibration.** Report what the P1 five direction check showed about how closely the 200 sentence sample tracks the published scores. If the noise is larger than 1.5 points, say so and propose a safer pass line.
6. **List the consequences:** which languages now go to the full model because of the quarantine, and the download size each one will see.

## Done when

No failing direction is routed to a small model, the punctuation function is tested and used in both places, the re-scored directions have updated verdicts, and the consequences list is written.

## Report (short)

Your plan in three lines, what changed, the updated verdict counts, the calibration finding, the consequences list, and anything you need from me.

## Do not

Delete any engine. Change the bar's gap thresholds. Change the interface beyond the existing heavy download warning.
