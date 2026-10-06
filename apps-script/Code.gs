/**
 * 오월 프로젝트 · 학생 제출 수신용 Google Apps Script
 *
 * 학생 웹앱에서 보낸 핀(Track C)과 소감(Track D)을
 *   - 이 스프레드시트의 '핀', '메시지' 시트에 한 줄씩 기록하고
 *   - 현장 사진은 Drive 의 '오월 프로젝트 현장 사진' 폴더에 저장합니다.
 *
 * 설정 방법은 저장소의 README.md 를 따라 하세요.
 */

// 답사 당일 학생들에게 알려 줄 반 코드. 이 값과 다르면 제출을 받지 않습니다.
const CLASS_CODE = '0518';

const PIN_HEAD = ['받은 시각', '제출자', 'id', '장소명', '유형', '위도', '경도', '단차(cm)', '폭(cm)', '설명', '사진 링크', '검수'];
const MSG_HEAD = ['받은 시각', '제출자', 'id', '닉네임', '세대', '소감', '작성 시각', '검수'];

/** 처음 한 번 실행: 시트와 사진 폴더를 만들고 권한을 허용합니다. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  getSheet_(ss, '핀', PIN_HEAD);
  getSheet_(ss, '메시지', MSG_HEAD);
  const f = getFolder_();
  Logger.log('준비 완료. 사진 폴더: ' + f.getUrl());
}

/** 브라우저로 웹 앱 주소를 열면 동작 여부를 확인할 수 있어요. */
function doGet() {
  return json_({ ok: true, service: 'may-project' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const body = JSON.parse(e.postData.contents);
    if (String(body.code || '').trim() !== CLASS_CODE) return json_({ ok: false, error: 'bad_code' });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const it = body.item || {};
    const team = clean_(body.team).slice(0, 30);
    const now = new Date();

    if (body.kind === 'pin') {
      const sh = getSheet_(ss, '핀', PIN_HEAD);
      if (exists_(sh, it.id)) return json_({ ok: true, dup: true });
      sh.appendRow([now, team, it.id, clean_(it.name), clean_(it.type), Number(it.lat), Number(it.lng),
        num_(it.step), num_(it.width), clean_(it.desc), savePhoto_(it.photo, team, it.id), '']);
      return json_({ ok: true });
    }
    if (body.kind === 'msg') {
      const sh = getSheet_(ss, '메시지', MSG_HEAD);
      if (exists_(sh, it.id)) return json_({ ok: true, dup: true });
      sh.appendRow([now, team, it.id, clean_(it.nick), clean_(it.gen), clean_(it.text), new Date(it.at || Date.now()), '']);
      return json_({ ok: true });
    }
    return json_({ ok: false, error: 'bad_kind' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
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
