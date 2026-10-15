/**
 * Every user facing string, in one place, so the voice can be reviewed in a
 * single pass. Voice rules from the PRD: short plain sentences, contractions,
 * no em dashes, no stock product vocabulary, no first person for the app,
 * and status messages that say what is actually true.
 */

import { LANGUAGES } from "@/lib/languages";

/** Size of the one time download for the full model, shown up front. */
export const MODEL_SIZE = "900 MB";

/** The app version, shown in Details. */
export const APP_VERSION = "1.0.0";

/** The language count comes from the registry. It is never hard coded. */
export const LANGUAGE_COUNT = LANGUAGES.length;

export const copy = {
  app: {
    wordmark: "Private Translator",
    // The page title and meta description use the headline and the subline.
    documentTitle: "Your words belong to you",
    metaDescription: `Translate between ${LANGUAGE_COUNT} languages on your own device. Nothing you type is sent anywhere.`,
    privacyLine: "What you type stays on your device. It's never sent anywhere.",
  },

  hero: {
    headline: "Your words belong to you.",
    subline: `Translate between ${LANGUAGE_COUNT} languages on your own device. Nothing you type is sent anywhere.`,
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
    offline: "You're offline",
  },
  setup: {
    title: "One time set up",
    line1: `The first translation needs the model on this device. It's a one time download of about ${MODEL_SIZE}.`,
    line2: "After that, translating works with no connection, and nothing you type is ever sent anywhere.",
    start: "Set up now",
    // Always available during setup: stops the work and returns to the offer.
    cancelSetup: "Cancel",
    // The setup stages, in order. These are the names people see while the
    // engine comes up.
    stageChecking: "Checking your device",
    stageDownloading: "Downloading the model",
    stageInitializing: "Reading it into memory",
    stageTesting: "Checking that translation works",
    stageReady: "Ready",
    // A small model for a specific pair, instead of the full one.
    settingUpPair: (pairEnglish: string, sizeMB: string) => `Setting up ${pairEnglish}. This downloads a small model once, about ${sizeMB} MB.`,
    // The IndicTrans2 bundles are larger than the small pairs: honest
    // wording without "small", so nobody is surprised by a 295 MB download.
    settingUpLargePair: (pairEnglish: string, sizeMB: string) => `Setting up ${pairEnglish}. This downloads a model once, about ${sizeMB} MB.`,
    switching: "Switching to the faster model for this pair.",
    settingUp: "Setting up translation. This happens once.",
    // The drawn check once setup finishes.
    readyNote: "Ready. Works offline now.",
    // While the model is being read into memory, no bytes move and nothing
    // would change on screen. A timer and these notes keep it honest.
    workingFor: (clock: string) => `Working for ${clock}`,
    unpackingNote: "This can take a minute while your device unpacks the model.",
    // Longer than usual while reading the model into memory.
    longLoadNote: "This is taking longer than usual. Closing other tabs can help.",
    // Four minutes and still reading into memory: say what the options are.
    veryLongLoadNote: "This device may not be able to run the full model. You can keep waiting or cancel.",
    // Download stall.
    stalled: (seconds: number) => `No data has arrived for ${seconds} seconds. Check your connection. Files already saved are kept.`,
    progress: (doneMB: string, totalMB: string) => `${doneMB} of ${totalMB} MB`,
    dataSaverTitle: "Data saver is on.",
    dataSaverBody: `Downloading the model uses about ${MODEL_SIZE}. Start anyway?`,
    dataSaverConfirm: "Download now",
    dataSaverDecline: "Not now",
    outOfMemory: "This device ran out of memory during setup. Close other tabs and try again, or use a computer.",
    downloadFailed: "Couldn't download the model. Check your connection and try again.",
    retry: "Try again",
    offlineNotSetup: "You're offline, and translation isn't set up yet. Connect once to finish setup.",
    // Offline with a pair whose model isn't saved, when some other model is.
    offlinePairNotSetup: "You're offline, and this language pair isn't set up yet.",
    // A leftover crash flag from the last visit.
    crashedLastTime: "Last time, setup stopped before it finished. That usually means the device ran out of memory. Close other tabs and try again.",
    // Another tab holds the engine.
    anotherTab: "Translation is open in another tab. Use that one, or close it and reload this one.",
    // Version handshake failure.
    staleCode: "The app files on this device are out of date. Reloading will fix it.",
    reload: "Reload",
    // Storage quota smaller than the model.
    quotaTooSmall: (canStore: string, needs: string) => `This window can only store ${canStore}, and the model needs about ${needs}. Open the app in a normal window instead.`,
    // Low reported memory. A note, not a block. Full model only.
    lowMemory: (gb: string) => `This device reports about ${gb} GB of memory. Setup needs roughly 3 GB free at its peak. Closing other tabs first helps.`,
    // Storage can't be written at all. Translating still works.
    storageDisabled: "Storage is switched off in this window, so the model can't be saved. It will download again next visit.",
    // WebGPU wanted, WebAssembly used.
    webgpuFellBack: "Switched to the more compatible mode because the faster one didn't work on this device.",
    // Translate pressed while the engine isn't ready.
    willRunAfterSetup: "Translation will start as soon as setup finishes.",
    // The honest ask before a heavy setup. Shown once per pair while the full
    // model isn't saved on the device.
    heavyTitle: (language: string) => `There's no fast model for ${language} yet.`,
    heavyBody: `The full model is about ${MODEL_SIZE} and needs roughly 3 GB of free memory when it starts. On many computers it takes several minutes, and on some it won't finish.`,
    heavyBodyLowMemory: (gb: string) => `The full model is about ${MODEL_SIZE} and needs roughly 3 GB of free memory when it starts. This device reports about ${gb} GB of memory, so it may not finish. Closing other tabs helps.`,
    heavyContinue: "Continue",
    heavyChooseAnother: "Choose another language",
  },

  translate: {
    viewLabel: "Translator",
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
    exampleLabel: "Try an example",
    examples: ["Where's the nearest pharmacy?", "Thank you for having us over.", "Could you say that more slowly?"] as string[],
    pickerShortcutMac: "⌘ K",
    pickerShortcutOther: "Ctrl K",
    translatedOffline: "Translated with no connection.",
    // Quiet cost notes beside each language, for the pair it would create
    // with the language on the other side. The tier qualifier comes from the
    // measured quality data, never a guess.
    costFast: (mb: string) => `Fast, about ${mb} MB`,
    costFastApproximate: (mb: string) => `Fast, approximate, about ${mb} MB`,
    costFastLimited: (mb: string) => `Fast, limited, about ${mb} MB`,
    costGroup: (mb: string) => `Fast, about ${mb} MB (one model shared by a few languages)`,
    costGroupApproximate: (mb: string) => `Fast, approximate, about ${mb} MB (one model shared by a few languages)`,
    costGroupLimited: (mb: string) => `Fast, limited, about ${mb} MB (one model shared by a few languages)`,
    costLarge: `Large, about ${MODEL_SIZE}`,
    // The quiet notice under a translation from an approximate or limited
    // model, with the per language way out.
    approximateNotice: "This fast model is approximate. For important text, use the full model.",
    useFullModel: "Use the full model for this language.",
    // Progress while translating, and the quiet timing line afterwards.
    translatingSentence: (index: number, total: number) => `Translating sentence ${index} of ${total}`,
    translatedIn: (seconds: string) => `Translated in ${seconds} s`,
  },

  details: {
    title: "Details",
    summary: "How the engine is doing. Nothing you type is ever included.",
    engine: "Engine",
    device: "Device",
    deviceWasm: "WebAssembly",
    deviceWebgpu: "WebGPU",
    precision: "Precision",
    precisionValue: "8 bit quantized",
    modelId: "Model",
    license: "Licence",
    attribution: "From",
    // The measured quality of this pair's route, beside its baseline.
    quality: "Quality",
    qualityBest: (gap: string) => `Fast, within ${gap} chrF++ of the full model's published score`,
    qualityBestAbove: (gap: string) => `Fast, ${gap} chrF++ above the full model's published score`,
    qualityGood: (gap: string) => `Fast, approximate, ${gap} chrF++ below the full model's published score`,
    qualityLimited: (gap: string) => `Fast, limited, ${gap} chrF++ below the full model's published score`,
    qualityFull: "The full multilingual model, the reference everything else is measured against",
    qualityUnmeasured: "Not measured",
    files: "Files",
    fileStatusWaiting: "waiting",
    fileStatusDownloading: "downloading",
    fileStatusSaved: "saved",
    fileStatusFromCache: "loaded from saved files",
    storage: "Storage",
    storageLine: (used: string, quota: string) => `${used} of ${quota}`,
    memory: "Reported memory",
    timings: "Stage times",
    timingLine: (label: string, seconds: string) => `${label}: ${seconds} s`,
    nowLine: (stage: string, clock: string) => `Now: ${stage}, ${clock} so far`,
    lastError: "Last error",
    version: "App version",
    recentTranslations: "Recent translations",
    recentLine: (chars: number, queueSeconds: string, translateSeconds: string) =>
      `${chars} characters, waited ${queueSeconds} s, translated in ${translateSeconds} s`,
    medianLine: (medianSeconds: string) => `Median translating time: ${medianSeconds} s`,
    noTranslationsYet: "Nothing translated yet this visit.",
    speedTest: "Run speed test",
    speedTestRunning: "Running the speed test...",
    speedTestResult: (perSentenceSeconds: string, queueSeconds: string) =>
      `About ${perSentenceSeconds} s per sentence on this device. Waiting in the queue took ${queueSeconds} s.`,
    speedTestUnavailable: "The speed test works from English. Pick English on the left to use it.",
    copyDetails: "Copy details",
    copied: "Details copied. They don't include anything you typed.",
    copyFailed: "Couldn't copy. Select the text and copy it yourself.",
    switchTime: (seconds: string) => `Last engine switch took ${seconds} s`,
    // Session creation details for the startup experiment (URL flag).
    graphOptLine: (level: string, seconds: string) => `Session optimization: ${level}, created in ${seconds} s`,
  },

  sections: {
    whereHeading: "Where your words go",
    whereBody:
      "Most translators send what you type to a server and send the answer back. This one does the work on your device, so there's nowhere for your words to go.",
    diagram: {
      you: "You",
      servers: "A company's servers",
      device: "Your device",
      mostTranslators: "Most translators",
      thisOne: "This one",
      mostTranslatorsAlt: "Most translators: what you type goes to a company's servers and the answer comes back to you.",
      thisOneAlt: "This one: the work happens on your own device and comes straight back to you.",
    },
    checkHeading: "Check for yourself",
    checkLead: "A live list of every request this page has made since it opened.",
    checkTranslations: "Translations this visit",
    checkWhileTranslating: "Requests made while translating",
    checkOwnFiles: "This app's own files",
    checkModelFiles: "Translation model files",
    checkOther: "Anything else",
    checkOtherEmpty: "Nothing here so far.",
    checkRequests: (count: number) => (count === 1 ? "1 request" : `${count} requests`),
    checkSizeUnknown: "—",
    checkDevtools: "Want to check without taking our word for it? Open your browser's developer tools and look at the Network tab.",
    checkOffline: "Turn off your wifi and translate something. It still works.",
    languagesHeading: "Every language, in its own script",
    languagesLead: `${LANGUAGE_COUNT} languages. Pick one to translate into it.`,
    expectHeading: "What to expect",
    expectItems: [
      `The first set up is a large download, about ${MODEL_SIZE} for the full model. Popular pairs, like English to French, use a much smaller one. It happens once.`,
      "Older phones and computers can be slow, and some may run out of memory.",
      "Quality is good for everyday text but varies by language. It won't match the biggest cloud services on subtle meaning.",
      "Listening depends on the voices your device already has.",
    ] as string[],
    questionsHeading: "Questions",
    questions: [
      {
        q: "Which models does it use?",
        a: "Popular pairs, like English to French, use small Opus-MT models from Helsinki NLP, released under Apache-2.0 or CC BY 4.0 depending on the pair. Portuguese shares one small multi language Opus-MT model, about 115 MB. The Indian languages (Hindi, Bengali, Tamil, Urdu and nine more, both directions with English) use IndicTrans2 from AI4Bharat, MIT licensed, as community int8 exports, about 250 to 300 MB per direction. Every other pair uses NLLB-200 from Meta, which is released under a non commercial licence, CC BY-NC 4.0. The exact model for the pair you're using, and its licence, is in Details.",
      },
      {
        q: "Does it work offline?",
        a: "Yes, once setup has finished. The model is saved in your browser.",
      },
      {
        q: "Where does the model come from?",
        a: "It's downloaded once from Hugging Face. They can see that a download happened, but never anything you type.",
      },
      {
        q: "What does it store on my device?",
        a: "The models for the pairs you use, your settings, and your history if you keep it on. Nothing else.",
      },
      {
        q: "How do I remove it?",
        a: "Open Settings and choose Erase everything on this device.",
      },
      {
        q: "Why is the first download so big?",
        a: "The full model holds what it knows about many languages, and it runs on your device instead of a server. That's the trade for keeping your words private.",
      },
    ] as { q: string; a: string }[],
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
    // Faster models for popular pairs.
    fastModels: "Use faster models when available",
    fastModelsHint: "Some language pairs have a smaller model that translates much faster. Other pairs use the full model.",
    // Experimental device setting.
    webgpu: "Try the faster graphics device (experimental)",
    webgpuHint: "Uses your device's graphics processor where the browser allows it, and falls back if it doesn't work.",
    onThisDevice: "On this device",
    savedModels: "Saved models",
    savedModelsEmpty: "None yet.",
    // The per language "use the full model" choices, each with a Remove button.
    fullModelChoices: "Always use the full model",
    fullModelChoicesEmpty: "None. The choice appears under translations from approximate models.",
    removedChoice: "Removed. That pair uses the fast model again.",
    savedModelSize: (mb: string) => `About ${mb} MB`,
    removeModel: "Remove",
    removeModelAria: (name: string) => `Remove ${name}`,
    removedNote: "Removed. It will download again if you pick that pair.",
    storageUsed: "Storage used",
    storageLine: (used: string, quota: string) => `${used} of ${quota} used`,
    historyLabel: "History",
    historyCount: (count: number) => (count === 1 ? "1 saved translation" : `${count} saved translations`),
    erase: "Erase everything on this device",
    eraseTitle: "Erase everything on this device?",
    eraseBody: "This removes your history, settings and the downloaded models. You'll need to set up again to translate.",
    eraseConfirm: "Erase everything",
    eraseCancel: "Keep it",
    howItWorks: "How it works",
    install: "Install",
    installLabel: "Install this app on your device",
    installHint: "Adds it to your home screen or desktop. It keeps working offline.",
  },

  offline: {
    offline: "You're offline",
  },
} as const;

export type Copy = typeof copy;
