# Private Translator: Product Requirements Document (v2)

*Working name. This document says what the product is, who it's for, and how it should feel. The Technical Design document (v2) says how it's built. Both are written as if starting fresh, and they replace the earlier versions.*

---

## 1. Overview

Private Translator translates text between a large set of world languages, entirely on the person's own device. It translates as they type. Nothing they write is ever sent to a server. There is no account, no ads and no tracking, and once it has been set up it keeps working with no internet connection.

## 2. Positioning

Most translators say they're fast and powerful. This one says something different: your words belong to you.

That is the whole idea, and the design should carry it. The goal is not to beat the big tools on feature count. The goal is a calm, trustworthy place to write something personal in another language, with nobody else in the middle.

## 3. The problem

Mainstream translators send every keystroke to a company's servers. People use them for things that are personal: a message to a relative, a medical letter, a contract, a private note. Most people accept the trade or go without. There is no popular option that is private by design, free of accounts and limits, and gives languages like Hindi, Urdu, Persian, Tamil and Swahili the same place in the interface as French or Spanish.

## 4. Who it's for

- People translating personal or sensitive text who don't want it leaving their device.
- People who move between languages in daily life: families, friends, communities, and people who work across languages.
- People with a weak or missing connection, such as travellers.
- Anyone tired of accounts, limits and upsells.

## 5. Principles

1. **Private by design.** What the person writes never leaves their device. The only network activity is loading the app itself and a one time download of the translation model files. No analytics, no tracking, no third party scripts or fonts.
2. **Free and unlimited.** No account, no subscription, no usage caps, no ads.
3. **Works offline.** After the first setup, no connection is needed.
4. **Honest.** The app says what is true. When setup is needed, when something isn't available, when a translation might be imperfect. No made up confidence scores.
5. **Calm.** The interface stays out of the way and never competes for attention.

## 6. Scope

### In this version

- Real time translation across a large set of world languages
- Searchable language picker showing native script names
- Hide input toggle
- Listen (read the translation aloud)
- Copy and download
- Local history, with a flag for translations that seem wrong
- Share link (no server involved)
- Batch mode for longer text
- One time setup, offline use, installable app
- Settings, light and dark appearance
- A plain language explanation of how privacy works here

### Not in this version

- Language learning aids: grammar markers, word definitions, hover alignment between languages, formality switches, quizzes, flashcards. They were tried and set aside to keep the product focused and reliable.
- Voice dictation. Browser speech recognition usually sends audio to a cloud service, which would break the main promise.
- Automatic language detection.
- Accounts, syncing between devices, or any cloud storage.
- A choice of model sizes or quality levels.

---

## 7. Features and what done looks like

### 7.1 Real time translation

- Translation starts as the person types. Finished sentences translate straight away. The sentence still being typed translates a moment after they pause.
- Enter translates everything immediately. Shift and Enter starts a new line.
- Works for any pair from the supported list, in either direction.
- Typing never feels blocked, even while a translation is running.
- Output never shows stale text. Once the person stops typing, the output matches what's in the input.
- The layout stays steady as translations arrive. No flashing, jumping or flicker.

### 7.2 Languages and the picker

- Source and target are chosen separately, with a swap control between them. Picking the same language on both sides swaps them instead of blocking the choice.
- The picker lists every language in its own script beside its English name. The order is always alphabetical by English name, including when filtered by search. Search matches either name.
- It opens as a clean layer above everything else. Nothing behind it shows through. It closes with Escape, an outside click, or by choosing a language. It works fully by keyboard.

### 7.3 Hide input

- A toggle blurs what the person types so it can't be read at a glance. Typing, translating and everything else carry on as normal while it's on.
- It also masks the source text shown in history.
- The choice is remembered between visits.

### 7.4 Listen

- Reads the translation aloud using voices already on the device. Nothing is sent anywhere.
- If the device has no voice for that language, the control says so instead of failing quietly.

### 7.5 Copy and download

- Copy the translation, or download it as a plain text file.

### 7.6 History

- Past translations are saved on the device only. Newest first, grouped by day, with the language pair shown.
- Each entry can be restored into the translator, copied, deleted, or flagged. A flag marks a translation the person thinks is wrong, for their own reference. Nothing is reported anywhere. History can be filtered to flagged entries.
- History can be switched off in settings and cleared at any time.

### 7.7 Share link

- Creates a link that carries the text and language pair inside it. No server stores anything. The text sits in the part of the link after the # symbol, which browsers never send to a server.
- The app says plainly that anyone with the link can read what's in it. If the text is too long to fit in a link, it says so.

