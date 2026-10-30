/* One speaking engine and one active utterance. Recorded student takes are separate. */
(function (global) {
  'use strict';
  let active = null, generation = 0;
  function cancelEngine() { try { global.speechSynthesis?.cancel(); } catch (_) {} }
  function stop(reason = 'cancelled') {
    ++generation;
    const previous = active; active = null;
    if (previous) previous.cancel(reason);
    cancelEngine();
  }
  function play(options = {}) {
    stop();
    const version = generation;
    return new Promise(resolve => {
      let settled = false, timer = null, utterance = null;
      const current = () => !settled && version === generation && active === job;
      const finish = (completed, reason) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (utterance) utterance.onstart = utterance.onend = utterance.onerror = null;
        if (active === job) {
          active = null;
          if (!completed) cancelEngine();
        }
        resolve({ completed, reason });
      };
      const job = { cancel: reason => finish(false, reason || 'cancelled') };
      active = job;
      if (options.muted) { finish(false, 'muted'); return; }
      const text = String(options.text || '');
      if (!text.trim()) { finish(false, 'empty'); return; }
      if (!global.speechSynthesis || !global.SpeechSynthesisUtterance) { finish(false, 'unsupported'); return; }
      // A short gap lets the browser stop its old voice before starting the next.
      timer = setTimeout(() => {
        if (!current()) return;
        try {
          const u = utterance = new global.SpeechSynthesisUtterance(text);
          u.lang = options.voice?.lang || 'ko-KR';
          if (options.voice) u.voice = options.voice;
          u.rate = options.rate || .88; u.pitch = options.pitch || 1.1; u.volume = options.volume ?? 1;
          u.onstart = () => {
            if (!current()) return;
            clearTimeout(timer);
            timer = setTimeout(() => { if (current()) finish(false, 'speech-timeout'); }, Math.max(30000, text.length * 700 / u.rate + 12000));
          };
          u.onend = () => { if (current()) finish(true, 'ended'); };
          u.onerror = () => { if (current()) finish(false, 'speech-error'); };
          // Never switch voices after an error: the unfinished utterance may still be pending.
          timer = setTimeout(() => { if (current()) finish(false, 'speech-start-timeout'); }, 6000);
          global.speechSynthesis.resume(); global.speechSynthesis.speak(u);
        } catch (_) { finish(false, 'speech-error'); }
      }, 180);
    });
  }
  global.ListenGuard = Object.freeze({ play, stop });
})(globalThis);
