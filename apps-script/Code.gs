/**
 * 오월 프로젝트 · 제출 수신 + 공개 데이터 제공용 Google Apps Script
 *
 * [받기 doPost]
 *   - 학생(반 코드)과 방문객(공개 페이지)이 보낸 무장애 정보·소감·현장 조사를
 *     이 스프레드시트의 '핀', '메시지', '조사' 시트에 한 줄씩 기록합니다.
 *   - 학생 사진은 Drive 의 '오월 프로젝트 현장 사진' 폴더에 저장합니다. 방문객은 사진을 받지 않습니다.
 *   - 방문객 글은 검수 칸이 비어 있는 채로 들어오고, 선생님이 'O' 를 적어야 공개됩니다.
 *
 * [보여 주기 doGet ?action=list]
 *   - '핀', '메시지' 시트에서 검수 칸이 O 로 시작하는 줄만 공개 페이지에 돌려줍니다.
 *   - 제출자 이름과 사진 링크는 내보내지 않습니다.
 *
 * 코드를 바꾼 뒤에는: 배포 → 배포 관리 → ✏️ → 버전 '새 버전' → 배포 (웹 앱 주소는 그대로)
 */

// 학생 반 코드. 이 값과 다르면 학생 제출을 받지 않습니다.
const CLASS_CODE = '0518';
// 공개 페이지(방문객)가 보내는 코드
const VISITOR_CODE = 'visitor';
// 방문객 글은 1시간에 이 개수까지만 받습니다 (장난 글 폭주 방지)
const VISITOR_LIMIT_PER_HOUR = 60;
// 방문객 무장애 정보는 이 범위(옛 전남도청 일대) 안의 위치만 받습니다
const AREA = { latMin: 35.140, latMax: 35.152, lngMin: 126.912, lngMax: 126.928 };

const PIN_HEAD = ['받은 시각', '제출자', 'id', '장소명', '유형', '위도', '경도', '단차(cm)', '폭(cm)', '설명', '사진 링크', '검수'];
const MSG_HEAD = ['받은 시각', '제출자', 'id', '닉네임', '세대', '소감', '작성 시각', '검수'];
const SURVEY_HEAD = ['받은 시각', '제출자', 'id', '찾은 방법', '위치', '관찰 메모', '개선 아이디어', '사진 링크', '기록 시각', '검수'];
const TYPES = ['ramp', 'elevator', 'flat', 'step', 'stairs', 'toilet', 'rest'];
const GENS = ['청소년', '청년', '중장년', '어르신'];

