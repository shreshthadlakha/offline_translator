(() => {
  window.__test = { finalStopAt: null, doneAt: null, done: false, firstOutAt: null, timeout: false };
  const textarea = document.getElementById("source-input");
  const out = document.querySelector("section[aria-label=Translation]");
  const text = "Thanks for the message. I will be there around noon. Let me know if that works for you.";
  const frag = "Let me know if that works for you";
  const pauseAfter = text.indexOf(frag) + frag.length;
  textarea.focus();
  let typed = 0;
  function typeNext() {
    if (typed >= text.length) { window.__test.typingDone = performance.now(); return; }
    const ch = text[typed];
    const ok = document.execCommand("insertText", false, ch);
    if (!ok) { window.__test.insertFailed = true; }
    if (ch === "." && typed === text.length - 1) { window.__test.finalStopAt = performance.now(); }
    typed = typed + 1;
    let delay = 70 + Math.random() * 40;
    if (ch === " ") { delay += 40; }
    if (ch === ".") { delay += 150; }
    if (typed === pauseAfter) { delay = 700; }
    setTimeout(typeNext, delay);
  }
  typeNext();
  const timer = setInterval(() => {
    const t = (out && out.textContent) || "";
    if (!window.__test.firstOutAt && t.includes("fake:")) { window.__test.firstOutAt = performance.now(); }
    if (window.__test.finalStopAt && !window.__test.done && t.includes("fake: Let me know if that works for you.")) {
      window.__test.doneAt = performance.now();
      window.__test.done = true;
      clearInterval(timer);
    }
  }, 30);
  setTimeout(() => { if (!window.__test.done) { window.__test.timeout = true; clearInterval(timer); } }, 90000);
  return "typing started";
})()
