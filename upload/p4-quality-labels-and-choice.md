# P4: Quality labels and a choice of model

Project: Private Translator, a browser app that translates on the person's own device. Keep a log in `worklog.md`. Nothing typed or translated may leave the device. No deployment config. Run this after P2 and the P3 prompts. It reads their results and changes the app.

## Plan first

Before writing any code, write a plan in the worklog, no longer than 15 lines: what you will build and why, the logic, the files you will touch, how you will test, and what could go wrong. Think about these in particular:
- Where will the quality data live, and how will the app read it without hard coding it?
- How does a per language override interact with engine switching, the heavy download warning, and offline use?
- What does each tier look like to the person, and what do they need to know to choose?

Then build. If the plan shows this is too big for one sitting, do the first slice and say so.

## Tasks

1. **Quality data in the engine config.** Build a JSON file from `quality-table.json` (P2) and the P3 recommendations. Each engine entry gets a tier:
   - Fast: passes the bar.
   - Fast, approximate: borderline.
   - Large: the full model.
   A small model that fails the bar is never used. Where P3 found a better engine that passes, route to it, but only if it is already integrated. Otherwise leave routing as it is and list it for me.
2. **Picker and language grid.** Show the tier and size beside each language for the pair it would create, for example "Fast, about 75 MB", "Fast, approximate, about 113 MB", or "Large, about 870 MB".
3. **Approximate notice.** When the output comes from an approximate model, show one quiet line under it: "This fast model is approximate. For important text, use the full model." With a button: "Use the full model for this language."
4. **Per language choice.** That button stores an override in settings for that pair. Settings lists the overrides with a Remove button. The existing "Use faster models when available" switch stays. The override still goes through the heavy download warning if the full model isn't saved.
5. **Details.** Show the tier and, for developers, the measured score next to its baseline.
6. **Copy** follows the voice rules: short, plain, no em dashes, no stock product words, all strings in the copy file.

## Sweep

Check overrides with engine switching, with the heavy download warning, offline, after Erase everything, and across a reload. Check the notes update when the other language changes. No hydration warnings, no flicker, no new third party requests.

## Done when

Every language shows an honest tier in the picker, approximate outputs carry the notice, and the override works end to end.

## Report (short)

Your plan in three lines, what you built, what you verified, and anything you need from me.

## Do not

Change the models themselves. Show a tier without data behind it. Add deployment config.
