// =====================================================================
// 교양 — 영문법 탭 · 오사카 여행 가이드 탭
// =====================================================================
import React, { useState } from 'react';
import { Volume2, ExternalLink, Plane, TrainFront, Ticket, Landmark, MessageCircle, UtensilsCrossed, Lightbulb, Phone, Check, ListChecks, BookText } from 'lucide-react';
import { cn } from '../lib/utils';
import { GRAMMAR } from './grammar';
import { OSAKA_UPDATED, CHECKLIST, ROUTES, ARRIVAL_STEPS, RAPIT_STEPS, USJ, HISTORY, PHRASES, FOODS, TIPS, EMERGENCY } from './osaka';
import { newId, type CultureRecord } from './cultureData';
import { Plus, Pencil } from 'lucide-react';

// ---------------------------------------------------------------------
// 소리 내어 읽기 (브라우저 음성 합성)
// ---------------------------------------------------------------------
export function speak(text: string, lang: 'en-US' | 'ja-JP' | 'es-ES') {
  try {
    const synth = window.speechSynthesis; if (!synth) { alert('이 브라우저는 음성 읽기를 지원하지 않습니다.'); return; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang; u.rate = lang === 'en-US' ? 0.9 : 0.85;
    const v = synth.getVoices().find(x => x.lang.replace('_', '-').startsWith(lang.slice(0, 2)));
    if (v) u.voice = v;
    synth.speak(u);
  } catch { /* 무시 */ }
}
export function SpeakBtn({ text, lang, small }: { text: string; lang: 'en-US' | 'ja-JP' | 'es-ES'; small?: boolean }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); speak(text, lang); }} title="듣기" className={cn('rounded-full border border-border-color text-text-muted hover:text-text-main flex items-center justify-center shrink-0', small ? 'w-7 h-7' : 'w-8 h-8')}>
      <Volume2 size={small ? 13 : 15} />
    </button>
  );
}

// =====================================================================
// 영문법
// =====================================================================
export function GrammarTab({ openStudy }: { openStudy: () => void }) {
  const [sel, setSel] = useState(GRAMMAR[0].id);
  const [hideKo, setHideKo] = useState(false);
  const l = GRAMMAR.find(g => g.id === sel)!;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      <div className="lg:col-span-1">
        <div className="flex lg:flex-col gap-1.5 overflow-x-auto no-scrollbar lg:overflow-visible bg-surface border border-border-color rounded-2xl p-2">
          {GRAMMAR.map((g, i) => (
            <button key={g.id} onClick={() => setSel(g.id)} className={cn('text-left px-3 py-2 rounded-xl text-sm font-bold whitespace-nowrap lg:whitespace-normal', sel === g.id ? 'bg-accent-color text-on-accent' : 'text-text-main hover:bg-soft')}>
              <span className={cn('text-[10px] mr-1.5', sel === g.id ? 'text-on-accent/70' : 'text-text-muted')}>{String(i + 1).padStart(2, '0')}</span>{g.title}
            </button>
          ))}
        </div>
        <button onClick={openStudy} className="hidden lg:flex mt-3 w-full h-10 rounded-xl bg-surface border border-border-color text-xs font-bold text-text-muted items-center justify-center gap-1.5"><BookText size={14} /> 예문 카드·퀴즈로 연습</button>
      </div>
      <div className="lg:col-span-3 space-y-4">
        <div className="bg-surface border border-border-color rounded-2xl p-5 sm:p-6 shadow-sm">
          <h3 className="font-serif text-2xl font-bold">{l.title}</h3>
          <p className="text-sm text-text-muted mt-2 leading-relaxed">{l.summary}</p>
          <ul className="mt-4 space-y-2">
            {l.points.map((p, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed"><span className="w-5 h-5 rounded-full bg-soft text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span><span>{p}</span></li>
            ))}
          </ul>
          {l.tip && <div className="mt-4 p-3 rounded-xl bg-soft text-sm flex gap-2"><Lightbulb size={16} className="text-amber-500 shrink-0 mt-0.5" /><span>{l.tip}</span></div>}
        </div>
        <div className="bg-surface border border-border-color rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-line-soft">
            <span className="text-xs font-black text-text-muted">예문 {l.examples.length}개</span>
            <button onClick={() => setHideKo(!hideKo)} className="text-xs font-bold text-text-muted">{hideKo ? '해석 보이기' : '해석 가리기'}</button>
          </div>
          {l.examples.map((e, i) => <GrammarRow key={i} e={e} hideKo={hideKo} />)}
        </div>
        <button onClick={openStudy} className="lg:hidden w-full h-10 rounded-xl bg-surface border border-border-color text-xs font-bold text-text-muted flex items-center justify-center gap-1.5"><BookText size={14} /> 예문 카드·퀴즈로 연습</button>
      </div>
    </div>
  );
}
function GrammarRow({ e, hideKo }: { e: { en: string; ko: string; note?: string }; hideKo: boolean }) {
  const [peek, setPeek] = useState(false);
  return (
    <div className="px-5 py-3.5 border-b border-line-soft last:border-0 flex gap-3">
      <SpeakBtn text={e.en} lang="en-US" small />
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold text-text-main leading-snug">{e.en}</div>
        <button onClick={() => setPeek(!peek)} className="text-sm text-left text-text-muted mt-0.5">{hideKo && !peek ? '••••  (눌러서 해석 보기)' : e.ko}</button>
        {e.note && <div className="text-[11px] font-bold text-accent-color mt-1">{e.note}</div>}
      </div>
    </div>
  );
}

