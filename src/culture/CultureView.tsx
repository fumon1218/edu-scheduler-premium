// =====================================================================
// 교양 (사자성어 · 외국어 · 이달의 작품 · 학습 · 독서 · 필사 · 여행 · 관람 · 음악 · 단어장 · 연간 기록)
// =====================================================================
import React, { useEffect, useMemo, useState } from 'react';
import {
  Sparkles, Palette, GraduationCap, BookOpen, Feather, Plane, Ticket, Music, Languages, BarChart3,
  ChevronLeft, ChevronRight, Check, Plus, X, Trash2, Search, Shuffle, RotateCcw, ExternalLink, Star,
  Scale, CalendarDays, Download, Heart, Pencil, Eye, EyeOff, CloudOff, Cloud,
} from 'lucide-react';
import { cn } from '../lib/utils';
import {
  useStudyData, useCultureStore, pickDaily, recordDate, googleSearch, youtubeSearch, downloadIcs, newId,
  type StudyData, type DeckId, type CultureRecord, type RecordKind,
} from './cultureData';
import { MONTH_POEMS, MONTH_ARTS, MONTH_MUSIC } from './monthly';
import { GRAMMAR_ITEMS } from './grammar';
import { GrammarTab, OsakaTab, SpeakBtn } from './CultureExtra';

type Tab = 'today' | 'grammar' | 'month' | 'study' | 'osaka' | RecordKind | 'year';
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// ---------------------------------------------------------------------
// 학습 자료(덱) 정의
// ---------------------------------------------------------------------
interface DeckDef { id: DeckId; label: string; short: string; lang?: string; voice?: 'en-US' | 'ja-JP' | 'es-ES'; items: (d: StudyData) => any[]; front: (x: any) => string; sub?: (x: any) => string; back: (x: any) => string; detail?: (x: any) => string; serif?: boolean }
const DECKS: DeckDef[] = [
  { id: 'saja', label: '사자성어', short: '사자성어', items: d => d.saja, front: x => x.h, sub: x => x.r, back: x => x.m, detail: x => [x.hun.join(' · '), x.n].filter(Boolean).join('\n'), serif: true },
  { id: 'cheonja', label: '천자문', short: '천자문', items: d => d.cheonja, front: x => x.h, sub: x => x.r, back: x => x.m, serif: true },
  { id: 'hanja', label: '한자 1800', short: '한자', items: d => d.hanja, front: x => x.c, sub: x => x.e, back: x => `${x.hun} ${x.e}`, detail: x => x.jp ? `일본어 훈독: ${x.jp}` : '', serif: true },
  { id: 'en', label: '영어 VOA 1500', short: '영어', lang: '영어', voice: 'en-US', items: d => d.en, front: x => x.w, back: x => x.k || x.d, detail: x => x.d },
  { id: 'grammar', label: '영문법 예문', short: '영문법', lang: '영어', voice: 'en-US', items: () => GRAMMAR_ITEMS, front: x => x.en, sub: x => x.lesson, back: x => x.ko, detail: x => x.note },
  { id: 'ja', label: '일본어 기초 문장', short: '일본어', lang: '일본어', voice: 'ja-JP', items: d => d.ja, front: x => x.t, sub: x => [x.kana, x.p].filter(Boolean).join(' · '), back: x => x.k, detail: x => x.n },
  { id: 'es', label: '스페인어 문장', short: '스페인어 문장', lang: '스페인어', voice: 'es-ES', items: d => d.es, front: x => x.t, sub: x => x.p, back: x => x.k, detail: x => x.n },
  { id: 'esw', label: '스페인어 단어', short: '스페인어 단어', lang: '스페인어', voice: 'es-ES', items: d => d.esw, front: x => x.w, sub: x => x.c, back: x => x.k },
  { id: 'law', label: '특수교육법', short: '특수교육법', items: d => d.law, front: x => `${x.no} (${x.t})`, sub: x => x.ch, back: x => x.x },
];
const deckOf = (id: DeckId) => DECKS.find(d => d.id === id)!;

// ---------------------------------------------------------------------
// 기록 양식 정의
// ---------------------------------------------------------------------
interface FieldDef { key: string; label: string; type: 'text' | 'textarea' | 'date' | 'select' | 'rating' | 'number' | 'checklist' | 'bool'; options?: string[]; required?: boolean; rows?: number; placeholder?: string; half?: boolean }
const FORMS: Record<RecordKind, { title: string; icon: React.ReactNode; fields: FieldDef[]; empty: string }> = {
  book: { title: '독서 기록', icon: <BookOpen size={15} />, empty: '읽은 책, 읽고 있는 책, 읽고 싶은 책을 기록해 보세요.', fields: [
    { key: 'title', label: '책 제목', type: 'text', required: true },
    { key: 'author', label: '저자', type: 'text', half: true },
    { key: 'status', label: '상태', type: 'select', options: ['읽는 중', '완독', '읽고 싶은 책'], half: true },
    { key: 'start', label: '읽기 시작', type: 'date', half: true },
    { key: 'end', label: '다 읽은 날', type: 'date', half: true },
    { key: 'rating', label: '별점', type: 'rating' },
    { key: 'quote', label: '인상 깊은 문장', type: 'textarea', rows: 3 },
    { key: 'review', label: '감상', type: 'textarea', rows: 5 },
  ] },
  copy: { title: '필사 노트', icon: <Feather size={15} />, empty: '마음에 남는 문장이나 시를 옮겨 적어 보세요.', fields: [
    { key: 'date', label: '날짜', type: 'date', half: true },
    { key: 'source', label: '출처 (작품명)', type: 'text', half: true },
    { key: 'author', label: '지은이', type: 'text' },
    { key: 'body', label: '필사 본문', type: 'textarea', rows: 10, required: true },
    { key: 'thought', label: '나의 생각', type: 'textarea', rows: 4 },
  ] },
  trip: { title: '여행', icon: <Plane size={15} />, empty: '다녀온 여행과 가고 싶은 곳을 모아 보세요.', fields: [
    { key: 'title', label: '여행 이름', type: 'text', required: true },
    { key: 'place', label: '장소', type: 'text', half: true },
    { key: 'status', label: '상태', type: 'select', options: ['계획 중', '다녀옴', '가고 싶은 곳'], half: true },
    { key: 'start', label: '출발', type: 'date', half: true },
    { key: 'end', label: '도착', type: 'date', half: true },
    { key: 'budget', label: '예산 (원)', type: 'number', half: true },
    { key: 'spent', label: '실제 지출 (원)', type: 'number', half: true },
    { key: 'companions', label: '함께 가는 사람', type: 'text' },
    { key: 'packing', label: '준비물 체크리스트', type: 'checklist' },
    { key: 'plan', label: '일정 메모', type: 'textarea', rows: 4 },
    { key: 'review', label: '여행 기록', type: 'textarea', rows: 5 },
    { key: 'rating', label: '별점', type: 'rating' },
  ] },
  show: { title: '공연 · 전시 관람', icon: <Ticket size={15} />, empty: '본 공연, 전시, 영화를 기록해 보세요.', fields: [
    { key: 'date', label: '날짜', type: 'date', half: true },
    { key: 'type', label: '종류', type: 'select', options: ['전시', '공연', '음악회', '영화', '기타'], half: true },
    { key: 'title', label: '제목', type: 'text', required: true },
    { key: 'venue', label: '장소', type: 'text', half: true },
    { key: 'with', label: '함께한 사람', type: 'text', half: true },
    { key: 'rating', label: '별점', type: 'rating' },
    { key: 'review', label: '감상', type: 'textarea', rows: 5 },
  ] },
  music: { title: '음악 감상', icon: <Music size={15} />, empty: '들은 곡과 마음에 든 곡을 모아 보세요.', fields: [
    { key: 'title', label: '곡명', type: 'text', required: true },
    { key: 'artist', label: '작곡가 · 아티스트', type: 'text', half: true },
    { key: 'performer', label: '연주자', type: 'text', half: true },
    { key: 'genre', label: '장르', type: 'select', options: ['클래식', '국악', '가요', '팝', '재즈', 'OST', '기타'], half: true },
    { key: 'date', label: '들은 날', type: 'date', half: true },
    { key: 'fav', label: '즐겨찾기', type: 'bool' },
    { key: 'rating', label: '별점', type: 'rating' },
    { key: 'note', label: '느낌', type: 'textarea', rows: 4 },
  ] },
  vocab: { title: '단어장', icon: <Languages size={15} />, empty: '새로 알게 된 단어를 모아 보세요. 학습 탭에서 ☆를 누르면 여기로 담깁니다.', fields: [
    { key: 'lang', label: '언어', type: 'select', options: ['영어', '일본어', '스페인어', '한자', '기타'], half: true },
    { key: 'known', label: '외웠어요', type: 'bool', half: true },
    { key: 'word', label: '단어 · 표현', type: 'text', required: true },
    { key: 'meaning', label: '뜻', type: 'text', required: true },
    { key: 'example', label: '예문 · 메모', type: 'textarea', rows: 3 },
  ] },
};
const KIND_COLOR: Record<RecordKind, string> = { book: '#4A6FA5', copy: '#7A5C99', trip: '#3E7C74', show: '#B26B3A', music: '#B24638', vocab: '#6B7B3A' };

