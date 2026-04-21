import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Calendar as CalendarIcon, 
  Clock, 
  MapPin, 
  Users, 
  Trash2, 
  Edit2, 
  LogOut, 
  LogIn, 
  Bell,
  ChevronRight,
  ChevronLeft,
  Settings,
  X,
  LayoutList,
  CalendarDays
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy, 
  Timestamp,
  getDocFromServer
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User 
} from 'firebase/auth';
import { auth, db } from './lib/firebase';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';

import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths, 
  getWeek, 
  startOfToday,
  addDays,
  getWeeksInMonth,
  getYear,
  getMonth,
  getDate,
  getDay,
  parseISO
} from 'date-fns';
import { ko } from 'date-fns/locale';

// --- Types ---
interface Schedule {
  id: string;
  day: string;
  date: string; // ISO String (YYYY-MM-DD)
  startTime: string;
  endTime: string;
  program: string;
  location: string;
  target: string;
  createdAt: any;
}

interface UserProfile {
  uid: string;
  email: string;
  role: 'admin' | 'user';
}

const DAYS = ['월', '화', '수', '목', '금'];
const TIME_BLOCKS = ['10:00~12:00', '13:30~15:30'];

const PROGRAMS = [
  '진로·직업교육',
  '안전체험',
  '문화예술체육',
  '장애이해교육'
];

const LOCATIONS = [
  '1층 안전체험관',
  '1층 바리스타체험실',
  '2층 쿠킹체험실',
  '2층 e스포츠체험실',
  '2층 장애이해교육실',
  '2층 동아리실'
];

const TARGETS = [
  '유초등',
  '중고등',
  '전공과'
];