### 7.8 Batch mode

- Paste text or upload a plain text file, translate the whole thing, watch progress, cancel if needed, then copy or download the result.

### 7.9 Setup and offline

- First use needs a one time download of the translation model. The size is stated up front and progress is shown as one calm bar.
- After that the app works offline. A quiet badge says so. If the person is offline before setup is finished, the app explains what's needed.
- The app can be installed on devices that support it.

### 7.10 Settings and appearance

- Light, dark, or follow the device.
- Keep history on or off. Clear history.
- Remove the downloaded model to free space, with a clear note that it will need downloading again.
- Link to the explanation of how it works.

### 7.11 How it works

- A short plain language panel covering: what runs where, what gets downloaded and from where, what is stored on the device, and what the app never does.

---

## 8. Experience

### 8.1 Structure

One main surface: the translate view. Secondary things (History, Batch, Share, Settings, How it works) are reachable from the header. Setup progress, offline status and the language picker appear as layers over the translate view, not as separate pages. There is no navigation for anything that doesn't exist.

### 8.2 Layout

- Top row: source language, swap, target language.
- Below: two panes. Side by side on desktop, stacked on mobile.
- Input pane: Hide input in its header. The Translate button and a short hint at its foot.
- Output pane: Listen, Copy, Download and Flag in its header.
- Page header: wordmark on the left, History, Batch, Share and Settings on the right, collapsing into a menu on small screens.
- The two panes are the visual centre and get the most room at every size.

### 8.3 Flows

**First visit.** The person lands on the translate view with the panes visible straight away. A line under the input states that first use downloads the translation model once, with its size. When they first type or press Translate, setup begins and a single progress bar appears. When it finishes, whatever they typed is translated.

**Everyday use.** Pick languages, type or paste, translation appears as sentences complete. Optionally hide the input, listen, copy, download, swap, or flag. The translation lands in history on its own once it has settled.

**Offline return.** They open the app with no connection. It works. A quiet badge confirms it.

**Opening a shared link.** The text and languages are filled in, and translation runs as normal.

### 8.4 Voice and copy

The writing should sound like one person writing to another, not a product describing its own features.

