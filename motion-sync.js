/* Position, bounce and footstep sound share the same visible animation clock. */
(function (global) {
  'use strict';
  const active = new Set();
  function cancelAll() { for (const job of [...active]) job.cancel(); }
  function move({ element, kind = 'enter-right', alive = () => true, paused = () => false,
    reduced = () => false, stepSound = () => null, viewportWidth = () => global.innerWidth || 1200 }) {
    if (!element?.style) return Promise.resolve({ completed: false });
    const exit = kind === 'exit-right', left = kind === 'enter-left';
    const duration = exit ? 1200 : left ? 1000 : 1300, steps = exit ? 3 : left ? 3 : 4;
    const width = viewportWidth();
    const rect = element.getBoundingClientRect?.() || { left: width * .65, right: width * .85 };
    const offRight = Math.max(40, width - rect.left + 16), offLeft = -Math.max(40, rect.right + 16);
    const start = exit ? 0 : left ? offLeft : offRight, end = exit ? offRight : 0;
    return new Promise(resolve => {
      let frame = null, last = null, elapsed = 0, landed = 0, sound = null, done = false;
      const silence = () => { if (typeof sound === 'function') { try { sound(); } catch (_) {} } sound = null; };
      const position = progress => {
        const x = start + (end - start) * progress;
        const fraction = progress * steps - Math.floor(progress * steps);
        const y = progress >= 1 ? 0 : -6 * Math.sin(Math.PI * fraction);
        element.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}%)`;
      };
      const finish = completed => {
        if (done) return; done = true;
        if (frame !== null) global.cancelAnimationFrame(frame);
        silence(); active.delete(job);
        if (completed) { position(1); if (!exit) element.style.transform = ''; }
        resolve({ completed });
      };
      const job = { cancel: () => finish(false) }; active.add(job);
      if (!alive() || element.isConnected === false) { finish(false); return; }
      if (reduced()) { finish(true); return; }
      position(0);
      function tick(now) {
        if (done) return;
        if (!alive() || element.isConnected === false) { finish(false); return; }
        if (reduced()) { finish(true); return; }
        if (paused()) {
          silence(); last = now; frame = global.requestAnimationFrame(tick); return;
        }
        const delta = last === null ? 0 : Math.min(80, Math.max(0, now - last)); last = now;
        elapsed = Math.min(duration, elapsed + delta);
        const progress = elapsed / duration;
        position(progress);
        const contacts = Math.min(steps, Math.floor(progress * steps + 1e-7));
        if (contacts > landed) {
          landed = contacts; silence();
          // Never schedule future sounds or play a burst for frames that were missed.
          const x = start + (end - start) * progress;
          if (rect.right + x > 0 && rect.left + x < width) sound = stepSound();
        }
        if (progress >= 1) {
          // Allow this final landing to ring naturally; no future steps remain.
          sound = null; finish(true); return;
        }
        frame = global.requestAnimationFrame(tick);
      }
      frame = global.requestAnimationFrame(tick);
    });
  }
  global.MotionSync = Object.freeze({ move, cancelAll });
})(globalThis);
