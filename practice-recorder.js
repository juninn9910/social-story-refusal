/* Local-only voice practice. A saved recording is evidence to review, not speech recognition. */
(function () {
  'use strict';
  const DB = 'ssr.practice.audio', STORE = 'takes', MIN_MS = 1500, MAX_MS = 30000;
  const memory = new Map(), active = new Set();
  const trim = (value, max = 200) => String(value ?? '').trim().slice(0, max);
  const newId = () => globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  const stopTracks = stream => { stream?.getTracks?.().forEach(track => { try { track.stop(); } catch (_) {} }); };
  const ext = mime => /mp4|m4a/.test(mime || '') ? 'm4a' : /ogg/.test(mime || '') ? 'ogg' : 'webm';
  const filename = take => ('따라읽기_' + take.student + '_' + take.stage + '단계_' + take.date.slice(0, 19).replace(/[:T]/g, '-') + '.' + ext(take.mime)).replace(/[\\/:*?"<>|]/g, '_');
  function download(take) {
    const url = URL.createObjectURL(take.blob), link = document.createElement('a');
    link.href = url; link.download = filename(take); document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function database() {
    return new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) { reject(new Error('local-storage-unavailable')); return; }
      let done = false, request;
      const finish = (error, db) => { if (done) { db?.close(); return; } done = true; clearTimeout(timer); error ? reject(error) : resolve(db); };
      const timer = setTimeout(() => finish(new Error('local-storage-timeout')), 4000);
      try {
        request = indexedDB.open(DB, 1);
        request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' }); };
        request.onsuccess = () => finish(null, request.result);
        request.onerror = () => finish(request.error || new Error('local-storage-failed'));
        request.onblocked = () => finish(new Error('local-storage-blocked'));
      } catch (error) { finish(error); }
    });
  }
  async function storageAction(mode, action) {
    const db = await database();
    return new Promise((resolve, reject) => {
      let result, transaction;
      try {
        transaction = db.transaction(STORE, mode);
        const request = action(transaction.objectStore(STORE));
        if (request) request.onsuccess = () => { result = request.result; };
        transaction.oncomplete = () => { db.close(); resolve(result); };
        transaction.onerror = transaction.onabort = () => { db.close(); reject(transaction.error || new Error('local-storage-failed')); };
      } catch (error) { db.close(); reject(error); }
    });
  }
  const put = take => storageAction('readwrite', store => store.put(take));
  const all = () => storageAction('readonly', store => store.getAll());
  const remove = id => storageAction('readwrite', store => store.delete(id));
  const errorText = error => ({
    NotAllowedError: '마이크 사용을 허용해 주세요. 주소창의 마이크 권한을 확인한 뒤 다시 녹음을 눌러 주세요.',
    PermissionDeniedError: '마이크 사용을 허용한 뒤 다시 녹음을 눌러 주세요.',
    NotFoundError: '연결된 마이크를 찾지 못했어요. 마이크를 연결해 주세요.',
    DevicesNotFoundError: '연결된 마이크를 찾지 못했어요.',
    NotReadableError: '마이크를 다른 프로그램이 사용 중일 수 있어요. 확인한 뒤 다시 시도해 주세요.',
    TrackStartError: '마이크를 시작하지 못했어요. 연결 상태를 확인해 주세요.',
    SecurityError: '이 주소에서는 마이크를 사용할 수 없어요. Chrome 또는 Edge의 HTTPS·로컬 주소에서 열어 주세요.',
    NotSupportedError: '이 브라우저는 음성 녹음을 지원하지 않아요. 최신 Chrome 또는 Edge로 열어 주세요.'
  }[error?.name] || '녹음을 시작하지 못했어요. 마이크와 브라우저 권한을 확인한 뒤 다시 시도해 주세요.');

  function mount({ container, phrase = '', student = '', stage = 0, onReady = () => {}, onBusy = () => {}, onStart = () => {}, onRecording = () => {} }) {
    if (!container?.appendChild) throw new TypeError('녹음 영역이 필요합니다.');
    const root = document.createElement('section'); root.className = 'practice-recorder'; root.setAttribute('aria-label', '따라 읽기 녹음과 확인');
    root.innerHTML = `<h3>내 목소리로 해 봐요</h3>
      <p class="pr-instruction">① 녹음하기 → ② 끝까지 듣기 → ③ 선생님 확인</p>
      <div class="pr-actions"><button type="button" data-pr="record">● 녹음하기</button><button type="button" data-pr="stop" disabled>■ 녹음 끝내기</button><button type="button" data-pr="listen" disabled>▶ 내 녹음 듣기</button><button type="button" data-pr="download" disabled>녹음 내려받기</button></div>
      <div class="pr-progress"><span class="pr-time">0초 / 최대 30초</span><span class="pr-step">녹음 전</span></div>
      <p class="pr-status" role="status" aria-live="polite">녹음을 마치고 다시 들은 뒤 선생님이 확인하면 마칠 수 있어요.</p>
      <label class="pr-review"><input type="checkbox" disabled><span>선생님 확인: 녹음을 듣고 학생의 실제 표현을 확인했어요.</span></label>
      <p class="pr-privacy">녹음은 이 브라우저에만 보관해요. 앱이 발음이나 이해를 자동 채점하지 않아요.</p>`;
    container.appendChild(root);
    const get = name => root.querySelector(`[data-pr="${name}"]`);
    const recordButton = get('record'), stopButton = get('stop'), listenButton = get('listen'), downloadButton = get('download');
    const check = root.querySelector('input'), status = root.querySelector('.pr-status'), timerText = root.querySelector('.pr-time'), step = root.querySelector('.pr-step');
    let state = 'idle', destroyed = false, enabled = true, generation = 0, stream = null, recorder = null, take = null, audio = null, url = '', listened = false;
    let tick = null, maximum = null, stopWatch = null, started = 0, recordedMs = null, commitPromise = null, lastReady = null, lastBusy = null, lastRecording = null;
    let playbackStart = 0, previousTime = 0, previousWall = 0, playbackValid = false;
    const disposers = [];
    const listen = (element, name, fn) => { element.addEventListener(name, fn); disposers.push(() => element.removeEventListener(name, fn)); };
    const isBusy = () => ['requesting', 'recording', 'stopping', 'listening', 'saving'].includes(state);
    const isRecording = () => ['requesting', 'recording', 'stopping'].includes(state);
    const canFinish = () => !destroyed && !!take?.blob?.size && listened && check.checked && !isBusy();
    const message = (text, bad = false) => { status.textContent = text; status.classList.toggle('pr-error', bad); };
    const update = () => {
      const busy = isBusy(), ready = canFinish();
      recordButton.disabled = !enabled || busy || destroyed;
      stopButton.disabled = !['requesting', 'recording'].includes(state) || destroyed;
      stopButton.textContent = state === 'requesting' ? '요청 취소' : '■ 녹음 끝내기';
      listenButton.disabled = !enabled || !take || busy || destroyed;
      downloadButton.disabled = !take || busy || destroyed;
      check.disabled = !listened || !take || busy || destroyed;
      recordButton.textContent = take ? '● 다시 녹음하기' : '● 녹음하기';
      root.classList.toggle('pr-recording', state === 'recording');
      root.classList.toggle('pr-ready', ready);
      step.textContent = state === 'requesting' ? '마이크 허용 기다리는 중' : state === 'recording' ? '녹음 중' : state === 'stopping' ? '녹음 정리 중' : state === 'listening' ? '내 녹음 듣는 중' : state === 'saving' ? '확인한 녹음 보관 중' : ready ? '확인 완료' : listened ? '선생님 확인을 기다려요' : take ? '녹음을 끝까지 들어 주세요' : '녹음 전';
      if (lastReady !== ready) { lastReady = ready; onReady(ready); }
      if (lastBusy !== busy) { lastBusy = busy; onBusy(busy); }
      const recording = !destroyed && isRecording();
      if (lastRecording !== recording) { lastRecording = recording; onRecording(recording); }
    };
    function clearTimers() { clearInterval(tick); clearTimeout(maximum); clearTimeout(stopWatch); tick = maximum = stopWatch = null; }
    function clearPlayback() {
      if (audio) { audio.onended = audio.onerror = audio.ontimeupdate = audio.onseeking = audio.onratechange = audio.onvolumechange = audio.onpause = null; try { audio.pause(); audio.removeAttribute?.('src'); audio.load?.(); } catch (_) {} audio = null; }
      if (url) { URL.revokeObjectURL(url); url = ''; }
    }
    function invalidate() { listened = false; check.checked = false; take = null; commitPromise = null; clearPlayback(); timerText.textContent = '0초 / 최대 30초'; }
    function cancelRecorder() {
      const current = recorder; recorder = null;
      if (current) { current.ondataavailable = current.onstop = current.onerror = null; try { if (current.state !== 'inactive') current.stop(); } catch (_) {} }
      stopTracks(stream); stream = null; clearTimers();
    }
    async function start() {
      if (destroyed || !enabled || isBusy()) return;
      generation++; const token = generation;
      invalidate(); recordedMs = null; state = 'requesting'; message('마이크 사용을 허용해 주세요. 허용한 뒤 녹음이 시작돼요.'); update();
      try { onStart(); } catch (_) {}
      if (!navigator.mediaDevices?.getUserMedia || typeof globalThis.MediaRecorder !== 'function') {
        state = 'error'; message(errorText({ name: 'NotSupportedError' }), true); update(); return;
      }
      let acquired;
      try {
        acquired = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
        if (destroyed || token !== generation) { stopTracks(acquired); return; }
        stream = acquired;
        const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported?.(type));
        const current = new MediaRecorder(stream, mimeType ? { mimeType } : undefined); recorder = current;
        const chunks = []; let finalized = false;
        current.ondataavailable = event => { if (!finalized && token === generation && !destroyed && event.data?.size) chunks.push(event.data); };
        current.onerror = event => {
          if (finalized || token !== generation || destroyed) return;
          generation++; cancelRecorder(); invalidate(); state = 'error'; message('녹음 중 문제가 생겼어요. 다시 녹음해 주세요.', true); update();
        };
        current.onstop = () => {
          if (finalized || token !== generation || destroyed) return;
          finalized = true;
          const elapsed = recordedMs ?? Math.max(0, Date.now() - started);
          current.ondataavailable = current.onstop = current.onerror = null;
          clearTimers(); stopTracks(stream); stream = null; recorder = null;
          const blob = new Blob(chunks, { type: current.mimeType || chunks[0]?.type || 'audio/webm' });
          if (elapsed < MIN_MS || !blob.size) {
            state = 'idle'; message(!blob.size ? '녹음된 소리를 저장하지 못했어요. 다시 녹음해 주세요.' : '녹음이 너무 짧아요. 녹음 버튼을 누른 뒤 표현하고 끝내 주세요.', true); update(); return;
          }
          take = { id: newId(), date: new Date().toISOString(), student: trim(student, 100) || '(별칭 없음)', stage: Number(stage) || 0, phrase: trim(phrase, 500), duration: elapsed / 1000, mime: blob.type, bytes: blob.size, blob, reviewed: false };
          url = URL.createObjectURL(blob); audio = new Audio(url); audio.preload = 'metadata';
          state = 'recorded'; timerText.textContent = take.duration.toFixed(1) + '초 녹음';
          message('녹음됐어요. ‘내 녹음 듣기’를 눌러 끝까지 들어 주세요.'); update();
        };
        current.start(250); started = Date.now(); state = 'recording'; message('녹음 중이에요. 표현한 뒤 ‘녹음 끝내기’를 눌러 주세요.'); update();
        tick = setInterval(() => { if (!destroyed && state === 'recording') timerText.textContent = Math.floor((Date.now() - started) / 1000) + '초 / 최대 30초'; }, 200);
        maximum = setTimeout(() => { if (state === 'recording') stop(); }, MAX_MS);
      } catch (error) {
        stopTracks(acquired); if (destroyed || token !== generation) return;
        cancelRecorder(); state = 'error'; message(errorText(error), true); update();
      }
    }
    function stop() {
      if (destroyed) return;
      if (state === 'requesting') { generation++; state = 'idle'; message('마이크 요청을 취소했어요. 다시 녹음을 누를 수 있어요.'); update(); return; }
      if (state !== 'recording' || !recorder) return;
      recordedMs = Math.max(0, Date.now() - started);
      state = 'stopping'; clearInterval(tick); clearTimeout(maximum); update();
      try {
        recorder.stop(); stopTracks(stream);
        stopWatch = setTimeout(() => {
          if (state !== 'stopping' || destroyed) return;
          generation++; cancelRecorder(); invalidate(); state = 'error'; message('녹음을 정리하지 못했어요. 다시 녹음해 주세요.', true); update();
        }, 4000);
      } catch (error) { generation++; cancelRecorder(); invalidate(); state = 'error'; message('녹음을 끝내지 못했어요. 다시 녹음해 주세요.', true); update(); }
    }
    async function replay() {
      if (!enabled || destroyed || !take || !audio || isBusy()) return;
      const playing = audio, token = generation;
      listened = false; check.checked = false; state = 'listening'; playbackValid = true;
      playbackStart = previousWall = Date.now(); previousTime = 0;
      message('내 녹음을 듣고 있어요. 끝까지 들은 뒤 선생님이 확인해 주세요.'); update();
      playing.currentTime = 0; playing.playbackRate = 1; playing.muted = false; playing.volume = 1;
      playing.ontimeupdate = () => {
        const now = Date.now(), mediaTime = playing.currentTime || 0;
        if (mediaTime + .2 < previousTime || mediaTime - previousTime > (now - previousWall) / 1000 + .7) playbackValid = false;
        previousTime = mediaTime; previousWall = now;
      };
      playing.onratechange = () => { if (playing.playbackRate !== 1) playbackValid = false; };
      playing.onvolumechange = () => { if (playing.muted || playing.volume === 0) playbackValid = false; };
      playing.onpause = () => {
        if (destroyed || generation !== token || audio !== playing || state !== 'listening' || playing.ended) return;
        playbackValid = false; listened = false; check.checked = false; state = 'recorded';
        message('녹음을 중간에 멈췄어요. 처음부터 끝까지 다시 들어 주세요.'); update();
      };
      playing.onended = () => {
        if (destroyed || generation !== token || audio !== playing || state !== 'listening') return;
        const expected = Number.isFinite(playing.duration) && playing.duration > 0 ? playing.duration : take.duration;
        listened = playbackValid && !playing.muted && playing.volume !== 0 && (Date.now() - playbackStart) / 1000 >= Math.max(.5, expected - .6);
        state = 'recorded';
        message(listened ? '끝까지 들었어요. 선생님이 실제 표현을 확인해 주세요.' : '녹음을 처음부터 끝까지 다시 들어 주세요.', !listened); update();
      };
      playing.onerror = () => { if (destroyed || generation !== token) return; listened = false; state = 'recorded'; message('녹음을 재생하지 못했어요. 다시 녹음해 주세요.', true); update(); };
      try { await playing.play(); }
      catch (error) { if (destroyed || generation !== token) return; listened = false; state = 'recorded'; message('재생을 시작하지 못했어요. ‘내 녹음 듣기’를 다시 눌러 주세요.', true); update(); }
    }
    async function commit() {
      if (commitPromise && state === 'saving' && !destroyed) return commitPromise;
      if (!canFinish()) { message('녹음 → 끝까지 듣기 → 선생님 확인을 모두 마쳐 주세요.', true); return null; }
      if (commitPromise) return commitPromise;
      const savedTake = { ...take, reviewed: true }, token = generation;
      state = 'saving'; update();
      commitPromise = (async () => {
        let storage = 'indexeddb';
        try { await put(savedTake); }
        catch (_) { storage = 'memory'; memory.set(savedTake.id, savedTake); }
        const { blob, ...metadata } = savedTake;
        if (!destroyed && token === generation) { state = 'recorded'; message(storage === 'indexeddb' ? '교사가 확인한 녹음을 이 브라우저에 보관했어요.' : '브라우저에 계속 보관하지 못했어요. 녹음 보관함에서 내려받아 주세요. 현재 창을 닫으면 사라질 수 있어요.', storage !== 'indexeddb'); update(); }
        return { ...metadata, created: metadata.date, storage };
      })();
      return commitPromise;
    }
    function destroy() {
      if (destroyed) return; destroyed = true; generation++;
      cancelRecorder(); clearPlayback(); state = 'destroyed'; disposers.forEach(fn => fn());
      root.remove(); active.delete(api); update();
    }
    listen(recordButton, 'click', start); listen(stopButton, 'click', stop); listen(listenButton, 'click', replay);
    listen(downloadButton, 'click', () => { if (take && !isBusy()) download(take); });
    listen(check, 'change', () => { if (!listened || !take || isBusy()) check.checked = false; update(); });
    const api = {
      canFinish, isBusy, isRecording, commit, destroy,
      setEnabled(value) { enabled = !!value; update(); },
      setBlocked(value) {
        enabled = !value;
        if (value && isRecording()) { generation++; cancelRecorder(); invalidate(); state = 'idle'; message('안내 음성을 모두 들은 뒤 녹음해 주세요.'); }
        else if (value && state === 'listening') { audio?.pause(); playbackValid = false; listened = false; check.checked = false; state = 'recorded'; }
        update();
      }
    };
    active.add(api); update(); return api;
  }

  async function openLibrary(student = '') {
    const existing = document.querySelector('.pr-library'); if (existing) { existing.querySelector('button')?.focus(); return; }
    const focus = document.activeElement, shell = document.createElement('div'); shell.className = 'pr-library';
    shell.innerHTML = '<section class="pr-library-panel" role="dialog" aria-modal="true" aria-label="따라 읽기 녹음 보관함"><header><h2>따라 읽기 녹음 보관함</h2><button type="button" class="pr-close">닫기</button></header><p class="pr-library-note" role="status">녹음을 불러오는 중…</p><div class="pr-library-list"></div><p>이 브라우저에 저장한 녹음입니다. 다른 기기나 구글 시트로 자동 전송하지 않습니다.</p></section>';
    document.body.appendChild(shell); const list = shell.querySelector('.pr-library-list'), note = shell.querySelector('.pr-library-note');
    const urls = [], players = []; let closed = false;
    const blocked = [...document.body.children].filter(node => node !== shell && !['SCRIPT','STYLE'].includes(node.tagName)).map(node => [node, node.inert]); blocked.forEach(([node]) => { node.inert = true; });
    function close() { if (closed) return; closed = true; players.forEach(player => { player.pause(); player.removeAttribute('src'); player.load(); }); urls.forEach(URL.revokeObjectURL); shell.remove(); blocked.forEach(([node, previous]) => { node.inert = previous; }); if (focus?.isConnected) focus.focus(); }
    shell.querySelector('.pr-close').onclick = close;
    shell.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') { const items = [...shell.querySelectorAll('button,audio')].filter(node => !node.disabled), index = items.indexOf(document.activeElement); event.preventDefault(); items[(index + (event.shiftKey ? -1 : 1) + items.length) % items.length]?.focus(); }
    });
    shell.querySelector('.pr-close').focus();
    let records = [], durable = true;
    try { records = await all(); } catch (_) { durable = false; }
    if (closed) return;
    const byId = new Map(records.map(take => [take.id, take])); memory.forEach(take => byId.set(take.id, take));
    const shown = [...byId.values()].filter(take => !student || take.student === student).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    note.textContent = shown.length ? (student ? student + ' · ' : '') + shown.length + '개 녹음' : durable ? '이 별칭으로 보관한 녹음이 없어요.' : '저장 공간을 읽지 못했어요. 이 창에서 임시 보관한 녹음만 볼 수 있어요.';
    for (const take of shown) {
      const card = document.createElement('article'); card.className = 'pr-library-card';
      const title = document.createElement('h3'); title.textContent = `${take.student} · ${take.stage}단계 · ${new Date(take.date).toLocaleString('ko-KR')}`; card.appendChild(title);
      const phrase = document.createElement('p'); phrase.textContent = take.phrase; card.appendChild(phrase);
      const audio = document.createElement('audio'), url = URL.createObjectURL(take.blob); urls.push(url); players.push(audio); audio.controls = true; audio.preload = 'metadata'; audio.src = url; audio.setAttribute('aria-label', '저장된 따라 읽기 녹음'); card.appendChild(audio);
      const buttons = document.createElement('div');
      const save = document.createElement('button'); save.type = 'button'; save.textContent = '내려받기'; save.onclick = () => download(take); buttons.appendChild(save);
      const del = document.createElement('button'); del.type = 'button'; del.textContent = '이 녹음 삭제';
      del.onclick = async () => { if (!confirm('이 기기의 이 녹음을 삭제할까요? 되돌릴 수 없어요.')) return; del.disabled = true; try { if (!memory.has(take.id)) await remove(take.id); else { try { await remove(take.id); } catch (_) {} } memory.delete(take.id); audio.pause(); card.remove(); note.textContent = '이 녹음을 삭제했어요.'; } catch (_) { del.disabled = false; note.textContent = '삭제하지 못했어요. 저장 공간을 확인해 주세요.'; } };
      buttons.appendChild(del); card.appendChild(buttons); list.appendChild(card);
    }
  }
  window.addEventListener('pagehide', () => { [...active].forEach(controller => controller.destroy()); });
  window.PracticeRecorder = Object.freeze({ mount, openLibrary });
})();
