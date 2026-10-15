# P8: Final release check

Project: Private Translator. Keep a log in `worklog.md`. Don't ask me for anything. If a choice comes up, decide it yourself, note it in the log, and carry on. Nothing typed or translated may leave the device.

## Plan first

Before changing anything, write a plan in the worklog, no longer than 10 lines: what you will check, the logic, how you will test, and what could go wrong. Then work.

## Why

P7 found that parts of the project folder had silently gone back to an earlier state: the quality table, deleted files that had come back, and a worker bundle that didn't match its source. The release work from P6 may have been affected too. Everything must be verified before the code is published and deployed.

## Tasks

1. **Inventory.** Confirm these exist and are current: `package-lock.json` (and no other lockfile), `LICENSE-MIT`, `LICENSE-APACHE`, `NOTICE`, `THIRD_PARTY_NOTICES.md`, `README.md`, `.gitignore`, `.github/workflows/ci.yml`, and the scripts that build the worker and the runtime files automatically on install and on build. Confirm there is no `vercel.json`, no `netlify.toml`, no API routes, no server code, and no `output: 'export'`. Recreate anything missing, following the requirements in `p6-release-readiness.md`.
2. **Regenerate** the third party notices and the quality table from the current engine table, and make sure the drift check passes. The notices must list every model now in use, including the community conversions, with its pinned revision, its license, and whether it is non commercial.
3. **Clean build.** In a fresh temporary copy of the project, with no `node_modules`, no `.next` folder and no generated files, run `npm ci`, lint, the type check, and `npm run build`. All of them must pass. Confirm the worker and runtime files are produced by the build itself, not left over from before. If anything fails, fix it and run the whole thing again.
4. **First visit size.** Measure it again, compressed, and report the number.
5. **Leftovers.** Remove dead files, debug flags and test pages that are not needed. Confirm no file in the repository is over 50 MB, no secrets or keys are present, and no model files or benchmark datasets are committed.
6. **Commit.** Commit the final state in git with a clear message, and confirm `git status` is clean, so nothing can silently go back to an earlier state.

## Report (six lines)

What was missing or out of date and what you fixed, the clean build result, the first visit size, the notices and quality table status, and anything you decided yourself.

## Do not

Change features, models or the interface. Add deployment config.
