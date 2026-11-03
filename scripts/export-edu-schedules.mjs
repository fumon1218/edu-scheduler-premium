// 에듀 스케줄러 수업 일정을 공개용 파일(JSON + ICS)로 내보냅니다.
//
// 에듀 스케줄러 원본(Firestore)은 로그인이 필요하지만, 앱이 날짜 있는 수업을
// 강릉 방문예약 앱 저장소의 eduSchedules 컬렉션에 미러해 두고 있습니다(교사 이름 제외).
// 이 스크립트는 그 미러를 읽기만 해서 아래 두 파일을 만듭니다.
//
//   dist/planner/edu-schedules.json  — 노션 동기화용
//   dist/planner/edu-schedules.ics   — 캘린더 구독용
//
// 읽기에 실패해도 배포가 멈추지 않도록, 실패하면 ok:false 인 JSON만 남깁니다.
// 사용: node scripts/export-edu-schedules.mjs [출력폴더=dist/planner]

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PROJECT_ID = 'gangneung-schedule';
// gangneungBridge.ts 의 GANGNEUNG_FIREBASE_CONFIG.apiKey 와 같은 웹 앱 공개 설정값입니다.
const API_KEY = 'AIzaSyAgrtE13iz1nwZcbgbf9gHohZrP-cxJiWE';
const COLLECTION = 'eduSchedules';
const OUT_DIR = process.argv[2] || 'dist/planner';

const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}`;

function fieldValue(v) {
  if (!v || typeof v !== 'object') return '';
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return String(v.integerValue);
  if ('doubleValue' in v) return String(v.doubleValue);
  if ('booleanValue' in v) return String(v.booleanValue);
  if ('nullValue' in v) return '';
  return '';
}

async function fetchAll() {
  const docs = [];
  let pageToken = '';
  for (let i = 0; i < 50; i++) {
    const url = new URL(BASE);
    url.searchParams.set('pageSize', '300');
    url.searchParams.set('key', API_KEY);
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Firestore ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    for (const d of body.documents || []) {
      const f = d.fields || {};
      docs.push({
        id: d.name.split('/').pop(),
        date: fieldValue(f.date),
        day: fieldValue(f.day),
        startTime: fieldValue(f.startTime),
        endTime: fieldValue(f.endTime),
        program: fieldValue(f.program),
        location: fieldValue(f.location),
        roomId: fieldValue(f.roomId) || null,
        target: fieldValue(f.target),
      });
    }
    pageToken = body.nextPageToken || '';
    if (!pageToken) break;
  }
  return docs
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date))
    .sort((a, b) => (a.date + a.startTime + a.id).localeCompare(b.date + b.startTime + b.id));
}

// ---- ICS ----
const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

function fold(line) {
  // RFC 5545: 75 옥텟 넘는 줄은 접습니다 (UTF-8 기준)
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts = [];
  let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, 'utf8') > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = ch;
    } else cur += ch;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

const hhmm = (t) => (/^\d{2}:\d{2}$/.test(t) ? t.replace(':', '') + '00' : '');
const ymd = (d) => d.replace(/-/g, '');

function nextDay(d) {
  const dt = new Date(d + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

function toIcs(items, stamp) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EduScheduler//edu-schedules//KO',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:에듀 스케줄러 수업 일정',
    'X-WR-TIMEZONE:Asia/Seoul',
  ];
  for (const s of items) {
    const summary = [s.program, s.target].filter(Boolean).join(' · ');
    lines.push('BEGIN:VEVENT', `UID:${s.id}@edu-scheduler`, `DTSTAMP:${stamp}`);
    const st = hhmm(s.startTime);
    const et = hhmm(s.endTime);
    if (st) {
      lines.push(`DTSTART;TZID=Asia/Seoul:${ymd(s.date)}T${st}`);
      if (et) lines.push(`DTEND;TZID=Asia/Seoul:${ymd(s.date)}T${et}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${ymd(s.date)}`, `DTEND;VALUE=DATE:${ymd(nextDay(s.date))}`);
    }
    lines.push(`SUMMARY:${esc(summary || '수업')}`);
    if (s.location) lines.push(`LOCATION:${esc(s.location)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const generatedAt = new Date().toISOString();
  const stamp = generatedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  try {
    const items = await fetchAll();
    await writeFile(path.join(OUT_DIR, 'edu-schedules.json'), JSON.stringify({ ok: true, generatedAt, source: `${PROJECT_ID}/${COLLECTION}`, count: items.length, items }, null, 2));
    await writeFile(path.join(OUT_DIR, 'edu-schedules.ics'), toIcs(items, stamp));
    console.log(`edu-schedules: ${items.length}건 내보냄 → ${OUT_DIR}`);
  } catch (err) {
    console.warn(`edu-schedules: 읽기 실패 — ${err.message}`);
    await writeFile(path.join(OUT_DIR, 'edu-schedules.json'), JSON.stringify({ ok: false, generatedAt, error: String(err.message || err), items: [] }, null, 2));
  }
}

main();
