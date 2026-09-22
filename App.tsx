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
  CalendarDays,
  Camera,
  User as UserIcon,
  Link2,
  ExternalLink,
  Sun,
  Moon,
  Cloud,
  CloudRain,
  Snowflake,
  ListChecks,
  GripVertical,
  ClipboardList
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
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from './lib/firebase';
import firebaseConfig from '../firebase-applet-config.json';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

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
  parseISO,
  isValid
} from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  BRIDGE_MIRROR_ENABLED,
  describeHubError,
  subscribeGangneung,
  syncMirror,
} from './lib/gangneungBridge';
import {
  GANGNEUNG_APP_URL,
  entriesByDate,
  findLinkedEntries,
  mergeRooms,
  roomLabel,
} from './lib/gangneungLink';
import type { GnEntry, GnRoom } from './lib/gangneungLink';

// --- 한국 주요 국경일 및 공휴일 데이터 ---
const KOREAN_HOLIDAYS: Record<string, string> = {
  '01-01': '신정',
  '03-01': '삼일절',
  '05-05': '어린이날',
  '06-06': '현충일',
  '08-15': '광복절',
  '10-03': '개천절',
  '10-09': '한글날',
  '12-25': '성탄절',
  '2026-02-16': '설날 연휴',
  '2026-02-17': '설날',
  '2026-02-18': '설날 연휴',
  '2026-09-24': '추석 연휴',
  '2026-09-25': '추석',
  '2026-09-26': '추석 연휴',
};

const getHolidayName = (dateStr: string) => {
  const monthDay = dateStr.slice(5);
  return KOREAN_HOLIDAYS[dateStr] || KOREAN_HOLIDAYS[monthDay] || null;
};

interface Schedule {
  id: string;
  day: string;
  date: string;
  startTime: string;
  endTime: string;
  program: string;
  location: string;
  target: string;
  teacherId?: string;
  teacherName?: string;
  category?: string;
  seriesId?: string;
  createdAt: any;
}