export default function App() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [calendarView, setCalendarView] = useState<'week' | 'month'>('week');
  const [baseDate, setBaseDate] = useState(startOfToday());
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0); 
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMsg, setNotificationMsg] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    day: '월',
    date: format(startOfToday(), 'yyyy-MM-dd'),
    startTime: '10:00',
    endTime: '12:00',
    program: PROGRAMS[0],
    location: LOCATIONS[0],
    target: TARGETS[0]
  });

  // Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setIsAdmin(true);
    });
    return () => unsubscribe();
  }, []);

  // Fetch Schedules - Modified to use date
  useEffect(() => {
    const q = query(collection(db, 'schedules'), orderBy('startTime'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          date: d.date || format(startOfToday(), 'yyyy-MM-dd'),
          ...d
        };
      }) as Schedule[];

      // Sort by date then startTime
      const sorted = data.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.startTime.localeCompare(b.startTime);
      });

      setSchedules(sorted);
    });

    return () => unsubscribe();
  }, []);

  // Calendar Helpers
  const weeksOfCurrentMonth = useMemo(() => {
    const start = startOfMonth(baseDate);
    const end = endOfMonth(baseDate);
    const startOfFirstWeek = startOfWeek(start, { weekStartsOn: 1 });
    const endOfLastWeek = endOfWeek(end, { weekStartsOn: 1 });
    
    const days = eachDayOfInterval({ start: startOfFirstWeek, end: endOfLastWeek });
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }
    return weeks;
  }, [baseDate]);

  // Update week index if baseDate changes and index is out of bounds
  useEffect(() => {
    if (selectedWeekIndex >= weeksOfCurrentMonth.length) {
      setSelectedWeekIndex(0);
    }
  }, [weeksOfCurrentMonth, selectedWeekIndex]);

  const currentViewWeek = weeksOfCurrentMonth[selectedWeekIndex] || weeksOfCurrentMonth[0];

  // Filtered Schedules for List View
  const filteredSchedules = useMemo(() => {
    return schedules.filter(s => {
      const matchesSearch = 
        s.program.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.target.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesDay = selectedDay ? s.day === selectedDay : true;
      return matchesSearch && matchesDay;
    });
  }, [schedules, searchTerm, selectedDay]);

  // Actions
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingId) {
        await updateDoc(doc(db, 'schedules', editingId), {
          ...formData,
          updatedAt: Timestamp.now()
        });
        showNotify('일정이 수정되었습니다.');
      } else {
        await addDoc(collection(db, 'schedules'), {
          ...formData,
          createdAt: Timestamp.now()
        });
        showNotify('일정이 추가되었습니다.');
      }
      resetForm();
    } catch (err) {
      console.error(err);
    }
  };

  const handleEdit = (schedule: Schedule) => {
    setFormData({
      day: schedule.day,
      date: schedule.date,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      program: schedule.program,
      location: schedule.location,
      target: schedule.target
    });
    setEditingId(schedule.id);
    setIsEditing(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('정말 삭제하시겠습니까?')) {
      try {
        await deleteDoc(doc(db, 'schedules', id));
        showNotify('일정이 삭제되었습니다.');
      } catch (err) {
        console.error(err);
      }
    }
  };

  const resetForm = () => {
    setFormData({
      day: '월',
      date: format(startOfToday(), 'yyyy-MM-dd'),
      startTime: '10:00',
      endTime: '12:00',
      program: PROGRAMS[0],
      location: LOCATIONS[0],
      target: TARGETS[0]
    });
    setEditingId(null);
    setIsEditing(false);
  };

  const showNotify = (msg: string) => {
    setNotificationMsg(msg);
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 3000);
  };

  return (
    <div className="flex h-screen bg-bg-primary overflow-hidden font-sans text-text-main">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex w-72 bg-sidebar-bg backdrop-blur-2xl border-r border-border-color flex-col p-8 shrink-0 z-20">
        <div className="flex items-center gap-3 mb-12">
          <div className="w-10 h-10 premium-gradient rounded-2xl flex items-center justify-center text-white shadow-lg shadow-accent-color/30">
            <CalendarIcon size={20} />
          </div>
          <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-grad-start to-grad-end">EduScheduler</span>
        </div>
        
        <nav className="flex-1 space-y-2">
          <div 
            onClick={() => { setViewMode('list'); setSelectedDay(null); }}
            className={cn(
              "px-5 py-3 rounded-xl text-sm font-semibold cursor-pointer flex items-center gap-3 transition-all duration-300",
              viewMode === 'list' ? "bg-accent-color text-white shadow-xl shadow-accent-color/20 scale-[1.02]" : "text-text-muted hover:bg-slate-100/50 hover:text-text-main"
            )}
          >
            <LayoutList size={20} />
            <span>리스트 보기</span>
          </div>
          <div 
            onClick={() => setViewMode('calendar')}
            className={cn(
              "px-5 py-3 rounded-xl text-sm font-semibold cursor-pointer flex items-center gap-3 transition-all duration-300",
              viewMode === 'calendar' ? "bg-accent-color text-white shadow-xl shadow-accent-color/20 scale-[1.02]" : "text-text-muted hover:bg-slate-100/50 hover:text-text-main"
            )}
          >
            <CalendarDays size={20} />
            <span>달력 보기</span>
          </div>
          <div className="px-5 py-3 text-text-muted hover:bg-slate-100/50 hover:text-text-main rounded-xl text-sm font-medium cursor-pointer transition-all flex items-center gap-3">
            <Settings size={20} />
            <span>설정</span>
          </div>
        </nav>

        <div className="pt-8 border-t border-border-color">
          {user ? (
            <button 
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-5 py-3 text-text-muted hover:text-red-500 hover:bg-red-50/50 rounded-xl transition-all text-sm font-semibold"
            >
              <LogOut size={20} />
              <span>로그아웃</span>
            </button>
          ) : (
            <button 
              onClick={handleLogin}
              className="flex items-center gap-3 w-full px-5 py-3 bg-accent-color/10 text-accent-color hover:bg-accent-color hover:text-white rounded-xl transition-all text-sm font-bold shadow-sm"
            >
              <LogIn size={20} />
              <span>로그인</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50/30">
        {/* Top Bar */}
        <header className="h-20 bg-white/50 backdrop-blur-md border-b border-border-color flex items-center justify-between px-10 shrink-0 z-10">
          <div className="flex items-center gap-4 flex-1 max-w-xl">
            <div className="relative w-full group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted/60 group-focus-within:text-accent-color transition-colors" size={18} />
              <input 
                type="text" 
                placeholder="프로그램, 장소, 대상 검색..."
                className="w-full h-12 pl-12 pr-6 bg-white/80 border border-border-color rounded-2xl text-sm outline-none focus:border-accent-color focus:ring-4 focus:ring-accent-color/5 transition-all shadow-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="relative w-12 h-12 bg-white border border-border-color rounded-2xl flex items-center justify-center cursor-pointer hover:bg-slate-50 hover:border-accent-color/30 transition-all shadow-sm group">
              <Bell size={20} className="text-text-main group-hover:rotate-12 transition-transform" />
              <span className="absolute top-3.5 right-3.5 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-white animate-pulse" />
            </div>
            
            <div className="flex items-center gap-4 pl-6 border-l border-border-color">
              {user && (
                <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-bold text-text-main">{user.displayName}</p>
                    <p className="text-[10px] text-accent-color uppercase font-black tracking-widest leading-none mt-1">{isAdmin ? 'Administrator' : 'Staff'}</p>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-200 to-slate-300 border-2 border-white shadow-xl overflow-hidden ring-1 ring-slate-200">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm font-bold text-slate-500">
                        {user.displayName?.[0]}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-8">
          <div className="max-w-7xl mx-auto">
            {/* Header / Mode Toggle Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-10">
              <div className="flex items-center gap-8">
                <div>
                  <h2 className="text-3xl font-black text-text-main tracking-tight">
                    {viewMode === 'list' ? '스케줄 대시보드' : `${format(baseDate, 'yyyy년 M월')} 일정마스터`}
                  </h2>
                  <p className="text-sm font-medium text-text-muted mt-1">교육 프로그램 일정을 지능적으로 관리하세요</p>
                </div>

                {viewMode === 'calendar' && (
                  <div className="flex items-center gap-1 p-1.5 bg-white border border-border-color rounded-2xl shadow-sm h-fit">
                    <button 
                      onClick={() => setCalendarView('week')}
                      className={cn(
                        "px-5 py-2 rounded-xl text-xs font-black tracking-wider transition-all duration-300",
                        calendarView === 'week' ? "bg-accent-color text-white shadow-lg shadow-accent-color/30" : "text-text-muted hover:text-text-main hover:bg-slate-50"
                      )}
                    >
                      WEEKLY
                    </button>
                    <button 
                      onClick={() => setCalendarView('month')}
                      className={cn(
                        "px-5 py-2 rounded-xl text-xs font-black tracking-wider transition-all duration-300",
                        calendarView === 'month' ? "bg-accent-color text-white shadow-lg shadow-accent-color/30" : "text-text-muted hover:text-text-main hover:bg-slate-50"
                      )}
                    >
                      MONTHLY
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-4">
                {viewMode === 'list' ? (
                  <div className="flex p-1.5 bg-white border border-border-color rounded-2xl shadow-sm shrink-0 overflow-x-auto no-scrollbar max-w-sm sm:max-w-none">
                    <button 
                      onClick={() => { setSelectedDay(null); }}
                      className={cn(
                        "px-5 py-2 rounded-xl text-xs font-black transition-all duration-300 whitespace-nowrap",
                        !selectedDay ? "bg-accent-color text-white shadow-lg shadow-accent-color/30" : "text-text-muted hover:text-text-main hover:bg-slate-50"
                      )}
                    >
                      ALL
                    </button>
                    {DAYS.map(day => (
                      <button 
                        key={day}
                        onClick={() => { setSelectedDay(day); }}
                        className={cn(
                          "px-5 py-2 rounded-xl text-xs font-black transition-all duration-300 whitespace-nowrap",
                          selectedDay === day ? "bg-accent-color text-white shadow-lg shadow-accent-color/30" : "text-text-muted hover:text-text-main hover:bg-slate-50"
                        )}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setBaseDate(subMonths(baseDate, 1))}
                      className="p-3 bg-white border border-border-color rounded-xl hover:text-accent-color hover:border-accent-color transition-all shadow-sm"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <button 
                      onClick={() => setBaseDate(startOfToday())}
                      className="px-6 py-2.5 bg-white border border-border-color rounded-xl text-xs font-black hover:text-accent-color hover:border-accent-color transition-all shadow-sm"
                    >
                      TODAY
                    </button>
                    <button 
                      onClick={() => setBaseDate(addMonths(baseDate, 1))}
                      className="p-3 bg-white border border-border-color rounded-xl hover:text-accent-color hover:border-accent-color transition-all shadow-sm"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>
                )}

                <div className="h-10 w-[1px] bg-border-color/60 mx-2" />

                <button 
                  onClick={() => setViewMode(prev => prev === 'list' ? 'calendar' : 'list')}
                  className="bg-white border border-border-color rounded-2xl hover:bg-slate-50 hover:border-accent-color transition-all text-text-main flex items-center gap-3 px-6 h-12 shadow-sm shrink-0"
                >
                  {viewMode === 'list' ? (
                    <>
                      <CalendarDays size={18} className="text-accent-color" />
                      <span className="text-xs font-black tracking-wide">CALENDAR</span>
                    </>
                  ) : (
                    <>
                      <LayoutList size={18} className="text-accent-color" />
                      <span className="text-xs font-black tracking-wide">LIST VIEW</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Week Tab Logic - Only in Calendar/Week view */}
            {viewMode === 'calendar' && calendarView === 'week' && (
              <div className="flex p-2 bg-white/50 backdrop-blur-md border border-white/20 rounded-[2rem] mb-10 w-fit mx-auto shadow-xl shadow-slate-200/40 overflow-x-auto no-scrollbar">
                {weeksOfCurrentMonth.map((week, idx) => {
                  const isActive = selectedWeekIndex === idx;
                  return (
                    <button 
                      key={idx}
                      onClick={() => setSelectedWeekIndex(idx)}
                      className={cn(
                        "px-8 py-3 rounded-[1.5rem] text-sm font-black transition-all duration-500 flex flex-col items-center min-w-[130px] group",
                        isActive ? "bg-accent-color text-white shadow-2xl shadow-accent-color/40 scale-105" : "text-text-muted hover:text-text-main hover:bg-white"
                      )}
                    >
                      <span className="tracking-tight">{idx + 1} WEEK</span>
                      <span className={cn(
                        "text-[10px] opacity-70 font-semibold tracking-widest mt-0.5",
                        isActive ? "text-white" : "text-text-muted"
                      )}>
                        {format(week[0], 'M.d')} — {format(week[6], 'M.d')}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-[1fr,320px] gap-8">
              {/* Left Column: List or Calendar View */}
              <div className="space-y-6">
                {viewMode === 'list' ? (
                  <div className="glass-panel rounded-[2rem] overflow-hidden">
                    <div className="px-10 py-6 border-b border-border-color flex items-center justify-between bg-white/40">
                      <span className="text-xs font-black text-accent-color uppercase tracking-[0.2em]">Schedules Archive</span>
                      <span className="text-xs font-bold text-text-muted">{filteredSchedules.length} Items found</span>
                    </div>

                    <div className="divide-y divide-border-color/40">
                      {filteredSchedules.map((s) => (
                        <motion.div 
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          key={s.id}
                          className="p-8 hover:bg-white/60 transition-all duration-300 group relative schedule-card"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center gap-8">
                            <div className="w-20 h-20 rounded-2xl bg-white border border-border-color flex flex-col items-center justify-center shrink-0 shadow-sm group-hover:shadow-lg transition-all group-hover:border-accent-color/30">
                              <span className="text-sm font-black text-text-main">{s.day}</span>
                              <span className="text-[10px] font-bold text-accent-color uppercase tracking-widest mt-1">Day</span>
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-4 mb-2">
                                <div className="flex items-center gap-2 text-accent-color bg-accent-color/5 px-3 py-1 rounded-full">
                                  <Clock size={14} className="animate-pulse" />
                                  <span className="text-xs font-black tracking-tighter">{s.startTime} — {s.endTime}</span>
                                </div>
                                <div className="text-[10px] font-black text-text-muted/60 bg-slate-100 px-3 py-1 rounded-full tracking-widest">
                                  {s.date.replace(/-/g, '. ')}
                                </div>
                              </div>
                              <h3 className="text-xl font-black text-text-main truncate mb-2 group-hover:text-accent-color transition-colors">{s.program}</h3>
                              <div className="flex flex-wrap gap-6 items-center">
                                <div className="flex items-center gap-2 text-xs font-semibold text-text-muted">
                                  <MapPin size={14} className="text-accent-color/50" />
                                  <span>{s.location}</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs font-semibold text-text-muted">
                                  <Users size={14} className="text-accent-color/50" />
                                  <span>{s.target}</span>
                                </div>
                              </div>
                            </div>

                            {isAdmin && (
                              <div className="flex items-center gap-2 sm:opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-4 group-hover:translate-x-0">
                                <button 
                                  onClick={() => handleEdit(s)}
                                  className="p-3 text-text-muted hover:text-white hover:bg-accent-color rounded-xl transition-all shadow-sm border border-border-color"
                                >
                                  <Edit2 size={18} />
                                </button>
                                <button 
                                  onClick={() => handleDelete(s.id)}
                                  className="p-3 text-text-muted hover:text-white hover:bg-rose-500 rounded-xl transition-all shadow-sm border border-border-color"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      ))}
                      {filteredSchedules.length === 0 && (
                        <div className="p-32 text-center">
                          <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6 border border-dashed border-slate-200">
                            <CalendarDays size={32} clas                   /* --- WEEKLY VIEW --- */
                  <div className="glass-panel rounded-[2rem] overflow-hidden">
                    <div className="grid grid-cols-7 border-b border-border-color bg-white/60">
                      {currentViewWeek.map((dayDate, idx) => (
                        <div key={idx} className={cn(
                          "py-6 text-center border-r border-border-color/40 last:border-r-0",
                          !isSameMonth(dayDate, baseDate) && "opacity-20 bg-slate-50/50",
                          isSameDay(dayDate, startOfToday()) && "bg-accent-color/5"
                        )}>
                          <span className="text-[10px] font-black text-accent-color block mb-2 uppercase tracking-[0.2em] opacity-60">
                            {format(dayDate, 'EEE', { locale: ko })}
                          </span>
                          <span className={cn(
                            "text-xl font-black",
                            isSameDay(dayDate, startOfToday()) ? "text-accent-color drop-shadow-sm" : "text-text-main"
                          )}>
                            {format(dayDate, 'd')}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 min-h-[600px] divide-x divide-border-color/40 bg-white/20">
                      {currentViewWeek.map((dayDate, idx) => {
                        const dateStr = format(dayDate, 'yyyy-MM-dd');
                        const daySchedules = schedules.filter(s => s.date === dateStr);
                          
                        return (
                          <div 
                            key={idx} 
                            className={cn(
                              "p-3 space-y-3 min-h-[400px] transition-colors duration-500",
                              !isSameMonth(dayDate, baseDate) ? "bg-slate-50/10" : "hover:bg-white/20"
                            )}
                          >
                            {isAdmin && (
                              <button 
                                onClick={() => {
                                  const dStr = format(dayDate, 'yyyy-MM-dd');
                                  setFormData({
                                    ...formData,
                                    date: dStr,
                                    day: format(dayDate, 'EEE', { locale: ko })[0]
                                  });
                                  setIsEditing(false);
                                  setEditingId(null);
                                }}
                                className="w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-slate-300 hover:text-accent-color hover:border-accent-color hover:bg-white transition-all text-[10px] font-black flex items-center justify-center gap-2 group"
                              >
                                <Plus size={12} className="group-hover:rotate-90 transition-transform" />
                                ADD
                              </button>
                            )}
                            {daySchedules.map(s => (
                              <motion.div 
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                key={s.id}
                                onClick={() => handleEdit(s)}
                                className="p-4 rounded-2xl border border-border-color bg-white/80 hover:bg-white hover:border-accent-color hover:shadow-2xl hover:shadow-accent-color/10 transition-all cursor-pointer group relative overflow-hidden"
                              >
                                <div className="absolute top-0 left-0 w-1 h-full premium-gradient opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="text-[10px] font-black text-accent-color mb-1.5 flex items-center gap-1">
                                  <Clock size={10} />
                                  {s.startTime}
                                </div>
                                <h4 className="text-[12px] font-black text-text-main leading-snug mb-1.5">{s.program}</h4>
                                <div className="text-[10px] text-text-muted font-bold truncate opacity-60 flex items-center gap-1">
                                  <MapPin size={8} />
                                  {s.location}
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* --- MONTHLY VIEW --- */
                  <div className="glass-panel rounded-[2rem] overflow-hidden">
                    <div className="grid grid-cols-7 border-b border-border-color bg-white/60">
                      {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => (
                        <div key={day} className="py-4 text-center text-[10px] font-black text-text-muted tracking-[0.2em] uppercase">
                          {day}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 min-h-[600px] divide-x divide-y divide-border-color/40 bg-white/20">
                      {daysOfCurrentMonth.map((dayDate, idx) => {
                        const dateStr = format(dayDate, 'yyyy-MM-dd');
                        const daySchedules = schedules.filter(s => s.date === dateStr);
                        const isCurrentMonth = isSameMonth(dayDate, baseDate);
                        const isToday = isSameDay(dayDate, startOfToday());
                          
                        return (
                          <div 
                            key={idx} 
                            className={cn(
                              "p-3 h-32 transition-all duration-300",
                              !isCurrentMonth ? "bg-slate-50/10 opacity-20" : "hover:bg-white/40",
                              isToday && "bg-accent-color/5"
                            )}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <span className={cn(
                                "text-xs font-black w-6 h-6 flex items-center justify-center rounded-lg transition-colors",
                                isToday ? "bg-accent-color text-white shadow-lg shadow-accent-color/30" : "text-text-main"
                              )}>
                                {format(dayDate, 'd')}
                              </span>
                              {daySchedules.length > 0 && isCurrentMonth && (
                                <span className="w-1.5 h-1.5 rounded-full bg-accent-color animate-pulse" />
                              )}
                            </div>
                            <div className="space-y-1 overflow-y-auto max-h-[70px] no-scrollbar">
                              {daySchedules.map(s => (
                                <div 
                                  key={s.id}
                                  onClick={() => handleEdit(s)}
                                  className="text-[9px] font-bold text-text-main hover:text-accent-color truncate cursor-pointer bg-white/60 px-1.5 py-1 rounded-md border border-border-color/30"
                                >
                                  {s.startTime} {s.program}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Admin Form */}
              <div className="lg:w-96 space-y-6">
                <div className="glass-panel p-8 rounded-[2rem] sticky top-28 border-t-4 border-t-accent-color">
                  <div className="flex items-center gap-3 mb-8">
                    <div className="p-2.5 bg-accent-color/10 text-accent-color rounded-xl">
                      <Plus size={20} />
                    </div>
                    <h3 className="text-xl font-black text-text-main tracking-tight">
                      {editingId ? '일정 정보 수정' : '새 일정 마스터'}
                    </h3>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">날짜</label>
                        <input 
                          type="date" 
                          required
                          className="w-full h-12 px-4 bg-white/50 border border-border-color rounded-2xl text-sm font-bold outline-none focus:border-accent-color focus:ring-4 focus:ring-accent-color/5 transition-all"
                          value={formData.date}
                          onChange={(e) => setFormData({...formData, date: e.target.value})}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">요일</label>
                        <div className="relative">
                          <select 
                            required
                            className="w-full h-12 pl-4 pr-10 bg-white/50 border border-border-color rounded-2xl text-sm font-bold outline-none focus:border-accent-color appearance-none cursor-pointer group"
                            value={formData.day}
                            onChange={(e) => setFormData({...formData, day: e.target.value})}
                          >
                            {DAYS.map(day => <option key={day} value={day}>{day}요일</option>)}
                          </select>
                          <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 rotate-90 text-text-muted/40 pointer-events-none group-focus:text-accent-color transition-colors" size={14} />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">시작</label>
                        <input 
                          type="time" 
                          required
                          className="w-full h-12 px-4 bg-white/50 border border-border-color rounded-2xl text-sm font-bold outline-none focus:border-accent-color focus:ring-4 focus:ring-accent-color/5 transition-all"
                          value={formData.startTime}
                          onChange={(e) => setFormData({...formData, startTime: e.target.value})}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">종료</label>
                        <input 
                          type="time" 
                          required
                          className="w-full h-12 px-4 bg-white/50 border border-border-color rounded-2xl text-sm font-bold outline-none focus:border-accent-color focus:ring-4 focus:ring-accent-color/5 transition-all"
                          value={formData.endTime}
                          onChange={(e) => setFormData({...formData, endTime: e.target.value})}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">프로그램 명칭</label>
                      <input 
                        type="text" 
                        required
                        placeholder="예: 인공지능 기초과정"
                        className="w-full h-12 px-4 bg-white/50 border border-border-color rounded-2xl text-sm font-bold outline-none focus:border-accent-color focus:ring-4 focus:ring-accent-color/5 transition-all placeholder:text-text-muted/40"
                        value={formData.program}
                        onChange={(e) => setFormData({...formData, program: e.target.value})}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">장소 / 커리큘럼</label>
                      <div className="relative">
                        <select 
                          required
                          className="w-full h-12 pl-4 pr-10 bg-white/50 border border-border-color rounded-2xl text-sm font-bold outline-none focus:border-accent-color appearance-none cursor-pointer"
                          value={formData.location}
                          onChange={(e) => setFormData({...formData, location: e.target.value})}
                        >
                          {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                        <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 rotate-90 text-text-muted/40 pointer-events-none" size={14} />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.15em] ml-1">교육 대상</label>
                      <div className="relative">
                        <select 
                          required
                          className="w-full h-12 pl-4 pr-10 bg-white/50 border border-border-color rounded-2xl text-sm font-bold outline-none focus:border-accent-color appearance-none cursor-pointer"
                          value={formData.target}
                          onChange={(e) => setFormData({...formData, target: e.target.value})}
                        >
                          {TARGETS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 rotate-90 text-text-muted/40 pointer-events-none" size={14} />
                      </div>
                    </div>

                    <button 
                      type="submit"
                      disabled={!isAdmin}
                      className="w-full h-14 premium-gradient text-white rounded-2xl text-sm font-black shadow-xl shadow-accent-color/30 hover:scale-[1.02] active:scale-95 transition-all mt-4 disabled:opacity-50 disabled:grayscale disabled:scale-100"
                    >
                      {editingId ? '수정 사항 저장' : '일정 마스터 추가'}
                    </button>
                    
                    {editingId && (
                      <button 
                        type="button"
                        onClick={resetForm}
                        className="w-full py-2 text-text-muted text-[10px] font-black uppercase tracking-widest hover:text-text-main transition-colors"
                      >
                        CANCEL EDIT
                      </button>
                    )}
                  </form>
                </div>

                <div className="glass-panel rounded-[2rem] border-l-4 border-l-amber-400 p-8 shadow-lg shadow-slate-200/50">
                  <h4 className="text-[10px] font-black text-text-main uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                    <Bell size={14} className="text-amber-500 animate-bounce" />
                    System Insights
                  </h4>
                  <div className="space-y-4">
                    <div className="p-4 bg-slate-50/50 rounded-2xl border border-border-color/40">
                      <p className="text-[11px] font-black text-text-main mb-1">인공지능 교육 서버 점검</p>
                      <p className="text-[10px] text-text-muted font-semibold">내일 새벽 02:00 - 04:00 (KST 예정)</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <AnimatePresence>
        {showNotification && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 right-8 bg-text-main text-white px-6 py-4 rounded-2xl shadow-2xl z-[100] flex items-center gap-3 border border-gray-700"
          >
            <Bell className="text-accent-color" size={18} />
            <span className="text-sm font-medium">{notificationMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
