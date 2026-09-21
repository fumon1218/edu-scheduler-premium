// 강릉분원 방문예약 앱(gangneung-schedule)과 데이터를 주고받기 위한 "순수 로직" 모음입니다.
// Firebase 같은 외부 라이브러리를 쓰지 않으므로 단독으로 시험해 볼 수 있습니다.
// (Firebase 읽기/쓰기는 gangneungBridge.ts 에 있습니다)

export type GnSession = 'AM' | 'PM';

/** 강릉 방문예약 앱의 일정 1건 (Firestore: entries 컬렉션) */
export interface GnEntry {
  id: string;
  date: string; // YYYY-MM-DD
  session: GnSession; // 오전(AM) / 오후(PM)
  room: string; // 강릉 앱의 프로그램실 id (예: 'safety')
  org: string; // 방문 기관 구분 (예: '초등학교')
  count: number; // 인원
  note: string;
}

/** 강릉 방문예약 앱의 프로그램실 */
export interface GnRoom {
  id: string;
  name: string;
  custom?: boolean; // 강릉 앱에서 사용자가 직접 추가한 프로그램실
}

export const GANGNEUNG_APP_URL = 'https://fumon1218.github.io/gangneung-schedule/';

// 강릉 앱(index.html)의 BASE_ROOMS 와 id·이름이 같아야 합니다.
export const GN_BASE_ROOMS: GnRoom[] = [
  { id: 'safety', name: '안전체험관' },
  { id: 'cook', name: '진로·직업교육실(요리)' },
  { id: 'mask', name: '공연장(관노가면극)' },
  { id: 'upcycle', name: '해안 업사이클링실' },
  { id: 'barista', name: '바리스타 체험실' },
  { id: 'drawing', name: '중회의실(디지털드로잉)' },
  { id: 'craft', name: '장애이해교육실(공예)' },
  { id: 'club', name: '장애이해교육 동아리실(실용음악·영상)' },
  { id: 'digital', name: '디지털융합교실' },
  { id: 'esports', name: 'e스포츠 체험실' },
  { id: 'visit', name: '특별연수 및 기관방문' },
];

export function mergeRooms(customRooms: GnRoom[]): GnRoom[] {
  const ids = new Set(GN_BASE_ROOMS.map((r) => r.id));
  return [...GN_BASE_ROOMS, ...customRooms.filter((r) => !ids.has(r.id)).map((r) => ({ ...r, custom: true }))];
}

export function roomLabel(rooms: GnRoom[], id: string): string {
  return rooms.find((r) => r.id === id)?.name ?? '(미등록 프로그램실)';
}

// ---------------------------------------------------------------------------
// 프로그램실 연결: 에듀 스케줄러의 "장소" 이름 ↔ 강릉 앱의 프로그램실 id
// 예) '2층 쿠킹체험실' → 'cook',  '1층 안전체험관' → 'safety'
// 장소 이름을 바꿨는데 연결이 안 되면 아래 KEYWORD_RULES 의 단어만 고쳐주세요.
// (앞에서부터 차례로 검사하므로 순서가 중요합니다: '동아리'를 '장애이해교육실'보다 먼저)
// ---------------------------------------------------------------------------
const KEYWORD_RULES: Array<[string, string[]]> = [
  ['club', ['동아리']],
  ['craft', ['장애이해교육실', '공예']],
  ['safety', ['안전체험']],
  ['barista', ['바리스타']],
  ['cook', ['쿠킹', '요리', '제과', '제빵']],
  ['esports', ['e스포츠', '이스포츠', 'esports']],
  ['mask', ['가면극', '공연장']],
  ['upcycle', ['업사이클']],
  ['drawing', ['디지털드로잉', '드로잉', '중회의실']],
  ['digital', ['디지털융합']],
  ['visit', ['특별연수', '기관방문']],
];

const normalizeName = (s: string): string =>
  (s || '')
    .toLowerCase()
    .replace(/^\s*\d+\s*층\s*/, '') // 앞의 "1층", "2층" 제거
    .replace(/[\s·・.,\-_/]/g, ''); // 공백·가운뎃점 등 제거