// =====================================================================
// 오사카 여행 가이드
// =====================================================================
type Sec = 'prep' | 'airport' | 'usj' | 'history' | 'talk' | 'food' | 'tips';
const SECS: { id: Sec; label: string; icon: React.ReactNode }[] = [
  { id: 'prep', label: '준비물', icon: <ListChecks size={14} /> },
  { id: 'airport', label: '공항 → 시내', icon: <TrainFront size={14} /> },
  { id: 'usj', label: 'USJ', icon: <Ticket size={14} /> },
  { id: 'history', label: '오사카 역사', icon: <Landmark size={14} /> },
  { id: 'talk', label: '필수 회화', icon: <MessageCircle size={14} /> },
  { id: 'food', label: '맛집', icon: <UtensilsCrossed size={14} /> },
  { id: 'tips', label: '생활 팁 · 긴급', icon: <Lightbulb size={14} /> },
];

function Box({ title, children, icon, className }: { title?: string; children: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-surface border border-border-color rounded-2xl p-5 shadow-sm', className)}>
      {title && <h3 className="font-bold text-text-main mb-3 flex items-center gap-2">{icon}{title}</h3>}
      {children}
    </div>
  );
}
const Bullets = ({ items }: { items: string[] }) => (
  <ul className="space-y-2">{items.map((t, i) => <li key={i} className="text-sm leading-relaxed flex gap-2"><span className="w-1.5 h-1.5 rounded-full bg-accent-color mt-2 shrink-0" /><span>{t}</span></li>)}</ul>
);
const Steps = ({ items }: { items: { t: string; d: string }[] }) => (
  <ol className="space-y-3">
    {items.map((s, i) => (
      <li key={i} className="flex gap-3">
        <span className="w-7 h-7 rounded-full bg-accent-color text-on-accent text-xs font-black flex items-center justify-center shrink-0">{i + 1}</span>
        <div><div className="text-sm font-bold">{s.t}</div><div className="text-sm text-text-muted leading-relaxed mt-0.5">{s.d}</div></div>
      </li>
    ))}
  </ol>
);

