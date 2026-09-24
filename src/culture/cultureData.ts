// =====================================================================
// 교양 메뉴 — 학습 자료 불러오기 · 오늘의 항목 고르기 · 기록 저장
// 학습 자료 파일: public/culture/study-data.json
// 기록 저장 위치(Firestore): culture/{내 uid}/items , culture/{내 uid}/progress
//   ※ Firestore 규칙이 아직 없으면 자동으로 이 기기(브라우저)에 저장합니다.
// =====================================================================
import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface Saja { id: string; no: number; h: string; r: string; st: number; hun: string[]; g: string[]; m: string; n: string }
export interface Cheonja { id: string; h: string; r: string; m: string }
export interface Hanja { id: string; c: string; hun: string; e: string; jp: string }
export interface EnWord { id: string; w: string; d: string; k: string }
export interface EsSentence { id: string; t: string; p: string; k: string; n: string }
export interface EsWord { id: string; w: string; k: string; c: string }
export interface JaSentence { id: string; t: string; kana: string; p: string; k: string; n: string }
export interface LawArticle { id: string; no: string; t: string; ch: string; x: string }
export interface StudyData { saja: Saja[]; cheonja: Cheonja[]; hanja: Hanja[]; en: EnWord[]; es: EsSentence[]; esw: EsWord[]; ja: JaSentence[]; law: LawArticle[] }

let cache: StudyData | null = null;
let pending: Promise<StudyData> | null = null;
export function loadStudyData(): Promise<StudyData> {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    const base = ((import.meta as any).env?.BASE_URL as string) || '/edu-scheduler-premium/';
    pending = fetch(`${base}culture/study-data.json`)
      .then(r => { if (!r.ok) throw new Error('학습 자료 파일을 찾을 수 없습니다 (public/culture/study-data.json)'); return r.json(); })
      .then((d: StudyData) => { cache = d; return d; })
      .catch(e => { pending = null; throw e; });
  }
  return pending;
}

export function useStudyData() {
  const [data, setData] = useState<StudyData | null>(cache);
  const [error, setError] = useState('');
  useEffect(() => {
    if (cache) return;
    let alive = true;
    loadStudyData().then(d => { if (alive) setData(d); }).catch(e => { if (alive) setError(String(e.message || e)); });
    return () => { alive = false; };
  }, []);
  return { data, error };
}

// 2026-01-01을 0일로 하는 날짜 번호 → 매일 다른 항목
const EPOCH = Date.UTC(2026, 0, 1);
export const dayNumber = (d: Date) => Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EPOCH) / 86400000);
export function pickDaily<T>(arr: T[], d: Date, salt = 0): T | undefined {
  if (!arr || arr.length === 0) return undefined;
  const n = dayNumber(d) + salt;
  return arr[((n % arr.length) + arr.length) % arr.length];
}

// ---------------------------------------------------------------------
// 기록(독서·필사·여행·관람·음악·단어장) + 학습 진도(외운 항목)
// ---------------------------------------------------------------------
export type RecordKind = 'book' | 'copy' | 'trip' | 'show' | 'music' | 'vocab';
export interface CultureRecord { id: string; kind: RecordKind; createdAt?: number; updatedAt?: number; [key: string]: any }
export type DeckId = 'saja' | 'cheonja' | 'hanja' | 'en' | 'grammar' | 'es' | 'esw' | 'ja' | 'law';
export type Progress = Partial<Record<DeckId, string[]>>;

