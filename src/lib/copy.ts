/**
 * Every user facing string, in one place, so the voice can be reviewed in a
 * single pass. Voice rules from the PRD: short plain sentences, contractions,
 * no em dashes, no stock product vocabulary, no first person for the app,
 * and status messages that say what is actually true.
 */

/** Size of the one time model download, shown up front. */
export const MODEL_SIZE = "900 MB";

export const copy = {
  app: {
    wordmark: "Private Translator",
    documentTitle: "Private Translator",
    metaDescription: "Translate between many languages entirely on your own device. Nothing you type is sent anywhere.",
    privacyLine: "What you type stays on your device. It's never sent anywhere.",
  },

  nav: {
    history: "History",
    batch: "Batch",
    share: "Share",
    settings: "Settings",
    howItWorks: "How it works",
    menu: "Menu",
    close: "Close",
    openMenu: "Open the menu",
  },

  status: {
    starting: "Starting",
    ready: "Ready",
    settingUp: "Setting up translation. This happens once.",
    worksOffline: "Works offline now. The model is saved on your device.",
    offlineNotSetup: "You're offline, and translation isn't set up yet. Connect once to finish setup.",
  },

  setup: {
    firstUseNote: `The first time, a one time download of about ${MODEL_SIZE} sets things up. After that it works offline.`,
    settingUp: "Setting up translation. This happens once.",
    progress: (doneMB: string, totalMB: string) => `${doneMB} of ${totalMB} MB`,
    dataSaverTitle: "Data saver is on.",
    dataSaverBody: `Downloading the model uses about ${MODEL_SIZE}. Start anyway?`,
    dataSaverConfirm: "Download now",
    dataSaverDecline: "Not now",
    outOfMemory: "This device ran out of memory during setup. Close other tabs and try again, or use a computer.",
    downloadFailed: "Couldn't download the model. Check your connection and try again.",
    retry: "Try again",
  },

  translate: {
    source: "Source",
    translation: "Translation",
    inputPlaceholder: "Type or paste text",
    inputAriaLabel: "Text to translate",
    outputAriaLabel: "Translation",
    outputEmpty: "The translation appears here.",
    translateNow: "Translate",
    translationReady: "Translation ready.",
    hint: "Enter translates. Shift and Enter starts a new line.",
    swap: "Swap languages",
    chooseSource: "Choose the source language",
    chooseTarget: "Choose the target language",
    searchLanguages: "Search languages",
    noLanguageMatches: "No language matches that search.",
    hideInput: "Hide input",
    hideInputChip: "Input hidden",
    hideInputHelper: "Blurs what you type so it can't be read over your shoulder.",
    listen: "Listen",
    listenAria: "Read the translation aloud",
    stopListening: "Stop reading",
    noVoice: "No voice for this language on your device.",
    copy: "Copy",
    copyAria: "Copy the translation",
    copied: "Copied.",
    copyFailed: "Couldn't copy. Select the text and copy it yourself.",
    download: "Download",
    downloadAria: "Download the translation as a text file",
    flag: "Flag",
    flagAria: "Mark this translation as wrong",
    flagMarked: "Marked. You can find it again in your history.",
    sentenceFailed: "Couldn't translate that. Try again.",
    engineNotReady: "Setting up translation first.",
  },

  history: {
    title: "History",
    empty: "Nothing translated yet. It'll show up here once you do.",
    emptyFlagged: "Nothing flagged yet. Flag a translation to find it again later.",
    showAll: "All",
    flaggedOnly: "Flagged",
    pair: (srcEnglish: string, tgtEnglish: string) => `${srcEnglish} to ${tgtEnglish}`,
    restoreAria: "Put this translation back in the translator",
    copyAria: "Copy this translation",
    deleteAria: "Delete this entry",
    flagAria: "Mark this translation as wrong",
    flaggedBadge: "Flagged",
    clear: "Clear history",
    clearTitle: "Clear all history?",
    clearBody: "Everything in history is deleted from this device. This can't be undone.",
    clearConfirm: "Clear",
    clearCancel: "Keep it",
    today: "Today",
    yesterday: "Yesterday",
    inputHidden: "Input hidden",
  },

  share: {
    aria: "Share this translation as a link",
    linkCopied: "Link copied. Anyone with it can read what's in it.",
    tooLong: "That's too long to fit in a link. Try sharing a shorter piece.",
    nothingToShare: "Type something first, then share it.",
    clipboardBlocked: "Your browser blocked copying. Copy the link below yourself.",
    manualLabel: "Share link",
    copyLink: "Copy link",
  },

  batch: {
    title: "Batch",
    intro: "Translate a longer piece of text all at once.",
    pastePlaceholder: "Paste text here",
    chooseFile: "Choose a text file",
    fileAria: "Upload a plain text file",
    translate: "Translate",
    translating: "Translating",
    cancel: "Cancel",
    progress: (done: number, total: number) => `${done} of ${total} sentences`,
    done: "Translation ready.",
    cancelled: "Cancelled.",
    copy: "Copy",
    download: "Download",
    fileReadError: "Couldn't read that file. Plain text files work best.",
    clear: "Start over",
  },

  settings: {
    title: "Settings",
    appearance: "Appearance",
    light: "Light",
    dark: "Dark",
    system: "Follow the device",
    keepHistory: "Keep history",
    keepHistoryHint: "Save recent translations on this device.",
    clearHistory: "Clear history",
    model: "Translation model",
    removeModel: "Remove the downloaded model",
    removeModelNote: `Frees about ${MODEL_SIZE}. You'll need to download it again to translate.`,
    removed: "Model removed.",
    nothingToRemove: "No model downloaded yet.",
    howItWorks: "How it works",
    install: "Install",
    installLabel: "Install this app on your device",
    installHint: "Adds it to your home screen or desktop. It keeps working offline.",
  },

  howItWorks: {
    title: "How it works",
    runsTitle: "What runs where",
    runsBody:
      "Translation runs entirely on your device, inside this browser. It keeps up as you type because it runs in a separate part of the page that never blocks typing.",
    downloadedTitle: "What gets downloaded",
    downloadedBody: `The first time you translate, the app downloads the translation model once, about ${MODEL_SIZE}. It comes from huggingface.co, a public file host. That host can see that a download happened, and the address it went to. It never sees anything you type. Everything else, like the fonts and the engine that runs the model, comes from this app's own files.`,
    storedTitle: "What's stored on your device",
    storedBody:
      "Your settings and your history live in this browser's local storage. The model files sit in the browser's cache. Nothing is stored anywhere else. You can remove the model in Settings at any time.",
    neverTitle: "What this app never does",
    neverBody:
      "It never sends what you type or translate to a server. There are no accounts, no analytics and no tracking. Share links carry the text inside the link itself, in the part after the # that browsers never send to a server. Anyone with the link can read it.",
    qualityTitle: "A note on quality",
    qualityBody:
      "Translations are good for everyday text and vary by language. They won't always match the largest commercial services on subtle meaning or idiom. Less widely used languages can be weaker.",
  },

  offline: {
    offline: "You're offline",
  },
} as const;

export type Copy = typeof copy;
