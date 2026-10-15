# P7: Quality safety net

Project: Private Translator. Keep a log in `worklog.md`. Don't ask me for anything. If a choice comes up, decide it yourself, note it in the log, and carry on. Nothing typed or translated may leave the device. No deployment config.

## Plan first

Before changing anything, write a plan in the worklog, no longer than 10 lines: what you will check and change, the logic, the files, how you will test, and what could go wrong. Then work.

## Why

The autopilot kept some small-model routes live even though they failed the quality bar in P2, because the alternative was the 900 MB full model. For the worst of them, up to half the sentences were cut off in the middle of a word. A label in the language picker is easy to miss, and the app's full stop restoration can make a cut off sentence look finished.

## Tasks

1. **List the live failures.** From `quality-table.json` and the current engine table, list every route that is live today and had a fail verdict in P2: language, direction, engine, gap, flag rate. Write the list in the worklog.
2. **Remove the worst.** Quarantine again every live route with clear evidence of cut off or invented output (a flag rate above 10%, or a gap worse than minus 10). That includes the Croatian, Serbian and Norwegian group model routes. Those languages go back to the full model through the existing heavy download warning.
3. **Warn at the moment it matters.** For every other route labelled limited, show a notice under the translated text, once per language pair per visit: "This fast model is approximate. For important text, use the full model." Add a button: "Use the full model for this language." It stores a per language choice in settings and goes through the heavy download warning if the full model isn't saved. Settings lists these choices with a Remove button. If this already exists, check that it really works and say so.
4. **Never disguise a cut off sentence.** Don't restore final punctuation on outputs from limited routes.
5. **Check in the browser:** a limited route shows the notice and the button, the button works, the quarantined languages show the heavy warning, and Details and the picker labels are still right. Update the language table in the README and the worklog.

## Report (six lines)

How many live failures were found, which routes were removed, whether the notice and button existed or were built, and anything you decided yourself.

## Do not

Change the models, the other engines, or the interface beyond this.
