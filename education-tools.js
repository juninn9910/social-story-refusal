/* 교사의 준비·실생활 관찰. 이 기록은 이 브라우저에만 저장합니다. */
(() => {
  'use strict';
  const KEYS = { plans: 'ssr.edu.plans', observations: 'ssr.edu.observations' };
  const SITUATIONS = ['기분이 나쁠 때', '먹기 싫은 음식이 있을 때', '어렵거나 모를 때', '쉬고 싶을 때', '내 물건을 지킬 때', '원하지 않는 접촉이 계속될 때'];
  const METHODS = { speech: '말', aac: '말 버튼·의사소통판', gesture: '몸짓·표정', mixed: '여러 방법 함께', unobserved: '관찰하지 못함' };
  const SUPPORT = { independent: '추가 도움 없이', visual: '그림·환경 단서', model: '시범을 본 뒤', verbal: '말로 안내받은 뒤', unobserved: '관찰하지 못함' };
  const OUTCOMES = { honored: '요청을 확인하고 반영함', support: '추가 지원이 필요함', unobserved: '관찰하지 못함' };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (value, max = 200) => String(value ?? '').trim().slice(0, max);
  let panel = null, lastFocus = null, appInert = false;
  let storageFailed = false;

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) { storageFailed = true; return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (_) { storageFailed = true; return false; }
  }
  function plans() {
    const value = read(KEYS.plans, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }
  function observations() {
    const value = read(KEYS.observations, []);
    return Array.isArray(value) ? value.filter(row => row && typeof row === 'object' && typeof row.name === 'string') : [];
  }
  function getPlan(name) {
    const all = plans();
    if (!Object.prototype.hasOwnProperty.call(all, name)) return null;
    const value = all[name];
    if (!value || typeof value !== 'object') return null;
    return {
      name: clamp(name, 40), place: clamp(value.place), adult: clamp(value.adult, 100), goal: clamp(value.goal, 300),
      channels: Array.isArray(value.channels) ? value.channels.filter(x => ['speech', 'aac', 'gesture'].includes(x)) : [],
      updated: clamp(value.updated, 40)
    };
  }
  function defaultName() {
    try { return clamp(typeof STATE !== 'undefined' ? STATE.setup?.name : '', 40); }
    catch (_) { return ''; }
  }
  const options = values => Object.entries(values).map(([key, value]) => `<option value="${key}">${value}</option>`).join('');
  function sayStatus(message, error = false) {
    const status = panel?.querySelector('.edu-status');
    if (status) { status.textContent = message; status.classList.toggle('edu-error', error); }
  }
  function setName(name) {
    panel.querySelectorAll('[name="name"]').forEach(input => { input.value = name; });
  }
  function loadPlan(name) {
    const plan = getPlan(name);
    const form = panel.querySelector('#edu-plan');
    form.elements.place.value = plan?.place || '';
    form.elements.adult.value = plan?.adult || '';
    form.elements.goal.value = plan?.goal || '';
    form.querySelectorAll('[name="channels"]').forEach(input => { input.checked = plan ? plan.channels.includes(input.value) : true; });
    setName(name);
    renderRecords();
    sayStatus(plan ? '이 기기에 저장된 준비 내용을 불러왔습니다.' : '새 이름입니다. 수업에 맞게 준비 내용을 적어 주세요.');
  }
  function displayDate(iso) {
    const date = new Date(iso);
    return Number.isFinite(date.getTime()) ? date.toLocaleString('ko-KR') : '날짜 확인 필요';
  }
  function renderRecords() {
    const name = clamp(panel.querySelector('#edu-observation [name="name"]').value, 40);
    const rows = observations().filter(row => row.name === name);
    const list = panel.querySelector('.edu-records');
    list.replaceChildren();
    panel.querySelector('.edu-record-count').textContent = name ? `${name} · 총 ${rows.length}건 · 최근 10건` : '이름을 입력하면 관찰 기록이 표시됩니다.';
    if (!rows.length) {
      const empty = document.createElement('p'); empty.textContent = '아직 저장된 관찰이 없습니다.'; list.append(empty); return;
    }
    rows.slice(-10).reverse().forEach(row => {
      const item = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = `${displayDate(row.date)} · ${SITUATIONS[Number(row.situation) - 1] || '상황 미확인'}`;
      const detail = document.createElement('p');
      detail.textContent = `${row.context === 'real' ? '실생활' : '동의한 연습'} · ${METHODS[row.method] || METHODS.unobserved} · ${SUPPORT[row.support] || SUPPORT.unobserved} · ${OUTCOMES[row.outcome] || OUTCOMES.unobserved}`;
      item.append(title, detail);
      if (row.note) { const note = document.createElement('p'); note.textContent = row.note; item.append(note); }
      list.append(item);
    });
  }
  function csvCell(value) {
    let text = String(value ?? '');
    if (/^[\s\uFEFF]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }
  function exportCSV() {
    const name = clamp(panel.querySelector('#edu-observation [name="name"]').value, 40);
    const rows = observations().filter(row => row.name === name);
    if (!name || !rows.length) { sayStatus('현재 이름으로 저장된 관찰이 없습니다.', true); return; }
    const body = [['관찰일시', '별칭', '상황', '맥락', '표현 방법', '도움', '요청에 대한 반응', '관찰 메모']]
      .concat(rows.map(row => [row.date, row.name, SITUATIONS[Number(row.situation) - 1] || '', row.context === 'real' ? '실생활' : '동의한 연습', METHODS[row.method] || '', SUPPORT[row.support] || '', OUTCOMES[row.outcome] || '', row.note]));
    const blob = new Blob(['\uFEFF' + body.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = '사회적상황_관찰_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    sayStatus(`${rows.length}건의 관찰을 CSV로 내려받았습니다. 학생 자료는 학교의 보관 기준에 따라 관리해 주세요.`);
  }
  function close() {
    if (!panel) return;
    const closing = panel; panel = null; closing.remove();
    const app = document.querySelector('#app');
    if (app) app.inert = appInert;
    document.removeEventListener('keydown', handleKeys, true);
    if (lastFocus?.isConnected) lastFocus.focus();
  }
  function handleKeys(event) {
    if (!panel) return;
    // 학습 화면의 전역 Enter 단축키가 교사 양식에서 작동하지 않도록 합니다.
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...panel.querySelectorAll('button,input,select,textarea,summary,a[href],[tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
  }
  function open(name = defaultName()) {
    if (panel) { panel.querySelector('.edu-close').focus(); return; }
    lastFocus = document.activeElement;
    const app = document.querySelector('#app'); appInert = !!app?.inert; if (app) app.inert = true;
    panel = document.createElement('div'); panel.className = 'edu-shade';
    panel.innerHTML = `<section class="edu-panel" role="dialog" aria-modal="true" aria-labelledby="edu-title" aria-describedby="edu-description">
      <header class="edu-header"><div><h2 id="edu-title">수업 준비·관찰</h2><p id="edu-description">아이의 표현을 이해하고, 요청에 응답하는 수업을 준비해요.</p></div><button class="edu-close" type="button">닫기</button></header>
      <p class="edu-notice">말, 몸짓, 말 버튼은 모두 의사소통입니다. 카드 선택 횟수나 ‘마치기’는 실제 발화·이해·실생활 수행의 증거가 아닙니다.</p>
      <nav class="edu-nav" aria-label="교사 도구 항목"><button type="button" data-jump="edu-preparation">수업 준비</button><button type="button" data-jump="edu-observe">관찰 기록</button><button type="button" data-jump="edu-guide">지원 방법</button></nav>
      <div class="edu-status" role="status" aria-live="polite"></div>
      <section id="edu-preparation" class="edu-section" aria-labelledby="edu-plan-title"><h3 id="edu-plan-title" tabindex="-1">1. 아이에게 맞는 수업 준비</h3>
        <form id="edu-plan">
          <label>학생 별칭 <span>(실명 대신 학급 내 별칭 권장)</span><input name="name" maxlength="40" required autocomplete="off" value="${esc(name)}"></label>
          <button class="edu-secondary" type="button" data-load-plan>이 별칭의 준비 불러오기</button>
          <div class="edu-two"><label>언제·어디서 필요한가요?<input name="place" maxlength="200" placeholder="예: 급식실에서 음식 권유를 받을 때"></label><label>도움을 요청할 어른<input name="adult" maxlength="100" placeholder="예: 담임 선생님, 급식실 선생님"></label></div>
          <fieldset><legend>아이가 편하게 쓰는 표현 방법 <span>(여러 개 선택 가능)</span></legend><div class="edu-checks"><label><input name="channels" type="checkbox" value="speech" checked> 말</label><label><input name="channels" type="checkbox" value="aac" checked> 말 버튼·의사소통판</label><label><input name="channels" type="checkbox" value="gesture" checked> 몸짓·표정</label></div></fieldset>
          <label>이번에 함께 살펴볼 행동 <span>(관찰 가능한 한 가지)</span><textarea name="goal" rows="2" maxlength="300" placeholder="예: 원하지 않을 때 편한 방법으로 의사를 표현하는지, 어른이 요청에 응답했는지 살펴본다."></textarea></label>
          <button class="edu-primary" type="submit">준비 내용 저장</button>
        </form>
        <fieldset class="edu-checklist"><legend>수업 전 확인 <span>(확인 표시는 이 창을 닫으면 초기화)</span></legend><label><input type="checkbox"> 아이가 편안한가요? 참여하지 않거나 멈춰도 괜찮다고 알렸나요?</label><label><input type="checkbox"> 실제 경험·이해 수준에 맞게 이야기 문장을 함께 확인했나요?</label><label><input type="checkbox"> 말 버튼과 쉬는 공간을 준비하고, 어른의 응답 방법을 정했나요?</label></fieldset>
        <p class="edu-small">수업 후: 아이에게 도움이 된 단서를 확인하고, 다른 사람·장소에서도 자연스럽게 표현할 기회를 마련합니다. 반복을 위해 불편한 상황을 일부러 만들지 않습니다.</p>
      </section>
      <section id="edu-observe" class="edu-section" aria-labelledby="edu-observation-title"><h3 id="edu-observation-title" tabindex="-1">2. 연습과 실생활을 구분한 관찰</h3>
        <p>아이가 실제로 보인 표현과 어른의 응답을 적습니다. 보지 못한 것은 ‘관찰하지 못함’으로 남기며, 표현 방법으로 능력의 높고 낮음을 판단하지 않습니다.</p>
        <form id="edu-observation">
          <label>학생 별칭<input name="name" maxlength="40" required autocomplete="off" value="${esc(name)}"></label>
          <div class="edu-two"><label>상황<select name="situation">${SITUATIONS.map((text, i) => `<option value="${i + 1}">${i + 1}. ${text}</option>`).join('')}</select></label><label>관찰 맥락<select name="context"><option value="practice">아이가 동의한 연습</option><option value="real">실생활의 자연스러운 기회</option></select></label></div>
          <div class="edu-two"><label>관찰한 표현 방법<select name="method"><option value="unobserved">관찰하지 못함</option>${options(Object.fromEntries(Object.entries(METHODS).filter(([key]) => key !== 'unobserved')))}</select></label><label>사용한 도움 <span>(표현 방법과 별도로 기록)</span><select name="support"><option value="unobserved">관찰하지 못함</option>${options(Object.fromEntries(Object.entries(SUPPORT).filter(([key]) => key !== 'unobserved')))}</select></label></div>
          <label>요청에 대한 주변의 응답<select name="outcome"><option value="unobserved">관찰하지 못함</option>${options(Object.fromEntries(Object.entries(OUTCOMES).filter(([key]) => key !== 'unobserved')))}</select></label>
          <label>구체적인 관찰 메모 <span>(불필요한 개인정보 제외)</span><textarea name="note" rows="3" maxlength="1000" placeholder="예: 소음이 커졌을 때 ‘쉬고 싶어요’ 버튼을 눌렀다. 교사가 확인하고 조용한 곳으로 함께 이동했다."></textarea></label>
          <button class="edu-primary" type="submit">관찰 저장</button>
        </form>
        <div class="edu-record-header"><h4>이 기기의 관찰 기록</h4><button class="edu-secondary" type="button" data-export>현재 별칭의 관찰 CSV</button></div><p class="edu-record-count edu-small"></p><ol class="edu-records"></ol>
        <p class="edu-small">이 도구의 준비·관찰은 현재 브라우저에만 저장되며 구글 시트로 전송하지 않습니다. 브라우저 자료를 지우면 사라질 수 있으므로 필요한 기록은 CSV로 보관하세요.</p>
      </section>
      <section id="edu-guide" class="edu-section" aria-labelledby="edu-guide-title"><h3 id="edu-guide-title" tabindex="-1">3. 어른이 함께할 지원 방법</h3>
        <ul class="edu-guide"><li><strong>먼저 이해하기:</strong> 아이가 겪은 상황과 감각적 불편을 확인합니다. 얼굴만 보고 감정을 단정하지 않고 아이의 표현을 확인합니다.</li><li><strong>표현을 기다리기:</strong> 짧은 문장과 필요한 단서를 제공한 뒤 충분히 기다립니다. 정확한 말이나 특정 동작을 반복해야만 요청을 들어주는 방식은 피합니다.</li><li><strong>요청에 응답하기:</strong> 거절·도움·휴식 요청을 확인하고 가능한 지원을 제공합니다. 다시 참여할 시점과 방식은 아이와 함께 정합니다.</li><li><strong>안전과 편안함 먼저:</strong> 위험하거나 원하지 않는 접촉이 있으면 어른이 즉시 안전을 확보합니다. 아이가 먼저 거절을 말해야 도움을 받을 수 있는 것은 아닙니다.</li><li><strong>자연스럽게 연결하기:</strong> 편안할 때 동의한 역할놀이를 짧게 해 보고, 실제 일상에서 기회가 생기면 지원합니다. 평가를 위해 음식·소음·접촉을 강요하지 않습니다.</li><li><strong>관찰에 따라 바꾸기:</strong> 표현 방법, 도움 정도, 주변의 응답을 함께 검토합니다. 실생활에서 달라진 점을 확인하고 이야기와 환경을 조정합니다.</li></ul>
        <p class="edu-small">이 앱은 사회적 상황을 이해하고 의사소통을 연습하는 교육 자료입니다. 문장 수·비율이나 앱 사용만으로 공식 Social Stories 기준 충족 또는 개인별 교육 효과를 판단하지 않습니다.</p>
      </section>
      <footer class="edu-footer"><button type="button" class="edu-close">학습 화면으로 돌아가기</button></footer>
    </section>`;
    document.body.append(panel);
    document.addEventListener('keydown', handleKeys, true);
    panel.querySelectorAll('.edu-close').forEach(button => button.addEventListener('click', close));
    panel.addEventListener('click', event => {
      if (event.target === panel) { close(); return; }
      const jump = event.target.closest('[data-jump]');
      if (jump) { const target = panel.querySelector('#' + jump.dataset.jump); target.scrollIntoView({ block: 'start' }); target.querySelector('h3').focus({ preventScroll: true }); }
    });
    panel.querySelector('[data-load-plan]').addEventListener('click', () => {
      const form = panel.querySelector('#edu-plan');
      if (form.elements.name.reportValidity()) loadPlan(clamp(form.elements.name.value, 40));
    });
    panel.querySelector('#edu-plan').addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget, name = clamp(form.elements.name.value, 40);
      if (!name) { sayStatus('학생 별칭을 입력해 주세요.', true); return; }
      const all = plans();
      const value = { place: clamp(form.elements.place.value), adult: clamp(form.elements.adult.value, 100), goal: clamp(form.elements.goal.value, 300), channels: [...form.querySelectorAll('[name="channels"]:checked')].map(x => x.value), updated: new Date().toISOString() };
      Object.defineProperty(all, name, { value, enumerable: true, configurable: true, writable: true });
      if (write(KEYS.plans, all)) { setName(name); renderRecords(); sayStatus('준비 내용을 이 기기에 저장했습니다.'); }
      else sayStatus('저장하지 못했습니다. 브라우저 저장 공간·설정을 확인하고 내용을 따로 보관해 주세요.', true);
    });
    panel.querySelector('#edu-observation').addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget, name = clamp(form.elements.name.value, 40);
      if (!name) { sayStatus('학생 별칭을 입력해 주세요.', true); return; }
      const rows = observations();
      if (rows.length >= 2000) { sayStatus('이 기기 관찰이 2,000건입니다. CSV로 보관한 뒤 기록 보관 방법을 검토해 주세요. 기존 관찰은 삭제하지 않았습니다.', true); return; }
      rows.push({ date: new Date().toISOString(), name, situation: Number(form.elements.situation.value), context: form.elements.context.value, method: form.elements.method.value, support: form.elements.support.value, outcome: form.elements.outcome.value, note: clamp(form.elements.note.value, 1000) });
      if (write(KEYS.observations, rows)) { renderRecords(); form.elements.note.value = ''; sayStatus('관찰을 이 기기에 저장했습니다.'); }
      else sayStatus('관찰을 저장하지 못했습니다. 입력한 내용을 따로 보관해 주세요.', true);
    });
    panel.querySelector('#edu-observation [name="name"]').addEventListener('input', renderRecords);
    panel.querySelector('[data-export]').addEventListener('click', exportCSV);
    loadPlan(clamp(name, 40));
    if (storageFailed) sayStatus('브라우저 저장 자료를 읽지 못했습니다. 저장이 제한되어 있을 수 있으므로 중요한 내용은 따로 보관해 주세요.', true);
    panel.querySelector('.edu-close').focus();
  }

  const launch = document.createElement('button'); launch.type = 'button'; launch.className = 'edu-launch'; launch.textContent = '교사 도구'; launch.setAttribute('aria-label', '수업 준비·관찰 열기');
  launch.addEventListener('click', () => open()); document.body.append(launch);
  window.EducationTools = Object.freeze({ open, getPlan });
})();