- Short, plain sentences. Don't try to sound impressive.
- No em dashes or double hyphens as a way of building sentences. Use a full stop or a comma, or start a new sentence.
- Avoid "it's not just X, it's Y". Avoid "whether you're X or Y" as an opener. Avoid lists of three used only for rhythm.
- Avoid stock product vocabulary: seamless, empower, unlock, elevate, leverage, journey (unless it's about travel), landscape, robust, cutting edge, game changing. If a line could sit unchanged in any other app's marketing, rewrite it so it says something about this one.
- Contractions are good. "You're offline" is better than "You are currently offline."
- Status messages say what is actually true.
- The app never speaks about itself in the first person and has no character. Talk to the person about what's happening, not as the tool.
- Every piece of user facing text lives in one place in the code so it can be reviewed together.

| Where | Avoid | Prefer |
|---|---|---|
| Privacy statement | "100% Private. No Data Collection." | "What you type stays on your device. It's never sent anywhere." |
| Offline badge | "Offline Mode Enabled" | "Works offline now. The model is saved on your device." |
| Translation done | "Translation Complete!" | "Translation ready." |
| First use note | "Preparing your language model..." | "The first time, a one time download of about [size] sets things up. After that it works offline." |
| During setup | "Powering up your translator..." | "Setting up translation. This happens once." |
| Empty history | "No history yet! Start your language journey!" | "Nothing translated yet. It'll show up here once you do." |
| Share link made | "Link copied to clipboard! 🎉" | "Link copied. Anyone with it can read what's in it." |
| Link too long | "Oops, that's too much!" | "That's too long to fit in a link. Try sharing a shorter piece." |
| Flagged | "Report submitted!" | "Marked. You can find it again in your history." |
| No voice | "Sorry, voice unavailable." | "No voice for this language on your device." |
| Translation failed | "Something went wrong!" | "Couldn't translate that. Try again." |
| Offline, not set up | "No connection detected." | "You're offline, and translation isn't set up yet. Connect once to finish setup." |
| Out of memory | "Error: insufficient memory." | "This device ran out of memory during setup. Close other tabs and try again, or use a computer." |
| Hide input helper | "Privacy shield enabled." | "Blurs what you type so it can't be read over your shoulder." |

### 8.5 Visual direction

**Overall feel.** Warm, restrained and engineered. Calm rather than flashy. Closer to a well made writing tool than a tech dashboard.

**Colour.** One confident accent, no gradients, no glow.

| Role | Light | Dark (starting values) | Use |
|---|---|---|---|
| Background | `#F8F7F2` | `#12171D` | Page background. Warm, not stark white. |
| Surface | `#FDFCF8` | `#1A212A` | Panes, sheets, menus. |
| Border | `#E3E0D6` | `#2A3440` | 1px borders. |
| Text | `#243B53` | `#ECE9E1` | Body text. |
| Muted text | `#5B6B7B` | `#9AA7B4` | Metadata, hints. |
| Primary | `#243B53` | `#9DB7D3` | Main button fill, key controls. |
| Accent | `#3BB273` | `#4CC38A` | Fills, dots, icons, active toggles. |
| Accent text | `#1F7A4D` | `#6FD9A4` | When the accent has to be read as text. |
| Highlight | `#FFD166` | `#FFD166` | Small badges and icons only. |
| Error | `#A94438` | `#E58A7E` | Failures, used sparingly. |

The bright accent green on the cream background is too faint to read as small text, and gold is too faint for any text at all. Use the darker accent text colour for any green words, and keep gold to icons and badges. All colour pairs, dark mode included, must be checked against WCAG AA contrast and adjusted if they fall short.

Avoid purple and cyan together, and avoid dark navy with electric purple. That is the default look of most AI products at the moment and reads as generic.

**Type.** A humanist serif for the wordmark and the largest headline only. A clean sans for everything else. Not the usual default sans that every template ships with. Both must work properly across every script the app supports, with sensible fallbacks, because a font that handles Latin beautifully and falls back to something mismatched for Devanagari or Arabic looks broken, not elegant. Four sizes only: wordmark, section heading, body, small.

**Shape.** Moderately rounded corners. One pixel borders and a very light shadow instead of heavy drop shadows or glass effects. Generous spacing.

**Motion.** New translated text settles in gently, a soft fade with a tiny rise, only on text that has just arrived. Transitions are quick and quiet, around 150 to 220 milliseconds. No bounce, no spring, no shimmer or gradient loading skeletons. Respect the device's reduced motion setting.

**Icons.** Simple line icons. Lock for privacy, crossed out cloud for offline, speaker for listen, copy, download, link for share, arrows for swap. No sparkles, magic wands, robots or glowing effects.

### 8.6 How the global identity shows up

The multi language nature of the product shows up inside the tool, not in a separate mission section or decoration.

- The language picker is the main place. Every language appears in its own script, set with real care, next to its English name.
- Translated text is rendered with correct handling for its script: right to left layout for Arabic, Urdu, Persian, Hebrew and Pashto, proper spacing and weight for Devanagari, Han and the rest. That it does this well every time is what makes it feel serious about languages.
- Copy carries what the privacy actually protects, writing to someone in their language without a third party in the middle, rather than listing features.

### 8.7 What to avoid

- Gradients, glow, purple and cyan schemes.
- Per language decoration such as particles or flag colours.
- A chatty first person voice for the app.
- Fake progress percentages or confidence scores.
- Anything that implies vocabulary tracking, streaks or learning progress.
- Navigation for features that don't exist.

---

## 9. Accessibility and inclusion

- Text contrast meets WCAG AA in light and dark modes.
- Every icon only button has a real accessible label.
- Right to left languages work correctly in the panes, the picker and history.
- Everything can be done with the keyboard alone, including the language picker.
- Touch targets are comfortably large on phones.
- Reduced motion is respected.
- Text in other scripts is marked with the right language so browsers pick suitable fonts and shaping.

## 10. Success criteria

- Someone new can get a translation within seconds of setup finishing, with no signup.
- During normal use the only requests leaving the app are for its own files and, once, the model download. Nothing the person types is ever included in any request.
- After setup, the app works with the connection turned off.
- Typing stays smooth while translations run.
- Every supported language shows correctly in the picker and in the output, right to left ones included.
- There is no flicker, overlap or jumping in the picker, the setup progress or the panes.
- No one is ever shown a made up result when the truth is "not available".

## 11. Honest limitations

- Quality is good for everyday text but varies by language, and will not match the largest commercial services on subtle meaning or idiom. Less widely used languages can be weaker.
- The first download is large, and older or low memory devices can be slow or may not manage it.
- Listening depends on which voices a device already has.
- There is no automatic language detection.
- Text formatting such as bold or lists is not preserved.

## 12. Ideas for later

- Automatic language detection.
- Smaller, faster models for the most used language pairs.
- More languages as models become available.
- Learning aids, if they can be done reliably, as a separate and optional layer.
