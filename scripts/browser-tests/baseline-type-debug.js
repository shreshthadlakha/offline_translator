(() => {
  window.__test = { finalStopAt: null, doneAt: null, done: false, firstOutAt: null, timeout: false };
  window.__dbg = [];
  const textarea = document.getElementById("source-input");
  textarea.dataset.tag = "captured";
  const out = document.querySelector("section[aria-label=Translation]");
  const text = "Thanks for the message. I will be there around noon. Let me know if that works for you.";
  const frag = "Let me know if that works for you";
  const pauseAfter = text.indexOf(frag) + frag.length;
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
  let typed = 0;
  function log(note) {
    const live = document.getElementById("source-input");
    window.__dbg.push({
      at: Math.round(performance.now()),
      i: typed,
      note,
      liveTag: live ? live.dataset.tag || "live-untagged" : "gone",
      liveLen: live ? live.value.length : -1,
      capturedIsLive: live === textarea,
      capturedLen: textarea.value.length,
    });
  }
  function typeNext() {
    if (typed >= text.length) { window.__test.typingDone = performance.now(); log("done"); return; }
    const ch = text[typed];
    try {
      nativeSetter.call(textarea, textarea.value + ch);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    } catch (err) {
      log("error: " + String(err));
      return;
    }
    if (ch === "." && typed === text.length - 1) { window.__test.finalStopAt = performance.now(); }
    typed = typed + 1;
    if (typed % 10 === 0 || typed === pauseAfter || typed === text.length) log("tick");
    let delay = 70 + Math.random() * 40;
    if (ch === " ") { delay += 40; }
    if (ch === ".") { delay += 150; }
    if (typed === pauseAfter) { delay = 700; log("pause-start"); }
    setTimeout(typeNext, delay);
  }
  log("start");
  typeNext();
  const timer = setInterval(() => {
    const t = (out && out.textContent) || "";
    if (!window.__test.firstOutAt && t.includes("fake:")) { window.__test.firstOutAt = performance.now(); }
    if (window.__test.finalStopAt && !window.__test.done && t.includes("fake: Let me know if that works for you.")) {
      window.__test.doneAt = performance.now();
      window.__test.done = true;
      log("done-detected");
      clearInterval(timer);
    }
  }, 30);
  setTimeout(() => { if (!window.__test.done) { window.__test.timeout = true; log("timeout"); clearInterval(timer); } }, 45000);
  return "typing started (debug)";
})()
