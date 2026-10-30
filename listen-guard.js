(function (global) {
  'use strict';
  let active = null;
  function stop() { if (active) active.cancel(); }
  function play(options = {}) {
    stop();
    return new Promise(resolve => {
      let settled = false, audio = null, utterance = null, timer = null, attempt = 0;
      const clear = () => { clearTimeout(timer); timer = null; };
      const finish = (completed, reason) => {
        if (settled) return;
        settled = true; clear();
        if (audio) { audio.onended = audio.onerror = null; try { audio.pause(); } catch (_) {} }
        if (utterance) utterance.onend = utterance.onerror = utterance.onstart = null;
        if (active === job) active = null;
        resolve({ completed, reason });
      };
      const job = { cancel() {
        finish(false, 'cancelled');
        try { global.speechSynthesis?.cancel(); } catch (_) {}
      }};
      active = job;
      if (options.muted) { finish(false, 'muted'); return; }
      const text = String(options.text || '');
      if (!text.trim()) { finish(false, 'empty'); return; }
      function tts(withVoice = true) {
        if (settled) return;
        clear();
        if (!global.speechSynthesis || !global.SpeechSynthesisUtterance) { finish(false, 'unsupported'); return; }
        const version = ++attempt;
        let started = false;
        const fallback = () => {
          if (settled || version !== attempt) return;
          if (withVoice && options.voice) {
            attempt++; clear();
            if (utterance) utterance.onend = utterance.onerror = utterance.onstart = null;
            try { global.speechSynthesis.cancel(); } catch (_) {}
            timer = setTimeout(() => tts(false), 300);
          } else finish(false, 'speech-error');
        };
        try {
          utterance = new global.SpeechSynthesisUtterance(text);
          const u = utterance;
          u.lang = options.voice?.lang || 'ko-KR';
          if (withVoice && options.voice) u.voice = options.voice;
          u.rate = options.rate || .88; u.pitch = options.pitch || 1.1; u.volume = options.volume ?? 1;
          u.onstart = () => {
            if (settled || version !== attempt) return;
            started = true; clear();
            // A watchdog may report a failure. It must never count as completed listening.
            timer = setTimeout(() => {
              finish(false, 'speech-timeout');
              try { global.speechSynthesis.cancel(); } catch (_) {}
            }, Math.max(30000, text.length * 700 / u.rate + 12000));
          };
          u.onend = () => { if (!settled && version === attempt) finish(true, 'ended'); };
          u.onerror = () => { if (version === attempt) fallback(); };
          global.speechSynthesis.resume(); global.speechSynthesis.speak(u);
          if (!started) timer = setTimeout(fallback, 6000);
        } catch (_) { fallback(); }
      }
      const paths = [...(options.paths || [])];
      function nextFile() {
        if (settled) return;
        clear();
        if (audio) { audio.onended = audio.onerror = null; try { audio.pause(); } catch (_) {} }
        const src = paths.shift();
        if (!src || typeof global.Audio !== 'function') { tts(); return; }
        let current;
        try { current = audio = new global.Audio(encodeURI(src)); } catch (_) { nextFile(); return; }
        const failed = () => { if (!settled && audio === current) nextFile(); };
        current.onerror = failed;
        current.onended = () => { if (!settled && audio === current) finish(true, 'ended'); };
        timer = setTimeout(failed, 5000);
        try {
          Promise.resolve(current.play()).then(() => {
            if (settled || audio !== current) { try { current.pause(); } catch (_) {} return; }
            clear();
            const duration = Number.isFinite(current.duration) ? current.duration * 1000 : text.length * 700;
            timer = setTimeout(failed, Math.max(30000, duration + 12000));
          }, failed);
        } catch (_) { failed(); }
      }
      nextFile();
    });
  }
  global.ListenGuard = Object.freeze({ play, stop });
})(globalThis);