const SCHEDULE_CATEGORIES: { id: string; label: string; dot: string; bg: string; text: string; border: string }[] = [
  { id: 'class',    label: '수업',     dot: 'bg-blue-500',   bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
  { id: 'meeting',  label: '회의',     dot: 'bg-green-500',  bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200' },
  { id: 'trip',     label: '출장',     dot: 'bg-amber-500',  bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200' },
  { id: 'event',    label: '행사',     dot: 'bg-yellow-500', bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  { id: 'personal', label: '개인업무', dot: 'bg-gray-400',   bg: 'bg-gray-50',   text: 'text-gray-600',   border: 'border-gray-200' },
];
const categoryOf = (id?: string) => SCHEDULE_CATEGORIES.find(c => c.id === (id || 'class')) || SCHEDULE_CATEGORIES[0];

interface Teacher {
  id: string;
  name: string;
  createdAt: any;
}

interface SystemNotification {
  id: string;
  title: string;
  content: string;
  createdAt: any;
}

const DEFAULT_PROGRAMS = ['코딩 영재반', '기초 파이썬', '웹 개발 입문', 'AI 창의 캠프', '방학 특강', '정기 코딩'];
const DEFAULT_LOCATIONS = ['1층 안전체험관', '1층 바리스타체험실', '2층 쿠킹체험실', '2층 e스포츠체험실', '2층 장애이해교육실', '2층 동아리실'];
const DEFAULT_TARGETS = ['유초등', '중고등', '전공과'];
const DAYS = ['월', '화', '수', '목', '금'];

function hexToRgbTriplet(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}
function readableOnColor(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '20 30 44' : '255 255 255';
}
function applyAccentColor(hex: string) {
  document.documentElement.style.setProperty('--c-accent-color', hexToRgbTriplet(hex));
  document.documentElement.style.setProperty('--c-on-accent', readableOnColor(hex));
}

export default function App() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'calendar' | 'teacher' | 'tasks'>('calendar');
  const [calendarView, setCalendarView] = useState<'week' | 'month'>('month');
  const [baseDate, setBaseDate] = useState(startOfToday());
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0); 

  const [weather, setWeather] = useState<{ temp: number; text: string; icon: string } | null>({
    temp: 22,
    text: '맑음',
    icon: 'sun'
  });

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [newTeacherName, setNewTeacherName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMsg, setNotificationMsg] = useState('');
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [gnEntries, setGnEntries] = useState<GnEntry[]>([]);
  const [gnCustomRooms, setGnCustomRooms] = useState<GnRoom[]>([]);
  const [gnStatus, setGnStatus] = useState<'connecting' | 'ok' | 'error'>('connecting');
  const [gnError, setGnError] = useState('');
  const [mirrorInfo, setMirrorInfo] = useState<{ state: 'idle' | 'ok' | 'error'; message: string }>({ state: 'idle', message: '' });
  const [showGnEntries, setShowGnEntries] = useState(true);
  const [schedulesLoaded, setSchedulesLoaded] = useState(false);
  const gnRooms = useMemo(() => mergeRooms(gnCustomRooms), [gnCustomRooms]);
  const gnByDate = useMemo(() => entriesByDate(gnEntries), [gnEntries]);
  const [gnDetailDate, setGnDetailDate] = useState<string | null>(null);
  const [gnEntryTeachers, setGnEntryTeachers] = useState<Record<string, string>>({});

  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  );
  const [accentColor, setAccentColor] = useState<string | null>(() => {
    try { return localStorage.getItem('eduAccentColorV1'); } catch { return null; }
  });
  useEffect(() => { if (accentColor) applyAccentColor(accentColor); }, [accentColor]);

  const [programs, setPrograms] = useState<string[]>(DEFAULT_PROGRAMS);
  const [locations, setLocations] = useState<string[]>(DEFAULT_LOCATIONS);
  const [targets, setTargets] = useState<string[]>(DEFAULT_TARGETS);
  const [dioramaUrls, setDioramaUrls] = useState<Record<string, string>>({
    '강릉분원': '',
    '춘천본원': '',
    '원주분원': ''
  });

  const [registeredUsers, setRegisteredUsers] = useState<{id: string, role: string}[]>([]);
  const [formData, setFormData] = useState({
    day: '월',
    date: format(startOfToday(), 'yyyy-MM-dd'),
    startTime: '10:00',
    endTime: '12:00',
    program: '',
    location: '',
    target: '',
    teacherId: '',
    category: 'class',
    repeat: 'none' as 'none' | 'daily' | 'weekly' | 'monthly',
    repeatEndDate: ''
  });

  const [isAuthInitialCheckDone, setIsAuthInitialCheckDone] = useState(false);
  const [appName, setAppName] = useState('EduScheduler');
  const [appLogo, setAppLogo] = useState('./app-logo.png');

  const safeFormat = (date: any, fmt: string, options?: any) => {
    try {
      const d = new Date(date);
      if (!isValid(d)) return '??';
      return format(d, fmt, options);
    } catch { return '??'; }
  };

  const safeIsSameMonth = (d1: any, d2: any) => {
    try { return isSameMonth(new Date(d1), new Date(d2)); } catch { return false; }
  };

  const safeIsSameDay = (d1: any, d2: any) => {
    try { return isSameDay(new Date(d1), new Date(d2)); } catch { return false; }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const id = u.email?.split('@')[0];
        setIsAdmin(id?.startsWith('admin') ?? false);
      } else {
        setIsAdmin(false);
      }
      setIsAuthInitialCheckDone(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'schedules'), orderBy('startTime'));
    return onSnapshot(q, (snapshot) => {
      setSchedules(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Schedule));
      if (!snapshot.metadata.fromCache) setSchedulesLoaded(true);
    });
  }, []);

  const calendarDays = useMemo(() => {
    try {
      const monthStart = startOfMonth(baseDate);
      if (!isValid(monthStart)) return [];
      const startOfGrid = startOfWeek(monthStart, { weekStartsOn: 1 });
      if (!isValid(startOfGrid)) return [];
      return Array.from({ length: 42 }).map((_, i) => addDays(startOfGrid, i));
    } catch { return []; }
  }, [baseDate]);

  const filteredSchedules = useMemo(() => {
    return schedules.filter(s => {
      const matchesSearch = [s.program, s.location, s.target, s.teacherName].some(v => (v || '').toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesDay = selectedDay ? s.day === selectedDay : true;
      return matchesSearch && matchesDay;
    });
  }, [schedules, searchTerm, selectedDay]);

  // ✅ 강릉분원 이미지 경로 수정 (logo-gangneung.jpg 적용)
  const DIORAMA_ITEMS = [
    { name: '강릉분원', src: './logo-gangneung.jpg', url: 'https://www.gninjae.or.kr' },
    { name: '춘천본원', src: './logo-chuncheon.jpg', url: 'https://jinro.gwe.go.kr' },
    { name: '원주분원', src: './logo-wonju.jpg', url: 'https://wj.gwe.go.kr' }
  ];

  if (!isAuthInitialCheckDone) return null;

  return (
    <div className="flex h-screen bg-bg-primary overflow-hidden font-sans select-none">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-64 bg-sidebar-bg border-r border-border-color flex-col p-6 shrink-0">
        <div className="flex items-center gap-3 px-2 mb-10 cursor-pointer">
          <div className="w-10 h-10 bg-surface rounded-xl flex items-center justify-center shadow-md border border-border-color overflow-hidden p-1">
            <img src={appLogo} alt="Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="font-serif text-sm font-bold text-accent-color truncate">{appName}</h1>
        </div>
        
        {/* 디오라마 카드 영역 */}
        <div className="space-y-3 mt-auto pt-6">
          {DIORAMA_ITEMS.map(diorama => (
            <div 
              key={diorama.name} 
              onClick={() => window.open(diorama.url, '_blank')}
              className="rounded-xl overflow-hidden border border-border-color shadow-sm cursor-pointer group bg-surface active:scale-95 transition-all"
            >
              <img src={diorama.src} alt={diorama.name} className="w-full h-20 object-cover group-hover:scale-110 transition-transform duration-700" />
              <div className="p-1.5 bg-surface/80 backdrop-blur-sm border-t border-border-color/30">
                <p className="text-[8px] font-bold text-text-muted text-center">{diorama.name} 디오라마</p>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-[72px] bg-surface border-b border-border-color flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-4 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted/50" size={16} />
              <input type="text" placeholder="검색..." className="w-full h-10 pl-11 pr-4 bg-bg-primary border border-border-color rounded-full text-sm outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
          </div>

          {/* 실시간 날씨 위젯 */}
          {weather && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-primary border border-border-color rounded-full text-xs font-bold text-text-main shadow-sm">
              <Sun className="text-amber-500 animate-spin-slow" size={16} />
              <span>강릉 {weather.temp}°C</span>
              <span className="text-text-muted">({weather.text})</span>
            </div>
          )}
        </header>

        {/* Calendar Viewport */}
        <div className="flex-1 overflow-y-auto p-6 bg-bg-primary">
          <div className="bg-surface rounded-2xl border border-border-color shadow-sm overflow-hidden">
            <div className="grid grid-cols-7 border-b border-border-color bg-soft">
              {['월', '화', '수', '목', '금', '토', '일'].map(d => (
                <div key={d} className={cn("py-3 text-center text-[10px] font-bold uppercase", d === '일' ? "text-sun" : d === '토' ? "text-sat" : "text-text-muted")}>{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 divide-x divide-y divide-border-color">
              {calendarDays.map((dayDate, idx) => {
                const dateStr = safeFormat(dayDate, 'yyyy-MM-dd');
                const holidayName = getHolidayName(dateStr);
                const daySchedules = filteredSchedules.filter(s => s.date === dateStr);
                const isToday = safeIsSameDay(dayDate, startOfToday());
                const isCurMonth = safeIsSameMonth(dayDate, baseDate);

                return (
                  <div key={dateStr || idx} className="min-h-[120px] p-2 flex flex-col bg-surface hover:bg-gray-50/10">
                    <div className="flex justify-between items-start mb-1">
                      <span className={cn(
                        "text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center",
                        isToday ? "bg-accent-color text-on-accent" : holidayName || dayDate.getDay() === 0 ? "text-sun" : dayDate.getDay() === 6 ? "text-sat" : "text-text-muted"
                      )}>
                        {safeFormat(dayDate, 'd')}
                      </span>
                      
                      {holidayName && (
                        <span className="text-[9px] font-black text-red-500 bg-red-50 px-1.5 py-0.5 rounded-md border border-red-100 truncate">
                          {holidayName}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 space-y-1">
                      {daySchedules.map(s => (
                        <div key={s.id} className="px-1.5 py-1 text-[9px] font-bold rounded bg-blue-50 text-blue-700 truncate">
                          {s.startTime} {s.program}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}