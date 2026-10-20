# Small prompts: how to use them

Paste one prompt at a time into z.ai. Wait for its report, read it, then move on. Do not paste several together. Each prompt is short on purpose, and each one makes z.ai write a plan before it builds anything.

## Order

| Step | File | What it does | Needs the one before |
|---|---|---|---|
| 1 | `p1-quality-benchmark.md` | Builds a fair way to measure translation quality using professional human translations | No |
| 2 | `p2-score-current-engines.md` | Scores every model the app uses today and sets the quality bar | Yes, P1 |
| 3 | `p3a-south-asian-models.md` | Looks for better small models for Urdu and the Indian languages | Yes, P1 and P2 |
| 4 | `p3b-middle-east-models.md` | The same for Persian, Hebrew, Pashto, Arabic and Turkish | Yes, P1 and P2 |
| 5 | `p3c-remaining-models.md` | The same for the remaining languages | Yes, P1 and P2 |
| 6 | `p4-quality-labels-and-choice.md` | Shows quality honestly in the app and lets people choose the full model | Yes, P2 and the P3 results |

P3a, P3b and P3c can run in any order.

## When to come back to me

- After P2, with the quality table, so we can read it together.
- After each P3 prompt, with its recommendation table.
- Whenever a report says it needs something from you.

## The goal, stated honestly

No translation system is 100% accurate, including the big commercial ones. The goal here is measurable: for each language, use the fastest model that clears a quality bar, measured against professional human translations. Anything that doesn't clear the bar is labelled honestly or stays on the full model. Nothing ships silently below the bar.