export function OsakaTab({ saveRecord, hasTrip, notes, onAddNote, onEditNote }: { saveRecord: (r: CultureRecord) => Promise<any>; hasTrip: boolean; notes: CultureRecord[]; onAddNote: (section: string) => void; onEditNote: (r: CultureRecord) => void }) {
  const [sec, setSec] = useState<Sec>('prep');
  const secLabel = SECS.find(s => s.id === sec)!.label;
  const myNotes = notes.filter(n => n.section === secLabel).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const [done, setDone] = useState<Record<number, boolean>>(() => { try { return JSON.parse(localStorage.getItem('eduOsakaChecklist') || '{}'); } catch { return {}; } });
  const toggle = (i: number) => { const n = { ...done, [i]: !done[i] }; setDone(n); try { localStorage.setItem('eduOsakaChecklist', JSON.stringify(n)); } catch { /* */ } };
  const addTrip = async () => {
    await saveRecord({ id: newId(), kind: 'trip', title: '오사카 여행', place: '일본 오사카', status: '계획 중', packing: CHECKLIST.map(t => ({ t, d: false })), plan: '' });
    alert('‘여행’ 탭에 오사카 여행을 만들었습니다. 날짜와 일정을 채워 보세요.');
  };
  return (
    <div className="space-y-4">
      <div className="rounded-3xl p-6 sm:p-8 bg-accent-color text-on-accent shadow-sm">
        <div className="text-xs font-bold opacity-80 flex items-center gap-1.5"><Plane size={13} /> 인천 → 간사이국제공항(KIX) · {OSAKA_UPDATED}</div>
        <h3 className="font-serif text-3xl font-bold mt-2">오사카 여행 가이드</h3>
        <p className="text-sm opacity-90 mt-2 max-w-2xl leading-relaxed">공항에서 숙소까지, 유니버설 스튜디오 재팬, 역사와 맛집, 필수 회화를 한곳에 모았습니다. 요금과 판매 방식은 자주 바뀌니 예약 전에 공식 페이지를 한 번 더 확인하세요.</p>
        {!hasTrip && <button onClick={addTrip} className="mt-4 h-9 px-4 rounded-full bg-surface text-text-main text-xs font-bold">내 여행 기록에 ‘오사카 여행’ 만들기</button>}
      </div>

      <div className="flex p-1 bg-surface border border-border-color rounded-full w-fit max-w-full shadow-sm overflow-x-auto no-scrollbar">
        {SECS.map(s => (
          <button key={s.id} onClick={() => setSec(s.id)} className={cn('px-3 sm:px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 whitespace-nowrap', sec === s.id ? 'bg-accent-color text-on-accent shadow-sm' : 'text-text-muted hover:text-text-main')}>{s.icon}{s.label}</button>
        ))}
      </div>

      <div className="bg-surface border border-border-color rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-bold flex items-center gap-1.5"><Pencil size={14} /> 내가 추가한 정보 · {secLabel} {myNotes.length > 0 && <span className="text-text-muted font-normal">{myNotes.length}</span>}</div>
          <button onClick={() => onAddNote(secLabel)} className="h-8 px-3 rounded-full bg-accent-color text-on-accent text-xs font-bold flex items-center gap-1"><Plus size={13} /> 정보 추가</button>
        </div>
        {myNotes.length === 0 ? <p className="text-xs text-text-muted mt-2">바뀐 요금, 새로 찾은 맛집, 유용한 링크를 이 항목에 직접 추가해 두세요. 계정에 저장되어 어디서나 보입니다.</p> : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
            {myNotes.map(n => (
              <div key={n.id} className="p-3 rounded-xl bg-soft">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-bold text-sm break-words">{n.title}</div>
                  <button onClick={() => onEditNote({ ...n })} className="w-7 h-7 rounded-full hover:bg-surface flex items-center justify-center text-text-muted shrink-0"><Pencil size={13} /></button>
                </div>
                {n.body && <p className="text-xs text-text-main/85 mt-1 whitespace-pre-line leading-relaxed">{n.body}</p>}
                {n.url && <a href={n.url} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-accent-color mt-1.5 inline-flex items-center gap-1 break-all"><ExternalLink size={11} /> 링크 열기</a>}
                <div className="text-[10px] text-text-muted/70 mt-1">{n.updatedAt ? new Date(n.updatedAt).toLocaleDateString('ko-KR') : ''}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {sec === 'prep' && (
        <Box title={`출발 전 체크리스트 (${Object.values(done).filter(Boolean).length}/${CHECKLIST.length})`} icon={<ListChecks size={16} />}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {CHECKLIST.map((c, i) => (
              <button key={i} onClick={() => toggle(i)} className={cn('flex items-center gap-2.5 p-3 rounded-xl border text-left text-sm', done[i] ? 'bg-soft border-line-soft text-text-muted line-through' : 'bg-surface border-border-color')}>
                <span className={cn('w-5 h-5 rounded border flex items-center justify-center shrink-0', done[i] ? 'bg-accent-color border-accent-color text-on-accent' : 'border-border-color')}>{done[i] && <Check size={12} />}</span>{c}
              </button>
            ))}
          </div>
        </Box>
      )}

      {sec === 'airport' && (
        <div className="space-y-4">
          <Box title="숙소 위치별 추천 경로" icon={<TrainFront size={16} />}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {ROUTES.map((r, i) => (
                <div key={i} className={cn('p-4 rounded-xl border', r.best ? 'border-accent-color bg-soft' : 'border-line-soft bg-surface')}>
                  <div className="flex items-center gap-2"><span className="text-xs font-black text-text-muted">숙소</span><span className="font-bold">{r.to}</span>{r.best && <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-accent-color text-on-accent">추천</span>}</div>
                  <div className="text-sm font-bold text-accent-color mt-1">{r.how}</div>
                  <div className="flex gap-3 text-xs text-text-muted mt-1"><span>⏱ {r.time}</span><span>¥ {r.fare}</span></div>
                  <p className="text-xs text-text-main/80 mt-2 leading-relaxed">{r.tip}</p>
                </div>
              ))}
            </div>
          </Box>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Box title="도착 후 순서" icon={<Plane size={16} />}><Steps items={ARRIVAL_STEPS} /></Box>
            <Box title="라피트 티켓 사는 법" icon={<Ticket size={16} />}>
              <Steps items={RAPIT_STEPS} />
              <div className="flex flex-wrap gap-2 mt-4">
                <a href="https://www.nankai.co.jp/en_railway/traffic/express/rapit.html" target="_blank" rel="noreferrer" className="h-8 px-3 rounded-full bg-accent-color text-on-accent text-xs font-bold flex items-center gap-1.5"><ExternalLink size={12} /> 난카이 라피트 공식</a>
                <a href="https://www.westjr.co.jp/travel-information/en/tickets-passes/oneway/haruka/" target="_blank" rel="noreferrer" className="h-8 px-3 rounded-full border border-border-color text-xs font-bold text-text-muted flex items-center gap-1.5"><ExternalLink size={12} /> JR 하루카 편도권</a>
                <a href="https://www.kate.co.jp/en/" target="_blank" rel="noreferrer" className="h-8 px-3 rounded-full border border-border-color text-xs font-bold text-text-muted flex items-center gap-1.5"><ExternalLink size={12} /> 공항 리무진버스</a>
              </div>
            </Box>
          </div>
        </div>
      )}

      {sec === 'usj' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Box title="입장권 기본" icon={<Ticket size={16} />}><Bullets items={USJ.tickets} /></Box>
          <Box title="익스프레스 패스 고르기" icon={<Ticket size={16} />}><Bullets items={USJ.express} /></Box>
          <Box title="익스프레스 구매 방법" icon={<Ticket size={16} />}><Bullets items={USJ.buy} /></Box>
          <Box title="슈퍼 닌텐도 월드 입장" icon={<Ticket size={16} />}><Bullets items={USJ.nintendo} /></Box>
          <Box title="대기 상황 확인 · 줄 줄이는 요령" icon={<Lightbulb size={16} />}>
            <Bullets items={USJ.wait} />
            <div className="flex flex-wrap gap-2 mt-4">
              {USJ.links.map(l => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="h-8 px-3 rounded-full border border-border-color text-xs font-bold text-text-muted flex items-center gap-1.5"><ExternalLink size={12} />{l.label}</a>)}
            </div>
          </Box>
          <Box title="키 제한 (아이와 갈 때 필수 확인)" icon={<Lightbulb size={16} />}>
            <div className="divide-y divide-line-soft">
              {USJ.height.map(([a, h]) => <div key={a} className="flex justify-between py-2 text-sm"><span>{a}</span><span className="font-bold">{h}</span></div>)}
            </div>
          </Box>
          <Box title="가는 방법" icon={<TrainFront size={16} />} className="lg:col-span-2"><Bullets items={USJ.access} /></Box>
        </div>
      )}

      {sec === 'history' && (
        <Box title="한눈에 보는 오사카 역사" icon={<Landmark size={16} />}>
          <div className="relative pl-6">
            <div className="absolute left-2 top-1 bottom-1 w-px bg-border-color" />
            {HISTORY.map((h, i) => (
              <div key={i} className="relative pb-5 last:pb-0">
                <span className="absolute -left-[22px] top-1 w-3 h-3 rounded-full bg-accent-color border-2 border-surface" />
                <div className="text-[11px] font-black text-accent-color">{h.y}</div>
                <div className="font-serif text-lg font-bold">{h.t}</div>
                <p className="text-sm text-text-muted leading-relaxed mt-0.5">{h.d}</p>
              </div>
            ))}
          </div>
        </Box>
      )}

      {sec === 'talk' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {PHRASES.map(g => (
            <Box key={g.cat} title={g.cat} icon={<MessageCircle size={16} />}>
              <div className="divide-y divide-line-soft">
                {g.items.map(p => (
                  <div key={p.ja} className="py-2.5 flex items-center gap-3">
                    <SpeakBtn text={p.kana.split(' / ')[0]} lang="ja-JP" small />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-text-main">{p.ja}</div>
                      <div className="text-xs text-accent-color font-bold">{p.pr}</div>
                      <div className="text-xs text-text-muted">{p.ko}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Box>
          ))}
        </div>
      )}

      {sec === 'food' && (
        <div className="space-y-4">
          <p className="text-xs text-text-muted">오래 영업해 온 대표 가게 위주로 골랐습니다. 영업시간·휴무일은 바뀔 수 있으니 방문 전에 지도 앱에서 확인하세요.</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {FOODS.map(g => (
              <Box key={g.cat} title={g.cat} icon={<UtensilsCrossed size={16} />}>
                <div className="space-y-3">
                  {g.items.map(f => (
                    <div key={f.name} className="p-3 rounded-xl bg-soft">
                      <div className="flex items-center justify-between gap-2">
                        <div><span className="font-bold">{f.name}</span> <span className="text-xs text-text-muted">{f.ja}</span></div>
                        <a href={`https://www.google.com/maps/search/${encodeURIComponent(f.ja + ' 大阪')}`} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-text-muted flex items-center gap-1 shrink-0"><ExternalLink size={11} /> 지도</a>
                      </div>
                      <div className="text-xs text-accent-color font-bold mt-0.5">{f.area} · {f.menu}</div>
                      <p className="text-xs text-text-muted mt-1">{f.tip}</p>
                    </div>
                  ))}
                </div>
              </Box>
            ))}
          </div>
        </div>
      )}

      {sec === 'tips' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Box title="알아 두면 편한 생활 팁" icon={<Lightbulb size={16} />} className="lg:col-span-2"><Bullets items={TIPS} /></Box>
          <Box title="긴급 연락처" icon={<Phone size={16} />}>
            <div className="space-y-2">
              {EMERGENCY.map(e => (
                <a key={e.label} href={`tel:${e.value.replace(/[^+\d]/g, '')}`} className="flex items-center justify-between p-3 rounded-xl bg-soft">
                  <span className="text-sm">{e.label}</span><span className="font-bold text-accent-color">{e.value}</span>
                </a>
              ))}
            </div>
          </Box>
        </div>
      )}
    </div>
  );
}