const LOCAL_KEY = 'eduCultureV1';
interface LocalShape { items: CultureRecord[]; progress: Progress }
const readLocal = (): LocalShape => {
  try { const v = JSON.parse(localStorage.getItem(LOCAL_KEY) || ''); return { items: v.items || [], progress: v.progress || {} }; }
  catch { return { items: [], progress: {} }; }
};
const writeLocal = (v: LocalShape) => { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(v)); } catch { /* 저장 공간 부족 등 */ } };
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function useCultureStore(uid?: string | null) {
  const [mode, setMode] = useState<'loading' | 'cloud' | 'local'>(uid ? 'loading' : 'local');
  const [items, setItems] = useState<CultureRecord[]>(() => uid ? [] : readLocal().items);
  const [progress, setProgress] = useState<Progress>(() => uid ? {} : readLocal().progress);
  const [localLeft, setLocalLeft] = useState(() => readLocal().items.length);

  useEffect(() => {
    if (!uid) { const l = readLocal(); setItems(l.items); setProgress(l.progress); setMode('local'); return; }
    let failed = false;
    const fallback = () => {
      if (failed) return; failed = true;
      const l = readLocal(); setItems(l.items); setProgress(l.progress); setMode('local');
    };
    const u1 = onSnapshot(collection(db, 'culture', uid, 'items'), snap => {
      setItems(snap.docs.map(d => ({ ...(d.data() as any), id: d.id })));
      setMode('cloud');
    }, fallback);
    const u2 = onSnapshot(collection(db, 'culture', uid, 'progress'), snap => {
      const p: Progress = {};
      snap.docs.forEach(d => { (p as any)[d.id] = (d.data() as any).ids || []; });
      setProgress(p);
    }, fallback);
    return () => { u1(); u2(); };
  }, [uid]);

  const saveRecord = async (rec: CultureRecord) => {
    const now = Date.now();
    const r = { ...rec, id: rec.id || newId(), createdAt: rec.createdAt || now, updatedAt: now };
    if (mode === 'cloud' && uid) {
      const { id, ...rest } = r;
      await setDoc(doc(db, 'culture', uid, 'items', id), { ...rest, serverAt: serverTimestamp() });
    } else {
      const l = readLocal(); const i = l.items.findIndex(x => x.id === r.id);
      if (i >= 0) l.items[i] = r; else l.items.push(r);
      writeLocal(l); setItems([...l.items]); setLocalLeft(l.items.length);
    }
    return r;
  };
  const removeRecord = async (id: string) => {
    if (mode === 'cloud' && uid) await deleteDoc(doc(db, 'culture', uid, 'items', id));
    else { const l = readLocal(); l.items = l.items.filter(x => x.id !== id); writeLocal(l); setItems([...l.items]); setLocalLeft(l.items.length); }
  };
  const setKnown = async (deck: DeckId, id: string, known: boolean) => {
    const cur = new Set(progress[deck] || []);
    if (known) cur.add(id); else cur.delete(id);
    const ids = Array.from(cur);
    setProgress(p => ({ ...p, [deck]: ids }));
    if (mode === 'cloud' && uid) await setDoc(doc(db, 'culture', uid, 'progress', deck), { ids, updatedAt: serverTimestamp() });
    else { const l = readLocal(); l.progress = { ...l.progress, [deck]: ids }; writeLocal(l); }
  };
  // 이 기기에 저장해 둔 기록을 클라우드로 옮기기 (규칙 적용 후 1회)
  const migrateLocal = async () => {
    if (mode !== 'cloud' || !uid) return 0;
    const l = readLocal(); let n = 0;
    for (const r of l.items) { const { id, ...rest } = r; await setDoc(doc(db, 'culture', uid, 'items', id), { ...rest, serverAt: serverTimestamp() }); n++; }
    for (const [deck, ids] of Object.entries(l.progress)) {
      const merged = Array.from(new Set([...(progress as any)[deck] || [], ...(ids || [])]));
      await setDoc(doc(db, 'culture', uid, 'progress', deck), { ids: merged, updatedAt: serverTimestamp() });
    }
    writeLocal({ items: [], progress: {} }); setLocalLeft(0);
    return n;
  };
  const knownSet = useMemo(() => {
    const m: Partial<Record<DeckId, Set<string>>> = {};
    (Object.keys(progress) as DeckId[]).forEach(k => { m[k] = new Set(progress[k]); });
    return m;
  }, [progress]);
  return { mode, items, progress, knownSet, saveRecord, removeRecord, setKnown, migrateLocal, localLeft };
}

export const recordDate = (r: CultureRecord): string => {
  const d = r.kind === 'book' ? (r.end || r.start) : r.kind === 'trip' ? r.start : r.date;
  if (d) return d;
  return r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : '';
};

export const googleSearch = (q: string) => `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`;
export const youtubeSearch = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

export function downloadIcs(title: string, start: string, end: string | undefined, desc = '') {
  const d = (s: string) => s.replace(/-/g, '');
  const next = (s: string) => { const t = new Date(s + 'T00:00:00'); t.setDate(t.getDate() + 1); return `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, '0')}${String(t.getDate()).padStart(2, '0')}`; };
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//EduScheduler//Culture//KO', 'BEGIN:VEVENT',
    `UID:${newId()}@edu-culture`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
    `DTSTART;VALUE=DATE:${d(start)}`, `DTEND;VALUE=DATE:${next(end || start)}`, `SUMMARY:${esc(title)}`,
    desc ? `DESCRIPTION:${esc(desc)}` : '', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${title || '일정'}.ics`;
  document.body.appendChild(a); a.click(); a.remove();
}