/** 처음 한 번 실행: 시트와 사진 폴더를 만들고 권한을 허용합니다. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  getSheet_(ss, '핀', PIN_HEAD);
  getSheet_(ss, '메시지', MSG_HEAD);
  getSheet_(ss, '조사', SURVEY_HEAD);
  const f = getFolder_();
  Logger.log('준비 완료. 사진 폴더: ' + f.getUrl());
}

/** ?action=list → 검수 O 인 공개 데이터 / 그 밖 → 동작 확인 */
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  if (action !== 'list') return json_({ ok: true, service: 'may-project' });
  const cache = CacheService.getScriptCache();
  const hit = cache.get('public-list');
  if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const approved = v => String(v || '').trim().toUpperCase().indexOf('O') === 0;
  const rows = name => {
    const sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return [];
    return sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  };
  const pins = rows('핀').filter(r => approved(r[11]) && r[2] && r[5] !== '' && r[6] !== '').map(r => ({
    id: String(r[2]), name: String(r[3]), type: String(r[4]), lat: Number(r[5]), lng: Number(r[6]),
    step: r[7] === '' ? '' : Number(r[7]), width: r[8] === '' ? '' : Number(r[8]), desc: String(r[9] || ''),
    visitor: String(r[1]).indexOf('방문객') === 0
  }));
  const msgs = rows('메시지').filter(r => approved(r[7]) && r[2]).map(r => ({
    id: String(r[2]), nick: String(r[3] || '익명'), gen: String(r[4] || ''), text: String(r[5] || ''),
    at: r[6] instanceof Date ? r[6].getTime() : Date.parse(r[6]) || Date.now(),
    visitor: String(r[1]).indexOf('방문객') === 0
  }));
  const out = JSON.stringify({ ok: true, pins: pins, msgs: msgs, updated: new Date().toISOString() });
  cache.put('public-list', out, 60);   // 1분 동안은 같은 결과를 바로 돌려줘요
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_json' }); }
  const code = String(body.code || '').trim();
  const visitor = code === VISITOR_CODE;
  if (!visitor && code !== CLASS_CODE) return json_({ ok: false, error: 'bad_code' });
  if (visitor && body.hp) return json_({ ok: true });            // 자동 입력 봇: 조용히 버림
  const it = body.item || {};

  if (visitor) {
    const err = checkVisitor_(body.kind, it);
    if (err) return json_({ ok: false, error: err });
    if (!visitorQuota_()) return json_({ ok: false, error: 'busy' });
  }
  const team = visitor ? '방문객(웹)' : clean_(body.team).slice(0, 30);

  // 사진 저장은 시간이 걸려서 잠금 밖에서 먼저 처리해요 (동시 제출이 몰려도 덜 막힘)
  let photoUrl = '';
  if (!visitor && (body.kind === 'pin' || body.kind === 'survey')) {
    try { photoUrl = savePhoto_(it.photo, team, it.id); } catch (err) { photoUrl = ''; }
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return json_({ ok: false, error: 'busy' });
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const now = new Date();
    if (body.kind === 'pin') {
      const sh = getSheet_(ss, '핀', PIN_HEAD);
      if (exists_(sh, it.id)) return json_({ ok: true, dup: true });
      sh.appendRow([now, team, clean_(it.id), clean_(it.name), clean_(it.type), Number(it.lat), Number(it.lng),
        num_(it.step), num_(it.width), clean_(it.desc), photoUrl, '']);
      return json_({ ok: true });
    }
    if (body.kind === 'msg') {
      const sh = getSheet_(ss, '메시지', MSG_HEAD);
      if (exists_(sh, it.id)) return json_({ ok: true, dup: true });
      sh.appendRow([now, team, clean_(it.id), clean_(it.nick), clean_(it.gen), clean_(it.text), new Date(it.at || Date.now()), '']);
      return json_({ ok: true });
    }
    if (body.kind === 'survey' && !visitor) {
      const sh = getSheet_(ss, '조사', SURVEY_HEAD);
      if (exists_(sh, it.id)) return json_({ ok: true, dup: true });
      const ways = Array.isArray(it.ways) ? it.ways.map(clean_).join(', ') : clean_(it.ways);
      sh.appendRow([now, team, clean_(it.id), ways, clean_(it.where), clean_(it.note), clean_(it.idea),
        photoUrl, new Date(it.at || Date.now()), '']);
      return json_({ ok: true });
    }
    return json_({ ok: false, error: 'bad_kind' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- 방문객 글 확인 ---------- */
function checkVisitor_(kind, it) {
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(String(it.id || ''))) return 'bad_id';
  if (kind === 'pin') {
    const lat = Number(it.lat), lng = Number(it.lng);
    if (!(lat >= AREA.latMin && lat <= AREA.latMax && lng >= AREA.lngMin && lng <= AREA.lngMax)) return 'out_of_area';
    if (!String(it.name || '').trim() || String(it.name).length > 40) return 'bad_name';
    if (TYPES.indexOf(String(it.type)) < 0) return 'bad_type';
    if (String(it.desc || '').length > 300) return 'too_long';
    return '';
  }
  if (kind === 'msg') {
    const t = String(it.text || '').trim();
    if (t.length < 5 || t.length > 300) return 'bad_text';
    if (String(it.nick || '').length > 16) return 'bad_name';
    if (GENS.indexOf(String(it.gen)) < 0) return 'bad_gen';
    return '';
  }
  return 'bad_kind';
}
function visitorQuota_() {
  const cache = CacheService.getScriptCache();
  const key = 'visitor-' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMddHH');
  const n = Number(cache.get(key) || 0);
  if (n >= VISITOR_LIMIT_PER_HOUR) return false;
  cache.put(key, String(n + 1), 3700);
  return true;
}

/* ---------- 도우미 ---------- */
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function getSheet_(ss, name, head) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(head);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, head.length).setFontWeight('bold');
  }
  return sh;
}
function getFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* 폴더가 지워졌으면 새로 만듭니다 */ } }
  const f = DriveApp.createFolder('오월 프로젝트 현장 사진');
  props.setProperty('FOLDER_ID', f.getId());
  return f;
}
function savePhoto_(photo, team, id) {
  if (typeof photo !== 'string' || !photo) return '';
  if (/^https?:\/\//.test(photo)) return photo;
  const m = photo.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!m) return '';
  const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], `${team}_${id}.jpg`);
  return getFolder_().createFile(blob).getUrl();
}
function exists_(sh, id) {
  if (!id) return false;
  const n = sh.getLastRow();
  if (n < 2) return false;
  return sh.getRange(2, 3, n - 1, 1).getValues().some(r => r[0] === id);
}
function num_(v) {
  return v === '' || v == null || isNaN(v) ? '' : Number(v);
}
/** 시트 수식 주입(=, +, -, @ 로 시작하는 값)을 막습니다. */
function clean_(s) {
  s = String(s == null ? '' : s).slice(0, 1000);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
