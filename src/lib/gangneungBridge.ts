// 강릉분원 방문예약 앱(gangneung-schedule)과 실시간으로 데이터를 주고받는 브리지입니다.
//
// 두 앱은 Firebase 프로젝트가 서로 다르고, 에듀 스케줄러는 로그인이 필요하지만 강릉 앱은 로그인이 없습니다.
// 그래서 로그인이 필요 없는 "강릉 앱의 Firestore"를 공유 창구로 사용합니다.
//
//   강릉 앱 → 에듀:  entries(방문예약), customRooms(추가한 프로그램실)를 읽기 전용으로 받아서 표시
//   에듀 → 강릉 앱:  수업 일정을 eduSchedules 컬렉션에 복사(미러)해 두면 강릉 앱이 읽기 전용으로 표시
//
// 각 앱의 원본 데이터는 각자의 DB에 그대로 있고, 서로 상대 데이터를 "보기만" 합니다.

import { getApp, getApps, initializeApp } from 'firebase/app';
import { collection, doc, getDocs, getFirestore, onSnapshot, writeBatch } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import {
  buildMirrorMap,
  diffMirror,
  mirrorKey,
  normalizeEntry,
  normalizeMirrorDoc,
} from './gangneungLink';
import type { GnEntry, GnRoom, MirrorDoc, MirrorSource } from './gangneungLink';

/** false 로 바꾸면 에듀 수업을 강릉 앱으로 내보내지 않습니다. (강릉 예약 불러오기는 계속됩니다) */
export const BRIDGE_MIRROR_ENABLED = true;

/** true 로 바꾸면 담당 교사 이름도 강릉 앱에 함께 내보냅니다. (강릉 앱 저장소는 로그인 없이 읽을 수 있으므로 기본값은 false) */
export const MIRROR_INCLUDE_TEACHER = false;

// 강릉 앱(index.html)의 FIREBASE_CONFIG 와 같은 값입니다. (웹 앱용 공개 설정값)
const GANGNEUNG_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAgrtE13iz1nwZcbgbf9gHohZrP-cxJiWE',
  authDomain: 'gangneung-schedule.firebaseapp.com',
  projectId: 'gangneung-schedule',
  storageBucket: 'gangneung-schedule.firebasestorage.app',
  messagingSenderId: '912914783068',
  appId: '1:912914783068:web:55c5bba766519967013f99',
};

const HUB_APP_NAME = 'gangneung-hub';
const MIRROR_COLLECTION = 'eduSchedules';

let hubDb: Firestore | null = null;
function getHubDb(): Firestore {
  if (hubDb) return hubDb;
  // 에듀 앱 자체 Firebase(기본 앱)와 섞이지 않도록 이름을 붙인 별도 앱으로 초기화합니다.
  const app = getApps().some((a) => a.name === HUB_APP_NAME)
    ? getApp(HUB_APP_NAME)
    : initializeApp(GANGNEUNG_FIREBASE_CONFIG, HUB_APP_NAME);
  hubDb = getFirestore(app);
  return hubDb;
}

/** 오류를 화면에 보여줄 한국어 문구로 바꿉니다. */
export function describeHubError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code || '';
  if (code === 'permission-denied') {
    return '강릉 예약 앱의 Firebase 규칙이 접근을 막고 있습니다. 강릉 앱 Firebase 콘솔 → Firestore → 규칙에서 eduSchedules 컬렉션(읽기/쓰기)을 허용해 주세요.';
  }
  if (code === 'unavailable' || code === 'failed-precondition') {
    return '강릉 예약 앱 저장소와 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.';
  }
  const msg = (err as { message?: string } | null)?.message;
  return msg ? `연동 오류: ${msg}` : '알 수 없는 연동 오류가 발생했습니다.';
}

// ---------------------------------------------------------------------------
// 강릉 앱 → 에듀 (읽기)
// ---------------------------------------------------------------------------
export interface GangneungHandlers {
  onEntries: (entries: GnEntry[]) => void;
  onRooms: (rooms: GnRoom[]) => void;
  onError: (which: 'entries' | 'customRooms', err: unknown) => void;
}

