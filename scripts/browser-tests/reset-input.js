(() => {
  const textarea = document.getElementById("source-input");
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
  nativeSetter.call(textarea, "");
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  return "cleared";
})()