// =====================================================================
export default function CultureView({ uid }: { uid?: string | null }) {
  const [tab, setTab] = useState<Tab>('today');
  const { data, error } = useStudyData();
  const store = useCultureStore(uid);
  const [studyDeck, setStudyDeck] = useState<DeckId>('saja');
  const openDeck = (id: DeckId) => { setStudyDeck(id); setTab('study'); };

  const tabBtn = (id: Tab, icon: React.ReactNode, label: string) => (
    <button key={id} onClick={() => setTab(id)} className={cn('px-3 sm:px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap', tab === id ? 'bg-accent-color text-on-accent shadow-sm' : 'text-text-muted hover:text-text-main')}>
      {icon} {label}
    </button>
  );

  return (
    <div className="w-full max-w-[1400px] mx-auto">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl font-bold text-text-main">교양</h2>
            <p className="text-sm text-text-muted mt-1">매일 한 걸음 · 사자성어, 외국어, 작품 감상과 나의 문화 기록</p>
          </div>
          <StorageBadge store={store} />
        </div>
        <div className="flex p-1 bg-surface border border-border-color rounded-full w-fit max-w-full shadow-sm overflow-x-auto no-scrollbar">
          {tabBtn('today', <Sparkles size={14} />, '오늘')}
          {tabBtn('grammar', <Languages size={14} />, '영문법')}
          {tabBtn('month', <Palette size={14} />, '이달의 작품')}
          {tabBtn('study', <GraduationCap size={14} />, '학습')}
          {tabBtn('book', <BookOpen size={14} />, '독서')}
          {tabBtn('copy', <Feather size={14} />, '필사')}
          {tabBtn('trip', <Plane size={14} />, '여행')}
          {tabBtn('osaka', <Plane size={14} />, '오사카 가이드')}
          {tabBtn('show', <Ticket size={14} />, '관람')}
          {tabBtn('music', <Music size={14} />, '음악')}
          {tabBtn('vocab', <Languages size={14} />, '단어장')}
          {tabBtn('year', <BarChart3 size={14} />, '연간 기록')}
        </div>
      </div>

      {error && <div className="p-4 rounded-2xl bg-surface border border-red-200 text-sm text-red-600 mb-4">{error}</div>}
      {tab === 'today' && <TodayTab data={data} store={store} openDeck={openDeck} goMonth={() => setTab('month')} goGrammar={() => setTab('grammar')} />}
      {tab === 'month' && <MonthTab />}
      {tab === 'grammar' && <GrammarTab openStudy={() => openDeck('grammar')} />}
      {tab === 'osaka' && <OsakaTab saveRecord={store.saveRecord} hasTrip={store.items.some(r => r.kind === 'trip' && /오사카/.test(r.title || ''))} />}
      {tab === 'study' && <StudyTab data={data} store={store} deck={studyDeck} setDeck={setStudyDeck} />}
      {(['book', 'copy', 'trip', 'show', 'music', 'vocab'] as RecordKind[]).includes(tab as RecordKind) && <RecordTab kind={tab as RecordKind} store={store} />}
      {tab === 'year' && <YearTab data={data} store={store} />}
    </div>
  );
}

type Store = ReturnType<typeof useCultureStore>;