/** 강릉 방문예약(entries)과 사용자 추가 프로그램실(customRooms)을 실시간으로 받습니다. 반환값은 구독 해제 함수입니다. */
export function subscribeGangneung(h: GangneungHandlers): () => void {
  const db = getHubDb();

  const stopEntries = onSnapshot(
    collection(db, 'entries'),
    (snap) => {
      const list: GnEntry[] = [];
      snap.forEach((d) => {
        const e = normalizeEntry(d.id, d.data());
        if (e) list.push(e);
      });
      h.onEntries(list);
    },
    (err) => h.onError('entries', err)
  );

  const stopRooms = onSnapshot(
    collection(db, 'customRooms'),
    (snap) => {
      const rooms: GnRoom[] = [];
      snap.forEach((d) => {
        const name = d.data().name;
        if (typeof name === 'string' && name.trim()) rooms.push({ id: d.id, name, custom: true });
      });
      h.onRooms(rooms);
    },
    (err) => h.onError('customRooms', err)
  );

  return () => {
    stopEntries();
    stopRooms();
  };
}

// ---------------------------------------------------------------------------
// 에듀 → 강릉 앱 (쓰기: 수업 일정을 eduSchedules 에 복사)
// ---------------------------------------------------------------------------
export interface SyncResult {
  written: number;
  deleted: number;
}

// 강릉 쪽에 지금 올라가 있는 내용(id → 비교용 키). 처음 한 번만 서버에서 읽고, 이후에는 우리가 쓴 내용으로 갱신합니다.
let mirrorCache: Map<string, string> | null = null;
let syncQueue: Promise<unknown> = Promise.resolve();
const BATCH_LIMIT = 400; // Firestore 배치 한도(500) 보다 여유 있게

/**
 * 에듀의 수업 목록을 강릉 앱 저장소(eduSchedules)에 맞춰 줍니다. 바뀐 것만 쓰고, 사라진 수업은 지웁니다.
 * 반드시 "서버에서 받은 최신 수업 목록"으로만 호출하세요. (불러오기 전의 빈 목록으로 부르면 강릉 쪽 복사본이 지워집니다)
 */
export function syncMirror(sources: MirrorSource[], rooms: GnRoom[]): Promise<SyncResult> {
  const run = async (): Promise<SyncResult> => {
    const db = getHubDb();
    const next = buildMirrorMap(sources, rooms, MIRROR_INCLUDE_TEACHER);

    if (!mirrorCache) {
      const snap = await getDocs(collection(db, MIRROR_COLLECTION));
      const cache = new Map<string, string>();
      snap.forEach((d) => cache.set(d.id, mirrorKey(normalizeMirrorDoc(d.data()))));
      mirrorCache = cache;
    }
    const cache = mirrorCache;

    const { toSet, toDelete } = diffMirror(cache, next);
    if (toSet.length === 0 && toDelete.length === 0) return { written: 0, deleted: 0 };

    type Op = { kind: 'set'; id: string; doc: MirrorDoc } | { kind: 'delete'; id: string };
    const ops: Op[] = [
      ...toSet.map(([id, d]): Op => ({ kind: 'set', id, doc: d })),
      ...toDelete.map((id): Op => ({ kind: 'delete', id })),
    ];

    for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
      const chunk = ops.slice(i, i + BATCH_LIMIT);
      const batch = writeBatch(db);
      for (const op of chunk) {
        const ref = doc(db, MIRROR_COLLECTION, op.id);
        if (op.kind === 'set') batch.set(ref, op.doc);
        else batch.delete(ref);
      }
      await batch.commit();
      // 커밋에 성공한 것만 캐시에 반영 (중간에 실패하면 다음 동기화 때 나머지를 다시 시도)
      for (const op of chunk) {
        if (op.kind === 'set') cache.set(op.id, mirrorKey(op.doc));
        else cache.delete(op.id);
      }
    }
    return { written: toSet.length, deleted: toDelete.length };
  };

  // 동시에 여러 번 호출돼도 순서대로 하나씩 처리합니다.
  const p = syncQueue.then(run, run);
  syncQueue = p.catch(() => undefined);
  return p;
}
