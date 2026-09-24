// =====================================================================
// 교양 — 내 자료
//  · CSV / 엑셀 / 글자 PDF / 붙여넣기 → 나만의 학습 덱
//  · 구글 스프레드시트 링크 연결 → 앱을 열 때 자동으로 최신 내용 반영
//  저장 위치: culture/{uid}/decks (덱 정보) , culture/{uid}/deckChunks (항목, 400개씩 나눠 저장)
// =====================================================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { Upload, FileSpreadsheet, FileText, Link2, ClipboardPaste, RefreshCw, Trash2, GraduationCap, Check, X, AlertTriangle, Sheet } from 'lucide-react';
import { db } from '../lib/firebase';
import { cn } from '../lib/utils';

export type Voice = '' | 'en-US' | 'ja-JP' | 'es-ES';
export interface MyItem { id: string; f: string; b: string; s?: string; d?: string }
export interface ColMap { f: number; b: number; s: number; d: number; header: boolean; sheet?: string }
export interface MyDeck { id: string; name: string; voice: Voice; source: 'file' | 'sheet' | 'paste'; url?: string; map?: ColMap; count: number; syncedAt?: number; createdAt?: number; chunks?: number; items: MyItem[] }

// ---------------------------------------------------------------------
// 파싱 도구
// ---------------------------------------------------------------------
export function parseCSV(text: string): string[][] {
  text = text.replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const delim = (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? '\t' : ',';
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(x => x.trim())).filter(r => r.some(x => x !== ''));
}

const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
export function rowsToItems(rows: string[][], m: ColMap): MyItem[] {
  const out: MyItem[] = []; const seen = new Set<string>();
  rows.slice(m.header ? 1 : 0).forEach(r => {
    const f = (r[m.f] || '').trim(), b = (r[m.b] || '').trim();
    if (!f || !b) return;
    const id = 'x' + hash(f + '|' + b);
    if (seen.has(id)) return; seen.add(id);
    const it: MyItem = { id, f, b };
    if (m.s >= 0 && r[m.s]) it.s = r[m.s].trim();
    if (m.d >= 0 && r[m.d]) it.d = r[m.d].trim();
    out.push(it);
  });
  return out;
}

const loadScript = (src: string) => new Promise<void>((resolve, reject) => {
  if (document.querySelector(`script[data-src="${src}"]`)) { resolve(); return; }
  const s = document.createElement('script'); s.src = src; s.async = true; s.dataset.src = src;
  s.onload = () => resolve(); s.onerror = () => { s.remove(); reject(new Error('도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.')); };
  document.head.appendChild(s);
});
async function readExcel(file: File): Promise<Record<string, string[][]>> {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
  const XLSX = (window as any).XLSX;
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const out: Record<string, string[][]> = {};
  wb.SheetNames.forEach((n: string) => {
    const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' });
    out[n] = rows.map(r => r.map(c => String(c ?? '').trim())).filter(r => r.some(c => c !== ''));
  });
  return out;
}
async function readPdfLines(file: File): Promise<string[]> {
  const base = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  await loadScript(base + 'pdf.min.js');
  const pdfjs = (window as any).pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js';
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const lines: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const tc = await (await pdf.getPage(p)).getTextContent();
    const rows: { y: number; parts: { x: number; s: string }[] }[] = [];
    tc.items.forEach((it: any) => {
      if (!it.str || !it.str.trim()) return;
      const y = it.transform[5], x = it.transform[4];
      let r = rows.find(rr => Math.abs(rr.y - y) < 3);
      if (!r) { r = { y, parts: [] }; rows.push(r); }
      r.parts.push({ x, s: it.str });
    });
    rows.sort((a, b) => b.y - a.y).forEach(r => {
      const parts = r.parts.sort((a, b) => a.x - b.x);
      let line = ''; let lastX = -1;
      parts.forEach(pt => { line += (lastX >= 0 && pt.x - lastX > 18 ? '\t' : '') + pt.s; lastX = pt.x + pt.s.length * 4; });
      if (line.trim()) lines.push(line.trim());
    });
  }
  return lines;
}
const SPLITS: { id: string; label: string; fn: (lines: string[]) => string[][] }[] = [
  { id: 'tab', label: '넓은 간격(탭)으로 나누기', fn: ls => ls.map(l => l.split(/\t+/)) },
  { id: 'dash', label: '“ - ” 로 나누기', fn: ls => ls.map(l => l.split(/\s+[-–—]\s+/)) },
  { id: 'dot', label: '“ · ” 로 나누기', fn: ls => ls.map(l => l.split(/\s*·\s*/)) },
  { id: 'colon', label: '“ : ” 로 나누기', fn: ls => ls.map(l => l.split(/\s*[:：]\s+/)) },
  { id: 'bar', label: '“ | ” 로 나누기', fn: ls => ls.map(l => l.split(/\s*\|\s*/)) },
  { id: 'comma', label: '쉼표로 나누기', fn: ls => ls.map(l => l.split(/\s*,\s*/)) },
  { id: 'pair', label: '두 줄이 한 항목 (윗줄=앞면, 아랫줄=뒷면)', fn: ls => { const o: string[][] = []; for (let i = 0; i + 1 < ls.length; i += 2) o.push([ls[i], ls[i + 1]]); return o; } },
];