function StorageBadge({ store }: { store: Store }) {
  const [open, setOpen] = useState(false);
  if (store.mode === 'loading') return null;
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className={cn('h-8 px-3 rounded-full text-[11px] font-bold border flex items-center gap-1.5', store.mode === 'cloud' ? 'bg-surface border-border-color text-text-muted' : 'bg-amber-50 border-amber-200 text-amber-700')}>
        {store.mode === 'cloud' ? <Cloud size={13} /> : <CloudOff size={13} />}
        {store.mode === 'cloud' ? '계정에 저장 중' : '이 기기에만 저장 중'}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-[300px] p-4 bg-surface border border-border-color rounded-2xl shadow-xl text-xs text-text-main leading-relaxed">
          {store.mode === 'cloud' ? (
            <>
              <p>기록과 학습 진도가 구글 계정에 저장되어 어느 기기에서나 보입니다.</p>
              {store.localLeft > 0 && (
                <button onClick={async () => { const n = await store.migrateLocal(); alert(`이 기기에 있던 기록 ${n}건을 계정으로 옮겼습니다.`); setOpen(false); }} className="mt-3 w-full h-9 rounded-xl bg-accent-color text-on-accent font-bold">
                  이 기기 기록 {store.localLeft}건을 계정으로 옮기기
                </button>
              )}
            </>
          ) : (
            <>
              <p>Firestore 규칙에 교양 기록 저장 권한이 아직 없어서, 지금은 이 브라우저에만 저장됩니다.</p>
              <p className="mt-2 text-text-muted">Firebase 콘솔 → Firestore → 규칙에 <b>culture</b> 규칙을 추가하면 자동으로 계정 저장으로 바뀝니다. 그때 이 기기 기록을 옮기는 버튼이 나타납니다.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// 공통 작은 부품
// ---------------------------------------------------------------------
function Card({ children, className, title, icon, right }: { children: React.ReactNode; className?: string; title?: string; icon?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className={cn('bg-surface border border-border-color rounded-2xl p-5 shadow-sm', className)}>
      {title && (
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-xs font-black text-text-muted tracking-wide flex items-center gap-1.5">{icon}{title}</h3>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}
function KnownBtn({ known, onClick, small }: { known: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button onClick={onClick} className={cn('rounded-full font-bold flex items-center gap-1 border transition-colors shrink-0', small ? 'h-7 px-2.5 text-[11px]' : 'h-8 px-3 text-xs',
      known ? 'bg-accent-color text-on-accent border-accent-color' : 'bg-surface text-text-muted border-border-color hover:text-text-main')}>
      <Check size={small ? 12 : 13} /> {known ? '외웠어요' : '외우기'}
    </button>
  );
}
function Stars({ value, onChange, size = 16 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} type="button" disabled={!onChange} onClick={() => onChange && onChange(value === i ? 0 : i)} className={cn(onChange ? 'cursor-pointer' : 'cursor-default')}>
          <Star size={size} className={i <= value ? 'text-amber-500 fill-amber-400' : 'text-border-color'} />
        </button>
      ))}
    </div>
  );
}
const Loading = () => <div className="p-10 text-center text-sm text-text-muted">학습 자료를 불러오는 중…</div>;

// =====================================================================
// 오늘
// =====================================================================
function TodayTab({ data, store, openDeck, goMonth, goGrammar }: { data: StudyData | null; store: Store; openDeck: (id: DeckId) => void; goMonth: () => void; goGrammar: () => void }) {
  const [day, setDay] = useState(() => new Date());
  if (!data) return <Loading />;
  const isToday = iso(day) === iso(new Date());
  const saja = pickDaily(data.saja, day)!;
  const cj = pickDaily(data.cheonja, day)!;
  const hj = pickDaily(data.hanja, day, 7)!;
  const en = pickDaily(data.en, day)!;
  const ja = pickDaily(data.ja, day)!;
  const es = pickDaily(data.es, day)!;
  const esw = pickDaily(data.esw, day, 3)!;
  const law = pickDaily(data.law, day)!;
  const gr = pickDaily(GRAMMAR_ITEMS, day)!;
  const m = day.getMonth();
  const k = (deck: DeckId, id: string) => !!store.knownSet[deck]?.has(id);
  const tog = (deck: DeckId, id: string) => store.setKnown(deck, id, !k(deck, id));
  const addVocab = (lang: string, word: string, meaning: string, example = '') =>
    store.saveRecord({ id: newId(), kind: 'vocab', lang, word, meaning, example, known: false }).then(() => alert(`단어장에 담았습니다: ${word}`));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => setDay(addDays(day, -1))} className="w-9 h-9 rounded-full bg-surface border border-border-color flex items-center justify-center"><ChevronLeft size={16} /></button>
        <div className="font-serif text-lg font-bold text-text-main px-1">{day.getFullYear()}년 {day.getMonth() + 1}월 {day.getDate()}일 <span className={cn(day.getDay() === 0 ? 'text-sun' : day.getDay() === 6 ? 'text-sat' : 'text-text-muted')}>({WD[day.getDay()]})</span></div>
        <button onClick={() => setDay(addDays(day, 1))} className="w-9 h-9 rounded-full bg-surface border border-border-color flex items-center justify-center"><ChevronRight size={16} /></button>
        {!isToday && <button onClick={() => setDay(new Date())} className="h-8 px-3 rounded-full bg-surface border border-border-color text-xs font-bold text-text-muted">오늘로</button>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 사자성어 */}
        <Card className="lg:col-span-2" title="오늘의 사자성어" icon={<Sparkles size={13} />} right={<KnownBtn known={k('saja', saja.id)} onClick={() => tog('saja', saja.id)} />}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="flex gap-2">
              {saja.h.split('').map((c, i) => (
                <div key={i} className="flex flex-col items-center">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-soft border border-line-soft flex items-center justify-center font-serif text-3xl sm:text-4xl font-bold text-text-main">{c}</div>
                  <div className="text-[10px] text-text-muted mt-1 whitespace-nowrap">{saja.hun[i]}</div>
                  {saja.g[i] && <div className="text-[9px] text-text-muted/70">{saja.g[i]}</div>}
                </div>
              ))}
            </div>
            <div className="min-w-0">
              <div className="font-serif text-2xl font-bold text-accent-color">{saja.r}</div>
              <div className="text-base font-bold text-text-main mt-1">{saja.m}</div>
              {saja.n && <p className="text-sm text-text-muted mt-2 leading-relaxed">{saja.n}</p>}
              <div className="text-[11px] text-text-muted/80 mt-2">{saja.st ? `난이도 ${saja.st}단계` : ''} · 전체 {data.saja.length}개 중 {store.knownSet.saja?.size || 0}개 외움 <button onClick={() => openDeck('saja')} className="underline ml-1">학습하기</button></div>
            </div>
          </div>
        </Card>

        {/* 천자문 + 한자 */}
        <Card title="오늘의 천자문 · 한자" icon={<BookOpen size={13} />}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-serif text-2xl font-bold tracking-widest">{cj.h}</div>
              <div className="text-sm font-bold text-accent-color mt-0.5">{cj.r}</div>
              <p className="text-sm text-text-muted mt-1">{cj.m}</p>
            </div>
            <KnownBtn small known={k('cheonja', cj.id)} onClick={() => tog('cheonja', cj.id)} />
          </div>
          <div className="border-t border-line-soft my-4" />
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl bg-soft border border-line-soft flex items-center justify-center font-serif text-4xl font-bold">{hj.c}</div>
            <div className="flex-1 min-w-0">
              <div className="text-base font-bold">{hj.hun} <span className="text-accent-color">{hj.e}</span></div>
              {hj.jp && <div className="text-sm text-text-muted mt-0.5">일본어 훈독 · {hj.jp}</div>}
            </div>
            <KnownBtn small known={k('hanja', hj.id)} onClick={() => tog('hanja', hj.id)} />
          </div>
        </Card>

        {/* 외국어 */}
        <Card className="lg:col-span-2" title="오늘의 외국어" icon={<Languages size={13} />}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <LangBox voice="en-US" flag="EN" label="영어 단어" main={en.w} sub={en.d} mean={en.k} known={k('en', en.id)} onKnown={() => tog('en', en.id)} onAdd={() => addVocab('영어', en.w, en.k || en.d, en.d)} />
            <LangBox voice="ja-JP" flag="JA" label="일본어 한 문장" main={ja.t} sub={[ja.kana, ja.p].filter(Boolean).join(' · ')} mean={ja.k} extra={ja.n} known={k('ja', ja.id)} onKnown={() => tog('ja', ja.id)} onAdd={() => addVocab('일본어', ja.t, ja.k, [ja.kana, ja.p, ja.n].filter(Boolean).join(' / '))} />
            <LangBox voice="es-ES" flag="ES" label="스페인어 한 문장" main={es.t} sub={es.p} mean={es.k} extra={es.n} known={k('es', es.id)} onKnown={() => tog('es', es.id)} onAdd={() => addVocab('스페인어', es.t, es.k, [es.p, es.n].filter(Boolean).join(' / '))} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[11px] font-black text-text-muted">스페인어 단어</span>
            <span className="font-bold">{esw.w}</span><span className="text-text-muted">{esw.k}</span>
            <KnownBtn small known={k('esw', esw.id)} onClick={() => tog('esw', esw.id)} />
          </div>
        </Card>

        {/* 영어 문법 */}
        <Card title="오늘의 영어 문법" icon={<Languages size={13} />} right={<KnownBtn small known={k('grammar', gr.id)} onClick={() => tog('grammar', gr.id)} />}>
          <div className="text-[11px] font-black text-accent-color">{gr.lesson}</div>
          <div className="flex items-start gap-2 mt-1.5">
            <div className="text-lg font-bold text-text-main leading-snug flex-1">{gr.en}</div>
            <SpeakBtn text={gr.en} lang="en-US" small />
          </div>
          <div className="text-sm text-text-muted mt-1.5">{gr.ko}</div>
          {gr.note && <div className="mt-3 p-2.5 rounded-xl bg-soft text-xs font-bold text-text-main">{gr.note}</div>}
          <button onClick={goGrammar} className="mt-3 text-[11px] text-text-muted underline">이 문법 자세히 보기</button>
        </Card>

        {/* 특수교육법 */}
        <Card title="오늘의 특수교육법" icon={<Scale size={13} />} right={<KnownBtn small known={k('law', law.id)} onClick={() => tog('law', law.id)} />}>
          <div className="text-[11px] text-text-muted">{law.ch}</div>
          <div className="font-bold text-text-main mt-0.5">{law.no} ({law.t})</div>
          <p className="text-[13px] text-text-main/90 mt-2 leading-relaxed whitespace-pre-line max-h-[220px] overflow-y-auto pr-1">{law.x}</p>
          <button onClick={() => openDeck('law')} className="mt-2 text-[11px] text-text-muted underline">전체 조문 보기</button>
        </Card>

        {/* 이달의 작품 미리보기 */}
        <Card className="lg:col-span-2" title={`${m + 1}월의 작품`} icon={<Palette size={13} />} right={<button onClick={goMonth} className="text-[11px] font-bold text-text-muted underline">자세히</button>}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button onClick={goMonth} className="text-left p-4 rounded-xl bg-soft border border-line-soft hover:border-accent-color transition-colors">
              <div className="text-[10px] font-black text-text-muted">이달의 시</div>
              <div className="font-serif text-lg font-bold mt-1">{MONTH_POEMS[m].title}</div>
              <div className="text-xs text-text-muted">{MONTH_POEMS[m].author} · {MONTH_POEMS[m].year}</div>
              <p className="font-serif text-sm mt-2 text-text-main/80 line-clamp-3 whitespace-pre-line">{MONTH_POEMS[m].text}</p>
            </button>
            <button onClick={goMonth} className="text-left p-4 rounded-xl bg-soft border border-line-soft hover:border-accent-color transition-colors">
              <div className="text-[10px] font-black text-text-muted">이달의 명화</div>
              <div className="font-serif text-lg font-bold mt-1">{MONTH_ARTS[m].title}</div>
              <div className="text-xs text-text-muted">{MONTH_ARTS[m].artist} · {MONTH_ARTS[m].year}</div>
              <p className="text-sm mt-2 text-text-main/80 line-clamp-3">{MONTH_ARTS[m].note}</p>
            </button>
            <button onClick={goMonth} className="text-left p-4 rounded-xl bg-soft border border-line-soft hover:border-accent-color transition-colors">
              <div className="text-[10px] font-black text-text-muted">이달의 명곡</div>
              <div className="font-serif text-lg font-bold mt-1">{MONTH_MUSIC[m].title}</div>
              <div className="text-xs text-text-muted">{MONTH_MUSIC[m].composer} · {MONTH_MUSIC[m].year}</div>
              <p className="text-sm mt-2 text-text-main/80 line-clamp-3">{MONTH_MUSIC[m].note}</p>
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function LangBox({ voice, flag, label, main, sub, mean, extra, known, onKnown, onAdd }: { voice: 'en-US' | 'ja-JP' | 'es-ES'; flag: string; label: string; main: string; sub?: string; mean: string; extra?: string; known: boolean; onKnown: () => void; onAdd: () => void }) {
  const [show, setShow] = useState(false);
  return (
    <div className="p-4 rounded-xl bg-soft border border-line-soft flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-accent-color text-on-accent">{flag}</span>
        <span className="text-[11px] font-bold text-text-muted flex-1">{label}</span>
        <SpeakBtn text={main} lang={voice} small />
      </div>
      <div className="text-lg font-bold text-text-main leading-snug break-words">{main}</div>
      {sub && <div className="text-xs text-text-muted mt-1 break-words">{sub}</div>}
      <button onClick={() => setShow(!show)} className="mt-2 text-left text-sm">
        {show ? <span className="font-bold text-accent-color">{mean}</span> : <span className="text-text-muted/70 flex items-center gap-1"><Eye size={13} /> 뜻 보기</span>}
      </button>
      {show && extra && <div className="text-[11px] text-text-muted mt-1">{extra}</div>}
      <div className="flex items-center gap-1.5 mt-auto pt-3">
        <KnownBtn small known={known} onClick={onKnown} />
        <button onClick={onAdd} title="단어장에 담기" className="h-7 px-2.5 rounded-full border border-border-color text-[11px] font-bold text-text-muted flex items-center gap-1"><Plus size={12} />단어장</button>
      </div>
    </div>
  );
}

// =====================================================================
// 이달의 작품
// =====================================================================
function MonthTab() {
  const [m, setM] = useState(() => new Date().getMonth());
  const poem = MONTH_POEMS[m], art = MONTH_ARTS[m], mus = MONTH_MUSIC[m];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 12 }, (_, i) => (
          <button key={i} onClick={() => setM(i)} className={cn('w-11 h-9 rounded-xl text-xs font-bold border', m === i ? 'bg-accent-color text-on-accent border-accent-color' : 'bg-surface border-border-color text-text-muted')}>{i + 1}월</button>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3" title="이달의 시" icon={<Feather size={13} />}>
          <div className="font-serif text-2xl font-bold">{poem.title}</div>
          <div className="text-sm text-text-muted mt-1">{poem.author} · {poem.year}</div>
          {poem.original && <p className="font-serif text-lg mt-4 whitespace-pre-line tracking-wider text-text-main/80">{poem.original}</p>}
          <p className="font-serif text-[15px] leading-8 mt-4 whitespace-pre-line text-text-main">{poem.text}</p>
          <div className="mt-4 p-3 rounded-xl bg-soft text-sm text-text-muted leading-relaxed">{poem.note}</div>
        </Card>
        <div className="lg:col-span-2 space-y-4">
          <Card title="이달의 명화" icon={<Palette size={13} />}>
            <div className="font-serif text-xl font-bold">{art.title}</div>
            <div className="text-sm text-text-muted mt-1">{art.artist} · {art.year}</div>
            <div className="text-xs text-text-muted mt-0.5">{art.place}</div>
            <p className="text-sm mt-3 leading-relaxed">{art.note}</p>
            <a href={googleSearch(art.query)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-accent-color text-on-accent text-xs font-bold"><ExternalLink size={13} /> 작품 이미지 보기</a>
          </Card>
          <Card title="이달의 명곡" icon={<Music size={13} />}>
            <div className="font-serif text-xl font-bold">{mus.title}</div>
            <div className="text-sm text-text-muted mt-1">{mus.composer} · {mus.year}</div>
            <p className="text-sm mt-3 leading-relaxed">{mus.note}</p>
            <a href={youtubeSearch(mus.query)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-accent-color text-on-accent text-xs font-bold"><ExternalLink size={13} /> 유튜브에서 듣기</a>
          </Card>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// 학습 (목록 · 카드 · 퀴즈)
// =====================================================================
function StudyTab({ data, store, deck, setDeck }: { data: StudyData | null; store: Store; deck: DeckId; setDeck: (d: DeckId) => void }) {
  const [mode, setMode] = useState<'list' | 'card' | 'quiz'>('list');
  const [filter, setFilter] = useState<'all' | 'todo' | 'known'>('all');
  const [q, setQ] = useState('');
  const [stage, setStage] = useState(0);
  const [limit, setLimit] = useState(60);
  useEffect(() => { setLimit(60); setStage(0); }, [deck]);
  if (!data) return <Loading />;
  const def = deckOf(deck);
  const all = def.items(data);
  const known = store.knownSet[deck] || new Set<string>();
  const list = all.filter((x: any) => {
    if (deck === 'saja' && stage && x.st !== stage) return false;
    if (filter === 'todo' && known.has(x.id)) return false;
    if (filter === 'known' && !known.has(x.id)) return false;
    if (q) { const s = JSON.stringify(x).toLowerCase(); if (!s.includes(q.toLowerCase())) return false; }
    return true;
  });
  const addVocab = (x: any) => {
    const lang = def.lang || (deck === 'hanja' || deck === 'saja' || deck === 'cheonja' ? '한자' : '기타');
    store.saveRecord({ id: newId(), kind: 'vocab', lang, word: def.front(x), meaning: def.back(x), example: [def.sub?.(x), def.detail?.(x)].filter(Boolean).join(' / '), known: false })
      .then(() => alert('단어장에 담았습니다.'));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {DECKS.map(d => {
          const total = d.items(data).length, kn = store.knownSet[d.id]?.size || 0;
          return (
            <button key={d.id} onClick={() => setDeck(d.id)} className={cn('px-3 py-2 rounded-xl border text-left transition-colors', deck === d.id ? 'bg-accent-color text-on-accent border-accent-color' : 'bg-surface border-border-color text-text-main hover:border-accent-color')}>
              <div className="text-xs font-bold">{d.label}</div>
              <div className={cn('text-[10px] mt-0.5', deck === d.id ? 'text-on-accent/80' : 'text-text-muted')}>{kn} / {total} 외움</div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex p-1 bg-surface border border-border-color rounded-full">
          {(['list', 'card', 'quiz'] as const).map(mm => (
            <button key={mm} onClick={() => setMode(mm)} className={cn('px-3 py-1 rounded-full text-xs font-bold', mode === mm ? 'bg-accent-color text-on-accent' : 'text-text-muted')}>{mm === 'list' ? '목록' : mm === 'card' ? '카드' : '퀴즈'}</button>
          ))}
        </div>
        <div className="flex p-1 bg-surface border border-border-color rounded-full">
          {(['all', 'todo', 'known'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={cn('px-3 py-1 rounded-full text-xs font-bold', filter === f ? 'bg-accent-color text-on-accent' : 'text-text-muted')}>{f === 'all' ? '전체' : f === 'todo' ? '아직' : '외운 것'}</button>
          ))}
        </div>
        {deck === 'saja' && (
          <select value={stage} onChange={e => setStage(Number(e.target.value))} className="h-9 px-3 bg-surface border border-border-color rounded-full text-xs font-bold outline-none">
            <option value={0}>난이도 전체</option>
            {[1, 2, 3, 4, 5].map(s => <option key={s} value={s}>{s}단계{s === 1 ? ' (쉬움)' : s === 5 ? ' (어려움)' : ''}</option>)}
          </select>
        )}
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/60" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="검색" className="w-full h-9 pl-9 pr-3 bg-surface border border-border-color rounded-full text-sm outline-none focus:border-accent-color" />
        </div>
        <span className="text-xs text-text-muted">{list.length}개</span>
      </div>

      {list.length === 0 ? <div className="p-10 text-center text-sm text-text-muted bg-surface border border-border-color rounded-2xl">해당하는 항목이 없습니다.</div> :
        mode === 'list' ? (
          <>
            <div className={cn('grid gap-3', deck === 'law' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3')}>
              {list.slice(0, limit).map((x: any) => (
                <div key={x.id} className="bg-surface border border-border-color rounded-2xl p-4 flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className={cn('font-bold text-text-main break-words', def.serif ? 'font-serif text-2xl' : 'text-base')}>{def.front(x)}</div>
                      {def.sub && def.sub(x) && <div className="text-xs text-accent-color font-bold mt-0.5">{def.sub(x)}</div>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {def.voice && <SpeakBtn text={def.front(x)} lang={def.voice} small />}
                      <KnownBtn small known={known.has(x.id)} onClick={() => store.setKnown(deck, x.id, !known.has(x.id))} />
                    </div>
                  </div>
                  <div className={cn('text-sm text-text-main mt-2 leading-relaxed', deck === 'law' && 'whitespace-pre-line text-[13px]')}>{def.back(x)}</div>
                  {def.detail && def.detail(x) && <div className="text-[11px] text-text-muted mt-1.5 whitespace-pre-line leading-relaxed">{def.detail(x)}</div>}
                  {deck !== 'law' && <button onClick={() => addVocab(x)} className="mt-auto pt-2 self-start text-[11px] text-text-muted hover:text-text-main flex items-center gap-1"><Plus size={11} /> 단어장에 담기</button>}
                </div>
              ))}
            </div>
            {list.length > limit && <button onClick={() => setLimit(limit + 90)} className="w-full h-10 rounded-xl bg-surface border border-border-color text-sm font-bold text-text-muted">더 보기 ({list.length - limit}개 남음)</button>}
          </>
        ) : mode === 'card' ? <FlashCards key={deck + filter + stage + q} def={def} list={list} known={known} onKnown={(id, v) => store.setKnown(deck, id, v)} />
          : <Quiz key={deck + filter + stage + q} def={def} list={list} pool={all} onKnown={(id) => store.setKnown(deck, id, true)} />}
    </div>
  );
}

function shuffleArr<T>(a: T[]) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

function FlashCards({ def, list, known, onKnown }: { def: DeckDef; list: any[]; known: Set<string>; onKnown: (id: string, v: boolean) => void }) {
  const [order, setOrder] = useState(list);
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const x = order[Math.min(i, order.length - 1)];
  if (!x) return null;
  const go = (n: number) => { setFlip(false); setI(((i + n) % order.length + order.length) % order.length); };
  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={() => setFlip(!flip)} className="w-full min-h-[280px] bg-surface border border-border-color rounded-3xl shadow-sm p-8 flex flex-col items-center justify-center text-center">
        {!flip ? (
          <>
            <div className={cn('font-bold text-text-main break-words', def.serif ? 'font-serif text-5xl tracking-widest' : 'text-3xl')}>{def.front(x)}</div>
            {def.sub && def.sub(x) && def.id !== 'saja' && def.id !== 'cheonja' && def.id !== 'hanja' && <div className="text-sm text-text-muted mt-3">{def.sub(x)}</div>}
            <div className="text-xs text-text-muted/70 mt-6 flex items-center gap-1"><RotateCcw size={12} /> 눌러서 뒤집기</div>
          </>
        ) : (
          <>
            {def.sub && def.sub(x) && <div className="text-sm font-bold text-accent-color mb-2">{def.sub(x)}</div>}
            <div className={cn('text-text-main leading-relaxed', def.id === 'law' ? 'text-sm text-left whitespace-pre-line max-h-[360px] overflow-y-auto' : 'text-xl font-bold')}>{def.back(x)}</div>
            {def.detail && def.detail(x) && <div className="text-xs text-text-muted mt-3 whitespace-pre-line">{def.detail(x)}</div>}
          </>
        )}
      </button>
      <div className="flex items-center justify-between mt-4 gap-2">
        <button onClick={() => go(-1)} className="w-10 h-10 rounded-full bg-surface border border-border-color flex items-center justify-center"><ChevronLeft size={18} /></button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">{i + 1} / {order.length}</span>
          <button onClick={() => { setOrder(shuffleArr(list)); setI(0); setFlip(false); }} className="h-8 px-3 rounded-full bg-surface border border-border-color text-xs font-bold text-text-muted flex items-center gap-1"><Shuffle size={13} /> 섞기</button>
          <KnownBtn known={known.has(x.id)} onClick={() => { onKnown(x.id, !known.has(x.id)); if (!known.has(x.id)) go(1); }} />
        </div>
        <button onClick={() => go(1)} className="w-10 h-10 rounded-full bg-surface border border-border-color flex items-center justify-center"><ChevronRight size={18} /></button>
      </div>
    </div>
  );
}

function Quiz({ def, list, pool, onKnown }: { def: DeckDef; list: any[]; pool: any[]; onKnown: (id: string) => void }) {
  const isLaw = def.id === 'law';
  const make = () => {
    const x = list[Math.floor(Math.random() * list.length)];
    const ans = isLaw ? `${x.no} (${x.t})` : def.back(x);
    const others = shuffleArr(pool.filter(p => p.id !== x.id)).slice(0, 12).map(p => isLaw ? `${p.no} (${p.t})` : def.back(p)).filter(s => s !== ans);
    const opts = shuffleArr([ans, ...Array.from(new Set(others)).slice(0, 3)]);
    return { x, ans, opts };
  };
  const [cur, setCur] = useState(make);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState({ ok: 0, n: 0 });
  const pick = (o: string) => {
    if (picked) return;
    setPicked(o);
    const ok = o === cur.ans;
    setScore(s => ({ ok: s.ok + (ok ? 1 : 0), n: s.n + 1 }));
  };
  const next = () => { setPicked(null); setCur(make()); };
  const x = cur.x;
  const question = isLaw ? (x.x.length > 220 ? x.x.slice(0, 220) + '…' : x.x) : def.front(x);
  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-xs text-text-muted text-right mb-2">맞힌 문제 {score.ok} / {score.n}</div>
      <div className="bg-surface border border-border-color rounded-3xl p-8 text-center shadow-sm">
        <div className="text-[11px] font-bold text-text-muted mb-3">{isLaw ? '어느 조문일까요?' : '뜻을 고르세요'}</div>
        <div className={cn('text-text-main break-words', isLaw ? 'text-sm text-left whitespace-pre-line leading-relaxed' : def.serif ? 'font-serif text-5xl font-bold tracking-widest' : 'text-3xl font-bold')}>{question}</div>
        {!isLaw && def.sub && def.sub(x) && picked && <div className="text-sm text-accent-color font-bold mt-3">{def.sub(x)}</div>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
        {cur.opts.map(o => {
          const state = !picked ? '' : o === cur.ans ? 'ok' : o === picked ? 'bad' : '';
          return (
            <button key={o} onClick={() => pick(o)} className={cn('p-4 rounded-2xl border text-sm font-bold text-left transition-colors',
              state === 'ok' ? 'bg-emerald-50 border-emerald-400 text-emerald-800' : state === 'bad' ? 'bg-red-50 border-red-300 text-red-700' : 'bg-surface border-border-color text-text-main hover:border-accent-color')}>{o}</button>
          );
        })}
      </div>
      {picked && (
        <div className="flex items-center justify-center gap-2 mt-4">
          {picked === cur.ans && <button onClick={() => { onKnown(x.id); next(); }} className="h-10 px-4 rounded-full bg-surface border border-border-color text-sm font-bold flex items-center gap-1"><Check size={14} /> 외웠어요로 표시하고 다음</button>}
          <button onClick={next} className="h-10 px-5 rounded-full bg-accent-color text-on-accent text-sm font-bold">다음 문제</button>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// 기록 (독서 · 필사 · 여행 · 관람 · 음악 · 단어장)
// =====================================================================
function RecordTab({ kind, store }: { kind: RecordKind; store: Store }) {
  const form = FORMS[kind];
  const [editing, setEditing] = useState<CultureRecord | null>(null);
  const [q, setQ] = useState('');
  const [fil, setFil] = useState('');
  const statusField = form.fields.find(f => f.key === 'status' || f.key === 'type' || f.key === 'lang' || f.key === 'genre');
  const list = store.items.filter(r => r.kind === kind)
    .filter(r => !fil || (statusField && r[statusField.key] === fil) || (fil === '★' && r.fav))
    .filter(r => !q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (recordDate(b) || '').localeCompare(recordDate(a) || '') || (b.createdAt || 0) - (a.createdAt || 0));
  const all = store.items.filter(r => r.kind === kind);
  const blank = (): CultureRecord => {
    const r: CultureRecord = { id: '', kind };
    form.fields.forEach(f => { if (f.type === 'date' && (f.key === 'date' || f.key === 'start')) r[f.key] = iso(new Date()); if (f.type === 'select' && f.options) r[f.key] = f.options[0]; });
    return r;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setEditing(blank())} className="h-10 px-4 rounded-full bg-accent-color text-on-accent text-sm font-bold flex items-center gap-1.5 shadow-sm"><Plus size={16} /> 새 {form.title}</button>
        {statusField?.options && (
          <div className="flex p-1 bg-surface border border-border-color rounded-full overflow-x-auto no-scrollbar max-w-full">
            <button onClick={() => setFil('')} className={cn('px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap', !fil ? 'bg-accent-color text-on-accent' : 'text-text-muted')}>전체 {all.length}</button>
            {statusField.options.map(o => {
              const n = all.filter(r => r[statusField.key] === o).length;
              return <button key={o} onClick={() => setFil(o)} className={cn('px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap', fil === o ? 'bg-accent-color text-on-accent' : 'text-text-muted')}>{o} {n}</button>;
            })}
            {kind === 'music' && <button onClick={() => setFil('★')} className={cn('px-3 py-1 rounded-full text-xs font-bold', fil === '★' ? 'bg-accent-color text-on-accent' : 'text-text-muted')}>즐겨찾기</button>}
          </div>
        )}
        <div className="relative flex-1 min-w-[160px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/60" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="검색" className="w-full h-10 pl-9 pr-3 bg-surface border border-border-color rounded-full text-sm outline-none focus:border-accent-color" />
        </div>
      </div>

      {list.length === 0 ? (
        <div className="p-10 text-center bg-surface border border-border-color rounded-2xl">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-soft flex items-center justify-center text-text-muted mb-3">{form.icon}</div>
          <p className="text-sm text-text-muted">{form.empty}</p>
        </div>
      ) : kind === 'vocab' ? <VocabList list={list} store={store} onEdit={setEditing} /> : (
        <div className={cn('grid gap-3', kind === 'copy' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3')}>
          {list.map(r => <RecordCard key={r.id} r={r} onClick={() => setEditing({ ...r })} />)}
        </div>
      )}

      {editing && <RecordEditor rec={editing} onClose={() => setEditing(null)} store={store} />}
    </div>
  );
}

function RecordCard({ r, onClick }: { r: CultureRecord; onClick: () => void }) {
  const tag = (t?: string) => t ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-soft border border-line-soft text-text-muted">{t}</span> : null;
  let head = r.title || r.source || '(제목 없음)', sub = '', body = '', tags: React.ReactNode = null;
  if (r.kind === 'book') { sub = r.author || ''; body = r.quote ? `“${r.quote}”` : r.review || ''; tags = tag(r.status); }
  if (r.kind === 'copy') { head = r.source || '필사'; sub = [r.author, r.date].filter(Boolean).join(' · '); body = r.body || ''; }
  if (r.kind === 'trip') {
    sub = [r.place, r.start && `${r.start}${r.end && r.end !== r.start ? ` ~ ${r.end}` : ''}`].filter(Boolean).join(' · ');
    body = r.review || r.plan || ''; tags = tag(r.status);
  }
  if (r.kind === 'show') { sub = [r.date, r.venue].filter(Boolean).join(' · '); body = r.review || ''; tags = tag(r.type); }
  if (r.kind === 'music') { sub = [r.artist, r.performer].filter(Boolean).join(' · '); body = r.note || ''; tags = <>{tag(r.genre)}{r.fav && <Heart size={13} className="text-sun fill-current" />}</>; }
  const packing: { t: string; d: boolean }[] = r.kind === 'trip' ? (r.packing || []) : [];
  return (
    <button onClick={onClick} className="text-left bg-surface border border-border-color rounded-2xl p-4 hover:border-accent-color transition-colors flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={cn('font-bold text-text-main break-words', r.kind === 'copy' ? 'font-serif' : '')}>{head}</div>
          {sub && <div className="text-xs text-text-muted mt-0.5">{sub}</div>}
        </div>
        <div className="flex items-center gap-1 shrink-0">{tags}</div>
      </div>
      {body && <p className={cn('text-sm text-text-main/85 mt-2 leading-relaxed whitespace-pre-line', r.kind === 'copy' ? 'font-serif line-clamp-6' : 'line-clamp-3')}>{body}</p>}
      {packing.length > 0 && <div className="text-[11px] text-text-muted mt-2">준비물 {packing.filter(p => p.d).length}/{packing.length}</div>}
      {r.rating ? <div className="mt-2"><Stars value={r.rating} size={13} /></div> : null}
    </button>
  );
}

function VocabList({ list, store, onEdit }: { list: CultureRecord[]; store: Store; onEdit: (r: CultureRecord) => void }) {
  const [hide, setHide] = useState(false);
  return (
    <div className="bg-surface border border-border-color rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-line-soft">
        <span className="text-xs text-text-muted">외운 단어 {list.filter(r => r.known).length} / {list.length}</span>
        <button onClick={() => setHide(!hide)} className="text-xs font-bold text-text-muted flex items-center gap-1">{hide ? <Eye size={13} /> : <EyeOff size={13} />} {hide ? '뜻 보이기' : '뜻 가리기'}</button>
      </div>
      {list.map(r => <VocabRow key={r.id} r={r} hide={hide} store={store} onEdit={onEdit} />)}
    </div>
  );
}
function VocabRow({ r, hide, store, onEdit }: { r: CultureRecord; hide: boolean; store: Store; onEdit: (r: CultureRecord) => void }) {
  const [peek, setPeek] = useState(false);
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-line-soft last:border-0">
      <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-soft text-text-muted shrink-0 w-14 text-center">{r.lang}</span>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-text-main break-words">{r.word}</div>
        <button onClick={() => setPeek(!peek)} className="text-sm text-left text-text-muted break-words">{hide && !peek ? '••••••  (눌러서 보기)' : r.meaning}</button>
        {r.example && (!hide || peek) && <div className="text-[11px] text-text-muted/80 mt-0.5 break-words">{r.example}</div>}
      </div>
      <KnownBtn small known={!!r.known} onClick={() => store.saveRecord({ ...r, known: !r.known })} />
      <button onClick={() => onEdit({ ...r })} className="w-8 h-8 rounded-full hover:bg-soft flex items-center justify-center text-text-muted"><Pencil size={14} /></button>
    </div>
  );
}

function RecordEditor({ rec, onClose, store }: { rec: CultureRecord; onClose: () => void; store: Store }) {
  const form = FORMS[rec.kind];
  const [r, setR] = useState<CultureRecord>(rec);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setR(p => ({ ...p, [k]: v }));
  const save = async () => {
    const miss = form.fields.find(f => f.required && !String(r[f.key] || '').trim());
    if (miss) { alert(`${miss.label}을(를) 입력해 주세요.`); return; }
    setSaving(true);
    try { await store.saveRecord(r); onClose(); } catch (e: any) { alert('저장하지 못했습니다: ' + (e?.message || e)); } finally { setSaving(false); }
  };
  const del = async () => { if (!rec.id || !confirm('이 기록을 삭제할까요?')) return; await store.removeRecord(rec.id); onClose(); };
  const inputCls = 'w-full h-10 px-3 bg-bg-primary border border-border-color rounded-lg text-sm outline-none focus:border-accent-color';
  return (
    <div className="fixed inset-0 z-[200] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-surface w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-lg font-bold flex items-center gap-2">{form.icon}{rec.id ? form.title + ' 수정' : '새 ' + form.title}</h3>
          <button onClick={onClose} className="w-9 h-9 rounded-full hover:bg-soft flex items-center justify-center"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {form.fields.map(f => (
            <label key={f.key} className={cn('flex flex-col gap-1', f.half ? 'col-span-2 sm:col-span-1' : 'col-span-2')}>
              <span className="text-[11px] font-bold text-text-muted">{f.label}{f.required && ' *'}</span>
              {f.type === 'text' && <input className={inputCls} value={r[f.key] || ''} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder} />}
              {f.type === 'number' && <input className={inputCls} type="number" inputMode="numeric" value={r[f.key] ?? ''} onChange={e => set(f.key, e.target.value === '' ? '' : Number(e.target.value))} />}
              {f.type === 'date' && <input className={inputCls} type="date" value={r[f.key] || ''} onChange={e => set(f.key, e.target.value)} />}
              {f.type === 'textarea' && <textarea className={cn(inputCls, 'h-auto py-2 leading-relaxed', f.key === 'body' && 'font-serif text-[15px]')} rows={f.rows || 3} value={r[f.key] || ''} onChange={e => set(f.key, e.target.value)} />}
              {f.type === 'select' && <select className={inputCls} value={r[f.key] || ''} onChange={e => set(f.key, e.target.value)}>{f.options!.map(o => <option key={o}>{o}</option>)}</select>}
              {f.type === 'rating' && <Stars value={r[f.key] || 0} onChange={v => set(f.key, v)} size={22} />}
              {f.type === 'bool' && <button type="button" onClick={() => set(f.key, !r[f.key])} className={cn('h-10 rounded-lg border text-sm font-bold', r[f.key] ? 'bg-accent-color text-on-accent border-accent-color' : 'bg-bg-primary border-border-color text-text-muted')}>{r[f.key] ? '예' : '아니요'}</button>}
              {f.type === 'checklist' && <ChecklistEditor value={r[f.key] || []} onChange={v => set(f.key, v)} />}
            </label>
          ))}
        </div>
        {rec.kind === 'trip' && r.start && (
          <button onClick={() => downloadIcs(`여행: ${r.title || ''}`, r.start, r.end, [r.place, r.plan].filter(Boolean).join('\n'))} className="mt-4 h-9 px-3 rounded-full border border-border-color text-xs font-bold text-text-muted flex items-center gap-1.5"><CalendarDays size={13} /> 아이폰 캘린더에 추가 (.ics)</button>
        )}
        <div className="flex items-center justify-between gap-2 mt-5">
          {rec.id ? <button onClick={del} className="h-10 px-4 rounded-full text-sm font-bold text-red-600 flex items-center gap-1"><Trash2 size={15} /> 삭제</button> : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="h-10 px-4 rounded-full border border-border-color text-sm font-bold text-text-muted">취소</button>
            <button onClick={save} disabled={saving} className="h-10 px-5 rounded-full bg-accent-color text-on-accent text-sm font-bold disabled:opacity-60">{saving ? '저장 중…' : '저장'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChecklistEditor({ value, onChange }: { value: { t: string; d: boolean }[]; onChange: (v: { t: string; d: boolean }[]) => void }) {
  const [txt, setTxt] = useState('');
  const add = () => { const t = txt.trim(); if (!t) return; onChange([...value, { t, d: false }]); setTxt(''); };
  const presets = ['신분증', '충전기', '보조배터리', '상비약', '우산', '세면도구', '카드·현금', '여권'];
  return (
    <div className="space-y-2">
      {value.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <button type="button" onClick={() => onChange(value.map((x, j) => j === i ? { ...x, d: !x.d } : x))} className={cn('w-5 h-5 rounded border flex items-center justify-center shrink-0', it.d ? 'bg-accent-color border-accent-color text-on-accent' : 'border-border-color')}>{it.d && <Check size={12} />}</button>
          <span className={cn('text-sm flex-1', it.d && 'line-through text-text-muted')}>{it.t}</span>
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-text-muted"><X size={14} /></button>
        </div>
      ))}
      <div className="flex gap-2">
        <input value={txt} onChange={e => setTxt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder="준비물 입력 후 Enter" className="flex-1 h-9 px-3 bg-bg-primary border border-border-color rounded-lg text-sm outline-none" />
        <button type="button" onClick={add} className="h-9 px-3 rounded-lg bg-soft border border-border-color text-xs font-bold">추가</button>
      </div>
      <div className="flex flex-wrap gap-1">
        {presets.filter(p => !value.some(v => v.t === p)).map(p => (
          <button type="button" key={p} onClick={() => onChange([...value, { t: p, d: false }])} className="h-6 px-2 rounded-full bg-soft text-[10px] font-bold text-text-muted">+ {p}</button>
        ))}
      </div>
    </div>
  );
}

// =====================================================================
// 연간 기록
// =====================================================================
function YearTab({ data, store }: { data: StudyData | null; store: Store }) {
  const years = useMemo(() => {
    const s = new Set<number>([new Date().getFullYear()]);
    store.items.forEach(r => { const d = recordDate(r); if (d) s.add(Number(d.slice(0, 4))); });
    return Array.from(s).sort((a, b) => b - a);
  }, [store.items]);
  const [year, setYear] = useState(new Date().getFullYear());
  const inYear = store.items.filter(r => recordDate(r).startsWith(String(year)));
  const count = (k: RecordKind, pred?: (r: CultureRecord) => boolean) => inYear.filter(r => r.kind === k && (!pred || pred(r))).length;
  const months = Array.from({ length: 12 }, (_, i) => {
    const mm = `${year}-${pad(i + 1)}`;
    const per: Partial<Record<RecordKind, number>> = {};
    inYear.forEach(r => { if (recordDate(r).startsWith(mm)) per[r.kind] = (per[r.kind] || 0) + 1; });
    return per;
  });
  const maxM = Math.max(1, ...months.map(p => Object.values(p).reduce((a, b) => a + (b || 0), 0)));
  const summary: { k: RecordKind; label: string; n: number; sub: string }[] = [
    { k: 'book', label: '독서', n: count('book', r => r.status === '완독'), sub: `읽는 중 ${count('book', r => r.status === '읽는 중')}권` },
    { k: 'copy', label: '필사', n: count('copy'), sub: '편' },
    { k: 'trip', label: '여행', n: count('trip', r => r.status === '다녀옴'), sub: `계획 ${count('trip', r => r.status === '계획 중')}건` },
    { k: 'show', label: '관람', n: count('show'), sub: '공연·전시·영화' },
    { k: 'music', label: '음악', n: count('music'), sub: `즐겨찾기 ${count('music', r => !!r.fav)}곡` },
    { k: 'vocab', label: '단어장', n: count('vocab'), sub: `외움 ${count('vocab', r => !!r.known)}개` },
  ];
  const best = inYear.filter(r => (r.rating || 0) >= 4).sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 8);
  const spent = inYear.filter(r => r.kind === 'trip').reduce((a, r) => a + (Number(r.spent) || 0), 0);
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), items: store.items, progress: store.progress }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `교양기록_백업_${iso(new Date())}.json`; document.body.appendChild(a); a.click(); a.remove();
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {years.map(y => <button key={y} onClick={() => setYear(y)} className={cn('h-9 px-4 rounded-full text-sm font-bold border', year === y ? 'bg-accent-color text-on-accent border-accent-color' : 'bg-surface border-border-color text-text-muted')}>{y}년</button>)}
        <button onClick={exportJson} className="ml-auto h-9 px-3 rounded-full bg-surface border border-border-color text-xs font-bold text-text-muted flex items-center gap-1.5"><Download size={13} /> 기록 백업 (JSON)</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {summary.map(s => (
          <div key={s.k} className="bg-surface border border-border-color rounded-2xl p-4">
            <div className="text-[11px] font-black flex items-center gap-1.5" style={{ color: KIND_COLOR[s.k] }}>{FORMS[s.k].icon}{s.label}</div>
            <div className="font-serif text-3xl font-bold mt-1">{s.n}</div>
            <div className="text-[11px] text-text-muted">{s.sub}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2" title={`${year}년 월별 기록`} icon={<BarChart3 size={13} />}>
          <div className="flex items-end gap-1.5 h-44">
            {months.map((p, i) => {
              const tot = Object.values(p).reduce((a, b) => a + (b || 0), 0);
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                  <div className="text-[10px] text-text-muted mb-1">{tot || ''}</div>
                  <div className="w-full max-w-[28px] flex flex-col-reverse rounded-md overflow-hidden" style={{ height: `${(tot / maxM) * 100}%` }}>
                    {(Object.keys(p) as RecordKind[]).map(k => <div key={k} style={{ flex: p[k], background: KIND_COLOR[k] }} />)}
                  </div>
                  <div className="text-[10px] text-text-muted mt-1">{i + 1}월</div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-3">
            {(Object.keys(KIND_COLOR) as RecordKind[]).map(k => <span key={k} className="text-[10px] text-text-muted flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: KIND_COLOR[k] }} />{FORMS[k].title}</span>)}
          </div>
          {spent > 0 && <div className="text-xs text-text-muted mt-3">여행 지출 합계 {spent.toLocaleString()}원</div>}
        </Card>
        <Card title="학습 진도 (누적)" icon={<GraduationCap size={13} />}>
          {!data ? <div className="text-sm text-text-muted">불러오는 중…</div> : (
            <div className="space-y-2.5">
              {DECKS.map(d => {
                const total = d.items(data).length, kn = store.knownSet[d.id]?.size || 0;
                return (
                  <div key={d.id}>
                    <div className="flex justify-between text-xs"><span className="font-bold">{d.label}</span><span className="text-text-muted">{kn} / {total}</span></div>
                    <div className="h-2 rounded-full bg-soft mt-1 overflow-hidden"><div className="h-full bg-accent-color rounded-full" style={{ width: `${total ? (kn / total) * 100 : 0}%` }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
      <Card title="올해의 베스트 (별점 4점 이상)" icon={<Star size={13} />}>
        {best.length === 0 ? <p className="text-sm text-text-muted">별점을 매긴 기록이 쌓이면 여기에 모입니다.</p> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {best.map(r => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl bg-soft">
                <span className="w-2 h-8 rounded-full shrink-0" style={{ background: KIND_COLOR[r.kind] }} />
                <div className="flex-1 min-w-0"><div className="text-sm font-bold truncate">{r.title || r.source}</div><div className="text-[11px] text-text-muted">{FORMS[r.kind].title} · {recordDate(r)}</div></div>
                <Stars value={r.rating} size={12} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// =====================================================================
// 첫 화면에 넣는 작은 ‘오늘의 교양’ 띠
// =====================================================================
export function TodayCultureMini({ onOpen }: { onOpen: () => void }) {
  const { data } = useStudyData();
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('eduCultureMiniHide') === iso(new Date()); } catch { return false; } });
  if (!data || hidden) return null;
  const d = new Date();
  const s = pickDaily(data.saja, d)!, en = pickDaily(data.en, d)!, ja = pickDaily(data.ja, d)!;
  return (
    <div className="mb-6 bg-surface border border-border-color rounded-2xl px-4 py-3 shadow-sm flex flex-wrap items-center gap-x-5 gap-y-2">
      <button onClick={onOpen} className="flex items-center gap-2 text-left">
        <Sparkles size={15} className="text-accent-color shrink-0" />
        <span className="font-serif text-lg font-bold tracking-wider">{s.h}</span>
        <span className="text-sm font-bold text-accent-color">{s.r}</span>
        <span className="text-sm text-text-muted hidden sm:inline">{s.m}</span>
      </button>
      <span className="text-sm hidden md:inline"><span className="text-[10px] font-black text-text-muted mr-1">EN</span><b>{en.w}</b> <span className="text-text-muted">{en.k}</span></span>
      <span className="text-sm hidden lg:inline"><span className="text-[10px] font-black text-text-muted mr-1">JA</span>{ja.t} <span className="text-text-muted">{ja.k}</span></span>
      <div className="ml-auto flex items-center gap-1">
        <button onClick={onOpen} className="h-8 px-3 rounded-full bg-accent-color text-on-accent text-xs font-bold">교양 열기</button>
        <button title="오늘은 숨기기" onClick={() => { try { localStorage.setItem('eduCultureMiniHide', iso(new Date())); } catch { /* */ } setHidden(true); }} className="w-8 h-8 rounded-full hover:bg-soft flex items-center justify-center text-text-muted"><X size={14} /></button>
      </div>
    </div>
  );
}


