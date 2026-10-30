/**
 * 사회적 상황이야기 기록 — 구글 시트 웹앱
 *
 * - 상황 이야기(앱의 CONFIG.story)마다 탭이 하나씩 자동으로 생깁니다. 기존 탭은 건드리지 않아요.
 * - 앱에 새 항목이 생기면 그 열만 맨 오른쪽에 덧붙입니다. (기존 열·기록은 그대로)
 * - '말 버튼 사용' 탭에는 말 버튼 보드를 누른 횟수가 날짜별로 쌓입니다.
 *
 * 설치: 교사용_안내.md 참고. 이 파일을 고친 뒤에는 [배포 → 배포 관리 → 수정 → 새 버전]을 해야 반영돼요.
 */
const KEY = '여기에-비밀-키를-적으세요';   // 앱의 교사 설정 → '비밀 키'와 똑같이 적어 주세요

const SHEET_ID = '';   // 비워 두면 이 스크립트가 붙은 시트. 따로 만든 스크립트라면 시트 주소의 /d/와 /edit 사이 글자를 넣으세요

function doPost(e) {
  try { return handle_(e); }
  catch (err) { return out_({ ok: false, error: 'Apps Script 오류: ' + (err && err.message ? err.message : err) }); }
}

function handle_(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: '잘못된 요청' }); }
  const configuredKey = String(KEY || '').trim();
  if (!configuredKey || configuredKey === '여기에-비밀-키를-적으세요') return out_({ ok: false, error: '서버의 비밀 키를 먼저 설정해 주세요' });
  const suppliedKey = String(body && body.key || '').trim();
  if (!suppliedKey || suppliedKey !== configuredKey) return out_({ ok: false, error: '비밀 키가 맞지 않아요' });
  const ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return out_({ ok: false, error: '연결된 시트가 없어요 → 시트에서 [확장 프로그램 → Apps Script]로 만들거나 SHEET_ID를 적어 주세요' });

  if (body.action === 'ping') {
    return out_({ ok: true, sheets: ss.getSheets().map(s => s.getName()) });
  }
  if (body.action === 'append') {
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try { return out_({ ok: true, added: append_(ss, body.sheet, body.rows || []) }); }
    finally { lock.releaseLock(); }
  }
  if (body.action === 'list') {
    const sh = ss.getSheetByName(sheetName_(body.sheet));
    if (!sh || sh.getLastRow() < 2) return out_({ ok: true, rows: [] });
    const v = sh.getDataRange().getValues();
    const head = v.shift().map(String);
    let rows = v.map(r => {
      const o = {};
      head.forEach((h, i) => { o[h] = r[i] instanceof Date ? r[i].toISOString() : r[i]; });
      return o;
    });
    if (body.name) rows = rows.filter(r => String(r['이름']) === String(body.name));
    return out_({ ok: true, rows: rows.slice(-2000) });
  }
  return out_({ ok: false, error: '알 수 없는 요청' });
}

function doGet() {
  return out_({ ok: true, msg: '사회적 상황이야기 기록 웹앱이 켜져 있어요.' });
}

function sheetName_(s) {
  return String(s || '기록').replace(/[\[\]\*\?\/\\:]/g, ' ').slice(0, 90);
}

// 학생 이름·메모·열 이름이 수식으로 실행되지 않도록 텍스트로 저장해요.
// 숫자와 날짜는 원래 자료형을 유지하고, 일반 한글 문장은 그대로 둡니다.
function safeCell_(value) {
  return typeof value === 'string' && /^\s*[=+\-@]/.test(value) ? "'" + value : value;
}

function append_(ss, name, rows) {
  if (!rows.length) return 0;
  name = sheetName_(name);
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  const last = sh.getLastColumn();
  let head = last ? sh.getRange(1, 1, 1, last).getValues()[0].map(String) : [];

  // 처음 보는 항목만 오른쪽에 새 열로 추가
  const keys = ['저장시각'];
  rows.forEach(r => Object.keys(r).forEach(k => { if (keys.indexOf(k) < 0) keys.push(k); }));
  const add = keys.filter(k => head.indexOf(k) < 0);
  if (add.length) {
    sh.getRange(1, head.length + 1, 1, add.length).setValues([add.map(safeCell_)]).setFontWeight('bold').setBackground('#fff3d6');
    head = head.concat(add);
    sh.setFrozenRows(1);
  }

  const now = new Date();
  const data = rows.map(r => head.map(h => {
    if (h === '저장시각') return now;
    if (h === '수행일시' && r[h]) return new Date(r[h]);
    return r[h] === undefined || r[h] === null ? '' : safeCell_(r[h]);
  }));
  sh.getRange(sh.getLastRow() + 1, 1, data.length, head.length).setValues(data);
  return data.length;
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