// 구글 시트 링크 → CSV 주소
export function sheetCsvUrl(u: string): string | null {
  u = u.trim();
  if (/\/pub\?/.test(u) || /output=csv/.test(u)) return u.includes('output=') ? u : u + '&output=csv';
  const m = u.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) return null;
  const gid = (u.match(/[#&?]gid=(\d+)/) || [])[1] || '0';
  return `https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:csv&gid=${gid}`;
}
export async function fetchSheet(u: string): Promise<string[][]> {
  const url = sheetCsvUrl(u);
  if (!url) throw new Error('구글 스프레드시트 주소가 아닙니다.');
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('시트를 읽지 못했습니다. 공유 설정을 ‘링크가 있는 모든 사용자(뷰어)’로 바꾸거나 ‘웹에 게시(CSV)’ 링크를 넣어 주세요.');
  const t = await r.text();
  if (/<html/i.test(t.slice(0, 200))) throw new Error('시트가 비공개입니다. 공유 설정을 ‘링크가 있는 모든 사용자’로 바꿔 주세요.');
  return parseCSV(t);
}

// ---------------------------------------------------------------------
// 저장 (Firestore 또는 이 기기)
// ---------------------------------------------------------------------
const LKEY = 'eduCultureDecksV1';
const readL = (): MyDeck[] => { try { return JSON.parse(localStorage.getItem(LKEY) || '[]'); } catch { return []; } };
const writeL = (d: MyDeck[]) => { try { localStorage.setItem(LKEY, JSON.stringify(d)); } catch { alert('이 기기의 저장 공간이 부족합니다.'); } };
const CH = 400;

export function useMyDecks(uid: string | null | undefined, mode: 'loading' | 'cloud' | 'local') {
  const [metas, setMetas] = useState<Record<string, any>>({});
  const [chunks, setChunks] = useState<Record<string, { deck: string; n: number; items: MyItem[] }>>({});
  const [local, setLocal] = useState<MyDeck[]>(() => readL());
  const cloud = mode === 'cloud' && !!uid;
  useEffect(() => {
    if (!cloud) return;
    const u1 = onSnapshot(collection(db, 'culture', uid!, 'decks'), s => { const m: Record<string, any> = {}; s.docs.forEach(d => { m[d.id] = d.data(); }); setMetas(m); }, () => {});
    const u2 = onSnapshot(collection(db, 'culture', uid!, 'deckChunks'), s => { const m: Record<string, any> = {}; s.docs.forEach(d => { m[d.id] = d.data(); }); setChunks(m); }, () => {});
    return () => { u1(); u2(); };
  }, [cloud, uid]);
  const decks: MyDeck[] = useMemo(() => {
    if (!cloud) return local;
    return Object.entries(metas).map(([id, m]) => {
      const items = Object.values(chunks).filter(c => c.deck === id).sort((a, b) => a.n - b.n).flatMap(c => c.items || []);
      return { ...(m as any), id, items } as MyDeck;
    }).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }, [cloud, metas, chunks, local]);

  const saveDeck = async (d: MyDeck) => {
    const now = Date.now();
    const deck: MyDeck = { ...d, count: d.items.length, createdAt: d.createdAt || now, syncedAt: d.syncedAt || now };
    if (cloud) {
      const n = Math.max(1, Math.ceil(deck.items.length / CH));
      const old = (metas[deck.id]?.chunks as number) || 0;
      for (let i = 0; i < n; i++) await setDoc(doc(db, 'culture', uid!, 'deckChunks', `${deck.id}__${i}`), { deck: deck.id, n: i, items: deck.items.slice(i * CH, (i + 1) * CH) });
      for (let i = n; i < old; i++) await deleteDoc(doc(db, 'culture', uid!, 'deckChunks', `${deck.id}__${i}`));
      const { items, id, ...meta } = deck;
      await setDoc(doc(db, 'culture', uid!, 'decks', deck.id), { ...meta, chunks: n, updatedAt: serverTimestamp() });
    } else {
      const l = readL(); const i = l.findIndex(x => x.id === deck.id);
      if (i >= 0) l[i] = deck; else l.push(deck);
      writeL(l); setLocal([...l]);
    }
  };
  const removeDeck = async (id: string) => {
    if (cloud) {
      const old = (metas[id]?.chunks as number) || 0;
      for (let i = 0; i < Math.max(old, 1); i++) await deleteDoc(doc(db, 'culture', uid!, 'deckChunks', `${id}__${i}`));
      await deleteDoc(doc(db, 'culture', uid!, 'decks', id));
    } else { const l = readL().filter(x => x.id !== id); writeL(l); setLocal(l); }
  };
  return { decks, saveDeck, removeDeck };
}

// 구글 시트 덱 자동 동기화 (3시간마다, 교양 메뉴를 열 때)
export async function syncSheetDeck(d: MyDeck, save: (d: MyDeck) => Promise<void>) {
  if (d.source !== 'sheet' || !d.url || !d.map) return 0;
  let rows: string[][] = await fetchSheet(d.url);
  const items = rowsToItems(rows, d.map);
  await save({ ...d, items, syncedAt: Date.now() });
  return items.length;
}
export function useAutoSync(decks: MyDeck[], save: (d: MyDeck) => Promise<void>, ready: boolean) {
  const done = useRef(false);
  useEffect(() => {
    if (!ready || done.current || decks.length === 0) return;
    done.current = true;
    const stale = decks.filter(d => d.source === 'sheet' && Date.now() - (d.syncedAt || 0) > 3 * 3600 * 1000);
    (async () => { for (const d of stale) { try { await syncSheetDeck(d, save); } catch { /* 다음에 다시 시도 */ } } })();
  }, [ready, decks.length]);
}

// =====================================================================
// 화면
// =====================================================================
const VOICES: { v: Voice; label: string }[] = [{ v: '', label: '듣기 없음' }, { v: 'en-US', label: '영어' }, { v: 'ja-JP', label: '일본어' }, { v: 'es-ES', label: '스페인어' }];
const newDeckId = () => 'u' + Date.now().toString(36);

export function MyDataTab({ decks, saveDeck, removeDeck, openDeck, linksNode }: { decks: MyDeck[]; saveDeck: (d: MyDeck) => Promise<void>; removeDeck: (id: string) => Promise<void>; openDeck: (id: string) => void; linksNode: React.ReactNode }) {
  const [sub, setSub] = useState<'decks' | 'links'>('decks');
  const [wizard, setWizard] = useState(false);
  const [busy, setBusy] = useState('');
  const resync = async (d: MyDeck) => {
    setBusy(d.id);
    try { const n = await syncSheetDeck(d, saveDeck); alert(`${d.name}: ${n}개 항목으로 업데이트했습니다.`); }
    catch (e: any) { alert(e?.message || String(e)); } finally { setBusy(''); }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex p-1 bg-surface border border-border-color rounded-full">
          <button onClick={() => setSub('decks')} className={cn('px-4 py-1.5 rounded-full text-xs font-bold', sub === 'decks' ? 'bg-accent-color text-on-accent' : 'text-text-muted')}>내 학습 덱 {decks.length}</button>
          <button onClick={() => setSub('links')} className={cn('px-4 py-1.5 rounded-full text-xs font-bold', sub === 'links' ? 'bg-accent-color text-on-accent' : 'text-text-muted')}>링크 모음</button>
        </div>
        {sub === 'decks' && <button onClick={() => setWizard(true)} className="h-10 px-4 rounded-full bg-accent-color text-on-accent text-sm font-bold flex items-center gap-1.5 shadow-sm"><Upload size={15} /> 자료 추가 · 업데이트</button>}
      </div>

      {sub === 'links' ? linksNode : (
        <>
          {decks.length === 0 ? (
            <div className="p-8 bg-surface border border-border-color rounded-2xl text-center">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-soft flex items-center justify-center text-text-muted mb-3"><Upload size={20} /></div>
              <p className="text-sm text-text-main font-bold">CSV · 엑셀 · PDF 파일이나 구글 시트로 나만의 학습 덱을 만들어 보세요.</p>
              <p className="text-xs text-text-muted mt-1.5 leading-relaxed">예) A열 영어 문장, B열 해석, C열 문법 메모 → 목록 · 카드 · 퀴즈 · 듣기 · 오늘의 카드로 공부할 수 있습니다.<br />구글 시트를 연결하면 시트에 줄을 추가할 때마다 앱이 자동으로 따라 업데이트됩니다.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {decks.map(d => (
                <div key={d.id} className="bg-surface border border-border-color rounded-2xl p-4 flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-text-main break-words">{d.name}</div>
                      <div className="text-[11px] text-text-muted mt-0.5 flex items-center gap-1">
                        {d.source === 'sheet' ? <><Sheet size={11} /> 구글 시트 연결</> : d.source === 'paste' ? <><ClipboardPaste size={11} /> 붙여넣기</> : <><FileSpreadsheet size={11} /> 파일 업로드</>}
                        {' · '}{d.count}개{d.voice ? ` · 듣기 ${VOICES.find(v => v.v === d.voice)?.label}` : ''}
                      </div>
                      {d.syncedAt && <div className="text-[10px] text-text-muted/80 mt-0.5">마지막 업데이트 {new Date(d.syncedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>}
                    </div>
                  </div>
                  <div className="text-xs text-text-muted mt-2 line-clamp-2">{d.items.slice(0, 3).map(x => x.f).join(' · ')}</div>
                  <div className="flex flex-wrap gap-1.5 mt-auto pt-3">
                    <button onClick={() => openDeck(d.id)} className="h-8 px-3 rounded-full bg-accent-color text-on-accent text-xs font-bold flex items-center gap-1"><GraduationCap size={13} /> 학습</button>
                    {d.source === 'sheet' && <button disabled={busy === d.id} onClick={() => resync(d)} className="h-8 px-3 rounded-full border border-border-color text-xs font-bold text-text-muted flex items-center gap-1"><RefreshCw size={13} className={busy === d.id ? 'animate-spin' : ''} /> 지금 업데이트</button>}
                    <button onClick={async () => { if (confirm(`‘${d.name}’ 덱을 삭제할까요? (외운 기록은 남습니다)`)) await removeDeck(d.id); }} className="h-8 px-3 rounded-full text-xs font-bold text-red-600 flex items-center gap-1"><Trash2 size={13} /> 삭제</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="p-4 rounded-2xl bg-soft text-xs text-text-muted leading-relaxed">
            <b className="text-text-main">구글 시트 자동 업데이트 설정</b> · 시트 오른쪽 위 [공유] → ‘링크가 있는 모든 사용자’를 뷰어로 바꾸고 주소를 복사해 넣으세요. (또는 파일 → 공유 → 웹에 게시 → CSV 링크) 앱은 교양 메뉴를 열 때 3시간마다 시트를 다시 읽고, [지금 업데이트]로 바로 반영할 수도 있습니다.
          </div>
        </>
      )}
      {wizard && <ImportWizard decks={decks} onClose={() => setWizard(false)} saveDeck={saveDeck} />}
    </div>
  );
}

type Src = 'file' | 'sheet' | 'paste';
function ImportWizard({ decks, onClose, saveDeck }: { decks: MyDeck[]; onClose: () => void; saveDeck: (d: MyDeck) => Promise<void> }) {
  const [src, setSrc] = useState<Src>('file');
  const [rows, setRows] = useState<string[][] | null>(null);
  const [pdfLines, setPdfLines] = useState<string[] | null>(null);
  const [split, setSplit] = useState('tab');
  const [books, setBooks] = useState<Record<string, string[][]> | null>(null);
  const [sheetName, setSheetName] = useState('');
  const [url, setUrl] = useState('');
  const [paste, setPaste] = useState('');
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState('');
  const [err, setErr] = useState('');
  const [map, setMap] = useState<ColMap>({ f: 0, b: 1, s: -1, d: -1, header: true });
  const [target, setTarget] = useState('new');
  const [name, setName] = useState('');
  const [voice, setVoice] = useState<Voice>('en-US');
  const [saving, setSaving] = useState(false);

  const effRows: string[][] | null = pdfLines ? SPLITS.find(s => s.id === split)!.fn(pdfLines) : rows;
  const ncol = effRows ? Math.max(...effRows.slice(0, 50).map(r => r.length), 0) : 0;
  const header = effRows && map.header ? effRows[0] : null;
  const colName = (i: number) => header?.[i] ? `${String.fromCharCode(65 + i)}열 · ${header[i].slice(0, 14)}` : `${String.fromCharCode(65 + i)}열`;
  const items = effRows ? rowsToItems(effRows, map) : [];

  const reset = () => { setRows(null); setPdfLines(null); setBooks(null); setErr(''); };
  const guessHeader = (r: string[][]) => {
    const h = (r[0] || []).join(' ').toLowerCase();
    const isHead = /(영어|한국|뜻|의미|단어|문장|해석|english|korean|meaning|word|front|back|읽기|발음|메모)/.test(h);
    setMap(m => ({ ...m, header: isHead }));
  };
  const onFile = async (f: File) => {
    reset(); setFileName(f.name); if (!name) setName(f.name.replace(/\.[^.]+$/, ''));
    setLoading('파일을 읽는 중…');
    try {
      const ext = f.name.split('.').pop()!.toLowerCase();
      if (ext === 'csv' || ext === 'tsv' || ext === 'txt') { const r = parseCSV(await f.text()); setRows(r); guessHeader(r); }
      else if (ext === 'xlsx' || ext === 'xls') { const b = await readExcel(f); const first = Object.keys(b)[0]; setBooks(b); setSheetName(first); setRows(b[first]); guessHeader(b[first]); }
      else if (ext === 'pdf') { const l = await readPdfLines(f); if (!l.length) throw new Error('PDF에서 글자를 찾지 못했습니다. 스캔한 이미지 PDF는 읽을 수 없습니다.'); setPdfLines(l); setMap(m => ({ ...m, header: false })); }
      else throw new Error('CSV, 엑셀(xlsx), PDF, TXT 파일을 올려 주세요.');
    } catch (e: any) { setErr(e?.message || String(e)); } finally { setLoading(''); }
  };
  const onSheet = async () => {
    reset(); setLoading('구글 시트를 읽는 중…');
    try { const r = await fetchSheet(url); if (!r.length) throw new Error('시트가 비어 있습니다.'); setRows(r); guessHeader(r); if (!name) setName('구글 시트 자료'); }
    catch (e: any) { setErr(e?.message || String(e)); } finally { setLoading(''); }
  };
  const onPaste = () => { reset(); const r = parseCSV(paste); setRows(r); guessHeader(r); if (!name) setName('붙여넣은 자료'); };

  const save = async () => {
    if (!items.length) { alert('앞면과 뒷면이 모두 있는 줄이 없습니다. 열 선택을 확인해 주세요.'); return; }
    setSaving(true);
    try {
      if (target === 'new') {
        const d: MyDeck = { id: newDeckId(), name: name.trim() || '내 자료', voice, source: src, url: src === 'sheet' ? url.trim() : undefined, map: { ...map, sheet: sheetName || undefined }, count: items.length, items };
        if (!d.url) delete d.url;
        await saveDeck(d);
        alert(`‘${d.name}’ 덱을 만들었습니다 (${items.length}개).`);
      } else {
        const d = decks.find(x => x.id === target)!;
        const have = new Set(d.items.map(x => x.id));
        const add = items.filter(x => !have.has(x.id));
        await saveDeck({ ...d, items: [...d.items, ...add], syncedAt: Date.now() });
        alert(`‘${d.name}’에 새 항목 ${add.length}개를 추가했습니다. (중복 ${items.length - add.length}개 제외)`);
      }
      onClose();
    } catch (e: any) { alert('저장하지 못했습니다: ' + (e?.message || e)); } finally { setSaving(false); }
  };

  const sel = 'h-9 px-2 bg-bg-primary border border-border-color rounded-lg text-xs font-bold outline-none';
  return (
    <div className="fixed inset-0 z-[200] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-surface w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-lg font-bold flex items-center gap-2"><Upload size={16} /> 자료 추가 · 업데이트</h3>
          <button onClick={onClose} className="w-9 h-9 rounded-full hover:bg-soft flex items-center justify-center"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {([['file', <FileText size={16} />, '파일 올리기', 'CSV · 엑셀 · PDF · TXT'], ['sheet', <Link2 size={16} />, '구글 시트 연결', '자동 업데이트'], ['paste', <ClipboardPaste size={16} />, '붙여넣기', '엑셀에서 복사해 붙여넣기']] as [Src, React.ReactNode, string, string][]).map(([id, ic, t, d]) => (
            <button key={id} onClick={() => { setSrc(id); reset(); setTarget('new'); }} className={cn('p-3 rounded-2xl border text-left', src === id ? 'border-accent-color bg-soft' : 'border-border-color')}>
              <div className="flex items-center gap-1.5 text-sm font-bold">{ic}{t}</div>
              <div className="text-[10px] text-text-muted mt-0.5">{d}</div>
            </button>
          ))}
        </div>

        <div className="mt-4">
          {src === 'file' && (
            <label className="block p-5 rounded-2xl border-2 border-dashed border-border-color text-center cursor-pointer hover:border-accent-color">
              <input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
              <Upload size={20} className="mx-auto text-text-muted" />
              <div className="text-sm font-bold mt-2">{fileName || '파일을 선택하세요'}</div>
              <div className="text-[11px] text-text-muted mt-1">첫 줄에 제목(예: 영어, 해석, 메모)이 있으면 자동으로 알아봅니다.</div>
            </label>
          )}
          {src === 'sheet' && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" className="flex-1 h-10 px-3 bg-bg-primary border border-border-color rounded-lg text-sm outline-none focus:border-accent-color" />
                <button onClick={onSheet} disabled={!url.trim()} className="h-10 px-4 rounded-lg bg-accent-color text-on-accent text-sm font-bold disabled:opacity-50">불러오기</button>
              </div>
              <p className="text-[11px] text-text-muted leading-relaxed">시트 [공유] → ‘링크가 있는 모든 사용자 · 뷰어’로 설정한 뒤 주소를 넣으세요. 특정 탭을 쓰려면 그 탭을 연 상태의 주소(#gid=…)를 복사하세요.</p>
            </div>
          )}
          {src === 'paste' && (
            <div className="space-y-2">
              <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={6} placeholder={'엑셀·구글 시트에서 여러 칸을 복사해 붙여넣거나,\n“영어 문장<Tab>해석” 또는 “영어 문장,해석” 형식으로 한 줄에 하나씩 입력하세요.'} className="w-full p-3 bg-bg-primary border border-border-color rounded-lg text-sm outline-none focus:border-accent-color" />
              <button onClick={onPaste} disabled={!paste.trim()} className="h-9 px-4 rounded-lg bg-accent-color text-on-accent text-sm font-bold disabled:opacity-50">미리보기</button>
            </div>
          )}
        </div>

        {loading && <div className="mt-4 text-sm text-text-muted flex items-center gap-2"><RefreshCw size={14} className="animate-spin" />{loading}</div>}
        {err && <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" />{err}</div>}

        {effRows && (
          <div className="mt-5 space-y-4">
            {books && Object.keys(books).length > 1 && (
              <div className="flex items-center gap-2 text-xs font-bold"><span className="text-text-muted">시트</span>
                <select className={sel} value={sheetName} onChange={e => { setSheetName(e.target.value); setRows(books[e.target.value]); guessHeader(books[e.target.value]); }}>{Object.keys(books).map(n => <option key={n}>{n}</option>)}</select>
              </div>
            )}
            {pdfLines && (
              <div className="p-3 rounded-xl bg-soft text-xs space-y-2">
                <div className="font-bold">PDF에서 {pdfLines.length}줄을 읽었습니다. 한 줄을 앞면·뒷면으로 나누는 방법을 고르세요.</div>
                <select className={sel} value={split} onChange={e => setSplit(e.target.value)}>{SPLITS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
                <div className="text-text-muted">표가 복잡한 PDF는 결과가 어긋날 수 있습니다. 그럴 땐 엑셀·CSV로 바꿔 올리는 것이 가장 정확합니다.</div>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {([['f', '앞면 (문장·단어) *'], ['b', '뒷면 (뜻·해석) *'], ['s', '읽기·발음·분류'], ['d', '메모·예문']] as [keyof ColMap, string][]).map(([k, lab]) => (
                <label key={k} className="flex flex-col gap-1 text-[11px] font-bold text-text-muted">{lab}
                  <select className={sel} value={map[k] as number} onChange={e => setMap({ ...map, [k]: Number(e.target.value) })}>
                    {(k === 's' || k === 'd') && <option value={-1}>사용 안 함</option>}
                    {Array.from({ length: ncol }, (_, i) => <option key={i} value={i}>{colName(i)}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={map.header} onChange={e => setMap({ ...map, header: e.target.checked })} /> 첫 줄은 제목 줄 (자료에서 제외)</label>

            <div className="border border-border-color rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-soft text-[11px] font-bold text-text-muted">미리보기 · 저장될 항목 {items.length}개</div>
              {items.slice(0, 6).map(x => (
                <div key={x.id} className="px-3 py-2 border-t border-line-soft text-sm">
                  <span className="font-bold">{x.f}</span>{x.s && <span className="text-accent-color text-xs ml-2">{x.s}</span>}
                  <div className="text-text-muted text-xs">{x.b}{x.d ? ` · ${x.d}` : ''}</div>
                </div>
              ))}
              {items.length === 0 && <div className="px-3 py-4 text-xs text-text-muted border-t border-line-soft">앞면·뒷면 열을 다시 골라 주세요.</div>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className="flex flex-col gap-1 text-[11px] font-bold text-text-muted">저장 위치
                <select className={sel} value={target} onChange={e => setTarget(e.target.value)} disabled={src === 'sheet'}>
                  <option value="new">새 덱 만들기</option>
                  {src !== 'sheet' && decks.map(d => <option key={d.id} value={d.id}>기존 덱에 추가: {d.name}</option>)}
                </select>
              </label>
              {target === 'new' && <label className="flex flex-col gap-1 text-[11px] font-bold text-text-muted">덱 이름<input value={name} onChange={e => setName(e.target.value)} className={cn(sel, 'font-normal text-sm')} /></label>}
              {target === 'new' && <label className="flex flex-col gap-1 text-[11px] font-bold text-text-muted">듣기 언어 (앞면)
                <select className={sel} value={voice} onChange={e => setVoice(e.target.value as Voice)}>{VOICES.map(v => <option key={v.v} value={v.v}>{v.label}</option>)}</select>
              </label>}
            </div>
            {src === 'sheet' && <p className="text-[11px] text-text-muted">구글 시트 덱은 시트 내용을 그대로 따라가므로, 항목을 추가·수정하려면 시트에서 고치면 됩니다.</p>}

            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="h-10 px-4 rounded-full border border-border-color text-sm font-bold text-text-muted">취소</button>
              <button onClick={save} disabled={saving || !items.length} className="h-10 px-5 rounded-full bg-accent-color text-on-accent text-sm font-bold disabled:opacity-50 flex items-center gap-1.5"><Check size={15} />{saving ? '저장 중…' : '저장'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