export function locationToRoomId(location: string, rooms: GnRoom[]): string | null {
  const n = normalizeName(location);
  if (!n) return null;

  // 1) 강릉 앱에서 사용자가 직접 추가한 프로그램실: 이름이 같거나 서로 포함되면 연결
  for (const r of rooms) {
    if (!r.custom) continue;
    const rn = normalizeName(r.name);
    if (rn && (rn === n || n.includes(rn) || rn.includes(n))) return r.id;
  }
  // 2) 기본 프로그램실: 이름 속 핵심 단어로 연결
  for (const [id, keys] of KEYWORD_RULES) {
    if (keys.some((k) => n.includes(k))) return id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 시간대: 강릉 앱은 오전/오후(12시 기준)로만 예약을 받습니다.
// 수업 시간(시작~종료)이 오전·오후 중 어느 쪽에 걸치는지 계산합니다.
// ---------------------------------------------------------------------------
const AM_END_MIN = 12 * 60;

const toMin = (t: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((t || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

export function sessionsOfClass(startTime: string, endTime: string): GnSession[] {
  const s = toMin(startTime);
  let e = toMin(endTime);
  if (!Number.isFinite(s)) return [];
  if (!Number.isFinite(e) || e <= s) e = s + 1;
  const out: GnSession[] = [];
  if (s < AM_END_MIN) out.push('AM');
  if (e > AM_END_MIN) out.push('PM');
  return out;
}

const bySession = (a: GnEntry, b: GnEntry) =>
  (a.session === b.session ? 0 : a.session === 'AM' ? -1 : 1) || a.room.localeCompare(b.room);

/** 같은 날짜·같은 실·겹치는 시간대(오전/오후)에 잡힌 강릉 방문예약을 찾습니다. */
export function findLinkedEntries(
  s: { date: string; startTime: string; endTime: string; location: string },
  entries: GnEntry[],
  rooms: GnRoom[]
): GnEntry[] {
  const roomId = locationToRoomId(s.location, rooms);
  if (!roomId) return [];
  const sessions = sessionsOfClass(s.startTime, s.endTime);
  if (sessions.length === 0) return [];
  return entries
    .filter((e) => e.date === s.date && e.room === roomId && sessions.includes(e.session))
    .sort(bySession);
}

export function entriesByDate(entries: GnEntry[]): Map<string, GnEntry[]> {
  const map = new Map<string, GnEntry[]>();
  for (const e of entries) {
    const list = map.get(e.date);
    if (list) list.push(e);
    else map.set(e.date, [e]);
  }
  map.forEach((list) => list.sort(bySession));
  return map;
}

/** Firestore 문서 → GnEntry (형식이 이상한 문서는 건너뜁니다) */
export function normalizeEntry(id: string, data: Record<string, unknown>): GnEntry | null {
  const date = typeof data.date === 'string' ? data.date : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const session: GnSession = data.session === 'PM' ? 'PM' : 'AM';
  return {
    id,
    date,
    session,
    room: typeof data.room === 'string' ? data.room : '',
    org: typeof data.org === 'string' ? data.org : '',
    count: Number(data.count) || 0,
    note: typeof data.note === 'string' ? data.note : '',
  };
}

// ---------------------------------------------------------------------------
// 에듀 스케줄러 수업 → 강릉 앱으로 보내는 "미러" 문서
// (강릉 앱 Firestore 의 eduSchedules 컬렉션. 문서 id = 수업 id)
// ---------------------------------------------------------------------------
export interface MirrorSource {
  id: string;
  date?: string;
  day?: string;
  startTime?: string;
  endTime?: string;
  program?: string;
  location?: string;
  target?: string;
  teacherName?: string;
}

export interface MirrorDoc {
  date: string;
  day: string;
  startTime: string;
  endTime: string;
  program: string;
  location: string;
  roomId: string | null; // 연결된 강릉 프로그램실 id (연결 안 되면 null)
  target: string;
  teacher?: string; // 교사 이름은 옵션을 켰을 때만 내보냅니다
}

export function toMirrorDoc(s: MirrorSource, rooms: GnRoom[], includeTeacher = false): MirrorDoc | null {
  // 날짜가 없는 예전 수업(요일만 있는 것)은 달력에 놓을 수 없으므로 내보내지 않습니다.
  if (!s.date || !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) return null;
  const location = s.location || '';
  const doc: MirrorDoc = {
    date: s.date,
    day: s.day || '',
    startTime: s.startTime || '',
    endTime: s.endTime || '',
    program: s.program || '',
    location,
    roomId: locationToRoomId(location, rooms),
    target: s.target || '',
  };
  if (includeTeacher && s.teacherName) doc.teacher = s.teacherName;
  return doc;
}

export function buildMirrorMap(
  sources: MirrorSource[],
  rooms: GnRoom[],
  includeTeacher = false
): Map<string, MirrorDoc> {
  const map = new Map<string, MirrorDoc>();
  for (const s of sources) {
    const d = toMirrorDoc(s, rooms, includeTeacher);
    if (d) map.set(s.id, d);
  }
  return map;
}

/** 필드 순서와 상관없이 같은 내용이면 같은 문자열이 되도록 만드는 비교용 키 */
export const mirrorKey = (d: MirrorDoc): string =>
  JSON.stringify([d.date, d.day, d.startTime, d.endTime, d.program, d.location, d.roomId, d.target, d.teacher ?? null]);

/** 강릉 쪽에 이미 올라가 있는 미러 문서 → MirrorDoc (비교용) */
export function normalizeMirrorDoc(data: Record<string, unknown>): MirrorDoc {
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const doc: MirrorDoc = {
    date: str(data.date),
    day: str(data.day),
    startTime: str(data.startTime),
    endTime: str(data.endTime),
    program: str(data.program),
    location: str(data.location),
    roomId: typeof data.roomId === 'string' ? data.roomId : null,
    target: str(data.target),
  };
  if (typeof data.teacher === 'string' && data.teacher) doc.teacher = data.teacher;
  return doc;
}

/** 강릉 쪽 현재 상태(prev)와 에듀 쪽 최신 상태(next)를 비교해 바뀐 것만 골라냅니다. */
export function diffMirror(
  prev: Map<string, string>,
  next: Map<string, MirrorDoc>
): { toSet: Array<[string, MirrorDoc]>; toDelete: string[] } {
  const toSet: Array<[string, MirrorDoc]> = [];
  const toDelete: string[] = [];
  next.forEach((doc, id) => {
    if (prev.get(id) !== mirrorKey(doc)) toSet.push([id, doc]);
  });
  prev.forEach((_key, id) => {
    if (!next.has(id)) toDelete.push(id);
  });
  return { toSet, toDelete };
}
