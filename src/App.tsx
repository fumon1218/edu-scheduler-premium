import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  ListChecks,
  GripVertical,
  ClipboardList,
  Printer,
  Menu,
  Plane,
  StickyNote,
  History,
  Layers,
  FileText,
  MessageSquare,
  AlertTriangle,
  Download
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

// --- Constants (Defaults) ---
const DEFAULT_PROGRAMS = ['코딩 영재반', '기초 파이썬', '웹 개발 입문', 'AI 창의 캠프', '방학 특강', '정기 코딩'];
const DEFAULT_LOCATIONS = ['1층 안전체험관', '1층 바리스타체험실', '2층 쿠킹체험실', '2층 e스포츠체험실', '2층 장애이해교육실', '2층 동아리실'];
const DEFAULT_TARGETS = ['유초등', '중고등', '전공과'];
const DAYS = ['월', '화', '수', '목', '금'];

// 항상 관리자로 들어올 수 있는 소유자 계정 (구글 로그인 이메일)
// ※ firestore.rules 의 isOwner() 에 적힌 이메일과 반드시 같아야 합니다.
const OWNER_EMAILS = ['fumon1218@gmail.com'];

const CHURCH_CALENDAR_URL = 'https://fumon1218.github.io/church-calendar/';

// --- 실시간 날씨 (강릉) / 대한민국 공휴일 ---
const GANGNEUNG_LAT = 37.7519;
const GANGNEUNG_LON = 128.8761;

const WEATHER_CODE_MAP: Record<number, { icon: string; label: string }> = {
  0: { icon: '☀️', label: '맑음' },
  1: { icon: '🌤️', label: '대체로 맑음' },
  2: { icon: '⛅', label: '구름 조금' },
  3: { icon: '☁️', label: '흐림' },
  45: { icon: '🌫️', label: '안개' },
  48: { icon: '🌫️', label: '짙은 안개' },
  51: { icon: '🌦️', label: '약한 이슬비' },
  53: { icon: '🌦️', label: '이슬비' },
  55: { icon: '🌦️', label: '강한 이슬비' },
  56: { icon: '🌧️', label: '어는 이슬비' },
  57: { icon: '🌧️', label: '강한 어는 이슬비' },
  61: { icon: '🌧️', label: '약한 비' },
  63: { icon: '🌧️', label: '비' },
  65: { icon: '🌧️', label: '강한 비' },
  66: { icon: '🌧️', label: '어는 비' },
  67: { icon: '🌧️', label: '강한 어는 비' },
  71: { icon: '🌨️', label: '약한 눈' },
  73: { icon: '🌨️', label: '눈' },
  75: { icon: '❄️', label: '강한 눈' },
  77: { icon: '❄️', label: '싸락눈' },
  80: { icon: '🌦️', label: '약한 소나기' },
  81: { icon: '🌦️', label: '소나기' },
  82: { icon: '⛈️', label: '강한 소나기' },
  85: { icon: '🌨️', label: '약한 눈소나기' },
  86: { icon: '❄️', label: '강한 눈소나기' },
  95: { icon: '⛈️', label: '뇌우' },
  96: { icon: '⛈️', label: '우박 동반 뇌우' },
  99: { icon: '⛈️', label: '강한 우박 동반 뇌우' },
};
const weatherIconOf = (code?: number) => (code !== undefined && WEATHER_CODE_MAP[code]) ? WEATHER_CODE_MAP[code] : { icon: '🌡️', label: '' };

// 2026년 대한민국 공휴일 (정확한 법정 공휴일/대체공휴일 데이터를 우선 적용, 그 외 연도는 공휴일 API로 자동 보완)
const KR_HOLIDAYS_STATIC: Record<string, string> = {
  '2026-01-01': '신정',
  '2026-02-16': '설날 연휴',
  '2026-02-17': '설날',
  '2026-02-18': '설날 연휴',
  '2026-03-01': '삼일절',
  '2026-03-02': '대체공휴일(삼일절)',
  '2026-05-05': '어린이날',
  '2026-05-24': '부처님오신날',
  '2026-05-25': '대체공휴일(부처님오신날)',
  '2026-06-03': '전국동시지방선거(임시공휴일)',
  '2026-06-06': '현충일',
  '2026-07-17': '제헌절',
  '2026-08-15': '광복절',
  '2026-08-17': '대체공휴일(광복절)',
  '2026-09-24': '추석 연휴',
  '2026-09-25': '추석',
  '2026-09-26': '추석 연휴',
  '2026-10-03': '개천절',
  '2026-10-05': '대체공휴일(개천절)',
  '2026-10-09': '한글날',
  '2026-12-25': '크리스마스',
};

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

// ---------- 파일 내려받기 · 백업 도우미 ----------
const downloadFile = (filename: string, content: string, mime: string) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};
const BACKUP_COLLECTIONS = ['schedules', 'teachers', 'todos', 'todoComments', 'todoTemplates', 'handoffNotes', 'dayNotes', 'trips', 'system_notifications', 'gnEntryTeachers', 'settings', 'activityLog', 'registered_users'];
// 복원할 때 건너뛰는 컬렉션 (삭제했던 계정이 되살아나지 않도록)
const RESTORE_SKIP = ['registered_users'];
const encodeBackupValue = (v: any): any => {
  if (v instanceof Timestamp) return { __ts: v.toMillis() };
  if (Array.isArray(v)) return v.map(encodeBackupValue);
  if (v && typeof v === 'object') { const o: any = {}; Object.keys(v).forEach(k => { o[k] = encodeBackupValue(v[k]); }); return o; }
  return v;
};
const decodeBackupValue = (v: any): any => {
  if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && typeof v.__ts === 'number') return Timestamp.fromMillis(v.__ts);
  if (Array.isArray(v)) return v.map(decodeBackupValue);
  if (v && typeof v === 'object') { const o: any = {}; Object.keys(v).forEach(k => { o[k] = decodeBackupValue(v[k]); }); return o; }
  return v;
};
const csvCell = (v: any) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (header: string[], rows: any[][]) => '\uFEFF' + [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
const tsText = (v: any) => (v && typeof v.toDate === 'function') ? format(v.toDate(), 'yyyy-MM-dd HH:mm') : '';

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
  
  // Teacher State
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [newTeacherName, setNewTeacherName] = useState('');
  const [isManagingTeachers, setIsManagingTeachers] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMsg, setNotificationMsg] = useState('');
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // --- 강릉분원 방문예약 앱 연동 ---
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

  // --- 실시간 날씨 (강릉, Open-Meteo) ---
  const [weatherNow, setWeatherNow] = useState<{ temp: number; code: number } | null>(null);
  const [weatherDaily, setWeatherDaily] = useState<Record<string, { max: number; min: number; code: number }>>({});
  useEffect(() => {
    let cancelled = false;
    const loadWeather = () => {
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${GANGNEUNG_LAT}&longitude=${GANGNEUNG_LON}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia%2FSeoul&forecast_days=16`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (!data || cancelled) return;
          if (data.current) {
            setWeatherNow({ temp: Math.round(data.current.temperature_2m), code: data.current.weather_code });
          }
          if (data.daily?.time) {
            const map: Record<string, { max: number; min: number; code: number }> = {};
            data.daily.time.forEach((dStr: string, i: number) => {
              map[dStr] = {
                max: Math.round(data.daily.temperature_2m_max[i]),
                min: Math.round(data.daily.temperature_2m_min[i]),
                code: data.daily.weather_code[i],
              };
            });
            setWeatherDaily(map);
          }
        })
        .catch(() => { /* 네트워크 오류 시 조용히 무시 */ });
    };
    loadWeather();
    const interval = setInterval(loadWeather, 30 * 60 * 1000); // 30분마다 갱신
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // --- 대한민국 공휴일 (연도별 자동 보완) ---
  const [koreanHolidays, setKoreanHolidays] = useState<Record<string, string>>({ ...KR_HOLIDAYS_STATIC });
  const fetchedHolidayYearsRef = useRef<Set<number>>(new Set());
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('eduThemeV1', next); } catch { }
  };

  // Dynamic Lists State
  const [programs, setPrograms] = useState<string[]>(DEFAULT_PROGRAMS);
  const [locations, setLocations] = useState<string[]>(DEFAULT_LOCATIONS);
  const [targets, setTargets] = useState<string[]>(DEFAULT_TARGETS);
  const [dioramaUrls, setDioramaUrls] = useState<Record<string, string>>({
    '강릉분원': '',
    '춘천본원': '',
    '원주분원': ''
  });
  const [newCategoryItem, setNewCategoryItem] = useState({ type: '', value: '' });

  // System Notifications State
  const [notifs, setNotifs] = useState<SystemNotification[]>([]);
  const [editingNotifId, setEditingNotifId] = useState<string | null>(null);
  const [notifForm, setNotifForm] = useState({ title: '', content: '' });

  // Auth Form State
  const [loginId, setLoginId] = useState('');
  const [loginPw, setLoginPw] = useState('');
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Account Management State
  const [newUserId, setNewUserId] = useState('');
  const [newUserPw, setNewUserPw] = useState('');
  const [registeredUsers, setRegisteredUsers] = useState<{ uid: string; id: string; email?: string; name?: string; role: string }[]>([]);
  // 접근 권한: 승인된 계정만 앱 사용 가능 (checking → approved | pending)
  const [accessState, setAccessState] = useState<'checking' | 'approved' | 'pending'>('checking');
  const [accessRequests, setAccessRequests] = useState<{ uid: string; email: string; name?: string; photoURL?: string; requestedAt?: any }[]>([]);
  const canRead = !!user && accessState === 'approved';

  // Form State
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
  const [isUploading, setIsUploading] = useState(false);
  const [isLogoUploading, setIsLogoUploading] = useState(false);
  const [appName, setAppName] = useState('EduScheduler');
  const [appLogo, setAppLogo] = useState('./app-logo.png');

  // --- Helpers ---
  const safeFormat = (date: any, fmt: string, options?: any) => {
    try {
      const d = new Date(date);
      if (!isValid(d)) return '??';
      return format(d, fmt, options);
    } catch (err) {
      console.error("Format error:", err);
      return '??';
    }
  };

  const safeIsSameMonth = (d1: any, d2: any) => {
    try {
      return isSameMonth(new Date(d1), new Date(d2));
    } catch { return false; }
  };

  const safeIsSameDay = (d1: any, d2: any) => {
    try {
      return isSameDay(new Date(d1), new Date(d2));
    } catch { return false; }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const email = (u.email || '').toLowerCase();
        if (OWNER_EMAILS.includes(email)) {
          // 소유자: 항상 관리자. 계정 목록에도 자동 등록
          setIsAdmin(true);
          setAccessState('approved');
          setDoc(doc(db, 'registered_users', u.uid), { id: email, email, name: u.displayName || '', role: 'admin' }, { merge: true }).catch(e => console.warn('owner register failed', e));
        } else {
          try {
            const userDoc = await getDoc(doc(db, 'registered_users', u.uid));
            if (userDoc.exists()) {
              setIsAdmin(userDoc.data().role === 'admin');
              setAccessState('approved');
            } else {
              // 승인되지 않은 계정: 관리자에게 승인 요청을 남기고 대기 화면으로
              setIsAdmin(false);
              setAccessState('pending');
              await setDoc(doc(db, 'access_requests', u.uid), {
                uid: u.uid, email, name: u.displayName || '', photoURL: u.photoURL || '', requestedAt: serverTimestamp(),
              }, { merge: true }).catch(e => console.warn('access request failed', e));
            }
          } catch (e) {
            console.error("Role check error:", e);
            setIsAdmin(false);
            setAccessState('pending');
          }
        }
      } else {
        setIsAdmin(false);
        setAccessState('checking');
      }
      
      try {
        const appConfig = await getDoc(doc(db, 'settings', 'app_config'));
        if (appConfig.exists()) {
          setAppName(appConfig.data().appName || 'EduScheduler');
          setAppLogo(appConfig.data().appLogo || './app-logo.png');
          setDioramaUrls(appConfig.data().dioramaUrls || { '강릉분원': '', '춘천본원': '', '원주분원': '' });
        }
      } catch (err) {
        console.error("App config fetch error:", err);
      }

      setIsAuthInitialCheckDone(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, 'registered_users'), orderBy('id'));
    const u1 = onSnapshot(q, (snapshot) => {
      setRegisteredUsers(snapshot.docs.map(d => ({ ...d.data(), uid: d.id } as any)));
    }, err => console.warn('registered_users snapshot error', err));
    const u2 = onSnapshot(collection(db, 'access_requests'), (snapshot) => {
      setAccessRequests(snapshot.docs.map(d => ({ ...d.data(), uid: d.id } as any)));
    }, err => console.warn('access_requests snapshot error', err));
    return () => { u1(); u2(); };
  }, [isAdmin]);

  const approveAccess = async (req: { uid: string; email: string; name?: string }, role: 'user' | 'admin' = 'user') => {
    try {
      await setDoc(doc(db, 'registered_users', req.uid), { id: req.email, email: req.email, name: req.name || '', role, createdAt: serverTimestamp() });
      await deleteDoc(doc(db, 'access_requests', req.uid));
      showNotify(`${req.name || req.email} 님을 승인했습니다.`);
    } catch (err) { console.error(err); showNotify('승인 중 오류가 발생했습니다.'); }
  };
  const rejectAccess = async (req: { uid: string; email: string }) => {
    if (!window.confirm(`${req.email} 의 접근 요청을 거절할까요?`)) return;
    try { await deleteDoc(doc(db, 'access_requests', req.uid)); } catch (err) { console.error(err); }
  };
  const toggleUserRole = async (ru: { uid: string; id: string; role: string }) => {
    const next = ru.role === 'admin' ? 'user' : 'admin';
    if (!window.confirm(`${ru.id} 을(를) ${next === 'admin' ? '관리자로' : '일반 사용자로'} 바꿀까요?`)) return;
    try { await updateDoc(doc(db, 'registered_users', ru.uid), { role: next }); } catch (err) { console.error(err); showNotify('권한 변경 중 오류가 발생했습니다.'); }
  };
  const recheckAccess = async () => {
    if (!user) return;
    try {
      const userDoc = await getDoc(doc(db, 'registered_users', user.uid));
      if (userDoc.exists()) { setIsAdmin(userDoc.data().role === 'admin'); setAccessState('approved'); }
      else showNotify('아직 승인되지 않았습니다. 관리자에게 승인을 요청해주세요.');
    } catch { showNotify('아직 승인되지 않았습니다.'); }
  };

  // ---------- 데이터 백업 · 내보내기 (관리자) ----------
  const [lastBackup, setLastBackup] = useState<{ at: number; by: string } | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [csvTarget, setCsvTarget] = useState<'schedules' | 'todos' | 'trips' | 'dayNotes' | 'handoffNotes'>('schedules');
  const restoreInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isAdmin || !canRead) return;
    return onSnapshot(doc(db, 'settings', 'backup'), (snap) => {
      const d = snap.data();
      setLastBackup(d?.lastBackupAt?.toMillis ? { at: d.lastBackupAt.toMillis(), by: d.by || '' } : null);
    }, err => console.warn('backup info error', err));
  }, [isAdmin, canRead]);

  const exportBackup = async () => {
    setBackupBusy(true);
    try {
      const out: Record<string, { id: string; data: any }[]> = {};
      let total = 0;
      for (const name of BACKUP_COLLECTIONS) {
        try {
          const snap = await getDocs(collection(db, name));
          out[name] = snap.docs.map(d => ({ id: d.id, data: encodeBackupValue(d.data()) }));
          total += snap.size;
        } catch (e) { console.warn('backup skip', name, e); out[name] = []; }
      }
      const payload = { app: 'edu-scheduler-premium', version: 2, exportedAt: new Date().toISOString(), exportedBy: user?.email || '', collections: out };
      downloadFile(`업무수첩-백업-${format(new Date(), 'yyyyMMdd-HHmm')}.json`, JSON.stringify(payload, null, 1), 'application/json');
      await setDoc(doc(db, 'settings', 'backup'), { lastBackupAt: Timestamp.now(), by: user?.displayName || user?.email || '' }).catch(() => {});
      showNotify(`백업 완료: 문서 ${total}개를 파일로 저장했습니다.`);
    } catch (err) { console.error(err); showNotify('백업 중 오류가 발생했습니다.'); }
    finally { setBackupBusy(false); }
  };

  const exportCsv = async () => {
    setBackupBusy(true);
    try {
      const snap = await getDocs(collection(db, csvTarget));
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      let header: string[] = []; let body: any[][] = []; let label = '';
      if (csvTarget === 'schedules') {
        label = '수업일정';
        header = ['날짜', '요일', '시작', '종료', '프로그램', '장소', '대상', '담당 교사', '종류'];
        body = rows.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)).map(r => [r.date, r.day, r.startTime, r.endTime, r.program, r.location, r.target, r.teacherName, categoryOf(r.category).label]);
      } else if (csvTarget === 'todos') {
        label = '할일';
        const st: Record<string, string> = { todo: '할 일', doing: '진행 중', done: '완료' };
        header = ['마감일', '제목', '상태', '분류', '담당자', '공문 번호', '제출처', '태그', '체크리스트', '메모', '등록자', '등록일'];
        body = rows.sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')).map(r => [r.dueDate || '', r.title, st[r.status] || r.status, todoCategoryOf(r.category).label, r.assigneeName || '', r.docNo || '', r.docTo || '', (r.tags || []).join(' '), (r.checklist || []).map((c: any) => `${c.done ? '[v]' : '[ ]'} ${c.text}`).join(' / '), r.note || '', r.createdBy || '', tsText(r.createdAt)]);
      } else if (csvTarget === 'trips') {
        label = '출장';
        header = ['시작일', '종료일', '출장명', '출장자', '장소', '결과', '등록자'];
        body = rows.sort((a, b) => a.startDate.localeCompare(b.startDate)).map(r => [r.startDate, r.endDate, r.title, r.assigneeName || '', r.place || '', r.result || '', r.authorName || '']);
      } else if (csvTarget === 'dayNotes') {
        label = '날짜메모';
        header = ['날짜', '내용', '작성자', '수정일'];
        body = rows.sort((a, b) => a.date.localeCompare(b.date)).map(r => [r.date, r.content, r.authorName || '', tsText(r.updatedAt)]);
      } else {
        label = '업무메모';
        header = ['작성일', '제목', '내용', '작성자'];
        body = rows.sort((a, b) => tsText(a.createdAt).localeCompare(tsText(b.createdAt))).map(r => [tsText(r.createdAt), r.title, r.content, r.authorName || '']);
      }
      downloadFile(`업무수첩-${label}-${format(new Date(), 'yyyyMMdd')}.csv`, toCsv(header, body), 'text/csv;charset=utf-8');
      showNotify(`${label} ${body.length}건을 엑셀용 파일로 저장했습니다.`);
    } catch (err) { console.error(err); showNotify('내보내기 중 오류가 발생했습니다.'); }
    finally { setBackupBusy(false); }
  };

  const restoreBackup = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed?.app !== 'edu-scheduler-premium' || !parsed.collections) { alert('이 앱의 백업 파일이 아닙니다.'); return; }
      const names = Object.keys(parsed.collections).filter(n => BACKUP_COLLECTIONS.includes(n) && !RESTORE_SKIP.includes(n));
      const summary = names.map(n => `· ${n}: ${(parsed.collections[n] || []).length}개`).join('\n');
      if (!window.confirm(`백업 파일(${parsed.exportedAt ? parsed.exportedAt.slice(0, 16).replace('T', ' ') : '날짜 모름'})을 복원할까요?\n\n${summary}\n\n· 백업에 있는 문서는 백업 당시 내용으로 덮어씁니다.\n· 백업 이후 새로 만든 문서는 지워지지 않고 그대로 남습니다.\n· 계정 목록(registered_users)은 복원하지 않습니다.`)) return;
      setBackupBusy(true);
      let written = 0;
      for (const name of names) {
        const docs: { id: string; data: any }[] = parsed.collections[name] || [];
        for (let i = 0; i < docs.length; i += 400) {
          const batch = writeBatch(db);
          docs.slice(i, i + 400).forEach(d => { if (d && d.id) batch.set(doc(db, name, d.id), decodeBackupValue(d.data || {})); });
          await batch.commit();
          written += Math.min(400, docs.length - i);
        }
      }
      showNotify(`복원 완료: 문서 ${written}개를 되살렸습니다.`);
    } catch (err) { console.error(err); alert('복원 중 오류가 발생했습니다. 파일이 손상되지 않았는지 확인해주세요.'); }
    finally { setBackupBusy(false); if (restoreInputRef.current) restoreInputRef.current.value = ''; }
  };
  const backupAgeDays = lastBackup ? Math.floor((Date.now() - lastBackup.at) / 86400000) : null;

  useEffect(() => {
    if (!canRead) return;
    const q = query(collection(db, 'schedules'), orderBy('startTime'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSchedules(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Schedule));
      if (!snapshot.metadata.fromCache) setSchedulesLoaded(true);
    }, err => console.warn('schedules snapshot error', err));
    return () => unsubscribe();
  }, [canRead]);

  useEffect(() => {
    if (!canRead) return;
    setGnStatus('connecting');
    try {
      return subscribeGangneung({
        onEntries: (list) => { setGnEntries(list); setGnStatus('ok'); setGnError(''); },
        onRooms: (rooms) => setGnCustomRooms(rooms),
        onError: (_which, err) => { setGnStatus('error'); setGnError(describeHubError(err)); },
      });
    } catch (err) {
      setGnStatus('error');
      setGnError(describeHubError(err));
    }
  }, [user?.uid, canRead]);

  useEffect(() => {
    if (!BRIDGE_MIRROR_ENABLED || !user || !isAdmin || !isAuthInitialCheckDone || !schedulesLoaded) return;
    let cancelled = false;
    syncMirror(schedules, gnRooms)
      .then((r) => {
        if (cancelled) return;
        setMirrorInfo({
          state: 'ok',
          message: r.written + r.deleted > 0 ? `방금 ${r.written}건 반영, ${r.deleted}건 삭제` : '최신 상태입니다',
        });
      })
      .catch((err) => {
        if (!cancelled) setMirrorInfo({ state: 'error', message: describeHubError(err) });
      });
    return () => { cancelled = true; };
  }, [user?.uid, isAdmin, isAuthInitialCheckDone, schedulesLoaded, schedules, gnRooms]);

  useEffect(() => {
    if (!canRead) return;
    const q = query(collection(db, 'system_notifications'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      setNotifs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as SystemNotification));
    }, err => console.warn('system_notifications snapshot error', err));
  }, [canRead]);

  useEffect(() => {
    if (!canRead) return;
    return onSnapshot(collection(db, 'gnEntryTeachers'), (snapshot) => {
      const map: Record<string, string> = {};
      snapshot.forEach(d => { const v = d.data().teacherId; if (v) map[d.id] = v; });
      setGnEntryTeachers(map);
    }, err => console.warn('gnEntryTeachers snapshot error', err));
  }, [user?.uid, canRead]);

  const assignGnEntryTeacher = async (entryId: string, teacherId: string) => {
    try {
      if (!teacherId) {
        await deleteDoc(doc(db, 'gnEntryTeachers', entryId));
      } else {
        await setDoc(doc(db, 'gnEntryTeachers', entryId), { teacherId, updatedAt: serverTimestamp() });
      }
    } catch (e) {
      console.warn('gnEntryTeachers write failed', e);
      showNotify('담당 교사 저장에 실패했습니다.');
    }
  };

  useEffect(() => {
    if (!canRead) return;
    const q = query(collection(db, 'teachers'), orderBy('name'));
    return onSnapshot(q, (snapshot) => {
      const fetchedTeachers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Teacher);
      setTeachers(fetchedTeachers);
      if (fetchedTeachers.length > 0 && !selectedTeacherId) {
        setSelectedTeacherId(fetchedTeachers[0].id);
      }
    }, err => console.warn('teachers snapshot error', err));
  }, [selectedTeacherId, canRead]);

  useEffect(() => {
    if (!canRead) return;
    const unsub = onSnapshot(doc(db, 'settings', 'config'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.programs) setPrograms(data.programs);
        if (data.locations) setLocations(data.locations);
        if (data.targets) setTargets(data.targets);
      } else {
        updateDoc(doc(db, 'settings', 'config'), {
          programs: DEFAULT_PROGRAMS,
          locations: DEFAULT_LOCATIONS,
          targets: DEFAULT_TARGETS
        }).catch(() => {
          import('firebase/firestore').then(({ setDoc }) => {
            setDoc(doc(db, 'settings', 'config'), {
              programs: DEFAULT_PROGRAMS,
              locations: DEFAULT_LOCATIONS,
              targets: DEFAULT_TARGETS
            });
          });
        });
      }
    }, err => console.warn('settings/config snapshot error', err));
    return () => unsub();
  }, [canRead]);

  useEffect(() => {
    if (!editingId) {
      setFormData(prev => ({
        ...prev,
        program: prev.program || programs[0] || '',
        location: prev.location || locations[0] || '',
        target: prev.target || targets[0] || ''
      }));
    }
  }, [programs, locations, targets, editingId]);

  // 업무 관리 알림 (상단 종 · 메뉴 배지)
  const [myTeacherIdApp] = useMyTeacherId(teachers, user?.displayName || '관리자');
  const taskAlerts = useTaskAlerts(myTeacherIdApp, user?.displayName || '관리자', canRead);
  const [alertsOpenReq, setAlertsOpenReq] = useState(0);
  const openTaskAlerts = () => { setViewMode('tasks'); setAlertsOpenReq(n => n + 1); };

  const calendarDays = useMemo(() => {
    try {
      const monthStart = startOfMonth(baseDate);
      if (!isValid(monthStart)) return [];
      
      const startOfGrid = startOfWeek(monthStart, { weekStartsOn: 0 });
      if (!isValid(startOfGrid)) return [];

      return Array.from({ length: 42 }).map((_, i) => addDays(startOfGrid, i));
    } catch (err) {
      console.error("Calendar engine error:", err);
      return [];
    }
  }, [baseDate]);

  useEffect(() => {
    if (calendarDays.length === 0) return;
    const years = Array.from(new Set(calendarDays.map(d => getYear(d))));
    const missing = years.filter(y => !fetchedHolidayYearsRef.current.has(y));
    if (missing.length === 0) return;
    missing.forEach(year => {
      fetchedHolidayYearsRef.current.add(year);
      fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/KR`)
        .then(res => res.ok ? res.json() : [])
        .then((list: { date: string; localName: string }[]) => {
          if (!Array.isArray(list)) return;
          setKoreanHolidays(prev => {
            const next = { ...prev };
            list.forEach(h => { if (!next[h.date]) next[h.date] = h.localName; });
            return next;
          });
        })
        .catch(() => { /* 네트워크 오류 시 정적 데이터로만 표시 */ });
    });
  }, [calendarDays]);

  const weeksOfCurrentMonth = useMemo(() => {
    const weeks = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      weeks.push(calendarDays.slice(i, i + 7));
    }
    return weeks;
  }, [calendarDays]);

  useEffect(() => {
    if (weeksOfCurrentMonth.length > 0 && selectedWeekIndex >= weeksOfCurrentMonth.length) {
      setSelectedWeekIndex(0);
    }
  }, [weeksOfCurrentMonth, selectedWeekIndex]);

  const currentViewWeek = weeksOfCurrentMonth[selectedWeekIndex] || weeksOfCurrentMonth[0] || [];

  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const filteredSchedules = useMemo(() => {
    return schedules.filter(s => {
      const matchesSearch = 
        [s.program, s.location, s.target, s.teacherName].some(v => (v || '').toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesDay = selectedDay ? s.day === selectedDay : true;
      const matchesTeacher = viewMode === 'teacher' ? s.teacherId === selectedTeacherId : true;
      const matchesCategory = categoryFilter === 'all' ? true : (s.category || 'class') === categoryFilter;
      return matchesSearch && matchesDay && matchesTeacher && matchesCategory;
    });
  }, [schedules, searchTerm, selectedDay, viewMode, selectedTeacherId, categoryFilter]);

  const handleIdPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginId || !loginPw) return;
    setIsLoginLoading(true);
    setLoginError('');
    try {
      const email = loginId.includes('@') ? loginId : `${loginId}@edu-admin.com`;
      // 보안: 없는 아이디로 로그인해도 계정이 자동으로 만들어지지 않습니다.
      // 새 계정은 관리자가 설정 > 계정 관리에서만 만들 수 있습니다.
      await signInWithEmailAndPassword(auth, email, loginPw);
      setLoginId('');
      setLoginPw('');
    } catch (err: any) {
      console.error("Login process error:", err);
      const errorCode = err.code || 'unknown';
      let message = '아이디 또는 비밀번호가 일치하지 않습니다.';
      
      if (errorCode === 'auth/operation-not-allowed') {
        message = '로그인 설정 오류: Firebase 콘솔에서 이메일 로그인을 활성화해주세요.';
      } else if (errorCode === 'auth/unauthorized-domain') {
        message = '도메인 허용 오류: Firebase 콘솔 [설정 > 승인된 도메인]에 fumon1218.github.io를 추가해주세요.';
      } else if (errorCode === 'auth/network-request-failed') {
        message = '네트워크 오류가 발생했습니다.';
      }
      
      setLoginError(message);
    } finally {
      setIsLoginLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (err) { console.error(err); }
  };

  const handleLogout = async () => { await signOut(auth); };

  const handleProfileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    
    setIsUploading(true);
    try {
      const storageRef = ref(storage, `profiles/${user.uid}`);
      await uploadBytes(storageRef, file);
      const photoURL = await getDownloadURL(storageRef);
      
      await updateProfile(user, { photoURL });
      await updateDoc(doc(db, 'registered_users', user.uid), { photoURL }).catch(() => {});
      
      setUser({ ...user, photoURL } as User);
      showNotify('프로필 사진이 업데이트되었습니다.');
    } catch (err) {
      console.error(err);
      showNotify('사진 업로드 중 오류가 발생했습니다.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleAppLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isAdmin) return;
    
    setIsLogoUploading(true);
    try {
      const storageRef = ref(storage, `app/logo`);
      await uploadBytes(storageRef, file);
      const logoURL = await getDownloadURL(storageRef);
      
      setAppLogo(logoURL);
      await setDoc(doc(db, 'settings', 'app_config'), { 
        appLogo: logoURL,
        updatedAt: serverTimestamp()
      }, { merge: true });
      showNotify('앱 로고가 변경되었습니다.');
    } catch (err) {
      console.error(err);
      showNotify('로고 업로드 중 오류가 발생했습니다.');
    } finally {
      setIsLogoUploading(false);
    }
  };

  const handleUpdateAppName = async (newName: string) => {
    if (!isAdmin) return;
    try {
      setAppName(newName);
      await setDoc(doc(db, 'settings', 'app_config'), { 
        appName: newName,
        updatedAt: serverTimestamp()
      }, { merge: true });
      showNotify('앱 이름이 변경되었습니다.');
    } catch (err) {
      console.error(err);
      showNotify('변경 중 오류가 발생했습니다.');
    }
  };

  const handleUpdateDisplayName = async (newName: string) => {
    if (!user) return;
    try {
      await updateProfile(user, { displayName: newName });
      await updateDoc(doc(db, 'registered_users', user.uid), { 
        displayName: newName,
        updatedAt: serverTimestamp()
      }).catch(() => {});
      
      setUser({ ...user, displayName: newName } as User);
      showNotify('프로필 이름이 변경되었습니다.');
    } catch (err) {
      console.error(err);
      showNotify('변경 중 오류가 발생했습니다.');
    }
  };

  const handleUpdateDioramaUrl = async (name: string, url: string) => {
    if (!isAdmin) return;
    try {
      const newUrls = { ...dioramaUrls, [name]: url };
      setDioramaUrls(newUrls);
      await setDoc(doc(db, 'settings', 'app_config'), { 
        dioramaUrls: newUrls,
        updatedAt: serverTimestamp()
      }, { merge: true });
      showNotify(`${name} 링크가 저장되었습니다.`);
    } catch (err) {
      console.error(err);
      showNotify('저장 중 오류가 발생했습니다.');
    }
  };

  const scrollToNotifications = () => {
    const el = document.getElementById('system-notifications');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
      el.classList.add('ring-2', 'ring-yellow-400');
      setTimeout(() => el?.classList.remove('ring-2', 'ring-yellow-400'), 2000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const teacherName = teachers.find(t => t.id === formData.teacherId)?.name || '';
      const { repeat, repeatEndDate, ...rest } = formData;
      const dataToSave = { ...rest, teacherName, updatedAt: Timestamp.now() };

      if (editingId) {
        await updateDoc(doc(db, 'schedules', editingId), dataToSave);
        showNotify('일정이 수정되었습니다.');
      } else if (repeat !== 'none' && repeatEndDate) {
        const dates: string[] = [];
        let cursor = parseISO(formData.date);
        const endDate = parseISO(repeatEndDate);
        while (cursor <= endDate && dates.length < 60) {
          dates.push(format(cursor, 'yyyy-MM-dd'));
          cursor = repeat === 'daily' ? addDays(cursor, 1) : repeat === 'weekly' ? addDays(cursor, 7) : addMonths(cursor, 1);
        }
        if (dates.length === 0) { showNotify('반복 종료일이 시작일보다 빠릅니다.'); return; }
        const seriesId = 'series_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const batch = writeBatch(db);
        dates.forEach((d) => {
          const ref = doc(collection(db, 'schedules'));
          batch.set(ref, { ...dataToSave, date: d, day: format(parseISO(d), 'EEE', { locale: ko })[0], seriesId, createdAt: Timestamp.now() });
        });
        await batch.commit();
        showNotify(`반복 일정 ${dates.length}건이 등록되었습니다.`);
      } else {
        await addDoc(collection(db, 'schedules'), { ...dataToSave, createdAt: Timestamp.now() });
        showNotify('일정이 추가되었습니다.');
      }
      resetForm();
    } catch (err) { console.error(err); showNotify('저장 중 오류가 발생했습니다.'); }
  };

  const handleEdit = (schedule: Schedule) => {
    setFormData({
      day: schedule.day, date: schedule.date, startTime: schedule.startTime, endTime: schedule.endTime,
      program: schedule.program, location: schedule.location, target: schedule.target,
      teacherId: schedule.teacherId || '', category: schedule.category || 'class',
      repeat: 'none', repeatEndDate: ''
    });
    setEditingId(schedule.id);
    setIsEditing(true);
  };

  const deleteSchedule = async (id: string) => {
    if (!window.confirm('정말 이 일정을 삭제하시겠습니까?')) return;
    try {
      await deleteDoc(doc(db, 'schedules', id));
      showNotify('일정이 삭제되었습니다.');
      resetForm();
    } catch (err) {
      showNotify('일정 삭제 중 오류가 발생했습니다.');
    }
  };

  const deleteSeries = async (seriesId: string, fromDate: string) => {
    const toDelete = schedules.filter(s => s.seriesId === seriesId && s.date >= fromDate);
    if (toDelete.length === 0) return;
    if (!window.confirm(`이 반복 일정 시리즈의 앞으로 남은 ${toDelete.length}건을 모두 삭제할까요? (지난 일정은 남겨둡니다)`)) return;
    try {
      const batch = writeBatch(db);
      toDelete.forEach(s => batch.delete(doc(db, 'schedules', s.id)));
      await batch.commit();
      showNotify(`반복 일정 ${toDelete.length}건이 삭제되었습니다.`);
      resetForm();
    } catch (err) {
      showNotify('삭제 중 오류가 발생했습니다.');
    }
  };

  const saveNotif = async () => {
    if (!notifForm.title.trim()) return;
    try {
      if (editingNotifId === 'new') {
        await addDoc(collection(db, 'system_notifications'), {
          ...notifForm,
          createdAt: serverTimestamp()
        });
      } else if (editingNotifId) {
        await updateDoc(doc(db, 'system_notifications', editingNotifId), notifForm);
      }
      setEditingNotifId(null);
      setNotifForm({ title: '', content: '' });
      showNotify('알림이 저장되었습니다.');
    } catch (err) {
      showNotify('알림 저장 오류가 발생했습니다.');
    }
  };

  const deleteNotif = async (id: string) => {
    if (!window.confirm('이 알림을 삭제하시겠습니까?')) return;
    try {
      await deleteDoc(doc(db, 'system_notifications', id));
      showNotify('알림이 삭제되었습니다.');
    } catch (err) {
      showNotify('삭제 오류가 발생했습니다.');
    }
  };

  const addTeacher = async () => {
    if (!newTeacherName.trim()) return;
    try {
      await addDoc(collection(db, 'teachers'), {
        name: newTeacherName,
        createdAt: serverTimestamp()
      });
      setNewTeacherName('');
      showNotify('교사가 추가되었습니다.');
    } catch (err) {
      showNotify('교사 추가 중 오류가 발생했습니다.');
    }
  };

  const deleteTeacher = async (id: string) => {
    const teacher = teachers.find(t => t.id === id);
    const linkedClasses = schedules.filter(s => s.teacherId === id).length;
    if (!window.confirm(`'${teacher?.name}' 교사를 명단에서 삭제하시겠습니까?${linkedClasses ? `\n\n이 선생님께 배정된 수업 ${linkedClasses}건은 삭제되지 않고 이름만 남습니다.` : ''}\n(할 일 · 출장의 담당자 표시도 이름만 남습니다)`)) return;
    try {
      await deleteDoc(doc(db, 'teachers', id));
      showNotify('교사가 삭제되었습니다.');
    } catch (err) {
      showNotify('교사 삭제 중 오류가 발생했습니다.');
    }
  };

  const updateTeacher = async (id: string, newName: string) => {
    const trimmedName = newName.trim();
    if (!trimmedName) return;
    const teacher = teachers.find(t => t.id === id);
    if (teacher?.name === trimmedName) return;

    try {
      await updateDoc(doc(db, 'teachers', id), { name: trimmedName });
      
      const q = query(collection(db, 'schedules'));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      
      let count = 0;
      snapshot.forEach(d => {
        if (d.data().teacherId === id) {
          batch.update(d.ref, { teacherName: trimmedName });
          count++;
        }
      });
      // 할 일 · 출장의 담당자 이름도 함께 변경
      const [todoSnap, tripSnap] = await Promise.all([getDocs(collection(db, 'todos')), getDocs(collection(db, 'trips'))]);
      todoSnap.forEach(d => { if (d.data().assigneeId === id) { batch.update(d.ref, { assigneeName: trimmedName }); count++; } });
      tripSnap.forEach(d => { if (d.data().assigneeId === id) { batch.update(d.ref, { assigneeName: trimmedName }); count++; } });
      
      if (count > 0) await batch.commit();
      
      showNotify('교사 정보가 수정되었습니다.');
    } catch (err) {
      console.error(err);
      showNotify('교사 수정 중 오류가 발생했습니다.');
    }
  };

  const createNewAccount = async (idArg?: string, pwArg?: string) => {
    const accId = (idArg ?? newUserId).trim();
    const accPw = (pwArg ?? newUserPw).trim();
    if (!accId || !accPw) return;
    try {
      const email = accId.includes('@') ? accId : `${accId}@edu.com`;
      
      const secondaryApp = initializeApp(firebaseConfig, 'Secondary');
      const secondaryAuth = getAuth(secondaryApp);
      
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, accPw);
      const newUid = userCredential.user.uid;
      
      await updateDoc(doc(db, 'registered_users', newUid), {
        id: accId,
        email: email,
        role: 'user',
        createdAt: serverTimestamp()
      }).catch(async () => {
        const { setDoc } = await import('firebase/firestore');
        await setDoc(doc(db, 'registered_users', newUid), {
          id: accId,
          email: email,
          role: 'user',
          createdAt: serverTimestamp()
        });
      });

      await deleteApp(secondaryApp);
      
      setNewUserId('');
      setNewUserPw('');
      ['new-account-id', 'new-account-pw'].forEach(elId => { const el = document.getElementById(elId) as HTMLInputElement | null; if (el) el.value = ''; });
      showNotify(`계정(${accId})이 생성되었습니다.`);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        showNotify('이미 존재하는 아이디입니다.');
      } else {
        showNotify('계정 생성 중 오류가 발생했습니다.');
      }
    }
  };

  const deleteAccount = async (uid: string, userId: string) => {
    if (uid === user?.uid) { showNotify('본인 계정은 삭제할 수 없습니다.'); return; }
    if (!window.confirm(`계정(${userId})의 접근 권한을 삭제하시겠습니까?\n삭제하면 이 계정은 더 이상 앱을 볼 수 없습니다.`)) return;
    try {
      await deleteDoc(doc(db, 'registered_users', uid));
      showNotify('계정 정보가 삭제되었습니다.');
    } catch (err) {
      showNotify('삭제 중 오류가 발생했습니다.');
    }
  };

  const updateCategories = async (type: 'programs' | 'locations' | 'targets', newList: string[]) => {
    try {
      await updateDoc(doc(db, 'settings', 'config'), { [type]: newList });
      showNotify('항목이 업데이트되었습니다.');
    } catch (err) {
      showNotify('업데이트 중 오류가 발생했습니다.');
    }
  };

  const addCategoryItem = (type: 'programs' | 'locations' | 'targets', value: string) => {
    if (!value.trim()) return;
    const currentList = type === 'programs' ? programs : type === 'locations' ? locations : targets;
    if (currentList.includes(value)) return showNotify('이미 존재하는 항목입니다.');
    updateCategories(type, [...currentList, value]);
  };

  const deleteCategoryItem = (type: 'programs' | 'locations' | 'targets', value: string) => {
    if (!window.confirm(`'${value}' 항목을 정말 삭제하시겠습니까?`)) return;
    const currentList = type === 'programs' ? programs : type === 'locations' ? locations : targets;
    updateCategories(type, currentList.filter(item => item !== value));
  };

  const updateCategoryItem = (type: 'programs' | 'locations' | 'targets', oldValue: string, newValue: string) => {
    const trimmedValue = newValue.trim();
    if (!trimmedValue || oldValue === trimmedValue) return;
    const currentList = type === 'programs' ? programs : type === 'locations' ? locations : targets;
    if (currentList.includes(trimmedValue)) return showNotify('이미 존재하는 항목입니다.');
    updateCategories(type, currentList.map(item => item === oldValue ? trimmedValue : item));
  };

  const resetForm = () => {
    setFormData({
      day: '월', date: format(startOfToday(), 'yyyy-MM-dd'), startTime: '10:00', endTime: '12:00',
      program: programs[0] || '', location: locations[0] || '', target: targets[0] || '', teacherId: '',
      category: 'class', repeat: 'none', repeatEndDate: ''
    });
    setEditingId(null);
    setIsEditing(false);
  };

  const showNotify = (msg: string) => {
    setNotificationMsg(msg);
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 3000);
  };

  if (!isAuthInitialCheckDone) {
    return (
      <div className="fixed inset-0 bg-surface flex flex-col items-center justify-center z-[1000]">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex flex-col items-center"
        >
          <div className="w-20 h-20 bg-surface rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-200 mb-6 overflow-hidden p-2">
            <img src={appLogo} alt="Logo" className="w-full h-full object-contain" />
          </div>
          <h2 className="text-xl font-bold text-text-main tracking-tight whitespace-nowrap max-w-full overflow-hidden text-ellipsis px-4" title={appName}>{appName}</h2>
          <p className="text-sm text-text-muted mt-2">시스템 초기화 중...</p>
          <div className="mt-8 w-48 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <motion.div 
              initial={{ x: "-100%" }}
              animate={{ x: "100%" }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
              className="w-full h-full bg-accent-color"
            />
          </div>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginOverlay 
        onLogin={handleIdPasswordLogin} 
        onGoogleLogin={handleGoogleLogin}
        isLoading={isLoginLoading}
        error={loginError}
        appName={appName}
        appLogo={appLogo}
      />
    );
  }

  // 권한 확인 중: 잠깐 로딩 표시
  if (accessState === 'checking') {
    return (
      <div className="fixed inset-0 bg-surface flex flex-col items-center justify-center z-[1000]">
        <div className="w-8 h-8 border-2 border-accent-color border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-text-muted mt-4">접근 권한 확인 중...</p>
      </div>
    );
  }

  // 승인되지 않은 계정: 데이터 없이 대기 화면만 보여줌
  if (accessState !== 'approved') {
    return (
      <div className="fixed inset-0 bg-bg-primary flex items-center justify-center p-6 z-[1000]">
        <div className="w-full max-w-sm bg-surface border border-border-color rounded-3xl shadow-2xl p-8 text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-surface rounded-2xl flex items-center justify-center border border-border-color overflow-hidden p-2">
            <img src={appLogo} alt="Logo" className="w-full h-full object-contain" />
          </div>
          <h2 className="font-serif text-xl font-bold text-text-main">승인 대기 중</h2>
          <p className="text-sm text-text-muted leading-relaxed">
            <b className="text-text-main">{user.email}</b> 계정은 아직 승인되지 않았습니다.<br />
            관리자에게 승인을 요청해주세요. 승인 요청은 자동으로 전달되었습니다.
          </p>
          <div className="flex gap-2 pt-2">
            <button onClick={recheckAccess} className="flex-1 h-10 rounded-xl bg-accent-color text-on-accent text-sm font-bold">승인 확인</button>
            <button onClick={handleLogout} className="flex-1 h-10 rounded-xl border border-border-color text-sm font-bold text-text-muted">로그아웃</button>
          </div>
        </div>
        <AnimatePresence>{showNotification && (<motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} className="fixed bottom-8 left-4 right-4 sm:left-auto sm:right-8 bg-text-main text-bg-primary px-6 py-4 rounded-2xl shadow-2xl z-[1001] text-sm font-medium">{notificationMsg}</motion.div>)}</AnimatePresence>
      </div>
    );
  }

  // 디오라마 카드 배열 (PC 및 모바일/태블릿 동시 활용)
  const DIORAMA_ITEMS = [
    { name: '강릉분원', src: './diorama-gangneung.jpg', url: 'https://www.gninjae.or.kr' },
    { name: '춘천본원', src: './logo-chuncheon.jpg', url: 'https://jinro.gwe.go.kr' },
    { name: '원주분원', src: './logo-wonju.jpg', url: 'https://wj.gwe.go.kr' }
  ];

  // 설정 열기: 업무 관리 화면에서는 설정 창이 없으므로 리스트 화면으로 옮긴 뒤 엽니다.
  const openSettings = () => {
    if (viewMode === 'tasks') { setViewMode('list'); setIsSettingsOpen(true); }
    else setIsSettingsOpen(v => !v);
  };

  // PC 사이드바와 모바일 메뉴(서랍)에서 같이 쓰는 메뉴 내용
  const renderSidebarContent = () => (
    <>
        <div 
          onClick={() => { setViewMode('list'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          className="flex items-center gap-3 px-2 mb-10 cursor-pointer hover:opacity-80 transition-opacity"
        >
          <div className="w-10 h-10 bg-surface rounded-xl flex items-center justify-center shadow-md border border-border-color overflow-hidden p-1">
            <img src={appLogo} alt="Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="font-serif text-sm font-bold text-accent-color tracking-tight whitespace-nowrap overflow-hidden text-ellipsis min-w-0 flex-1" title={appName}>{appName}</h1>
        </div>
        
        <nav className="flex-1 space-y-1">
          <div onClick={() => { setViewMode('list'); setSelectedDay(null); }} className={cn("px-4 py-2.5 rounded-full text-sm font-semibold cursor-pointer flex items-center gap-3 transition-colors", viewMode === 'list' ? "bg-accent-color text-on-accent shadow-sm" : "text-text-muted hover:bg-gray-50")}><LayoutList size={18} /><span>리스트 보기</span></div>
          <div onClick={() => setViewMode('calendar')} className={cn("px-4 py-2.5 rounded-full text-sm font-semibold cursor-pointer flex items-center gap-3 transition-colors", viewMode === 'calendar' ? "bg-accent-color text-on-accent shadow-sm" : "text-text-muted hover:bg-gray-50")}><CalendarDays size={18} /><span>달력 보기</span></div>
          <div onClick={() => setViewMode('teacher')} className={cn("px-4 py-2.5 rounded-full text-sm font-semibold cursor-pointer flex items-center gap-3 transition-colors", viewMode === 'teacher' ? "bg-accent-color text-on-accent shadow-sm" : "text-text-muted hover:bg-gray-50")}><Users size={18} /><span>교사 시간표</span></div>
          <div onClick={() => setViewMode('tasks')} className={cn("px-4 py-2.5 rounded-full text-sm font-semibold cursor-pointer flex items-center gap-3 transition-colors", viewMode === 'tasks' ? "bg-accent-color text-on-accent shadow-sm" : "text-text-muted hover:bg-gray-50")}><ListChecks size={18} /><span>업무 관리</span>{taskAlerts.unreadCount > 0 && <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">{taskAlerts.unreadCount}</span>}</div>
          <div onClick={openSettings} className={cn("px-4 py-2.5 rounded-full text-sm font-medium cursor-pointer transition-colors flex items-center gap-3", isSettingsOpen ? "bg-gray-100 text-text-main" : "text-text-muted hover:bg-gray-50")}><Settings size={18} /><span>설정</span>{isAdmin && accessRequests.length > 0 && <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center" title="승인 대기 중인 계정">{accessRequests.length}</span>}</div>
          <a href={GANGNEUNG_APP_URL} target="_blank" rel="noopener noreferrer" title="강릉분원 방문예약 앱 열기" className="px-4 py-2.5 rounded-full text-sm font-medium cursor-pointer transition-colors flex items-center gap-3 text-text-muted hover:bg-gray-50"><Link2 size={18} /><span>강릉 방문예약</span><span className={cn("ml-auto w-2 h-2 rounded-full", gnStatus === 'ok' ? "bg-green-500" : gnStatus === 'error' ? "bg-red-500" : "bg-gray-300")} /></a>
          <a href={CHURCH_CALENDAR_URL} target="_blank" rel="noopener noreferrer" title="교회 캘린더 앱 열기 (새 창)" className="px-4 py-2.5 rounded-full text-sm font-medium cursor-pointer transition-colors flex items-center gap-3 text-text-muted hover:bg-gray-50"><CalendarIcon size={18} /><span>교회 캘린더</span><ExternalLink size={13} className="ml-auto opacity-50" /></a>
          
          <div className="mt-auto pt-6 px-4 space-y-4">
            <div className="bg-bg-primary/50 border border-border-color/50 rounded-xl p-3">
              <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest opacity-50 mb-1">Version</p>
              <p className="text-xs font-black text-accent-color tracking-tighter">Premium v2.9.2</p>
            </div>
            
            <div className="space-y-3">
              {DIORAMA_ITEMS.map(diorama => (
                <div 
                  key={diorama.name} 
                  onClick={() => {
                    const url = dioramaUrls[diorama.name];
                    if (url && url.startsWith('http')) {
                      window.open(url, '_blank');
                    } else {
                      showNotify(`${diorama.name} 홈페이지 준비 중입니다.`);
                    }
                  }}
                  className="rounded-xl overflow-hidden border border-border-color shadow-sm cursor-pointer group bg-surface active:scale-95 transition-all"
                >
                  <img src={diorama.src} alt={diorama.name} className="w-full h-20 object-cover group-hover:scale-110 transition-transform duration-700" />
                  <div className="p-1.5 bg-surface/80 backdrop-blur-sm border-t border-border-color/30">
                    <p className="text-[8px] font-bold text-text-muted text-center">{diorama.name} 디오라마</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </nav>

        <div className="pt-6 border-t border-border-color">
          <button onClick={toggleTheme} className="flex items-center gap-3 w-full px-4 py-2.5 rounded-full text-text-muted hover:bg-gray-50 transition-colors text-sm font-medium mb-1">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            <span>{theme === 'dark' ? '라이트 모드' : '다크 모드'}</span>
          </button>
          {user ? (
            <button onClick={handleLogout} className="flex items-center gap-3 w-full px-4 py-2.5 text-text-muted hover:text-red-500 transition-colors text-sm font-medium"><LogOut size={18} /><span>로그아웃</span></button>
          ) : (
            <button onClick={() => {}} className="flex items-center gap-3 w-full px-4 py-2.5 text-accent-color hover:bg-blue-50 transition-colors text-sm font-bold"><LogIn size={18} /><span>로그인</span></button>
          )}
        </div>
    </>
  );

  return (
    <div className="flex h-screen h-[100dvh] bg-bg-primary overflow-hidden font-sans select-none">

      {/* Sidebar (Desktop) - 내용이 길면 사이드바 안에서 스크롤 */}
      <aside className="hidden lg:flex w-64 h-full overflow-y-auto bg-sidebar-bg border-r border-border-color flex-col p-6 shrink-0">
        {renderSidebarContent()}
      </aside>

      {/* Sidebar (Mobile Drawer) - PC와 같은 메뉴를 햄버거 버튼으로 열기 */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="lg:hidden fixed inset-0 bg-black/30 backdrop-blur-sm z-[120]"
            />
            <motion.aside
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.25 }}
              onClick={(e) => { if ((e.target as HTMLElement).closest('a,button,.cursor-pointer')) setIsMobileMenuOpen(false); }}
              className="lg:hidden fixed top-0 left-0 bottom-0 w-72 max-w-[85vw] bg-sidebar-bg border-r border-border-color z-[130] flex flex-col px-6 overflow-y-auto overscroll-contain"
              style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))', paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
            >
              <button aria-label="메뉴 닫기" className="absolute top-3 right-3 p-2 text-text-muted hover:text-text-main" style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}><X size={20} /></button>
              {renderSidebarContent()}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="lg:hidden shrink-0 box-content bg-surface border-b border-border-color z-40 px-3 h-14 flex items-center justify-between gap-2" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <button onClick={() => setIsMobileMenuOpen(true)} aria-label="메뉴 열기" className="p-2 -ml-1 text-text-main hover:text-accent-color transition-colors shrink-0"><Menu size={22} /></button>
          <div 
            onClick={() => { setViewMode('list'); }}
            className="flex items-center gap-2 cursor-pointer min-w-0 flex-1"
          >
            <img src={appLogo} alt="Logo" className="w-7 h-7 object-contain shrink-0" />
            <span className="font-serif font-bold text-base tracking-tight text-accent-color whitespace-nowrap overflow-hidden text-ellipsis" title={appName}>{appName}</span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={toggleTheme} aria-label="라이트/다크 모드 전환" className="p-2 text-text-muted hover:text-accent-color transition-colors">{theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}</button>
            <a href={GANGNEUNG_APP_URL} target="_blank" rel="noopener noreferrer" title="강릉분원 방문예약 앱 열기" className="p-2 text-text-muted hover:text-accent-color transition-colors"><Link2 size={20} /></a>
            <button onClick={() => taskAlerts.unreadCount > 0 ? openTaskAlerts() : scrollToNotifications()} className="p-2 text-text-muted hover:text-accent-color transition-colors relative" title={taskAlerts.unreadCount > 0 ? `새 업무 알림 ${taskAlerts.unreadCount}건` : '알림'}>
              <Bell size={20} />
              {taskAlerts.unreadCount > 0
                ? <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">{taskAlerts.unreadCount > 9 ? '9+' : taskAlerts.unreadCount}</span>
                : <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-surface" />}
            </button>
            <div 
              onClick={() => { if (viewMode === 'tasks') setViewMode('list'); setIsSettingsOpen(true); }}
              className="w-8 h-8 rounded-full border border-border-color overflow-hidden cursor-pointer ml-1"
            >
              {user?.photoURL ? (
                <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-blue-50 flex items-center justify-center text-[10px] font-bold text-accent-color">
                  {user?.displayName?.slice(0, 1) || 'U'}
                </div>
              )}
            </div>
          </div>
        </header>
        <header className="h-14 lg:h-[72px] bg-surface border-b border-border-color flex items-center justify-between px-3 lg:px-8 shrink-0">
          <div className="flex items-center gap-4 flex-1 lg:max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted/50" size={16} />
              <input type="text" placeholder="프로그램, 장소, 대상 검색..." className="w-full h-10 pl-11 pr-4 bg-bg-primary border border-border-color rounded-full text-sm outline-none focus:border-accent-color transition-colors" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
          </div>
          <div className="hidden lg:flex items-center gap-4">
            <div onClick={() => taskAlerts.unreadCount > 0 || viewMode === 'tasks' ? openTaskAlerts() : scrollToNotifications()} title={taskAlerts.unreadCount > 0 ? `새 업무 알림 ${taskAlerts.unreadCount}건` : '알림'} className="relative w-10 h-10 bg-bg-primary rounded-full flex items-center justify-center cursor-pointer hover:bg-gray-100 transition-colors"><Bell size={18} className="text-text-main" />{taskAlerts.unreadCount > 0 ? <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center border-2 border-surface">{taskAlerts.unreadCount > 9 ? '9+' : taskAlerts.unreadCount}</span> : <span className="absolute top-2 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-surface" />}</div>
            <div className="flex items-center gap-3">
              {user && (
                <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block"><p className="text-sm font-semibold text-text-main">{user.displayName || user.email?.split('@')[0]}</p><p className="text-[10px] text-text-muted uppercase font-bold">{isAdmin ? 'Admin' : 'Staff'}</p></div>
                  <div className="relative group">
                    <div className="w-9 h-9 rounded-full bg-gray-100 border border-border-color overflow-hidden flex items-center justify-center shadow-inner">
                      {isUploading ? (
                        <div className="w-4 h-4 border-2 border-accent-color border-t-transparent rounded-full animate-spin" />
                      ) : user.photoURL ? (
                        <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs font-black text-gray-400 bg-gray-50">{user.displayName?.[0] || user.email?.[0]?.toUpperCase()}</div>
                      )}
                    </div>
                    <label className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                      <Camera size={14} className="text-white" />
                      <input type="file" accept="image/*" className="hidden" onChange={handleProfileUpload} />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content Viewport */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-10 pb-32 lg:pb-10 bg-bg-primary">
          {viewMode !== 'tasks' && (
          <div className="max-w-[1400px] mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 lg:gap-12">
              <div className="lg:col-span-4">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 lg:mb-12">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 md:shrink-0">
                    <div className="relative">
                  <h2 
                    onClick={() => (viewMode === 'calendar' || viewMode === 'teacher') && setIsDatePickerOpen(!isDatePickerOpen)} 
                    className={cn(
                      "font-serif text-2xl font-bold text-text-main transition-all",
                      (viewMode === 'calendar' || viewMode === 'teacher') && "cursor-pointer hover:text-accent-color flex items-center gap-2 group"
                    )}
                  >
                    {viewMode === 'list' ? '스케줄 관리' : 
                     viewMode === 'teacher' ? `${safeFormat(baseDate, 'yyyy년 M월')} 교사 시간표` : 
                     `${safeFormat(baseDate, 'yyyy년 M월')} 일정표`}
                  </h2>
                  <p className="text-sm text-text-muted">
                    {viewMode === 'teacher' ? `${teachers.find(t => t.id === selectedTeacherId)?.name ? teachers.find(t => t.id === selectedTeacherId)?.name + ' 선생님의 ' : '교사별 '}${safeFormat(baseDate, 'M월')} 시간표입니다 · 제목을 누르면 월을 바꿀 수 있어요` : '교육 프로그램 일정을 효율적으로 관리하세요'}
                  </p>
                  
                  <AnimatePresence>
                    {isDatePickerOpen && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute top-full left-0 mt-2 p-4 bg-surface border border-border-color rounded-2xl shadow-2xl z-[50] min-w-[280px]"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <button onClick={() => setBaseDate(subMonths(baseDate, 12))} className="p-1 hover:bg-gray-100 rounded-lg"><ChevronLeft size={16} /></button>
                          <span className="font-bold text-lg">{safeFormat(baseDate, 'yyyy년')}</span>
                          <button onClick={() => setBaseDate(addMonths(baseDate, 12))} className="p-1 hover:bg-gray-100 rounded-lg"><ChevronRight size={16} /></button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {Array.from({ length: 12 }).map((_, i) => {
                            const targetDate = new Date(getYear(baseDate), i, 1);
                            const isSelected = getMonth(baseDate) === i;
                            return (
                              <button
                                key={i}
                                onClick={() => {
                                  setBaseDate(targetDate);
                                  setIsDatePickerOpen(false);
                                }}
                                className={cn(
                                  "py-2 rounded-xl text-sm font-bold transition-all",
                                  isSelected ? "bg-accent-color text-on-accent shadow-md" : "hover:bg-gray-50 text-text-muted hover:text-text-main"
                                )}
                              >
                                {i + 1}월
                              </button>
                            );
                          })}
                        </div>
                        <div className="mt-4 pt-4 border-t border-border-color">
                          <button 
                            onClick={() => { setBaseDate(startOfToday()); setIsDatePickerOpen(false); }}
                            className="w-full py-2 text-xs font-bold text-accent-color hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            오늘로 이동
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                {(viewMode === 'calendar' || viewMode === 'teacher') && (
                  <div className="flex items-center gap-2 px-1 py-1 bg-surface border border-border-color rounded-full h-fit shrink-0">
                    <button onClick={() => setCalendarView('week')} className={cn("px-4 py-1.5 rounded-full text-xs font-bold transition-all", calendarView === 'week' ? "bg-accent-color text-on-accent shadow-sm" : "text-text-muted hover:text-text-main")}>주간</button>
                    <button onClick={() => setCalendarView('month')} className={cn("px-4 py-1.5 rounded-full text-xs font-bold transition-all", calendarView === 'month' ? "bg-accent-color text-on-accent shadow-sm" : "text-text-muted hover:text-text-main")}>월간</button>
                  </div>
                )}
                {viewMode === 'calendar' && weatherNow && (
                  <div className="flex items-center gap-2 px-4 py-1.5 bg-surface border border-border-color rounded-full h-fit shrink-0 shadow-sm" title={`강릉분원 실시간 날씨 · ${weatherIconOf(weatherNow.code).label}`}>
                    <span className="text-lg leading-none">{weatherIconOf(weatherNow.code).icon}</span>
                    <div className="flex flex-col leading-tight">
                      <span className="text-xs font-bold text-text-main whitespace-nowrap">강릉 {weatherNow.temp}°C</span>
                      <span className="text-[9px] text-text-muted whitespace-nowrap">{weatherIconOf(weatherNow.code).label}</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap lg:flex-nowrap items-center gap-2 lg:gap-3 w-full lg:overflow-x-auto no-scrollbar scroll-smooth pb-1">
                {viewMode === 'list' ? (
                  <div className="w-full lg:w-auto lg:flex-1 flex p-1 bg-surface border border-border-color rounded-full overflow-x-auto no-scrollbar scroll-smooth">
                    <button onClick={() => { setSelectedDay(null); }} className={cn("px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap", !selectedDay ? "bg-accent-color text-on-accent shadow-sm" : "text-text-muted hover:text-text-main")}>전체</button>
                    {DAYS.map(day => (<button key={day} onClick={() => { setSelectedDay(day); }} className={cn("px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap", selectedDay === day ? "bg-accent-color text-on-accent shadow-sm" : "text-text-muted hover:text-text-main")}>{day}요일</button>))}
                  </div>
                ) : viewMode === 'calendar' || viewMode === 'teacher' ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setBaseDate(subMonths(baseDate, 1))} className="p-2 bg-surface border border-border-color rounded-full hover:bg-gray-50 transition-colors"><ChevronLeft size={16} /></button>
                    <button onClick={() => setBaseDate(startOfToday())} className="px-4 py-1.5 bg-surface border border-border-color rounded-full text-xs font-bold hover:bg-gray-50 transition-colors">오늘</button>
                    <button onClick={() => setBaseDate(addMonths(baseDate, 1))} className="p-2 bg-surface border border-border-color rounded-full hover:bg-gray-50 transition-colors"><ChevronRight size={16} /></button>
                  </div>
                ) : null}
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  title="일정 종류로 좁혀보기"
                  className="h-9 px-3 bg-surface border border-border-color rounded-full text-xs font-bold outline-none focus:border-accent-color cursor-pointer shrink-0"
                >
                  <option value="all">전체 종류</option>
                  {SCHEDULE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <div className="h-8 w-[1px] bg-border-color mx-1 shrink-0 hidden sm:block" />
                <button onClick={() => setViewMode(prev => prev === 'list' ? 'calendar' : 'list')} className="bg-surface border border-border-color rounded-full hover:bg-gray-50 transition-colors text-text-main flex items-center gap-2 px-4 h-[40px] shadow-sm shrink-0">
                  {viewMode === 'list' ? <><CalendarDays size={16} className="text-accent-color" /><span className="text-xs font-bold whitespace-nowrap">달력 보기</span></> : <><LayoutList size={16} className="text-accent-color" /><span className="text-xs font-bold whitespace-nowrap">리스트 보기</span></>}
                </button>
                <button
                  onClick={() => setShowGnEntries(v => !v)}
                  title={gnStatus === 'error' ? gnError : '강릉분원 방문예약을 함께 표시합니다'}
                  className={cn("border rounded-full transition-colors flex items-center gap-2 px-4 h-[40px] shadow-sm shrink-0 text-xs font-bold whitespace-nowrap", showGnEntries ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-surface border-border-color text-text-muted hover:bg-gray-50")}
                >
                  <Link2 size={14} />
                  <span>방문예약 {showGnEntries ? '표시 중' : '숨김'}</span>
                  {gnStatus === 'error' && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                </button>
              </div>
            </div>

            {(viewMode === 'calendar' || viewMode === 'teacher') && calendarView === 'week' && (
              <div className="flex p-1 bg-surface border border-border-color rounded-full mb-6 w-full sm:w-fit mx-auto shadow-sm overflow-x-auto no-scrollbar">
                {weeksOfCurrentMonth.map((week, idx) => (
                  <button key={idx} onClick={() => setSelectedWeekIndex(idx)} className={cn("px-6 py-2 rounded-2xl text-sm font-bold transition-all flex flex-col items-center min-w-[100px]", selectedWeekIndex === idx ? "bg-accent-color text-on-accent shadow-md scale-105" : "text-text-muted hover:text-text-main")}>
                    <span>{idx + 1}주차</span>
                    <span className={cn("text-[10px] opacity-60 font-normal", selectedWeekIndex === idx ? "text-white" : "text-text-muted")}>
                      {safeFormat(week[0], 'M.d')}~{safeFormat(week[6], 'M.d')}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {viewMode === 'teacher' && (
              <div className="flex p-1 bg-surface border border-border-color rounded-full mb-6 w-full sm:w-fit mx-auto shadow-sm overflow-x-auto no-scrollbar">
                {teachers.map((teacher) => (
                  <button key={teacher.id} onClick={() => setSelectedTeacherId(teacher.id)} className={cn("px-6 py-2 rounded-full text-sm font-bold transition-all min-w-[100px]", selectedTeacherId === teacher.id ? "bg-blue-600 text-white shadow-md" : "text-text-muted hover:text-text-main")}>
                    {teacher.name}
                  </button>
                ))}
                {teachers.length === 0 && <p className="px-6 py-2 text-sm text-text-muted italic">등록된 교사가 없습니다. 교사 관리에서 추가해주세요.</p>}
              </div>
            )}

            <div className="flex flex-col gap-8">
              <div className="space-y-6">
                {viewMode === 'list' ? (
                  <div className="bg-surface rounded-2xl border border-border-color overflow-hidden shadow-sm">
                    <div className="px-6 py-4 border-b border-border-color flex items-center justify-between bg-soft">
                      <span className="text-sm font-bold text-text-main uppercase tracking-tight">수업 일정표</span>
                      <span className="text-xs font-medium text-text-muted">{filteredSchedules.length}개의 일정</span>
                    </div>
                    <div className="divide-y divide-border-color">
                      {filteredSchedules.map((s) => (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key={s.id} className="p-4 sm:p-6 hover:bg-gray-50/50 transition-colors group relative border-l-4" style={{ borderLeftColor: 'transparent' }}>
                          <div className={cn("absolute left-0 top-0 bottom-0 w-1", categoryOf(s.category).dot)} />
                          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                            <div className="w-16 h-16 rounded-xl bg-bg-primary border border-border-color flex flex-col items-center justify-center shrink-0"><span className="text-xs font-bold text-text-muted">{s.day}</span><span className="text-[10px] font-medium text-text-muted opacity-60">요일</span></div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-1 flex-wrap"><div className="flex items-center gap-1.5 text-accent-color"><Clock size={14} /><span className="text-xs font-bold">{s.startTime} - {s.endTime}</span></div><div className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{s.date}</div><span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", categoryOf(s.category).bg, categoryOf(s.category).text)}>{categoryOf(s.category).label}</span>{s.seriesId && <span title="반복 일정" className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 flex items-center gap-1">🔁 반복</span>}</div>
                              <h3 className="text-base font-bold text-text-main truncate mb-1">{s.program}</h3>
                              <div className="flex flex-wrap gap-4 items-center"><div className="flex items-center gap-1.5 text-xs text-text-muted"><MapPin size={12} className="opacity-50" /><span>{s.location}</span></div><div className="flex items-center gap-1.5 text-xs text-text-muted"><Users size={12} className="opacity-50" /><span>{s.target}</span></div></div>
                              {showGnEntries && <GnLinkedTags schedule={s} entries={gnEntries} rooms={gnRooms} />}
                            </div>
                            {isAdmin && (
                              <div className="flex items-center gap-1 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="text-[10px] font-bold text-gray-400 mr-2">{s.teacherName}</span>
                                <button onClick={() => handleEdit(s)} className="p-2 text-text-muted hover:text-accent-color rounded-lg hover:bg-blue-50 transition-all"><Edit2 size={16} /></button>
                                <button onClick={() => deleteSchedule(s.id)} className="p-2 text-text-muted hover:text-red-500 rounded-lg hover:bg-red-50 transition-all"><Trash2 size={16} /></button>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      ))}
                      {filteredSchedules.length === 0 && <div className="p-20 text-center"><div className="w-12 h-12 bg-bg-primary rounded-full flex items-center justify-center mx-auto mb-4 border border-border-color"><CalendarDays size={20} className="text-text-muted opacity-30" /></div><p className="text-sm font-medium text-text-muted">일정이 없습니다.</p></div>}
                    </div>
                  </div>
                ) : calendarView === 'week' ? (
                  <div className="bg-surface rounded-2xl border border-border-color overflow-x-auto lg:overflow-hidden shadow-sm">
                    <div className="grid grid-cols-7 min-w-[720px] lg:min-w-0 border-b border-border-color bg-soft">
                      {currentViewWeek.map((dayDate, idx) => {
                        const dateStr = safeFormat(dayDate, 'yyyy-MM-dd');
                        const holidayName = koreanHolidays[dateStr];
                        const dayWeather = weatherDaily[dateStr];
                        const isOffDay = !!holidayName || dayDate.getDay() === 0;
                        return (
                          <div key={idx} className={cn("py-4 text-center border-r border-border-color last:border-r-0", !safeIsSameMonth(dayDate, baseDate) && "opacity-30 bg-gray-50", safeIsSameDay(dayDate, startOfToday()) && "bg-blue-50/50")}>
                            <span className={cn("text-[10px] font-bold block mb-1 uppercase tracking-tighter", isOffDay ? "text-sun" : dayDate.getDay() === 6 ? "text-sat" : "text-text-muted")}>{safeFormat(dayDate, 'EEE', { locale: ko })}</span>
                            <span className={cn("font-serif text-lg font-bold block", safeIsSameDay(dayDate, startOfToday()) ? "text-accent-color" : isOffDay ? "text-sun" : dayDate.getDay() === 6 ? "text-sat" : "text-text-main")}>{safeFormat(dayDate, 'd')}</span>
                            {holidayName && <span className="text-[8px] font-bold text-sun block mt-0.5 truncate px-1" title={holidayName}>{holidayName}</span>}
                            {dayWeather && <span className="text-[9px] text-text-muted block mt-0.5 opacity-70 whitespace-nowrap">{weatherIconOf(dayWeather.code).icon} {dayWeather.max}°/{dayWeather.min}°</span>}
                          </div>
                        );
                      })}
                    </div>
                    <div className="grid grid-cols-7 min-w-[720px] lg:min-w-0 min-h-[550px] divide-x divide-border-color">
                      {currentViewWeek.map((dayDate, idx) => {
                        const dateStr = safeFormat(dayDate, 'yyyy-MM-dd');
                        const daySchedules = filteredSchedules.filter(s => s.date === dateStr);
                        return (
                          <div key={idx} className={cn("p-2 space-y-2 min-h-[400px]", !safeIsSameMonth(dayDate, baseDate) ? "bg-gray-50/30" : "bg-surface")}>
                            {isAdmin && (
                              <button 
                                onClick={() => { 
                                  setFormData({ 
                                    ...formData, 
                                    date: dateStr, 
                                    day: safeFormat(dayDate, 'EEE', { locale: ko })[0],
                                    teacherId: viewMode === 'teacher' ? selectedTeacherId : formData.teacherId 
                                  }); 
                                  setEditingId(null);
                                  document.getElementById('schedule-form')?.scrollIntoView({ behavior: 'smooth' });
                                  setTimeout(() => document.getElementById('program-input')?.focus(), 100);
                                }} 
                                className="w-full py-1.5 border border-dashed border-gray-200 rounded-lg text-gray-300 hover:text-accent-color hover:border-accent-color transition-all text-xs flex items-center justify-center gap-1 group"
                              >
                                <Plus size={10} />
                              </button>
                            )}
                            {daySchedules.map(s => (<motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} key={s.id} onClick={() => handleEdit(s)} className={cn("p-2 rounded-xl border-l-4 border border-border-color bg-bg-primary hover:border-accent-color hover:shadow-md transition-all cursor-pointer group relative", categoryOf(s.category).border)}><div className="flex items-center gap-1 mb-0.5"><span className="text-[9px] font-bold text-accent-color">{s.startTime}</span>{s.seriesId && <span className="text-[8px]" title="반복 일정">🔁</span>}</div><h4 className="text-[11px] font-bold text-text-main leading-tight mb-1 truncate">{s.program}</h4><div className="text-[9px] text-text-muted truncate opacity-80">{s.location}</div>{viewMode !== 'teacher' && <div className="text-[8px] font-bold text-gray-400 mt-1">{s.teacherName}</div>}</motion.div>))}
                            {showGnEntries && viewMode === 'calendar' && (gnByDate.get(dateStr) || []).map(e => <GnEntryChip key={'gn-' + e.id} entry={e} rooms={gnRooms} onClick={() => { setGnDetailDate(dateStr); setTimeout(() => document.getElementById('gn-detail-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }} />)}
                            {showGnEntries && viewMode === 'teacher' && (gnByDate.get(dateStr) || []).filter(e => gnEntryTeachers[e.id] === selectedTeacherId).map(e => <GnEntryChip key={'gn-' + e.id} entry={e} rooms={gnRooms} onClick={() => { setGnDetailDate(dateStr); setTimeout(() => document.getElementById('gn-detail-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }} />)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="bg-surface rounded-2xl border border-border-color overflow-x-auto lg:overflow-hidden shadow-sm min-h-[700px] flex flex-col">
                    <div className="grid grid-cols-7 min-w-[700px] lg:min-w-0 border-b border-border-color bg-soft">
                      {['일', '월', '화', '수', '목', '금', '토'].map(d => (
                        <div key={d} className={cn("py-3 text-center text-[10px] font-bold uppercase tracking-widest", d === '일' ? "text-sun" : d === '토' ? "text-sat" : "text-text-muted")}>{d}</div>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 min-w-[700px] lg:min-w-0 flex-1 divide-x divide-y divide-border-color">
                      {calendarDays.length > 0 ? (
                        calendarDays.map((dayDate, idx) => {
                          const dateStr = safeFormat(dayDate, 'yyyy-MM-dd');
                          const daySchedules = filteredSchedules.filter(s => s.date === dateStr);
                          const isToday = safeIsSameDay(dayDate, startOfToday());
                          const isCurMonth = safeIsSameMonth(dayDate, baseDate);
                          const holidayName = koreanHolidays[dateStr];
                          const dayWeather = weatherDaily[dateStr];
                          const isOffDay = !!holidayName || dayDate.getDay() === 0;

                          return (
                            <div 
                              key={dateStr || idx} 
                              onClick={() => {
                                setFormData({ ...formData, date: dateStr, day: safeFormat(dayDate, 'EEE', { locale: ko })[0] });
                                setEditingId(null);
                                document.getElementById('schedule-form')?.scrollIntoView({ behavior: 'smooth' });
                                setTimeout(() => document.getElementById('program-input')?.focus(), 100);
                              }}
                              className={cn(
                                "min-h-[120px] p-2 flex flex-col transition-colors hover:bg-gray-50/10 cursor-pointer group/cell",
                                !isCurMonth ? "bg-gray-50/30 text-gray-300" : "bg-surface text-text-main"
                              )}
                            >
                              <div className="flex justify-between items-start mb-1 gap-1">
                                <div className="flex items-center gap-1 min-w-0">
                                  <span className={cn(
                                    "font-serif text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center transition-all shrink-0",
                                    isToday ? "bg-accent-color text-on-accent shadow-sm" : isOffDay ? "text-sun" : dayDate.getDay() === 6 ? "text-sat" : "text-text-muted group-hover/cell:text-accent-color",
                                    !isCurMonth && !isToday && "opacity-50"
                                  )}>
                                    {safeFormat(dayDate, 'd')}
                                  </span>
                                  {holidayName && (
                                    <span className="text-[8px] font-bold text-sun truncate" title={holidayName}>{holidayName}</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {dayWeather && (
                                    <span className="flex items-center gap-0.5 text-[9px] text-text-muted opacity-70 whitespace-nowrap" title={weatherIconOf(dayWeather.code).label}>
                                      <span>{weatherIconOf(dayWeather.code).icon}</span>
                                      <span className="font-bold">{dayWeather.max}°/{dayWeather.min}°</span>
                                    </span>
                                  )}
                                  <Plus size={12} className="text-gray-200 opacity-0 group-hover/cell:opacity-100 transition-opacity" />
                                </div>
                              </div>

                              <div className="flex-1 space-y-1">
                                {daySchedules.slice(0, 4).map(s => (
                                  <div 
                                    key={s.id}
                                    onClick={(e) => { 
                                      e.stopPropagation(); 
                                      handleEdit(s); 
                                      document.getElementById('schedule-form')?.scrollIntoView({ behavior: 'smooth' });
                                    }}
                                    className={cn("px-1.5 py-1 text-[9px] font-bold rounded border truncate cursor-pointer transition-all shadow-sm", categoryOf(s.category).bg, categoryOf(s.category).text, categoryOf(s.category).border)}
                                  >
                                    {s.startTime} {s.program}{s.seriesId ? ' 🔁' : ''}
                                  </div>
                                ))}
                                {daySchedules.length > 4 && (
                                  <div className="text-[8px] text-text-muted pl-1 font-bold italic opacity-60">
                                    + {daySchedules.length - 4} more
                                  </div>
                                )}
                                {showGnEntries && viewMode === 'calendar' && (gnByDate.get(dateStr) || []).length > 0 && (
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setGnDetailDate(dateStr);
                                      setTimeout(() => document.getElementById('gn-detail-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                                    }}
                                    title={(gnByDate.get(dateStr) || []).map(e => `${e.session === 'AM' ? '오전' : '오후'} ${roomLabel(gnRooms, e.room)} · ${e.org} ${e.count}명`).join('\n') + '\n\n클릭하면 아래에서 자세히 볼 수 있습니다'}
                                    className="px-1.5 py-1 bg-amber-50 text-amber-700 text-[9px] font-bold rounded border border-amber-200 truncate cursor-pointer hover:bg-amber-100 hover:border-amber-300 transition-all"
                                  >
                                    🔗 방문예약 {(gnByDate.get(dateStr) || []).length}건
                                  </div>
                                )}
                                {showGnEntries && viewMode === 'teacher' && (gnByDate.get(dateStr) || []).filter(e => gnEntryTeachers[e.id] === selectedTeacherId).length > 0 && (
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setGnDetailDate(dateStr);
                                      setTimeout(() => document.getElementById('gn-detail-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                                    }}
                                    title={(gnByDate.get(dateStr) || []).filter(e => gnEntryTeachers[e.id] === selectedTeacherId).map(e => `${e.session === 'AM' ? '오전' : '오후'} ${roomLabel(gnRooms, e.room)} · ${e.org} ${e.count}명`).join('\n') + '\n\n클릭하면 아래에서 자세히 볼 수 있습니다'}
                                    className="px-1.5 py-1 bg-amber-50 text-amber-700 text-[9px] font-bold rounded border border-amber-200 truncate cursor-pointer hover:bg-amber-100 hover:border-amber-300 transition-all"
                                  >
                                    🔗 방문예약 {(gnByDate.get(dateStr) || []).filter(e => gnEntryTeachers[e.id] === selectedTeacherId).length}건
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="col-span-7 flex flex-col items-center justify-center p-20 text-text-muted gap-4">
                          <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center">
                            <X className="text-red-400" size={24} />
                          </div>
                          <p className="font-bold">달력을 생성할 수 없습니다.</p>
                          <button 
                            onClick={() => setBaseDate(startOfToday())}
                            className="text-xs text-accent-color underline underline-offset-4"
                          >
                            오늘로 돌아가기
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-6" id="schedule-form">
                <motion.div 
                  key={editingId ? 'edit' : 'new'}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-surface rounded-2xl border border-border-color p-6 shadow-sm relative overflow-hidden"
                >
                  <h3 className="text-sm font-bold text-text-main uppercase mb-6 flex items-center gap-2"><div className="w-1.5 h-4 bg-accent-color rounded-full" />{editingId ? '일정 수정' : '신규 일정 등록'}</h3>
                  <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-text-muted uppercase tracking-wider ml-0.5">날짜</label>
                      <input type="date" required className="h-9 w-[132px] px-2 bg-bg-primary border border-border-color rounded-lg text-xs font-medium outline-none focus:border-accent-color" value={formData.date} onChange={(e) => { const dateObj = parseISO(e.target.value); setFormData({ ...formData, date: e.target.value, day: safeFormat(dateObj, 'EEE', { locale: ko })[0] }); }} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-text-muted uppercase tracking-wider ml-0.5">종류</label>
                      <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className="h-9 w-[92px] px-2 bg-bg-primary border border-border-color rounded-lg text-xs font-medium outline-none focus:border-accent-color cursor-pointer">
                        {SCHEDULE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-text-muted uppercase tracking-wider ml-0.5">시작</label>
                      <input type="time" required className="h-9 w-[108px] px-2 bg-bg-primary border border-border-color rounded-lg text-xs font-medium outline-none focus:border-accent-color" value={formData.startTime} onChange={(e) => setFormData({...formData, startTime: e.target.value})} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-text-muted uppercase tracking-wider ml-0.5">종료</label>
                      <input type="time" required className="h-9 w-[108px] px-2 bg-bg-primary border border-border-color rounded-lg text-xs font-medium outline-none focus:border-accent-color" value={formData.endTime} onChange={(e) => setFormData({...formData, endTime: e.target.value})} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-text-muted uppercase tracking-wider ml-0.5">프로그램</label>
                      <select id="program-input" required className="h-9 w-[140px] px-2 bg-bg-primary border border-border-color rounded-lg text-xs font-medium outline-none focus:border-accent-color cursor-pointer" value={formData.program} onChange={(e) => setFormData({...formData, program: e.target.value})}>
                        {(!programs.includes(formData.program) && formData.program) && (
                          <option value={formData.program}>{formData.program} (삭제됨)</option>
                        )}
                        {programs.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-text-muted uppercase tracking-wider ml-0.5">장소</label>
                      <select required className="h-9 w-[140px] px-2 bg-bg-primary border border-border-color rounded-lg text-xs font-medium outline-none focus:border-accent-color cursor-pointer" value={formData.location} onChange={(e) => setFormData({...formData, location: e.target.value})}>
                        {(!locations.includes(formData.location) && formData.location) && (
                          <option value={formData.location}>{formData.location} (삭제됨)</option>
                        )}
                        {locations.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-text-muted uppercase tracking-wider ml-0.5">대상</label>
                      <select required className="h-9 w-[100px] px-2 bg-bg-primary border border-border-color rounded-lg text-xs font-medium outline-none focus:border-accent-color cursor-pointer" value={formData.target} onChange={(e) => setFormData({...formData, target: e.target.value})}>
                        {(!targets.includes(formData.target) && formData.target) && (
                          <option value={formData.target}>{formData.target} (삭제됨)</option>
                        )}
                        {targets.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-text-muted uppercase tracking-wider ml-0.5">담당 교사</label>
                      <select className="h-9 w-[120px] px-2 bg-bg-primary border border-border-color rounded-lg text-xs font-medium outline-none focus:border-accent-color cursor-pointer" value={formData.teacherId} onChange={(e) => setFormData({...formData, teacherId: e.target.value})}>
                        <option value="">미지정</option>
                        {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                    {!editingId && (
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-text-muted uppercase tracking-wider ml-0.5">반복</label>
                        <select value={formData.repeat} onChange={(e) => setFormData({ ...formData, repeat: e.target.value as typeof formData.repeat })} className="h-9 w-[84px] px-2 bg-bg-primary border border-border-color rounded-lg text-xs font-medium outline-none focus:border-accent-color cursor-pointer">
                          <option value="none">안함</option>
                          <option value="daily">매일</option>
                          <option value="weekly">매주</option>
                          <option value="monthly">매월</option>
                        </select>
                      </div>
                    )}
                    {!editingId && formData.repeat !== 'none' && (
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-text-muted uppercase tracking-wider ml-0.5">반복 종료일</label>
                        <input type="date" required min={formData.date} className="h-9 w-[132px] px-2 bg-bg-primary border border-border-color rounded-lg text-xs font-medium outline-none focus:border-accent-color" value={formData.repeatEndDate} onChange={(e) => setFormData({ ...formData, repeatEndDate: e.target.value })} />
                      </div>
                    )}
                    <button type="submit" className="h-9 px-5 bg-accent-color text-on-accent rounded-lg text-xs font-bold shadow-sm hover:bg-blue-700 transition-all active:scale-[0.98] disabled:bg-gray-400">{editingId ? '수정 완료' : '추가'}</button>
                    {editingId && (
                      <>
                        <button type="button" onClick={() => deleteSchedule(editingId)} className="h-9 px-3 bg-red-50 text-red-500 rounded-lg text-xs font-bold hover:bg-red-100 transition-all flex items-center gap-1.5">
                          <Trash2 size={12} /> 삭제
                        </button>
                        <button type="button" onClick={resetForm} className="h-9 px-3 text-text-muted text-xs font-bold hover:text-text-main transition-colors">취소</button>
                      </>
                    )}
                    {editingId && schedules.find(s => s.id === editingId)?.seriesId && (
                      <button
                        type="button"
                        onClick={() => { const sc = schedules.find(s => s.id === editingId); if (sc?.seriesId) deleteSeries(sc.seriesId, sc.date); }}
                        className="h-9 px-3 text-[11px] font-bold text-red-400 hover:text-red-500 transition-colors flex items-center gap-1.5"
                      >
                        <Trash2 size={12} /> 반복 시리즈 모두 삭제
                      </button>
                    )}
                  </form>
                </motion.div>

                {isSettingsOpen && (
                  <>
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setIsSettingsOpen(false)}
                      className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[110]"
                    />
                    
                    <motion.div 
                      initial={{ x: '100%' }}
                      animate={{ x: 0 }}
                      exit={{ x: '100%' }}
                      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                      className="fixed top-0 right-0 bottom-0 w-full max-w-[400px] bg-surface shadow-2xl z-[120] flex flex-col border-l border-border-color"
                    >
                      <div className="flex items-center justify-between p-6 border-b border-border-color bg-gray-50/50">
                        <h3 className="text-base font-black text-text-main uppercase tracking-tight flex items-center gap-2">
                          <Settings size={20} className="text-accent-color" />
                          시스템 설정
                        </h3>
                        <button 
                          onClick={() => setIsSettingsOpen(false)} 
                          className="p-2 hover:bg-surface rounded-full text-text-muted hover:text-text-main transition-all shadow-sm"
                        >
                          <X size={20} />
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto p-6 space-y-10 pb-24">
                        <section className="space-y-4">
                          <div>
                            <h4 className="text-xs font-black text-text-main flex items-center gap-2 mb-2">
                              <Link2 size={14} className="text-accent-color" />
                              강릉 방문예약 앱 연동
                            </h4>
                            <p className="text-[11px] text-text-muted leading-relaxed">
                              강릉분원 방문예약 일정표와 실시간으로 데이터를 주고받습니다. 예약은 강릉 앱에서 관리하며, 여기서는 읽기 전용으로 표시됩니다.
                            </p>
                          </div>
                          <div className="rounded-xl border border-border-color p-3 space-y-2 text-xs">
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-bold text-text-muted">방문예약 불러오기</span>
                              <span className={cn("font-bold", gnStatus === 'ok' ? "text-green-600" : gnStatus === 'error' ? "text-red-500" : "text-text-muted")}>
                                {gnStatus === 'ok' ? `연결됨 · ${gnEntries.length}건` : gnStatus === 'error' ? '오류' : '연결 중...'}
                              </span>
                            </div>
                            {gnStatus === 'error' && <p className="text-[11px] text-red-500 leading-relaxed">{gnError}</p>}
                            {BRIDGE_MIRROR_ENABLED && isAdmin && (
                              <>
                                <div className="flex items-center justify-between gap-3">
                                  <span className="font-bold text-text-muted">수업 일정 내보내기</span>
                                  <span className={cn("font-bold text-right", mirrorInfo.state === 'ok' ? "text-green-600" : mirrorInfo.state === 'error' ? "text-red-500" : "text-text-muted")}>
                                    {mirrorInfo.state === 'idle' ? '대기 중' : mirrorInfo.state === 'ok' ? mirrorInfo.message : '오류'}
                                  </span>
                                </div>
                                {mirrorInfo.state === 'error' && <p className="text-[11px] text-red-500 leading-relaxed">{mirrorInfo.message}</p>}
                              </>
                            )}
                          </div>
                          <a href={GANGNEUNG_APP_URL} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-border-color text-xs font-bold text-accent-color hover:bg-blue-50 transition-colors">
                            <ExternalLink size={14} />
                            강릉 방문예약 앱 열기
                          </a>
                        </section>

                        {isAdmin && (
                          <section className="space-y-6">
                            <div>
                              <h4 className="text-xs font-black text-text-main flex items-center gap-2 mb-4">
                                <Settings size={14} className="text-accent-color" />
                                앱 브랜드 설정
                              </h4>
                              <div className="grid grid-cols-1 gap-6">
                                <div className="space-y-3">
                                  <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest ml-1">앱 메인 컬러 (테마)</label>
                                  <div className="flex flex-wrap gap-3 p-3 bg-gray-50 rounded-2xl border border-border-color">
                                    {['#344b68', '#3b82f6', '#10b981', '#8b5cf6', '#f43f5e', '#f59e0b'].map(color => (
                                      <button
                                        key={color}
                                        onClick={() => {
                                          applyAccentColor(color);
                                          setAccentColor(color);
                                          try { localStorage.setItem('eduAccentColorV1', color); } catch { }
                                          showNotify('테마 색상이 변경되었습니다.');
                                        }}
                                        className={cn(
                                          "w-8 h-8 rounded-full border-2 shadow-sm transition-transform active:scale-90 hover:scale-110",
                                          (accentColor ?? '#344b68').toLowerCase() === color ? "border-text-main scale-110" : "border-surface"
                                        )}
                                        style={{ backgroundColor: color }}
                                        aria-label={`테마 색상 ${color}`}
                                      />
                                    ))}
                                  </div>
                                  <p className="text-[10px] text-text-muted ml-1">기본값은 교회 캘린더와 어울리는 남색입니다. 이 브라우저에만 저장됩니다.</p>
                                </div>
                                <div className="space-y-3">
                                  <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest ml-1">앱 로고 아이콘</label>
                                  <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-border-color">
                                    <div className="w-16 h-16 bg-surface rounded-2xl flex items-center justify-center shadow-sm border border-border-color overflow-hidden p-1">
                                      {isLogoUploading ? (
                                        <div className="w-5 h-5 border-2 border-accent-color border-t-transparent rounded-full animate-spin" />
                                      ) : (
                                        <img src={appLogo} alt="Current Logo" className="w-full h-full object-contain" />
                                      )}
                                    </div>
                                    <label className="flex-1">
                                      <span className="inline-block px-4 py-2 bg-surface border border-border-color rounded-xl text-xs font-bold text-text-main cursor-pointer hover:bg-gray-100 transition-colors shadow-sm">아이콘 변경</span>
                                      <input type="file" accept="image/*" className="hidden" onChange={handleAppLogoUpload} />
                                    </label>
                                  </div>
                                </div>

                                <div className="space-y-3">
                                  <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest ml-1">앱 명칭 변경</label>
                                  <div className="flex gap-2">
                                    <input 
                                      type="text" 
                                      value={appName} 
                                      onChange={(e) => setAppName(e.target.value)}
                                      className="flex-1 h-11 px-4 bg-gray-50 border border-border-color rounded-2xl text-sm font-semibold outline-none focus:border-accent-color transition-all"
                                      placeholder="앱 이름을 입력하세요"
                                    />
                                    <button 
                                      onClick={() => handleUpdateAppName(appName)}
                                      className="px-5 h-11 bg-accent-color text-on-accent rounded-2xl text-sm font-bold hover:opacity-90 transition-all shadow-lg shadow-blue-500/20"
                                    >
                                      저장
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="pt-8 border-t border-gray-100">
                              <h4 className="text-xs font-black text-text-main flex items-center gap-2 mb-4">
                                <UserIcon size={14} className="text-accent-color" />
                                내 프로필 설정
                              </h4>
                              <div className="space-y-3">
                                <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest ml-1">표시 이름 변경</label>
                                <div className="flex gap-2">
                                  <input 
                                    type="text" 
                                    defaultValue={user.displayName || user.email?.split('@')[0]} 
                                    id="my-display-name"
                                    className="flex-1 h-11 px-4 bg-gray-50 border border-border-color rounded-2xl text-sm font-semibold outline-none focus:border-accent-color transition-all"
                                    placeholder="사용할 이름을 입력하세요"
                                  />
                                  <button 
                                    onClick={() => {
                                      const newName = (document.getElementById('my-display-name') as HTMLInputElement).value;
                                      if (newName) handleUpdateDisplayName(newName);
                                    }}
                                    className="px-5 h-11 bg-text-main text-bg-primary rounded-2xl text-sm font-bold hover:bg-gray-800 transition-all shadow-lg"
                                  >
                                    변경
                                  </button>
                                </div>
                              </div>
                            </div>
                          </section>
                        )}

                    <section className="space-y-4 pt-4 border-t border-border-color">
                      <div className="flex items-center justify-between border-b border-border-color pb-2">
                        <h4 className="text-xs font-bold text-text-main flex items-center gap-2"><Users size={14} />교사 명단 관리</h4>
                      </div>
                      <div className="flex gap-2">
                        <input type="text" placeholder="교사 이름 추가" className="flex-1 h-9 px-3 bg-bg-primary border border-border-color rounded-lg text-xs outline-none focus:border-accent-color" value={newTeacherName} onChange={(e) => setNewTeacherName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTeacher()} />
                        <button onClick={addTeacher} className="px-4 bg-accent-color text-on-accent rounded-lg text-xs font-bold shadow-sm hover:bg-blue-700 transition-colors">추가</button>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {teachers.map(t => (
                          <div key={t.id} className="flex items-center gap-2 px-3 py-1.5 bg-blue-50/50 border border-blue-100 rounded-full group transition-all hover:border-accent-color">
                            <input 
                              type="text"
                              defaultValue={t.name}
                              className="text-[11px] font-bold text-accent-color bg-transparent border-none outline-none focus:ring-1 focus:ring-accent-color rounded px-1 w-20"
                              onBlur={(e) => updateTeacher(t.id, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  updateTeacher(t.id, (e.target as HTMLInputElement).value);
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                            />
                            <button onClick={() => deleteTeacher(t.id)} className="text-blue-300 hover:text-red-500 transition-colors opacity-40 group-hover:opacity-100">
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="space-y-6 pt-4 border-t border-border-color">
                      <div className="flex items-center justify-between border-b border-border-color pb-2">
                        <h4 className="text-xs font-bold text-text-main flex items-center gap-2"><LayoutList size={14} />항목 카테고리 관리</h4>
                      </div>
                      
                      {[
                        { label: '프로그램', type: 'programs' as const, list: programs },
                        { label: '장소', type: 'locations' as const, list: locations },
                        { label: '대상', type: 'targets' as const, list: targets }
                      ].map(cat => (
                        <div key={cat.type} className="space-y-2">
                          <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider block ml-1">{cat.label}</label>
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              placeholder={`${cat.label} 추가`} 
                              className="flex-1 h-8 px-3 bg-bg-primary border border-border-color rounded-lg text-[11px] outline-none focus:border-accent-color"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  addCategoryItem(cat.type, (e.target as HTMLInputElement).value);
                                  (e.target as HTMLInputElement).value = '';
                                }
                              }}
                            />
                          </div>
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {cat.list.map(item => (
                              <div key={item} className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-100 rounded-lg group hover:border-accent-color transition-all">
                                <input 
                                  type="text"
                                  defaultValue={item}
                                  className="text-[10px] font-bold text-text-main bg-transparent border-none outline-none focus:text-accent-color transition-colors w-24"
                                  onBlur={(e) => updateCategoryItem(cat.type, item, e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      updateCategoryItem(cat.type, item, (e.target as HTMLInputElement).value);
                                      (e.target as HTMLInputElement).blur();
                                    }
                                  }}
                                />
                                <button 
                                  onClick={() => deleteCategoryItem(cat.type, item)} 
                                  className="text-gray-300 hover:text-red-500 transition-colors opacity-40 group-hover:opacity-100"
                                >
                                  <X size={10} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </section>

                    {isAdmin && (
                      <>
                      <section className="space-y-4 pt-4 border-t border-border-color">
                        <h4 className="text-xs font-bold text-text-main flex items-center gap-2 mb-3"><Users size={14} />계정 관리 (공유용)</h4>
                        <div className="flex flex-col gap-3">
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              placeholder="ID (예: user1)" 
                              className="flex-1 h-9 px-3 bg-bg-primary border border-border-color rounded-xl text-xs font-medium outline-none focus:border-accent-color transition-all"
                              id="new-account-id"
                            />
                            <input 
                              type="password" 
                              placeholder="PW (6자 이상)" 
                              className="flex-1 h-9 px-3 bg-bg-primary border border-border-color rounded-xl text-xs font-medium outline-none focus:border-accent-color transition-all"
                              id="new-account-pw"
                            />
                            <button 
                              onClick={() => {
                                const id = (document.getElementById('new-account-id') as HTMLInputElement).value;
                                const pw = (document.getElementById('new-account-pw') as HTMLInputElement).value;
                                if (id && pw) createNewAccount(id, pw);
                              }}
                              className="px-3 h-9 bg-text-main text-bg-primary rounded-xl text-xs font-bold hover:bg-gray-800 transition-colors"
                            >
                              추가
                            </button>
                          </div>
                        </div>
                        
                        {accessRequests.length > 0 && (
                          <div className="space-y-2 pt-2">
                            <p className="text-[11px] font-bold text-red-500">🔔 승인 대기 {accessRequests.length}명 <span className="font-normal text-text-muted">· 구글로 로그인을 시도한 계정</span></p>
                            <div className="divide-y divide-border-color border border-red-100 rounded-xl overflow-hidden">
                              {accessRequests.map(req => (
                                <div key={req.uid} className="flex items-center gap-2 p-3 bg-red-50/40">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-text-main truncate">{req.name || '(이름 없음)'}</p>
                                    <p className="text-[10px] text-text-muted truncate">{req.email}</p>
                                  </div>
                                  <button onClick={() => approveAccess(req)} className="px-2.5 h-7 rounded-lg bg-accent-color text-on-accent text-[10px] font-bold shrink-0">승인</button>
                                  <button onClick={() => rejectAccess(req)} className="px-2.5 h-7 rounded-lg border border-border-color text-[10px] font-bold text-text-muted hover:text-red-500 shrink-0">거절</button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="space-y-2 pt-2">
                          <p className="text-[11px] font-bold text-text-muted">승인된 계정 <span className="font-normal">· 이 목록에 있는 사람만 앱을 볼 수 있어요</span></p>
                          <div className="divide-y divide-border-color border border-border-color rounded-xl overflow-hidden">
                            {registeredUsers.map(ru => (
                              <div key={ru.uid} className="flex items-center gap-2 p-3 bg-gray-50/50">
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-text-main truncate">{ru.name ? `${ru.name} · ` : ''}{ru.id}</p>
                                  <p className="text-[9px] text-text-muted">{OWNER_EMAILS.includes((ru.email || '').toLowerCase()) ? '소유자 (관리자)' : ru.role === 'admin' ? '관리자' : '일반 사용자'}{ru.uid === user?.uid ? ' · 나' : ''}</p>
                                </div>
                                {ru.uid !== user?.uid && !OWNER_EMAILS.includes((ru.email || '').toLowerCase()) && (
                                  <>
                                    <button onClick={() => toggleUserRole(ru)} className="px-2 h-7 rounded-lg border border-border-color text-[10px] font-bold text-text-muted hover:text-accent-color shrink-0">{ru.role === 'admin' ? '일반으로' : '관리자로'}</button>
                                    <button onClick={() => deleteAccount(ru.uid, ru.id)} title="접근 권한 삭제" className="p-1.5 text-gray-300 hover:text-red-500 transition-colors shrink-0"><Trash2 size={14} /></button>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </section>
                      
                      <section className="space-y-3 pt-4 border-t border-border-color">
                        <h4 className="text-xs font-bold text-text-main flex items-center gap-2"><Download size={14} />데이터 백업 · 내보내기</h4>
                        <p className={cn("text-[11px] font-bold", backupAgeDays === null || backupAgeDays > 30 ? "text-red-500" : "text-text-muted")}>
                          {lastBackup ? `마지막 백업: ${format(new Date(lastBackup.at), 'yyyy-MM-dd HH:mm')} (${backupAgeDays === 0 ? '오늘' : `${backupAgeDays}일 전`}${lastBackup.by ? ` · ${lastBackup.by}` : ''})` : '아직 백업한 적이 없습니다.'}
                          {(backupAgeDays === null || backupAgeDays > 30) && ' · 한 달에 한 번은 백업해 두세요!'}
                        </p>
                        <button onClick={exportBackup} disabled={backupBusy} className="w-full h-10 rounded-xl bg-accent-color text-on-accent text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                          <Download size={14} /> {backupBusy ? '처리 중…' : '전체 백업 파일 받기 (.json)'}
                        </button>
                        <div className="flex gap-2">
                          <select value={csvTarget} onChange={(e) => setCsvTarget(e.target.value as typeof csvTarget)} className="flex-1 h-9 px-2 bg-bg-primary border border-border-color rounded-xl text-xs font-bold outline-none">
                            <option value="schedules">수업 일정</option>
                            <option value="todos">할 일 · 공문</option>
                            <option value="trips">출장</option>
                            <option value="dayNotes">날짜 메모</option>
                            <option value="handoffNotes">업무 메모</option>
                          </select>
                          <button onClick={exportCsv} disabled={backupBusy} className="px-3 h-9 rounded-xl border border-border-color text-xs font-bold hover:border-accent-color disabled:opacity-50 whitespace-nowrap">엑셀용 받기 (.csv)</button>
                        </div>
                        <div className="pt-1">
                          <input ref={restoreInputRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) restoreBackup(f); }} />
                          <button onClick={() => restoreInputRef.current?.click()} disabled={backupBusy} className="w-full h-9 rounded-xl border border-dashed border-border-color text-[11px] font-bold text-text-muted hover:text-red-500 hover:border-red-300 disabled:opacity-50">백업 파일로 복원하기…</button>
                          <p className="text-[10px] text-text-muted mt-1.5 leading-relaxed">백업 파일은 컴퓨터나 구글 드라이브 등 안전한 곳에 보관하세요. 파일에는 모든 업무 내용이 들어 있으니 다른 사람과 공유하지 마세요.</p>
                        </div>
                      </section>

                      <section className="space-y-4 pt-4 border-t border-border-color">
                        <h4 className="text-xs font-bold text-text-main flex items-center gap-2 mb-3"><MapPin size={14} />디오라마 링크 관리</h4>
                        <div className="space-y-3">
                          {['강릉분원', '춘천본원', '원주분원'].map(name => (
                            <div key={name} className="space-y-1.5">
                              <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest ml-1">{name} 링크</label>
                              <input 
                                type="text" 
                                placeholder="https://..." 
                                defaultValue={dioramaUrls[name]}
                                onBlur={(e) => handleUpdateDioramaUrl(name, e.target.value)}
                                className="w-full h-9 px-3 bg-gray-50 border border-border-color rounded-xl text-[11px] font-medium outline-none focus:border-accent-color transition-all"
                              />
                            </div>
                          ))}
                        </div>
                      </section>
                      </>
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
                {gnDetailDate && (
                  <motion.div
                    id="gn-detail-panel"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-surface rounded-2xl border border-amber-200 p-6 shadow-sm"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-bold text-text-main uppercase flex items-center gap-2">
                        <Link2 size={14} className="text-amber-600" />
                        방문예약 현황 · {safeFormat(parseISO(gnDetailDate), 'M월 d일 (EEE)', { locale: ko })}
                      </h3>
                      <button onClick={() => setGnDetailDate(null)} className="p-1.5 rounded-full hover:bg-gray-50 text-text-muted transition-colors"><X size={16} /></button>
                    </div>
                    {(gnByDate.get(gnDetailDate) || []).length === 0 ? (
                      <p className="text-xs text-text-muted italic py-2">이 날짜에 등록된 방문예약이 없습니다.</p>
                    ) : (
                      <div className="space-y-3">
                        {(gnByDate.get(gnDetailDate) || []).map(entry => (
                          <div key={entry.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-amber-50/50 rounded-xl border border-amber-100">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{entry.session === 'AM' ? '오전' : '오후'}</span>
                                <span className="text-sm font-bold text-text-main">{roomLabel(gnRooms, entry.room)}</span>
                              </div>
                              <div className="text-xs text-text-muted mt-1 flex items-center gap-1.5"><Users size={12} className="opacity-60" />{entry.org} · {entry.count}명{entry.note ? ` · ${entry.note}` : ''}</div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <UserIcon size={13} className="text-text-muted" />
                              <select
                                value={gnEntryTeachers[entry.id] || ''}
                                onChange={(e) => assignGnEntryTeacher(entry.id, e.target.value)}
                                className="h-8 px-2 bg-surface border border-border-color rounded-lg text-xs font-medium outline-none focus:border-accent-color transition-all"
                              >
                                <option value="">담당 교사 미지정</option>
                                {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                              </select>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-text-muted mt-4 leading-relaxed">방문예약 정보는 강릉 방문예약 앱에서 관리합니다. 여기서는 읽기 전용으로 표시되며, 담당 교사 지정만 이 화면에 저장됩니다.</p>
                  </motion.div>
                )}

              </div>
              </div>
            </div>
          </div>
        </div>)}
          {viewMode === 'tasks' && <TasksView teachers={teachers} authorName={user?.displayName || '관리자'} koreanHolidays={koreanHolidays} weatherDaily={weatherDaily} schedules={schedules} alertsOpenReq={alertsOpenReq} />}
      </div>

        {/* Mobile Bottom Navigation Bar */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-surface/90 backdrop-blur-xl border-t border-border-color z-[100] px-3 sm:px-6 py-2 pb-safe flex items-center justify-between shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
          <button onClick={() => { setViewMode('calendar'); setCalendarView('month'); }} className={cn("flex flex-col items-center gap-1 transition-all flex-1", viewMode === 'calendar' && calendarView === 'month' ? "text-accent-color scale-110" : "text-text-muted opacity-60")}>
            <CalendarDays size={20} strokeWidth={2.5} />
            <span className="text-[9px] font-black tracking-tighter">월간</span>
          </button>
          <button onClick={() => { setViewMode('calendar'); setCalendarView('week'); }} className={cn("flex flex-col items-center gap-1 transition-all flex-1", viewMode === 'calendar' && calendarView === 'week' ? "text-accent-color scale-110" : "text-text-muted opacity-60")}>
            <LayoutList size={20} strokeWidth={2.5} />
            <span className="text-[9px] font-black tracking-tighter">주간</span>
          </button>
          
          <div className="flex-1 flex justify-center -mt-6">
            <button 
              onClick={() => {
                setFormData({ ...formData, date: format(new Date(), 'yyyy-MM-dd'), day: format(new Date(), 'EEE', { locale: ko })[0] });
                setEditingId(null);
                document.getElementById('schedule-form')?.scrollIntoView({ behavior: 'smooth' });
                setTimeout(() => document.getElementById('program-input')?.focus(), 100);
              }}
              className="w-14 h-14 bg-accent-color text-on-accent rounded-2xl shadow-xl shadow-blue-500/40 flex items-center justify-center border-4 border-surface active:scale-90 transition-all group"
            >
              <Plus size={28} strokeWidth={3} className="group-active:rotate-90 transition-transform" />
            </button>
          </div>
          
          <button onClick={() => setViewMode('tasks')} className={cn("relative flex flex-col items-center gap-1 transition-all flex-1", viewMode === 'tasks' ? "text-accent-color" : "text-text-muted")}>
            <ListChecks size={20} strokeWidth={2.5} />
            {taskAlerts.unreadCount > 0 && <span className="absolute -top-1 left-1/2 ml-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">{taskAlerts.unreadCount > 9 ? '9+' : taskAlerts.unreadCount}</span>}
            <span className="text-[10px] font-bold">업무</span>
          </button>
          <button onClick={() => setViewMode('teacher')} className={cn("flex flex-col items-center gap-1 transition-all flex-1", viewMode === 'teacher' ? "text-accent-color scale-110" : "text-text-muted opacity-60")}>
            <Users size={20} strokeWidth={2.5} />
            <span className="text-[9px] font-black tracking-tighter">교사</span>
          </button>
          <button onClick={openSettings} className={cn("flex flex-col items-center gap-1 transition-all flex-1", isSettingsOpen ? "text-accent-color scale-110" : "text-text-muted opacity-60")}>
            <Settings size={20} strokeWidth={2.5} />
            <span className="text-[9px] font-black tracking-tighter">설정</span>
          </button>
        </nav>
      </div>
      <AnimatePresence>{showNotification && (<motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} className="fixed bottom-24 right-4 left-4 sm:left-auto sm:right-8 bg-text-main text-bg-primary px-6 py-4 rounded-2xl shadow-2xl z-[100] flex items-center gap-3 border border-gray-700"><Bell className="text-accent-color" size={18} /><span className="text-sm font-medium">{notificationMsg}</span></motion.div>)}</AnimatePresence>
    </div>
  );
}

// --- Components ---

// =====================================================================
// 업무 관리 (업무 수첩)
// =====================================================================
interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}
interface Todo {
  id: string;
  title: string;
  status: 'todo' | 'doing' | 'done';
  category?: string;
  tags?: string[];
  assigneeId?: string | null;
  assigneeName?: string | null;
  dueDate?: string | null;
  note?: string;
  seriesId?: string;
  linkedScheduleId?: string | null;
  linkedScheduleLabel?: string | null;
  linkedTripId?: string | null;
  checklist?: ChecklistItem[];
  docNo?: string | null;
  docTo?: string | null;
  createdBy?: string;
  createdAt: any;
}
interface HandoffNote {
  id: string;
  title: string;
  content: string;
  authorName: string;
  createdAt: any;
}
// 날짜별 메모 (업무 관리 캘린더에서 날짜 칸을 두 번 눌러 작성)
interface DayNote {
  id: string;
  date: string;
  content: string;
  authorName?: string;
  updatedAt?: any;
}
// 출장 (시작일~종료일 동안 캘린더에 띠로 표시)
interface Trip {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  place?: string | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  authorName?: string;
  result?: string;
  createdAt?: any;
}
// 할 일 댓글
interface TodoComment {
  id: string;
  todoId: string;
  text: string;
  authorName: string;
  createdAt: any;
}
// 업무 템플릿 (반복되는 할 일 묶음)
interface TemplateItem {
  title: string;
  offset: number;
  category: string;
}
interface TodoTemplate {
  id: string;
  name: string;
  items: TemplateItem[];
  createdAt?: any;
}
// 변경 기록
interface ActivityLog {
  id: string;
  targetType: 'todo' | 'trip' | 'memo' | 'note' | 'template';
  targetId: string;
  title: string;
  action: string;
  by: string;
  at: any;
}

const TODO_STATUSES: { id: Todo['status']; label: string }[] = [
  { id: 'todo', label: '할 일' },
  { id: 'doing', label: '진행 중' },
  { id: 'done', label: '완료' },
];

const TODO_CATEGORIES: { id: string; label: string; dot: string; bg: string; text: string; border: string }[] = [
  { id: 'prep',     label: '수업준비',   dot: 'bg-blue-500',   bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
  { id: 'admin',    label: '행정',       dot: 'bg-green-500',  bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200' },
  { id: 'official', label: '공문',       dot: 'bg-red-500',    bg: 'bg-red-50',    text: 'text-red-500',    border: 'border-red-100' },
  { id: 'facility', label: '시설/비품',  dot: 'bg-amber-500',  bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200' },
  { id: 'counsel',  label: '상담',       dot: 'bg-yellow-500', bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  { id: 'etc',      label: '기타',       dot: 'bg-gray-400',   bg: 'bg-gray-50',   text: 'text-gray-600',   border: 'border-gray-200' },
];
const todoCategoryOf = (id?: string) => TODO_CATEGORIES.find(c => c.id === (id || 'etc')) || TODO_CATEGORIES[TODO_CATEGORIES.length - 1];

const TRIP_COLORS = [
  'bg-[#344B68] text-white',
  'bg-[#3E7C74] text-white',
  'bg-[#A5793A] text-white',
  'bg-[#B24638] text-white',
  'bg-[#6B5B95] text-white',
];
const tripColorOf = (t: Trip) => {
  const key = t.assigneeId || t.id;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return TRIP_COLORS[h % TRIP_COLORS.length];
};

const LOG_TYPE_LABEL: Record<ActivityLog['targetType'], string> = { todo: '할 일', trip: '출장', memo: '날짜 메모', note: '업무 메모', template: '템플릿' };

// ---------- 작은 도우미 함수들 ----------
const tsMillis = (v: any): number => (v && typeof v.toMillis === 'function') ? v.toMillis() : (typeof v === 'number' ? v : 0);
const newLocalId = () => Math.random().toString(36).slice(2, 10);
// 마감일까지 남은 날 (오늘=0, 내일=1, 어제=-1)
const daysUntil = (due?: string | null): number | null => {
  if (!due) return null;
  try {
    const d = parseISO(due);
    if (!isValid(d)) return null;
    return Math.round((d.getTime() - startOfToday().getTime()) / 86400000);
  } catch { return null; }
};
const ddayLabel = (n: number) => n === 0 ? 'D-day' : n > 0 ? `D-${n}` : `D+${-n}`;
const escHtml = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// ---------- 휴대폰 캘린더(.ics) 도우미 ----------
const icsText = (s: string) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsFold = (line: string) => {
  const chars = Array.from(line);
  if (chars.length <= 60) return line;
  const parts: string[] = [];
  for (let i = 0; i < chars.length; i += 60) parts.push((i === 0 ? '' : ' ') + chars.slice(i, i + 60).join(''));
  return parts.join('\r\n');
};
const icsDate = (d: string) => d.replace(/-/g, '');
const icsDateTime = (d: string, hm: string) => `${icsDate(d)}T${(hm || '00:00').replace(':', '')}00`;
const icsNextDay = (d: string) => format(addDays(parseISO(d), 1), 'yyyyMMdd');

const logActivity = async (entry: Omit<ActivityLog, 'id' | 'at'>) => {
  try { await addDoc(collection(db, 'activityLog'), { ...entry, at: Timestamp.now() }); }
  catch (err) { console.warn('activity log failed', err); }
};

// ---------- "나는 어떤 선생님인가" (이 기기에 저장) ----------
const MY_TEACHER_KEY = 'eduMyTeacherIdV1';
const ALERT_SEEN_KEY = 'eduTaskAlertSeenV1';

function useMyTeacherId(teachers: Teacher[], myName: string): [string, (id: string) => void] {
  const read = () => { try { return localStorage.getItem(MY_TEACHER_KEY) || ''; } catch { return ''; } };
  const [id, setIdState] = useState<string>(read);
  const setId = (v: string) => {
    try { localStorage.setItem(MY_TEACHER_KEY, v); } catch { /* ignore */ }
    setIdState(v);
    window.dispatchEvent(new Event('edu-my-teacher'));
  };
  useEffect(() => {
    const h = () => setIdState(read());
    window.addEventListener('edu-my-teacher', h);
    return () => window.removeEventListener('edu-my-teacher', h);
  }, []);
  // 처음에는 로그인 이름과 같은 교사를 자동으로 찾아 둡니다.
  useEffect(() => {
    if (id || teachers.length === 0 || !myName) return;
    const match = teachers.find(t => t.name === myName) || teachers.find(t => myName.includes(t.name) || t.name.includes(myName));
    if (match) setId(match.id);
  }, [teachers, myName, id]);
  return [id, setId];
}

let lastHandledAlertsReq = 0;

interface TaskAlert {
  id: string;
  kind: 'assign' | 'comment';
  todoId: string;
  text: string;
  sub: string;
  at: number;
  unread: boolean;
}

// ---------- 담당자 알림 (새로 배정된 업무 · 내 업무에 달린 댓글) ----------
function useTaskAlerts(myTeacherId: string, myName: string, enabled: boolean) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [comments, setComments] = useState<TodoComment[]>([]);
  const [seen, setSeen] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem(ALERT_SEEN_KEY));
      if (v) return v;
      const now = Date.now();
      localStorage.setItem(ALERT_SEEN_KEY, String(now));
      return now;
    } catch { return Date.now(); }
  });
  useEffect(() => {
    const h = () => { try { setSeen(Number(localStorage.getItem(ALERT_SEEN_KEY)) || Date.now()); } catch { /* ignore */ } };
    window.addEventListener('edu-alert-seen', h);
    return () => window.removeEventListener('edu-alert-seen', h);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const u1 = onSnapshot(collection(db, 'todos'), (snap) => setTodos(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Todo)), (err) => console.warn('alerts todos error', err));
    const u2 = onSnapshot(collection(db, 'todoComments'), (snap) => setComments(snap.docs.map(d => ({ id: d.id, ...d.data() }) as TodoComment)), (err) => console.warn('todoComments error', err));
    return () => { u1(); u2(); };
  }, [enabled]);

  const alerts = useMemo<TaskAlert[]>(() => {
    if (!myTeacherId) return [];
    const since = Date.now() - 30 * 86400000;
    const mine = todos.filter(t => t.assigneeId === myTeacherId);
    const mineById = new Map<string, Todo>(mine.map(t => [t.id, t] as [string, Todo]));
    const list: Omit<TaskAlert, 'unread'>[] = [];
    mine.forEach(t => {
      const at = tsMillis(t.createdAt);
      if (at >= since && t.createdBy !== myName) list.push({ id: 'a' + t.id, kind: 'assign', todoId: t.id, text: `새 업무 배정: ${t.title}`, sub: t.dueDate ? `마감 ${t.dueDate}` : '', at });
    });
    comments.forEach(c => {
      const at = tsMillis(c.createdAt);
      const t = mineById.get(c.todoId);
      if (t && at >= since && c.authorName !== myName) list.push({ id: 'c' + c.id, kind: 'comment', todoId: c.todoId, text: `${c.authorName}: ${c.text}`, sub: t.title, at });
    });
    return list.sort((a, b) => b.at - a.at).slice(0, 30).map(a => ({ ...a, unread: a.at > seen }));
  }, [todos, comments, myTeacherId, myName, seen]);

  const unreadCount = alerts.filter(a => a.unread).length;
  const markSeen = () => {
    const now = Date.now();
    try { localStorage.setItem(ALERT_SEEN_KEY, String(now)); } catch { /* ignore */ }
    setSeen(now);
    window.dispatchEvent(new Event('edu-alert-seen'));
  };
  return { alerts, unreadCount, markSeen, seen, comments };
}

function TasksView({ teachers, authorName, koreanHolidays, weatherDaily, schedules, alertsOpenReq }: { teachers: Teacher[]; authorName: string; koreanHolidays: Record<string, string>; weatherDaily: Record<string, { max: number; min: number; code: number }>; schedules: Schedule[]; alertsOpenReq: number }) {
  const [subTab, setSubTab] = useState<'board' | 'calendar' | 'notes' | 'history'>('board');
  const [boardView, setBoardView] = useState<'kanban' | 'list'>('kanban');
  const [quickFilter, setQuickFilter] = useState<'none' | 'today' | 'overdue' | 'official'>('none');
  const today = format(startOfToday(), 'yyyy-MM-dd');

  // ---------- 나 / 내 업무만 보기 ----------
  const [myTeacherId, setMyTeacherId] = useMyTeacherId(teachers, authorName);
  const myTeacherName = teachers.find(t => t.id === myTeacherId)?.name || '';
  const [myOnly, setMyOnlyState] = useState<boolean>(() => { try { return localStorage.getItem('eduTaskMyOnlyV1') === '1'; } catch { return false; } });
  const setMyOnly = (v: boolean) => { try { localStorage.setItem('eduTaskMyOnlyV1', v ? '1' : '0'); } catch { /* ignore */ } setMyOnlyState(v); };
  const myFilterOn = myOnly && !!myTeacherId;

  // ---------- 알림 ----------
  const { alerts, unreadCount, markSeen, seen, comments } = useTaskAlerts(myTeacherId, authorName, true);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertsBaseline, setAlertsBaseline] = useState(0);
  const openAlerts = () => { setAlertsBaseline(seen); setAlertsOpen(true); markSeen(); setSearchText(''); };
  useEffect(() => {
    // 상단 종을 눌러 들어왔을 때 한 번만 알림 목록 열기
    if (alertsOpenReq > lastHandledAlertsReq) { lastHandledAlertsReq = alertsOpenReq; openAlerts(); }
  }, [alertsOpenReq]); // eslint-disable-line react-hooks/exhaustive-deps

  const commentsByTodo = useMemo(() => {
    const map: Record<string, TodoComment[]> = {};
    comments.forEach(c => { (map[c.todoId] ||= []).push(c); });
    Object.values(map).forEach(list => list.sort((a, b) => tsMillis(a.createdAt) - tsMillis(b.createdAt)));
    return map;
  }, [comments]);

  // ---------- 할 일 ----------
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [newDue, setNewDue] = useState('');
  const [newCategory, setNewCategory] = useState('etc');
  const [newTagsText, setNewTagsText] = useState('');
  const [newRepeat, setNewRepeat] = useState<'none' | 'weekly' | 'monthly'>('none');
  const [newRepeatEndDate, setNewRepeatEndDate] = useState('');
  const [newLinkedScheduleId, setNewLinkedScheduleId] = useState('');
  const [newDocNo, setNewDocNo] = useState('');
  const [newDocTo, setNewDocTo] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'todos'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setTodos(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Todo));
    }, (err) => console.warn('todos snapshot error', err));
  }, []);

  const visibleTodos = useMemo(() => myFilterOn ? todos.filter(t => t.assigneeId === myTeacherId) : todos, [todos, myFilterOn, myTeacherId]);

  // 마감일에 등록된 일정 목록 (일정-할 일 연동용)
  const schedulesForNewDue = useMemo(() => {
    if (!newDue) return [];
    return schedules.filter(s => s.date === newDue).sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [schedules, newDue]);

  const addTodo = async () => {
    if (!newTitle.trim()) return;
    try {
      const assigneeName = teachers.find(t => t.id === newAssignee)?.name || '';
      const tags = newTagsText.split(',').map(t => t.trim()).filter(Boolean);
      const linkedSchedule = newLinkedScheduleId ? schedulesForNewDue.find(s => s.id === newLinkedScheduleId) : null;
      const base = {
        title: newTitle.trim(),
        status: 'todo' as const,
        category: newCategory,
        tags,
        assigneeId: newAssignee || null,
        assigneeName: assigneeName || null,
        linkedScheduleId: linkedSchedule ? linkedSchedule.id : null,
        linkedScheduleLabel: linkedSchedule ? `${linkedSchedule.startTime} ${linkedSchedule.program}` : null,
        docNo: newCategory === 'official' ? (newDocNo.trim() || null) : null,
        docTo: newCategory === 'official' ? (newDocTo.trim() || null) : null,
        checklist: [] as ChecklistItem[],
        createdBy: authorName,
      };

      if (newRepeat !== 'none' && newDue && newRepeatEndDate) {
        const dates: string[] = [];
        let cursor = parseISO(newDue);
        const endDate = parseISO(newRepeatEndDate);
        while (cursor <= endDate && dates.length < 60) {
          dates.push(format(cursor, 'yyyy-MM-dd'));
          cursor = newRepeat === 'weekly' ? addDays(cursor, 7) : addMonths(cursor, 1);
        }
        if (dates.length === 0) { return; }
        const seriesId = 'todoseries_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const batch = writeBatch(db);
        dates.forEach(d => {
          const ref = doc(collection(db, 'todos'));
          batch.set(ref, { ...base, dueDate: d, seriesId, createdAt: Timestamp.now() });
        });
        await batch.commit();
        logActivity({ targetType: 'todo', targetId: seriesId, title: base.title, action: `반복 할 일 ${dates.length}건 등록`, by: authorName });
      } else {
        const ref = await addDoc(collection(db, 'todos'), { ...base, dueDate: newDue || null, createdAt: Timestamp.now() });
        logActivity({ targetType: 'todo', targetId: ref.id, title: base.title, action: '등록', by: authorName });
      }
      setNewTitle(''); setNewAssignee(''); setNewDue(''); setNewCategory('etc'); setNewTagsText('');
      setNewRepeat('none'); setNewRepeatEndDate(''); setNewLinkedScheduleId(''); setNewDocNo(''); setNewDocTo('');
    } catch (err) { console.error(err); alert('할 일을 저장하지 못했습니다.'); }
  };

  const moveTodo = async (id: string, status: Todo['status']) => {
    const t = todos.find(x => x.id === id);
    try {
      await updateDoc(doc(db, 'todos', id), { status });
      logActivity({ targetType: 'todo', targetId: id, title: t?.title || '', action: `상태 → ${TODO_STATUSES.find(s => s.id === status)?.label}`, by: authorName });
    } catch (err) { console.error(err); }
  };

  const deleteTodo = async (id: string) => {
    if (!window.confirm('이 할 일을 삭제할까요?')) return;
    const t = todos.find(x => x.id === id);
    try {
      await deleteDoc(doc(db, 'todos', id));
      logActivity({ targetType: 'todo', targetId: id, title: t?.title || '', action: '삭제', by: authorName });
      if (detailTodoId === id) setDetailTodoId(null);
    } catch (err) { console.error(err); }
  };

  const changeTodoDue = async (id: string, dueDate: string) => {
    const t = todos.find(x => x.id === id);
    if (!t || t.dueDate === dueDate) return;
    try {
      await updateDoc(doc(db, 'todos', id), { dueDate });
      logActivity({ targetType: 'todo', targetId: id, title: t.title, action: `마감일 ${t.dueDate || '없음'} → ${dueDate}`, by: authorName });
    } catch (err) { console.error(err); }
  };

  const boardTodos = useMemo(() => {
    if (quickFilter === 'today') return visibleTodos.filter(t => t.dueDate === today && t.status !== 'done');
    if (quickFilter === 'overdue') return visibleTodos.filter(t => !!t.dueDate && t.dueDate < today && t.status !== 'done');
    if (quickFilter === 'official') return visibleTodos.filter(t => t.category === 'official' && t.status !== 'done');
    return visibleTodos;
  }, [visibleTodos, quickFilter, today]);

  const columns = useMemo(() => {
    const byStatus: Record<Todo['status'], Todo[]> = { todo: [], doing: [], done: [] };
    boardTodos.forEach((t: Todo) => { (byStatus[t.status] || byStatus.todo).push(t); });
    (Object.keys(byStatus) as Todo['status'][]).forEach(k => {
      byStatus[k].sort((a, b) => (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99'));
    });
    return byStatus;
  }, [boardTodos]);

  const todosByCategory = useMemo(() => {
    const groups = TODO_CATEGORIES.map(c => ({ cat: c, items: [] as Todo[] }));
    boardTodos.forEach((t: Todo) => {
      const g = groups.find(g => g.cat.id === (t.category || 'etc')) || groups[groups.length - 1];
      g.items.push(t);
    });
    groups.forEach(g => g.items.sort((a, b) => (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99')));
    return groups.filter(g => g.items.length > 0);
  }, [boardTodos]);

  // ---------- 할 일 상세 (체크리스트 · 댓글 · 기록) ----------
  const [detailTodoId, setDetailTodoId] = useState<string | null>(null);
  const detailTodo = detailTodoId ? todos.find(t => t.id === detailTodoId) || null : null;
  const [dTitle, setDTitle] = useState('');
  const [dNote, setDNote] = useState('');
  const [dDue, setDDue] = useState('');
  const [dAssignee, setDAssignee] = useState('');
  const [dCategory, setDCategory] = useState('etc');
  const [dDocNo, setDDocNo] = useState('');
  const [dDocTo, setDDocTo] = useState('');
  const [dChecklistText, setDChecklistText] = useState('');
  const [dCommentText, setDCommentText] = useState('');
  useEffect(() => {
    if (!detailTodoId) return;
    const t = todos.find(x => x.id === detailTodoId);
    if (!t) return;
    setDTitle(t.title || ''); setDNote(t.note || ''); setDDue(t.dueDate || ''); setDAssignee(t.assigneeId || '');
    setDCategory(t.category || 'etc'); setDDocNo(t.docNo || ''); setDDocTo(t.docTo || '');
    setDChecklistText(''); setDCommentText('');
  }, [detailTodoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const openTodoDetail = (id: string) => { setDetailTodoId(id); setAlertsOpen(false); setSearchText(''); };

  const saveTodoDetail = async () => {
    if (!detailTodo) return;
    if (!dTitle.trim()) { alert('제목을 입력해주세요.'); return; }
    const changes: string[] = [];
    if (dTitle.trim() !== detailTodo.title) changes.push('제목');
    if ((dNote || '') !== (detailTodo.note || '')) changes.push('메모');
    if ((dDue || '') !== (detailTodo.dueDate || '')) changes.push(`마감일 ${detailTodo.dueDate || '없음'} → ${dDue || '없음'}`);
    if ((dAssignee || '') !== (detailTodo.assigneeId || '')) changes.push(`담당자 → ${teachers.find(t => t.id === dAssignee)?.name || '미지정'}`);
    if (dCategory !== (detailTodo.category || 'etc')) changes.push(`분류 → ${todoCategoryOf(dCategory).label}`);
    if ((dDocNo || '') !== (detailTodo.docNo || '') || (dDocTo || '') !== (detailTodo.docTo || '')) changes.push('공문 정보');
    try {
      await updateDoc(doc(db, 'todos', detailTodo.id), {
        title: dTitle.trim(),
        note: dNote,
        dueDate: dDue || null,
        assigneeId: dAssignee || null,
        assigneeName: teachers.find(t => t.id === dAssignee)?.name || null,
        category: dCategory,
        docNo: dDocNo.trim() || null,
        docTo: dDocTo.trim() || null,
      });
      if (changes.length) logActivity({ targetType: 'todo', targetId: detailTodo.id, title: dTitle.trim(), action: `수정: ${changes.join(', ')}`, by: authorName });
      setDetailTodoId(null);
    } catch (err) { console.error(err); alert('저장하지 못했습니다.'); }
  };

  const updateChecklist = async (t: Todo, next: ChecklistItem[]) => {
    try { await updateDoc(doc(db, 'todos', t.id), { checklist: next }); } catch (err) { console.error(err); }
  };
  const addChecklistItem = () => {
    if (!detailTodo || !dChecklistText.trim()) return;
    updateChecklist(detailTodo, [...(detailTodo.checklist || []), { id: newLocalId(), text: dChecklistText.trim(), done: false }]);
    setDChecklistText('');
  };

  const addComment = async () => {
    if (!detailTodo || !dCommentText.trim()) return;
    try {
      await addDoc(collection(db, 'todoComments'), { todoId: detailTodo.id, text: dCommentText.trim(), authorName, createdAt: Timestamp.now() });
      logActivity({ targetType: 'todo', targetId: detailTodo.id, title: detailTodo.title, action: '댓글 작성', by: authorName });
      setDCommentText('');
    } catch (err) { console.error(err); alert('댓글을 저장하지 못했습니다. (Firestore 보안 규칙에 todoComments 권한이 있는지 확인해주세요)'); }
  };
  const deleteComment = async (id: string) => {
    if (!window.confirm('이 댓글을 삭제할까요?')) return;
    try { await deleteDoc(doc(db, 'todoComments', id)); } catch (err) { console.error(err); }
  };

  // ---------- 업무 템플릿 ----------
  const [templates, setTemplates] = useState<TodoTemplate[]>([]);
  const [isTemplateOpen, setIsTemplateOpen] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplItems, setTplItems] = useState<TemplateItem[]>([{ title: '', offset: 0, category: 'etc' }]);
  const [applyTplId, setApplyTplId] = useState('');
  const [applyDate, setApplyDate] = useState(today);
  const [applyAssignee, setApplyAssignee] = useState('');

  useEffect(() => {
    return onSnapshot(collection(db, 'todoTemplates'), (snap) => {
      setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() }) as TodoTemplate).sort((a, b) => a.name.localeCompare(b.name)));
    }, (err) => console.warn('todoTemplates snapshot error', err));
  }, []);

  const saveTemplate = async () => {
    const items = tplItems.filter(i => i.title.trim()).map(i => ({ title: i.title.trim(), offset: Number(i.offset) || 0, category: i.category || 'etc' }));
    if (!tplName.trim() || items.length === 0) { alert('템플릿 이름과 항목을 한 개 이상 입력해주세요.'); return; }
    try {
      const ref = await addDoc(collection(db, 'todoTemplates'), { name: tplName.trim(), items, createdAt: Timestamp.now() });
      logActivity({ targetType: 'template', targetId: ref.id, title: tplName.trim(), action: `템플릿 저장 (${items.length}개 항목)`, by: authorName });
      setTplName(''); setTplItems([{ title: '', offset: 0, category: 'etc' }]);
    } catch (err) { console.error(err); alert('템플릿을 저장하지 못했습니다. (Firestore 보안 규칙에 todoTemplates 권한이 있는지 확인해주세요)'); }
  };
  const deleteTemplate = async (tpl: TodoTemplate) => {
    if (!window.confirm(`'${tpl.name}' 템플릿을 삭제할까요?`)) return;
    try { await deleteDoc(doc(db, 'todoTemplates', tpl.id)); if (applyTplId === tpl.id) setApplyTplId(''); } catch (err) { console.error(err); }
  };
  const applyTemplate = async () => {
    const tpl = templates.find(t => t.id === applyTplId);
    if (!tpl || !applyDate) { alert('템플릿과 기준일을 선택해주세요.'); return; }
    try {
      const base = parseISO(applyDate);
      const assigneeName = teachers.find(t => t.id === applyAssignee)?.name || null;
      const batch = writeBatch(db);
      tpl.items.forEach(item => {
        const ref = doc(collection(db, 'todos'));
        batch.set(ref, {
          title: item.title, status: 'todo', category: item.category || 'etc', tags: [tpl.name],
          assigneeId: applyAssignee || null, assigneeName,
          dueDate: format(addDays(base, Number(item.offset) || 0), 'yyyy-MM-dd'),
          checklist: [], createdBy: authorName, createdAt: Timestamp.now(),
        });
      });
      await batch.commit();
      logActivity({ targetType: 'template', targetId: tpl.id, title: tpl.name, action: `템플릿 적용 (${applyDate} 기준, ${tpl.items.length}건)`, by: authorName });
      alert(`'${tpl.name}' 템플릿으로 할 일 ${tpl.items.length}건을 등록했습니다.`);
      setApplyTplId('');
    } catch (err) { console.error(err); alert('템플릿을 적용하지 못했습니다.'); }
  };

  // ---------- 캘린더 ----------
  const [calBaseDate, setCalBaseDate] = useState(startOfToday());
  const [calSelectedDate, setCalSelectedDate] = useState<string | null>(null);
  const calDays = useMemo(() => {
    try {
      const monthStart = startOfMonth(calBaseDate);
      if (!isValid(monthStart)) return [];
      const startOfGrid = startOfWeek(monthStart, { weekStartsOn: 0 });
      if (!isValid(startOfGrid)) return [];
      return Array.from({ length: 42 }).map((_, i) => addDays(startOfGrid, i));
    } catch { return []; }
  }, [calBaseDate]);
  const todosByDate = useMemo(() => {
    const map: Record<string, Todo[]> = {};
    visibleTodos.forEach((t: Todo) => { if (t.dueDate) (map[t.dueDate] ||= []).push(t); });
    return map;
  }, [visibleTodos]);

  // ---------- 날짜 메모 ----------
  const [dayNotes, setDayNotes] = useState<Record<string, DayNote>>({});
  const [memoDate, setMemoDate] = useState<string | null>(null);
  const [memoText, setMemoText] = useState('');
  const [memoSaving, setMemoSaving] = useState(false);
  const lastTapRef = useRef<{ date: string; time: number } | null>(null);

  useEffect(() => {
    return onSnapshot(collection(db, 'dayNotes'), (snap) => {
      const map: Record<string, DayNote> = {};
      snap.docs.forEach(d => {
        const data = d.data() as Omit<DayNote, 'id'>;
        if (data.date) map[data.date] = { id: d.id, ...data };
      });
      setDayNotes(map);
    }, (err) => console.warn('dayNotes snapshot error', err));
  }, []);

  const openMemo = (dateStr: string) => {
    setMemoDate(dateStr);
    setMemoText(dayNotes[dateStr]?.content || '');
    setSearchText('');
  };

  // 한 번 누르면 날짜 선택, 같은 칸을 빠르게 두 번 누르면(더블클릭/더블탭) 메모 창 열기
  const handleDayTap = (dateStr: string) => {
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && last.date === dateStr && now - last.time < 400) {
      lastTapRef.current = null;
      openMemo(dateStr);
      return;
    }
    lastTapRef.current = { date: dateStr, time: now };
    setCalSelectedDate(dateStr);
    setSelectedTripId(null);
  };

  const saveMemo = async () => {
    if (!memoDate) return;
    setMemoSaving(true);
    try {
      const text = memoText.trim();
      if (!text) {
        if (dayNotes[memoDate]) {
          await deleteDoc(doc(db, 'dayNotes', dayNotes[memoDate].id));
          logActivity({ targetType: 'memo', targetId: memoDate, title: `${memoDate} 메모`, action: '삭제', by: authorName });
        }
      } else {
        await setDoc(doc(db, 'dayNotes', memoDate), { date: memoDate, content: text, authorName, updatedAt: Timestamp.now() });
        logActivity({ targetType: 'memo', targetId: memoDate, title: `${memoDate} 메모`, action: dayNotes[memoDate] ? '수정' : '작성', by: authorName });
      }
      setMemoDate(null);
    } catch (err) {
      console.error(err);
      alert('메모를 저장하지 못했습니다. (Firestore 보안 규칙에 dayNotes 권한이 있는지 확인해주세요)');
    } finally { setMemoSaving(false); }
  };

  const deleteMemo = async () => {
    if (!memoDate || !dayNotes[memoDate]) { setMemoDate(null); return; }
    if (!window.confirm('이 날짜의 메모를 삭제할까요?')) return;
    try {
      await deleteDoc(doc(db, 'dayNotes', dayNotes[memoDate].id));
      logActivity({ targetType: 'memo', targetId: memoDate, title: `${memoDate} 메모`, action: '삭제', by: authorName });
      setMemoDate(null);
    } catch (err) { console.error(err); }
  };

  // ---------- 출장 ----------
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [isTripFormOpen, setIsTripFormOpen] = useState(false);
  const [tripTitle, setTripTitle] = useState('');
  const [tripAssignee, setTripAssignee] = useState('');
  const [tripStart, setTripStart] = useState('');
  const [tripEnd, setTripEnd] = useState('');
  const [tripPlace, setTripPlace] = useState('');
  const [tripMakeReport, setTripMakeReport] = useState(true);
  const [tripResultDraft, setTripResultDraft] = useState('');
  const [tripEditStart, setTripEditStart] = useState('');
  const [tripEditEnd, setTripEditEnd] = useState('');

  useEffect(() => {
    return onSnapshot(collection(db, 'trips'), (snap) => {
      setTrips(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Trip).filter(t => !!t.startDate));
    }, (err) => console.warn('trips snapshot error', err));
  }, []);

  const visibleTrips = useMemo(() => myFilterOn ? trips.filter(t => t.assigneeId === myTeacherId) : trips, [trips, myFilterOn, myTeacherId]);

  // 출장 기간에 그 선생님 수업이 잡혀 있는지 (교사 시간표와 비교)
  const tripConflicts = (assigneeId: string | null | undefined, start: string, end: string) => {
    if (!assigneeId || !start) return [] as Schedule[];
    const e = end || start;
    return schedules
      .filter(s => s.teacherId === assigneeId && s.date >= start && s.date <= e)
      .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  };
  const formConflicts = useMemo(() => {
    const s = tripStart; const e = tripEnd || tripStart;
    if (!s) return [] as Schedule[];
    return tripConflicts(tripAssignee, s <= e ? s : e, s <= e ? e : s);
  }, [tripAssignee, tripStart, tripEnd, schedules]); // eslint-disable-line react-hooks/exhaustive-deps

  const addTrip = async () => {
    if (!tripTitle.trim() || !tripStart) { alert('출장명과 시작일을 입력해주세요.'); return; }
    let start = tripStart;
    let end = tripEnd || tripStart;
    if (end < start) { const tmp = start; start = end; end = tmp; }
    const conflicts = tripConflicts(tripAssignee, start, end);
    if (conflicts.length > 0) {
      const lines = conflicts.slice(0, 5).map(s => `· ${s.date} ${s.startTime} ${s.program}`).join('\n');
      if (!window.confirm(`출장 기간에 이 선생님의 수업 ${conflicts.length}건이 겹칩니다.\n\n${lines}${conflicts.length > 5 ? '\n…' : ''}\n\n그래도 출장을 등록할까요?`)) return;
    }
    try {
      const assigneeName = teachers.find(t => t.id === tripAssignee)?.name || null;
      const ref = await addDoc(collection(db, 'trips'), {
        title: tripTitle.trim(),
        startDate: start,
        endDate: end,
        place: tripPlace.trim() || null,
        assigneeId: tripAssignee || null,
        assigneeName,
        authorName,
        result: '',
        createdAt: Timestamp.now(),
      });
      logActivity({ targetType: 'trip', targetId: ref.id, title: tripTitle.trim(), action: `등록 (${start} ~ ${end})`, by: authorName });
      // 출장이 끝나면 복명서 할 일을 자동으로 만들기
      if (tripMakeReport) {
        await addDoc(collection(db, 'todos'), {
          title: `[복명서] ${tripTitle.trim()}`,
          status: 'todo', category: 'admin', tags: ['출장'],
          assigneeId: tripAssignee || null, assigneeName,
          dueDate: format(addDays(parseISO(end), 1), 'yyyy-MM-dd'),
          linkedTripId: ref.id,
          checklist: [
            { id: newLocalId(), text: '출장 결과 정리', done: false },
            { id: newLocalId(), text: '복명서 작성', done: false },
            { id: newLocalId(), text: '증빙 서류 제출', done: false },
          ],
          createdBy: authorName,
          createdAt: Timestamp.now(),
        });
      }
      setTripTitle(''); setTripAssignee(''); setTripStart(''); setTripEnd(''); setTripPlace('');
      setIsTripFormOpen(false);
      setCalBaseDate(parseISO(start));
    } catch (err) {
      console.error(err);
      alert('출장을 저장하지 못했습니다. (Firestore 보안 규칙에 trips 권한이 있는지 확인해주세요)');
    }
  };

  const deleteTrip = async (id: string) => {
    const trip = trips.find(t => t.id === id);
    const linked = todos.filter(t => t.linkedTripId === id);
    if (!window.confirm(`이 출장 일정을 삭제할까요?${linked.length ? `\n연결된 복명서 할 일 ${linked.length}건도 함께 삭제됩니다.` : ''}`)) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'trips', id));
      linked.forEach(t => batch.delete(doc(db, 'todos', t.id)));
      await batch.commit();
      logActivity({ targetType: 'trip', targetId: id, title: trip?.title || '', action: '삭제', by: authorName });
      setSelectedTripId(null);
    } catch (err) { console.error(err); }
  };

  const shiftTrip = async (trip: Trip, newStart: string, newEnd: string) => {
    if (!newStart) return;
    let s = newStart; let e = newEnd || newStart;
    if (e < s) { const tmp = s; s = e; e = tmp; }
    if (s === trip.startDate && e === trip.endDate) return;
    const conflicts = tripConflicts(trip.assigneeId, s, e);
    if (conflicts.length > 0 && !window.confirm(`바뀐 기간에 수업 ${conflicts.length}건이 겹칩니다. 그래도 옮길까요?`)) return;
    try {
      await updateDoc(doc(db, 'trips', trip.id), { startDate: s, endDate: e });
      // 연결된 복명서 마감일도 함께 조정
      const linked = todos.filter(t => t.linkedTripId === trip.id && t.status !== 'done');
      await Promise.all(linked.map(t => updateDoc(doc(db, 'todos', t.id), { dueDate: format(addDays(parseISO(e), 1), 'yyyy-MM-dd') })));
      logActivity({ targetType: 'trip', targetId: trip.id, title: trip.title, action: `기간 변경 ${trip.startDate}~${trip.endDate} → ${s}~${e}`, by: authorName });
    } catch (err) { console.error(err); }
  };

  const saveTripResult = async (trip: Trip) => {
    try {
      await updateDoc(doc(db, 'trips', trip.id), { result: tripResultDraft });
      logActivity({ targetType: 'trip', targetId: trip.id, title: trip.title, action: '출장 결과 메모 저장', by: authorName });
      alert('출장 결과를 저장했습니다.');
    } catch (err) { console.error(err); }
  };

  const tripNights = (t: Trip) => {
    try {
      const days = Math.round((parseISO(t.endDate || t.startDate).getTime() - parseISO(t.startDate).getTime()) / 86400000);
      return days <= 0 ? '당일' : `${days}박 ${days + 1}일`;
    } catch { return ''; }
  };

  const selectedTrip = selectedTripId ? trips.find(t => t.id === selectedTripId) || null : null;
  useEffect(() => {
    if (!selectedTrip) return;
    setTripResultDraft(selectedTrip.result || '');
    setTripEditStart(selectedTrip.startDate);
    setTripEditEnd(selectedTrip.endDate);
  }, [selectedTripId]); // eslint-disable-line react-hooks/exhaustive-deps

  const openTrip = (id: string) => {
    const t = trips.find(x => x.id === id);
    setSubTab('calendar');
    setSelectedTripId(id);
    setCalSelectedDate(null);
    if (t) setCalBaseDate(parseISO(t.startDate));
    setSearchText('');
  };

  // 달력을 주 단위로 나누고, 주마다 출장 띠의 위치(시작 칸, 끝 칸, 줄 번호)를 계산
  const calWeeks = useMemo(() => {
    const weeks: { days: Date[]; dayStrs: string[]; segs: { trip: Trip; startCol: number; endCol: number; lane: number; contL: boolean; contR: boolean }[]; laneCount: number }[] = [];
    for (let i = 0; i + 7 <= calDays.length; i += 7) {
      const days = calDays.slice(i, i + 7);
      const dayStrs = days.map(d => format(d, 'yyyy-MM-dd'));
      const ws = dayStrs[0];
      const we = dayStrs[6];
      const overlapping = visibleTrips
        .filter(t => t.startDate <= we && (t.endDate || t.startDate) >= ws)
        .sort((a, b) => a.startDate.localeCompare(b.startDate) || (b.endDate || b.startDate).localeCompare(a.endDate || a.startDate));
      const laneEnds: number[] = [];
      const segs = overlapping.map(t => {
        const end = t.endDate || t.startDate;
        const startCol = t.startDate < ws ? 0 : Math.max(0, dayStrs.indexOf(t.startDate));
        const endCol = end > we ? 6 : Math.max(startCol, dayStrs.indexOf(end));
        let lane = laneEnds.findIndex(e => e < startCol);
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(endCol); } else { laneEnds[lane] = endCol; }
        return { trip: t, startCol, endCol, lane, contL: t.startDate < ws, contR: end > we };
      });
      weeks.push({ days, dayStrs, segs, laneCount: laneEnds.length });
    }
    return weeks;
  }, [calDays, visibleTrips]);

  const tripsOnDate = (dateStr: string) => visibleTrips.filter(t => t.startDate <= dateStr && (t.endDate || t.startDate) >= dateStr);

  // ---------- 드래그로 날짜 옮기기 (PC) ----------
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const handleDropOnDate = (dateStr: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverDate(null);
    let data: { type: string; id: string; origin?: string } | null = null;
    try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
    if (!data) return;
    if (data.type === 'todo') {
      changeTodoDue(data.id, dateStr);
    } else if (data.type === 'trip') {
      const trip = trips.find(t => t.id === data!.id);
      if (!trip || !data.origin) return;
      const delta = Math.round((parseISO(dateStr).getTime() - parseISO(data.origin).getTime()) / 86400000);
      if (delta === 0) return;
      shiftTrip(trip, format(addDays(parseISO(trip.startDate), delta), 'yyyy-MM-dd'), format(addDays(parseISO(trip.endDate || trip.startDate), delta), 'yyyy-MM-dd'));
    }
  };
  const dropProps = (dateStr: string) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); if (dragOverDate !== dateStr) setDragOverDate(dateStr); },
    onDragLeave: () => { if (dragOverDate === dateStr) setDragOverDate(null); },
    onDrop: (e: React.DragEvent) => handleDropOnDate(dateStr, e),
  });

  // 이번 달 진행률
  const monthProgress = useMemo(() => {
    const monthStr = format(calBaseDate, 'yyyy-MM');
    const monthTodos = visibleTodos.filter((t: Todo) => t.dueDate && t.dueDate.startsWith(monthStr));
    const done = monthTodos.filter((t: Todo) => t.status === 'done').length;
    const doing = monthTodos.filter((t: Todo) => t.status === 'doing').length;
    const pct = monthTodos.length ? Math.round((done / monthTodos.length) * 100) : 0;
    return { total: monthTodos.length, done, doing, pct };
  }, [visibleTodos, calBaseDate]);

  // ---------- 오늘의 업무 요약 ----------
  const summary = useMemo(() => {
    const todayDue = visibleTodos.filter(t => t.dueDate === today && t.status !== 'done');
    const overdue = visibleTodos.filter(t => !!t.dueDate && t.dueDate < today && t.status !== 'done');
    const officialSoon = visibleTodos.filter(t => t.category === 'official' && t.status !== 'done' && (daysUntil(t.dueDate) ?? 99) <= 3);
    const todayTrips = visibleTrips.filter(t => t.startDate <= today && (t.endDate || t.startDate) >= today);
    const todaySchedules = schedules.filter(s => s.date === today && (!myFilterOn || s.teacherId === myTeacherId));
    const conflictTrips = visibleTrips
      .filter(t => (t.endDate || t.startDate) >= today)
      .map(t => ({ trip: t, conflicts: tripConflicts(t.assigneeId, t.startDate, t.endDate || t.startDate) }))
      .filter(x => x.conflicts.length > 0);
    return { todayDue, overdue, officialSoon, todayTrips, todaySchedules, conflictTrips };
  }, [visibleTodos, visibleTrips, schedules, today, myFilterOn, myTeacherId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- 업무 메모 (인수인계) ----------
  const [notes, setNotes] = useState<HandoffNote[]>([]);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [highlightNoteId, setHighlightNoteId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'handoffNotes'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setNotes(snap.docs.map(d => ({ id: d.id, ...d.data() }) as HandoffNote));
    }, (err) => console.warn('handoffNotes snapshot error', err));
  }, []);

  const addNote = async () => {
    if (!noteTitle.trim() || !noteContent.trim()) return;
    try {
      const ref = await addDoc(collection(db, 'handoffNotes'), {
        title: noteTitle.trim(), content: noteContent.trim(), authorName, createdAt: Timestamp.now(),
      });
      logActivity({ targetType: 'note', targetId: ref.id, title: noteTitle.trim(), action: '작성', by: authorName });
      setNoteTitle(''); setNoteContent('');
    } catch (err) { console.error(err); }
  };

  const deleteNote = async (id: string) => {
    if (!window.confirm('이 메모를 삭제할까요?')) return;
    const n = notes.find(x => x.id === id);
    try {
      await deleteDoc(doc(db, 'handoffNotes', id));
      logActivity({ targetType: 'note', targetId: id, title: n?.title || '', action: '삭제', by: authorName });
    } catch (err) { console.error(err); }
  };

  // ---------- 변경 기록 ----------
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [logFilter, setLogFilter] = useState<'all' | ActivityLog['targetType']>('all');
  useEffect(() => {
    const q = query(collection(db, 'activityLog'), orderBy('at', 'desc'));
    return onSnapshot(q, (snap) => {
      setLogs(snap.docs.slice(0, 300).map(d => ({ id: d.id, ...d.data() }) as ActivityLog));
    }, (err) => console.warn('activityLog snapshot error', err));
  }, []);
  const filteredLogs = logFilter === 'all' ? logs : logs.filter(l => l.targetType === logFilter);

  // ---------- 통합 검색 ----------
  const [searchText, setSearchText] = useState('');
  const searchResults = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return null;
    const has = (...vals: (string | null | undefined)[]) => vals.some(v => (v || '').toLowerCase().includes(q));
    return {
      todos: todos.filter(t => has(t.title, t.note, t.docNo, t.docTo, t.assigneeName, (t.tags || []).join(' '), ...(t.checklist || []).map(c => c.text))).slice(0, 15),
      trips: trips.filter(t => has(t.title, t.place, t.assigneeName, t.result)).slice(0, 10),
      memos: (Object.values(dayNotes) as DayNote[]).filter(n => has(n.content)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10),
      notes: notes.filter(n => has(n.title, n.content)).slice(0, 10),
    };
  }, [searchText, todos, trips, dayNotes, notes]);
  const searchCount = searchResults ? searchResults.todos.length + searchResults.trips.length + searchResults.memos.length + searchResults.notes.length : 0;

  // ---------- 휴대폰 캘린더로 내보내기 (.ics) ----------
  const [isIcsOpen, setIsIcsOpen] = useState(false);
  const [icsWho, setIcsWho] = useState<'me' | 'all'>('me');
  const [icsClasses, setIcsClasses] = useState(true);
  const [icsTrips, setIcsTrips] = useState(true);
  const [icsTodos, setIcsTodos] = useState(true);
  const [icsAlarm, setIcsAlarm] = useState(true);
  const [icsMonths, setIcsMonths] = useState(3);

  const exportIcs = () => {
    if (icsWho === 'me' && !myTeacherId) { alert('먼저 위쪽 "나는 누구?"에서 본인 이름을 선택해주세요.'); return; }
    const from = format(addDays(startOfToday(), -7), 'yyyy-MM-dd');
    const to = format(addMonths(startOfToday(), icsMonths), 'yyyy-MM-dd');
    const mine = (id?: string | null) => icsWho === 'all' || id === myTeacherId;
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const ev: string[] = [];
    const push = (lines: string[]) => { ev.push('BEGIN:VEVENT', ...lines, `DTSTAMP:${stamp}`, 'END:VEVENT'); };
    let count = 0;

    if (icsClasses) {
      schedules.filter(sc => sc.date >= from && sc.date <= to && mine(sc.teacherId)).forEach(sc => {
        count++;
        push([
          `UID:class-${sc.id}@edu-scheduler`,
          `DTSTART;TZID=Asia/Seoul:${icsDateTime(sc.date, sc.startTime)}`,
          `DTEND;TZID=Asia/Seoul:${icsDateTime(sc.date, sc.endTime || sc.startTime)}`,
          `SUMMARY:${icsText(`[${categoryOf(sc.category).label}] ${sc.program}`)}`,
          `LOCATION:${icsText(sc.location)}`,
          `DESCRIPTION:${icsText(`대상: ${sc.target}${sc.teacherName ? `\n담당: ${sc.teacherName}` : ''}`)}`,
          ...(icsAlarm ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(sc.program)}`, 'TRIGGER:-PT30M', 'END:VALARM'] : []),
        ]);
      });
    }
    if (icsTrips) {
      trips.filter(t => t.startDate <= to && (t.endDate || t.startDate) >= from && mine(t.assigneeId)).forEach(t => {
        count++;
        push([
          `UID:trip-${t.id}@edu-scheduler`,
          `DTSTART;VALUE=DATE:${icsDate(t.startDate)}`,
          `DTEND;VALUE=DATE:${icsNextDay(t.endDate || t.startDate)}`,
          `SUMMARY:${icsText(`✈️ 출장: ${t.title}${icsWho === 'all' && t.assigneeName ? ` (${t.assigneeName})` : ''}`)}`,
          ...(t.place ? [`LOCATION:${icsText(t.place)}`] : []),
          'TRANSP:TRANSPARENT',
          ...(icsAlarm ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText('내일 출장: ' + t.title)}`, 'TRIGGER:-PT6H', 'END:VALARM'] : []),
        ]);
      });
    }
    if (icsTodos) {
      todos.filter(t => t.status !== 'done' && t.dueDate && t.dueDate >= from && t.dueDate <= to && mine(t.assigneeId)).forEach(t => {
        count++;
        const isOfficial = t.category === 'official';
        push([
          `UID:todo-${t.id}@edu-scheduler`,
          `DTSTART;VALUE=DATE:${icsDate(t.dueDate!)}`,
          `DTEND;VALUE=DATE:${icsNextDay(t.dueDate!)}`,
          `SUMMARY:${icsText(`${isOfficial ? '📄 공문 기한' : '☑ 마감'}: ${t.title}${icsWho === 'all' && t.assigneeName ? ` (${t.assigneeName})` : ''}`)}`,
          `DESCRIPTION:${icsText([t.docNo ? `공문 번호: ${t.docNo}` : '', t.docTo ? `제출처: ${t.docTo}` : '', t.note || ''].filter(Boolean).join('\n'))}`,
          'TRANSP:TRANSPARENT',
          // 전날 오전 9시 알림 (공문은 3일 전에도 한 번 더)
          ...(icsAlarm ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText('내일 마감: ' + t.title)}`, 'TRIGGER:-PT15H', 'END:VALARM'] : []),
          ...(icsAlarm && isOfficial ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText('공문 기한 3일 전: ' + t.title)}`, 'TRIGGER:-P2DT15H', 'END:VALARM'] : []),
        ]);
      });
    }
    if (count === 0) { alert('선택한 기간에 내보낼 일정이 없습니다.'); return; }
    const cal = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//EduScheduler Premium//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-CALNAME:업무수첩', 'X-WR-TIMEZONE:Asia/Seoul',
      'BEGIN:VTIMEZONE', 'TZID:Asia/Seoul', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0900', 'TZOFFSETTO:+0900', 'TZNAME:KST', 'END:STANDARD', 'END:VTIMEZONE',
      ...ev,
      'END:VCALENDAR',
    ].map(icsFold).join('\r\n');
    downloadFile(`업무수첩-캘린더-${format(new Date(), 'yyyyMMdd')}.ics`, cal, 'text/calendar;charset=utf-8');
    logActivity({ targetType: 'todo', targetId: 'ics-export', title: '휴대폰 캘린더 내보내기', action: `${count}건 내보냄 (${icsWho === 'me' ? myTeacherName || '나' : '전체'}, ${icsMonths}개월)`, by: authorName });
  };

  // ---------- 인쇄 ----------
  const PRINT_STYLE = `
      body{font-family:-apple-system,'Malgun Gothic','Apple SD Gothic Neo',sans-serif;padding:32px;color:#1a1a1a;}
      h1{font-size:20px;margin:0 0 4px;}
      h2{font-size:14px;border-bottom:2px solid #333;padding-bottom:5px;margin:22px 0 8px;}
      p.sub{color:#777;font-size:12px;margin:0 0 20px;}
      .day{margin-bottom:18px;page-break-inside:avoid;}
      .day h3{font-size:13px;border-bottom:1px solid #999;padding-bottom:4px;margin:0 0 6px;display:flex;align-items:center;gap:8px;}
      .holiday{color:#c0392b;font-weight:bold;font-size:11px;}
      ul{list-style:none;padding:0;margin:0;}
      li{padding:6px 2px;border-bottom:1px solid #eee;font-size:13px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
      li.done{color:#aaa;text-decoration:line-through;}
      .tag{font-size:10px;font-weight:bold;padding:2px 8px;border-radius:999px;background:#eee;color:#555;white-space:nowrap;}
      .empty{color:#bbb;font-size:12px;font-style:italic;padding:4px 2px;}
      .stats{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;}
      .stat{border:1px solid #ddd;border-radius:10px;padding:10px 14px;min-width:90px;}
      .stat b{display:block;font-size:20px;}
      .stat span{font-size:11px;color:#777;}
      table{width:100%;border-collapse:collapse;font-size:12px;}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top;}
      th{background:#f4f4f4;}
      .pre{white-space:pre-wrap;}
      @media print{ body{padding:12px;} }`;

  const openPrintWindow = (title: string, body: string) => {
    const win = window.open('', '_blank', 'width=860,height=1000');
    if (!win) { alert('팝업이 차단되어 있습니다. 브라우저에서 팝업을 허용한 뒤 다시 시도해주세요.'); return; }
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title><style>${PRINT_STYLE}</style></head><body>${body}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  };
  const scopeLabel = myFilterOn ? ` · ${myTeacherName} 선생님` : '';
  const todoLi = (t: Todo) => `<li class="${t.status === 'done' ? 'done' : ''}">${t.status === 'done' ? '✅' : '⬜'} <b>${escHtml(t.title)}</b> <span class="tag">${escHtml(todoCategoryOf(t.category).label)}</span>${t.assigneeName ? ` <span class="tag">${escHtml(t.assigneeName)}</span>` : ''}${t.docNo ? ` <span class="tag">공문 ${escHtml(t.docNo)}</span>` : ''}${t.linkedScheduleLabel ? ` <span class="tag">🔗 ${escHtml(t.linkedScheduleLabel)}</span>` : ''}${(t.checklist || []).length ? ` <span class="tag">☑ ${(t.checklist || []).filter(c => c.done).length}/${(t.checklist || []).length}</span>` : ''}</li>`;

  // 이번 주 할 일 인쇄/내보내기
  const printWeeklyExport = () => {
    const weekStart = startOfWeek(startOfToday(), { weekStartsOn: 0 });
    const weekEnd = endOfWeek(startOfToday(), { weekStartsOn: 0 });
    const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
    const rows = weekDays.map(d => {
      const dateStr = format(d, 'yyyy-MM-dd');
      const items = (todosByDate[dateStr] || []).slice().sort((a, b) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0));
      const dayTrips = tripsOnDate(dateStr);
      return { label: format(d, 'M/d (EEE)', { locale: ko }), holiday: koreanHolidays[dateStr], items, dayTrips, memo: dayNotes[dateStr]?.content };
    });
    const body = `
      <h1>이번 주 할 일${escHtml(scopeLabel)}</h1>
      <p class="sub">${escHtml(format(weekStart, 'yyyy년 M월 d일'))} ~ ${escHtml(format(weekEnd, 'M월 d일'))} · 출력일 ${escHtml(today)}</p>
      ${rows.map(r => `
        <div class="day">
          <h3>${escHtml(r.label)}${r.holiday ? ` <span class="holiday">${escHtml(r.holiday)}</span>` : ''}</h3>
          ${r.dayTrips.length ? `<ul>${r.dayTrips.map(t => `<li>✈️ <b>${escHtml(t.title)}</b>${t.assigneeName ? ` <span class="tag">${escHtml(t.assigneeName)}</span>` : ''}</li>`).join('')}</ul>` : ''}
          ${r.items.length === 0 ? '<p class="empty">등록된 할 일이 없습니다.</p>' : `<ul>${r.items.map(todoLi).join('')}</ul>`}
          ${r.memo ? `<p class="pre" style="font-size:12px;color:#555;margin:6px 2px 0;">📝 ${escHtml(r.memo)}</p>` : ''}
        </div>`).join('')}`;
    openPrintWindow(`이번 주 할 일 (${format(weekStart, 'yyyy-MM-dd')} ~ ${format(weekEnd, 'yyyy-MM-dd')})`, body);
  };

  // 월간 업무 보고서
  const printMonthlyReport = () => {
    const monthStr = format(calBaseDate, 'yyyy-MM');
    const monthStart = `${monthStr}-01`;
    const monthEnd = format(endOfMonth(calBaseDate), 'yyyy-MM-dd');
    const monthTodos = visibleTodos.filter(t => t.dueDate && t.dueDate.startsWith(monthStr)).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    const done = monthTodos.filter(t => t.status === 'done');
    const notDone = monthTodos.filter(t => t.status !== 'done');
    const officials = monthTodos.filter(t => t.category === 'official');
    const monthTrips = visibleTrips.filter(t => t.startDate <= monthEnd && (t.endDate || t.startDate) >= monthStart).sort((a, b) => a.startDate.localeCompare(b.startDate));
    const memos = (Object.values(dayNotes) as DayNote[]).filter(n => n.date.startsWith(monthStr)).sort((a, b) => a.date.localeCompare(b.date));
    const monthSchedules = schedules.filter(s => s.date.startsWith(monthStr) && (!myFilterOn || s.teacherId === myTeacherId));
    const catStats = TODO_CATEGORIES.map(c => ({ c, total: monthTodos.filter(t => (t.category || 'etc') === c.id).length, done: done.filter(t => (t.category || 'etc') === c.id).length })).filter(x => x.total > 0);
    const body = `
      <h1>${escHtml(format(calBaseDate, 'yyyy년 M월'))} 업무 보고서${escHtml(scopeLabel)}</h1>
      <p class="sub">작성: ${escHtml(authorName)} · 출력일 ${escHtml(today)}</p>
      <div class="stats">
        <div class="stat"><b>${monthTodos.length}</b><span>전체 할 일</span></div>
        <div class="stat"><b>${done.length}</b><span>완료 (${monthTodos.length ? Math.round(done.length / monthTodos.length * 100) : 0}%)</span></div>
        <div class="stat"><b>${notDone.length}</b><span>미완료</span></div>
        <div class="stat"><b>${monthTrips.length}</b><span>출장</span></div>
        <div class="stat"><b>${monthSchedules.length}</b><span>수업·일정</span></div>
      </div>
      <h2>분류별 현황</h2>
      ${catStats.length ? `<table><tr><th>분류</th><th>전체</th><th>완료</th></tr>${catStats.map(x => `<tr><td>${escHtml(x.c.label)}</td><td>${x.total}</td><td>${x.done}</td></tr>`).join('')}</table>` : '<p class="empty">이번 달 할 일이 없습니다.</p>'}
      <h2>완료한 업무</h2>
      ${done.length ? `<ul>${done.map(t => todoLi(t).replace('<li class="done">', '<li>')).join('')}</ul>` : '<p class="empty">없음</p>'}
      <h2>남은 업무</h2>
      ${notDone.length ? `<ul>${notDone.map(t => todoLi(t).replace('<b>', `<span class="tag">${escHtml((t.dueDate || '').slice(5))}</span> <b>`)).join('')}</ul>` : '<p class="empty">없음</p>'}
      <h2>공문 처리</h2>
      ${officials.length ? `<table><tr><th>기한</th><th>공문</th><th>번호</th><th>제출처</th><th>상태</th></tr>${officials.map(t => `<tr><td>${escHtml(t.dueDate || '')}</td><td>${escHtml(t.title)}</td><td>${escHtml(t.docNo || '')}</td><td>${escHtml(t.docTo || '')}</td><td>${t.status === 'done' ? '완료' : '미완료'}</td></tr>`).join('')}</table>` : '<p class="empty">없음</p>'}
      <h2>출장 내역</h2>
      ${monthTrips.length ? `<table><tr><th>기간</th><th>출장</th><th>출장자</th><th>장소</th><th>결과</th></tr>${monthTrips.map(t => `<tr><td>${escHtml(t.startDate)} ~ ${escHtml(t.endDate)}</td><td>${escHtml(t.title)}</td><td>${escHtml(t.assigneeName || '')}</td><td>${escHtml(t.place || '')}</td><td class="pre">${escHtml(t.result || '')}</td></tr>`).join('')}</table>` : '<p class="empty">없음</p>'}
      <h2>날짜 메모</h2>
      ${memos.length ? `<table><tr><th style="width:90px">날짜</th><th>내용</th></tr>${memos.map(m => `<tr><td>${escHtml(m.date)}</td><td class="pre">${escHtml(m.content)}</td></tr>`).join('')}</table>` : '<p class="empty">없음</p>'}`;
    openPrintWindow(`${format(calBaseDate, 'yyyy년 M월')} 업무 보고서`, body);
  };

  // ---------- 할 일 카드 ----------
  const TodoRow = ({ t, compact }: { t: Todo; compact?: boolean }) => {
    const overdue = t.dueDate && t.dueDate < today && t.status !== 'done';
    const cat = todoCategoryOf(t.category);
    const dd = daysUntil(t.dueDate);
    const cl = t.checklist || [];
    const clDone = cl.filter(c => c.done).length;
    const cmtCount = (commentsByTodo[t.id] || []).length;
    const isOfficial = t.category === 'official';
    return (
      <div className={cn("p-3 bg-bg-primary rounded-xl border group", compact ? "flex items-center gap-3 border-transparent" : "border-border-color", isOfficial && t.status !== 'done' && dd !== null && dd <= 3 && "border-red-200")}>
        {compact && (
          <button
            onClick={() => moveTodo(t.id, t.status === 'done' ? 'todo' : 'done')}
            className={cn("w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all", t.status === 'done' ? "bg-green-500 border-green-500" : "border-border-color hover:border-accent-color")}
            title={t.status === 'done' ? '완료 취소' : '완료로 표시'}
          >
            {t.status === 'done' && <span className="text-white text-[10px] font-bold">✓</span>}
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <button onClick={() => openTodoDetail(t.id)} className={cn("text-left text-sm font-semibold text-text-main flex-1 hover:text-accent-color transition-colors", t.status === 'done' && "line-through opacity-50")} title="눌러서 상세 보기 (체크리스트·댓글·기록)">
              {t.title}{t.seriesId && <span className="ml-1 text-xs" title="반복 업무">🔁</span>}
            </button>
            <button onClick={() => deleteTodo(t.id)} className="lg:opacity-0 lg:group-hover:opacity-100 text-text-muted hover:text-red-500 transition-all shrink-0"><X size={14} /></button>
          </div>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1", cat.bg, cat.text)}><span className={cn("w-1.5 h-1.5 rounded-full", cat.dot)} />{cat.label}</span>
            {isOfficial && t.docNo && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-text-muted">📄 {t.docNo}</span>}
            {isOfficial && t.docTo && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-text-muted">→ {t.docTo}</span>}
            {(t.tags || []).map(tag => (
              <span key={tag} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">#{tag}</span>
            ))}
            {t.assigneeName && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-accent-color">{t.assigneeName}</span>}
            {t.dueDate && <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", overdue ? "bg-red-50 text-red-500" : "bg-gray-100 text-text-muted")}>{t.dueDate}{overdue ? ' 지남' : ''}</span>}
            {t.status !== 'done' && dd !== null && dd >= 0 && dd <= 7 && (
              <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full", dd <= (isOfficial ? 3 : 1) ? "bg-red-500 text-white" : "bg-amber-50 text-amber-700")}>{ddayLabel(dd)}</span>
            )}
            {cl.length > 0 && <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1", clDone === cl.length ? "bg-green-50 text-green-600" : "bg-gray-100 text-text-muted")}><ListChecks size={10} />{clDone}/{cl.length}</span>}
            {cmtCount > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-text-muted flex items-center gap-1"><MessageSquare size={10} />{cmtCount}</span>}
            {t.linkedScheduleLabel && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 flex items-center gap-1" title="연결된 일정"><Link2 size={10} />{t.linkedScheduleLabel}</span>}
            {t.linkedTripId && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 flex items-center gap-1 cursor-pointer" onClick={() => openTrip(t.linkedTripId!)} title="연결된 출장 보기"><Plane size={10} />출장</span>}
          </div>
          {!compact && cl.length > 0 && (
            <div className="w-full h-1 bg-surface rounded-full overflow-hidden mt-2">
              <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${Math.round(clDone / cl.length * 100)}%` }} />
            </div>
          )}
          {!compact && (
            <div className="flex gap-1.5 mt-3">
              {TODO_STATUSES.filter(s => s.id !== t.status).map(s => (
                <button key={s.id} onClick={() => moveTodo(t.id, s.id)} className="flex-1 h-7 rounded-lg text-[10px] font-bold bg-surface border border-border-color text-text-muted hover:border-accent-color hover:text-accent-color transition-all">
                  → {s.label}
                </button>
              ))}
            </div>
          )}
          {compact && (
            <div className="flex gap-1.5 mt-2">
              <select value={t.status} onChange={(e) => moveTodo(t.id, e.target.value as Todo['status'])} className="h-7 px-2 bg-surface border border-border-color rounded-lg text-[10px] font-bold outline-none">
                {TODO_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>
    );
  };

  const inputCls = "h-10 px-3 bg-bg-primary border border-border-color rounded-lg text-sm outline-none focus:border-accent-color";
  const tabBtn = (id: typeof subTab, icon: React.ReactNode, label: string) => (
    <button onClick={() => setSubTab(id)} className={cn("px-3 sm:px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap", subTab === id ? "bg-accent-color text-on-accent shadow-sm" : "text-text-muted hover:text-text-main")}>
      {icon} {label}
    </button>
  );
  const detailLogs = detailTodo ? logs.filter(l => l.targetType === 'todo' && l.targetId === detailTodo.id) : [];
  const logTime = (l: ActivityLog) => { const ms = tsMillis(l.at); return ms ? format(new Date(ms), 'M/d HH:mm') : ''; };

  return (
    <div className="w-full">
      {/* ===== 머리말: 제목 · 나 선택 · 내 업무만 · 검색 · 알림 ===== */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl font-bold text-text-main">업무 관리</h2>
            <p className="text-sm text-text-muted mt-1">할 일 · 출장 · 공문 · 메모를 팀과 함께 관리하세요</p>
          </div>
          <div className="flex p-1 bg-surface border border-border-color rounded-full w-fit max-w-full shadow-sm overflow-x-auto no-scrollbar">
            {tabBtn('board', <ListChecks size={14} />, '할 일')}
            {tabBtn('calendar', <CalendarDays size={14} />, '캘린더')}
            {tabBtn('notes', <ClipboardList size={14} />, '업무 메모')}
            {tabBtn('history', <History size={14} />, '변경 기록')}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted/60" size={15} />
            <input
              type="text" value={searchText} onChange={(e) => { setSearchText(e.target.value); setAlertsOpen(false); }}
              placeholder="할 일 · 출장 · 메모 통합 검색"
              className="w-full h-10 pl-10 pr-9 bg-surface border border-border-color rounded-full text-sm outline-none focus:border-accent-color"
            />
            {searchText && <button onClick={() => setSearchText('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main"><X size={15} /></button>}
          </div>
          <div className="flex items-center gap-1.5 h-10 pl-3 pr-1 bg-surface border border-border-color rounded-full">
            <UserIcon size={14} className="text-text-muted shrink-0" />
            <select value={myTeacherId} onChange={(e) => setMyTeacherId(e.target.value)} title="이 기기를 쓰는 사람 (알림·내 업무 기준)" className="h-8 bg-transparent text-xs font-bold outline-none max-w-[110px]">
              <option value="">나는 누구?</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <button
            onClick={() => { if (!myTeacherId) { alert('먼저 옆의 "나는 누구?"에서 본인 이름을 선택해주세요.'); return; } setMyOnly(!myOnly); }}
            className={cn("h-10 px-4 rounded-full text-xs font-bold border transition-colors whitespace-nowrap", myFilterOn ? "bg-accent-color text-on-accent border-accent-color" : "bg-surface border-border-color text-text-muted hover:text-text-main")}
          >
            {myFilterOn ? '✓ 내 업무만' : '내 업무만 보기'}
          </button>
          <button
            onClick={() => alertsOpen ? setAlertsOpen(false) : openAlerts()}
            className={cn("relative h-10 w-10 rounded-full border flex items-center justify-center transition-colors", alertsOpen ? "bg-accent-color text-on-accent border-accent-color" : "bg-surface border-border-color text-text-main hover:bg-gray-50")}
            title="내 업무 알림"
          >
            <Bell size={17} />
            {unreadCount > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>
        </div>

        {/* 알림 목록 */}
        {alertsOpen && (
          <div className="bg-surface rounded-2xl border border-border-color shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-text-main flex items-center gap-2"><Bell size={15} /> 내 업무 알림{myTeacherName && <span className="text-xs font-normal text-text-muted">· {myTeacherName} 선생님</span>}</h3>
              <button onClick={() => setAlertsOpen(false)} className="p-1.5 rounded-full hover:bg-gray-50 text-text-muted"><X size={15} /></button>
            </div>
            {!myTeacherId ? (
              <p className="text-xs text-text-muted py-3">위의 <b>"나는 누구?"</b>에서 본인 이름을 선택하면, 나에게 배정된 업무와 내 업무에 달린 댓글을 알려드려요.</p>
            ) : alerts.length === 0 ? (
              <p className="text-xs text-text-muted italic py-3">최근 30일 동안 새 알림이 없습니다.</p>
            ) : (
              <div className="divide-y divide-border-color">
                {alerts.map(a => (
                  <button key={a.id} onClick={() => openTodoDetail(a.todoId)} className={cn("w-full text-left py-2.5 px-2 rounded-lg flex items-start gap-2.5 hover:bg-gray-50 transition-colors", a.at > alertsBaseline && "bg-blue-50/60")}>
                    <span className="mt-0.5 shrink-0">{a.kind === 'assign' ? <ListChecks size={14} className="text-accent-color" /> : <MessageSquare size={14} className="text-amber-600" />}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-text-main truncate">{a.text}</span>
                      <span className="block text-[11px] text-text-muted truncate">{a.sub}{a.sub ? ' · ' : ''}{format(new Date(a.at), 'M/d HH:mm')}</span>
                    </span>
                    {a.at > alertsBaseline && <span className="text-[9px] font-black text-red-500 shrink-0 mt-1">NEW</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 통합 검색 결과 */}
        {searchResults && (
          <div className="bg-surface rounded-2xl border border-border-color shadow-sm p-4 space-y-3">
            <h3 className="text-sm font-bold text-text-main">'{searchText.trim()}' 검색 결과 <span className="text-xs font-normal text-text-muted">{searchCount}건</span></h3>
            {searchCount === 0 && <p className="text-xs text-text-muted italic">일치하는 내용이 없습니다.</p>}
            {searchResults.todos.length > 0 && (
              <div>
                <p className="text-[11px] font-bold text-text-muted mb-1">할 일</p>
                {searchResults.todos.map(t => (
                  <button key={t.id} onClick={() => openTodoDetail(t.id)} className="w-full text-left px-2 py-2 rounded-lg hover:bg-gray-50 flex items-center gap-2">
                    <span className={cn("w-2 h-2 rounded-full shrink-0", todoCategoryOf(t.category).dot)} />
                    <span className={cn("text-sm text-text-main truncate flex-1", t.status === 'done' && "line-through opacity-50")}>{t.title}</span>
                    <span className="text-[10px] text-text-muted shrink-0">{t.dueDate || ''}</span>
                  </button>
                ))}
              </div>
            )}
            {searchResults.trips.length > 0 && (
              <div>
                <p className="text-[11px] font-bold text-text-muted mb-1">출장</p>
                {searchResults.trips.map(t => (
                  <button key={t.id} onClick={() => openTrip(t.id)} className="w-full text-left px-2 py-2 rounded-lg hover:bg-gray-50 flex items-center gap-2">
                    <Plane size={13} className="text-text-muted shrink-0" />
                    <span className="text-sm text-text-main truncate flex-1">{t.title}{t.assigneeName ? ` · ${t.assigneeName}` : ''}</span>
                    <span className="text-[10px] text-text-muted shrink-0">{t.startDate} ~ {t.endDate}</span>
                  </button>
                ))}
              </div>
            )}
            {searchResults.memos.length > 0 && (
              <div>
                <p className="text-[11px] font-bold text-text-muted mb-1">날짜 메모</p>
                {searchResults.memos.map(n => (
                  <button key={n.id} onClick={() => { setSubTab('calendar'); setCalBaseDate(parseISO(n.date)); setCalSelectedDate(n.date); openMemo(n.date); }} className="w-full text-left px-2 py-2 rounded-lg hover:bg-gray-50 flex items-center gap-2">
                    <StickyNote size={13} className="text-amber-600 shrink-0" />
                    <span className="text-sm text-text-main truncate flex-1">{n.content.split('\n')[0]}</span>
                    <span className="text-[10px] text-text-muted shrink-0">{n.date}</span>
                  </button>
                ))}
              </div>
            )}
            {searchResults.notes.length > 0 && (
              <div>
                <p className="text-[11px] font-bold text-text-muted mb-1">업무 메모</p>
                {searchResults.notes.map(n => (
                  <button key={n.id} onClick={() => { setSubTab('notes'); setHighlightNoteId(n.id); setSearchText(''); setTimeout(() => document.getElementById('note-' + n.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80); }} className="w-full text-left px-2 py-2 rounded-lg hover:bg-gray-50 flex items-center gap-2">
                    <ClipboardList size={13} className="text-text-muted shrink-0" />
                    <span className="text-sm text-text-main truncate flex-1">{n.title}</span>
                    <span className="text-[10px] text-text-muted shrink-0">{n.authorName}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== 오늘의 업무 요약 ===== */}
        <div className="bg-surface rounded-2xl border border-border-color shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-text-main">{format(startOfToday(), 'M월 d일 (EEE)', { locale: ko })} 오늘의 업무{myFilterOn && <span className="text-xs font-normal text-text-muted"> · {myTeacherName} 선생님</span>}</h3>
            {weatherDaily[today] && <span className="text-xs text-text-muted">{weatherIconOf(weatherDaily[today].code).icon} {weatherDaily[today].max}°/{weatherDaily[today].min}°</span>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <button onClick={() => { setSubTab('board'); setQuickFilter('today'); }} className="p-3 rounded-xl bg-bg-primary border border-border-color text-left hover:border-accent-color transition-colors">
              <p className="text-2xl font-black text-text-main">{summary.todayDue.length}</p>
              <p className="text-[11px] font-bold text-text-muted">오늘 마감</p>
            </button>
            <button onClick={() => { setSubTab('board'); setQuickFilter('overdue'); }} className={cn("p-3 rounded-xl border text-left transition-colors", summary.overdue.length ? "bg-red-50 border-red-100 hover:border-red-400" : "bg-bg-primary border-border-color hover:border-accent-color")}>
              <p className={cn("text-2xl font-black", summary.overdue.length ? "text-red-500" : "text-text-main")}>{summary.overdue.length}</p>
              <p className="text-[11px] font-bold text-text-muted">기한 지남</p>
            </button>
            <button onClick={() => { setSubTab('board'); setQuickFilter('official'); }} className={cn("p-3 rounded-xl border text-left transition-colors", summary.officialSoon.length ? "bg-red-50 border-red-100 hover:border-red-400" : "bg-bg-primary border-border-color hover:border-accent-color")}>
              <p className={cn("text-2xl font-black", summary.officialSoon.length ? "text-red-500" : "text-text-main")}>{summary.officialSoon.length}</p>
              <p className="text-[11px] font-bold text-text-muted">공문 기한 임박 (3일)</p>
            </button>
            <button onClick={() => { setSubTab('calendar'); setCalBaseDate(startOfToday()); setCalSelectedDate(today); setSelectedTripId(null); }} className="p-3 rounded-xl bg-bg-primary border border-border-color text-left hover:border-accent-color transition-colors">
              <p className="text-2xl font-black text-text-main">{summary.todayTrips.length}</p>
              <p className="text-[11px] font-bold text-text-muted truncate">오늘 출장{summary.todayTrips.length > 0 && `: ${summary.todayTrips.map(t => t.assigneeName || t.title).join(', ')}`}</p>
            </button>
            <div className="p-3 rounded-xl bg-bg-primary border border-border-color col-span-2 sm:col-span-1">
              <p className="text-2xl font-black text-text-main">{summary.todaySchedules.length}</p>
              <p className="text-[11px] font-bold text-text-muted">오늘 수업·일정</p>
            </div>
          </div>
          {summary.conflictTrips.length > 0 && (
            <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-1">
              <p className="text-xs font-bold text-amber-700 flex items-center gap-1.5"><AlertTriangle size={13} /> 출장 기간과 수업이 겹치는 일정이 있어요</p>
              {summary.conflictTrips.slice(0, 4).map(({ trip, conflicts }) => (
                <button key={trip.id} onClick={() => openTrip(trip.id)} className="block w-full text-left text-[11px] text-amber-700 hover:underline truncate">
                  · {trip.assigneeName || '미지정'} 「{trip.title}」 {trip.startDate.slice(5)}~{trip.endDate.slice(5)} → 수업 {conflicts.length}건 ({conflicts.slice(0, 2).map(s => `${s.date.slice(5)} ${s.program}`).join(', ')}{conflicts.length > 2 ? ' …' : ''})
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {subTab === 'board' && (
        <div className="space-y-6">
          <div className="bg-surface rounded-2xl border border-border-color p-4 shadow-sm space-y-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addTodo(); }}
                placeholder="새 할 일 제목을 입력하세요"
                className={cn(inputCls, "flex-1")}
              />
              <select value={newAssignee} onChange={(e) => setNewAssignee(e.target.value)} className={inputCls}>
                <option value="">담당자 미지정</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} className={inputCls} title="마감일 (공문은 제출 기한)" />
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className={inputCls}>
                {TODO_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <input
                type="text" value={newTagsText} onChange={(e) => setNewTagsText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addTodo(); }}
                placeholder="태그 (쉼표로 구분, 예: 긴급, 10월)"
                className={cn(inputCls, "flex-1")}
              />
              <button onClick={addTodo} className="h-10 px-5 bg-accent-color text-on-accent rounded-lg text-sm font-bold hover:opacity-90 transition-all flex items-center gap-1.5 justify-center shrink-0">
                <Plus size={16} /> 추가
              </button>
            </div>
            {newCategory === 'official' && (
              <div className="flex flex-col sm:flex-row gap-2 p-2 rounded-lg bg-red-50/60 border border-red-100">
                <span className="text-[11px] font-bold text-red-500 shrink-0 self-center flex items-center gap-1"><FileText size={12} />공문 정보</span>
                <input type="text" value={newDocNo} onChange={(e) => setNewDocNo(e.target.value)} placeholder="공문 번호 (예: 강원교육-12345)" className={cn(inputCls, "flex-1 h-9 bg-surface")} />
                <input type="text" value={newDocTo} onChange={(e) => setNewDocTo(e.target.value)} placeholder="제출처 (예: 교육지원청)" className={cn(inputCls, "flex-1 h-9 bg-surface")} />
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-2 pt-1 border-t border-border-color/60 mt-1">
              <div className="flex items-center gap-2 flex-1">
                <span className="text-[11px] font-bold text-text-muted shrink-0">반복</span>
                <select value={newRepeat} onChange={(e) => setNewRepeat(e.target.value as 'none' | 'weekly' | 'monthly')} disabled={!newDue} className="h-9 px-2 flex-1 bg-bg-primary border border-border-color rounded-lg text-xs outline-none focus:border-accent-color disabled:opacity-50" title={!newDue ? '먼저 마감일을 선택하세요' : ''}>
                  <option value="none">안 함</option>
                  <option value="weekly">매주 반복</option>
                  <option value="monthly">매월 반복</option>
                </select>
                {newRepeat !== 'none' && (
                  <input type="date" value={newRepeatEndDate} min={newDue} onChange={(e) => setNewRepeatEndDate(e.target.value)} className="h-9 px-2 bg-bg-primary border border-border-color rounded-lg text-xs outline-none focus:border-accent-color" title="반복 종료일" />
                )}
              </div>
              <div className="flex items-center gap-2 flex-1">
                <span className="text-[11px] font-bold text-text-muted shrink-0 flex items-center gap-1"><Link2 size={12} />연결</span>
                <select
                  value={newLinkedScheduleId}
                  onChange={(e) => setNewLinkedScheduleId(e.target.value)}
                  disabled={!newDue || schedulesForNewDue.length === 0}
                  className="h-9 px-2 flex-1 bg-bg-primary border border-border-color rounded-lg text-xs outline-none focus:border-accent-color disabled:opacity-50"
                  title={!newDue ? '먼저 마감일을 선택하세요' : schedulesForNewDue.length === 0 ? '해당 날짜에 등록된 일정이 없습니다' : ''}
                >
                  <option value="">
                    {!newDue ? '마감일을 먼저 선택하세요' : schedulesForNewDue.length === 0 ? '해당 날짜 일정 없음' : '연결할 일정 선택 (선택)'}
                  </option>
                  {schedulesForNewDue.map(s => <option key={s.id} value={s.id}>{s.startTime} {s.program}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* ===== 업무 템플릿 ===== */}
          <div className="bg-surface rounded-2xl border border-border-color shadow-sm">
            <button onClick={() => setIsTemplateOpen(v => !v)} className="w-full px-4 py-3 flex items-center justify-between text-left">
              <span className="text-sm font-bold text-text-main flex items-center gap-2"><Layers size={15} /> 업무 템플릿 <span className="text-xs font-normal text-text-muted">매년 반복되는 할 일 묶음을 한 번에 등록</span></span>
              <ChevronRight size={16} className={cn("text-text-muted transition-transform", isTemplateOpen && "rotate-90")} />
            </button>
            {isTemplateOpen && (
              <div className="px-4 pb-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-text-muted">템플릿 적용</p>
                  {templates.length === 0 && <p className="text-xs text-text-muted italic">저장된 템플릿이 없습니다. 오른쪽에서 먼저 만들어주세요.</p>}
                  {templates.map(tpl => (
                    <div key={tpl.id} className={cn("p-3 rounded-xl border transition-colors", applyTplId === tpl.id ? "border-accent-color bg-blue-50/40" : "border-border-color bg-bg-primary")}>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setApplyTplId(applyTplId === tpl.id ? '' : tpl.id)} className="flex-1 text-left text-sm font-bold text-text-main">{tpl.name} <span className="text-[11px] font-normal text-text-muted">· {tpl.items.length}개 항목</span></button>
                        <button onClick={() => deleteTemplate(tpl)} className="p-1 text-text-muted hover:text-red-500"><Trash2 size={13} /></button>
                      </div>
                      {applyTplId === tpl.id && (
                        <div className="mt-2 space-y-2">
                          <ul className="text-[11px] text-text-muted space-y-0.5">
                            {tpl.items.map((it, i) => <li key={i}>· {it.title} <span className="opacity-70">(기준일 {it.offset >= 0 ? '+' : ''}{it.offset}일 · {todoCategoryOf(it.category).label})</span></li>)}
                          </ul>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input type="date" value={applyDate} onChange={(e) => setApplyDate(e.target.value)} className={cn(inputCls, "h-9 bg-surface")} title="기준일" />
                            <select value={applyAssignee} onChange={(e) => setApplyAssignee(e.target.value)} className={cn(inputCls, "h-9 bg-surface flex-1")}>
                              <option value="">담당자 미지정</option>
                              {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                            <button onClick={applyTemplate} className="h-9 px-4 bg-accent-color text-on-accent rounded-lg text-xs font-bold shrink-0">적용하기</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-text-muted">새 템플릿 만들기</p>
                  <input type="text" value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="템플릿 이름 (예: 방학 특강 운영)" className={cn(inputCls, "w-full")} />
                  {tplItems.map((it, i) => (
                    <div key={i} className="flex gap-1.5 items-center">
                      <input type="text" value={it.title} onChange={(e) => setTplItems(tplItems.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} placeholder={`할 일 ${i + 1}`} className={cn(inputCls, "h-9 flex-1 min-w-0")} />
                      <div className="flex items-center gap-1 shrink-0" title="기준일로부터 며칠 뒤 (앞이면 음수)">
                        <span className="text-[10px] text-text-muted">D+</span>
                        <input type="number" value={it.offset} onChange={(e) => setTplItems(tplItems.map((x, j) => j === i ? { ...x, offset: Number(e.target.value) } : x))} className={cn(inputCls, "h-9 w-16 px-2")} />
                      </div>
                      <select value={it.category} onChange={(e) => setTplItems(tplItems.map((x, j) => j === i ? { ...x, category: e.target.value } : x))} className={cn(inputCls, "h-9 px-1.5 w-[84px] shrink-0")}>
                        {TODO_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                      <button onClick={() => setTplItems(tplItems.length > 1 ? tplItems.filter((_, j) => j !== i) : [{ title: '', offset: 0, category: 'etc' }])} className="p-1 text-text-muted hover:text-red-500 shrink-0"><X size={14} /></button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <button onClick={() => setTplItems([...tplItems, { title: '', offset: (tplItems[tplItems.length - 1]?.offset || 0) + 1, category: 'etc' }])} className="h-9 px-3 rounded-lg border border-dashed border-border-color text-xs font-bold text-text-muted hover:border-accent-color hover:text-accent-color flex-1">+ 항목 추가</button>
                    <button onClick={saveTemplate} className="h-9 px-4 bg-accent-color text-on-accent rounded-lg text-xs font-bold">템플릿 저장</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {quickFilter !== 'none' ? (
              <button onClick={() => setQuickFilter('none')} className="h-8 px-3 rounded-full bg-accent-color text-on-accent text-xs font-bold flex items-center gap-1.5">
                필터: {quickFilter === 'today' ? '오늘 마감' : quickFilter === 'overdue' ? '기한 지남' : '진행 중인 공문'} <X size={12} />
              </button>
            ) : <span />}
            <div className="flex p-1 bg-surface border border-border-color rounded-full w-fit shadow-sm">
              <button onClick={() => setBoardView('kanban')} className={cn("px-3 py-1 rounded-full text-[11px] font-bold transition-all", boardView === 'kanban' ? "bg-accent-color text-on-accent" : "text-text-muted")}>칸반 보드</button>
              <button onClick={() => setBoardView('list')} className={cn("px-3 py-1 rounded-full text-[11px] font-bold transition-all", boardView === 'list' ? "bg-accent-color text-on-accent" : "text-text-muted")}>목록</button>
            </div>
          </div>

          {boardView === 'kanban' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {TODO_STATUSES.map((col) => (
                <div key={col.id} className="bg-surface rounded-2xl border border-border-color p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold text-text-main uppercase flex items-center gap-2">
                      <span className={cn("w-2 h-2 rounded-full", col.id === 'todo' ? "bg-gray-400" : col.id === 'doing' ? "bg-amber-500" : "bg-green-500")} />
                      {col.label}
                    </h3>
                    <span className="text-[10px] font-bold text-text-muted bg-bg-primary px-2 py-0.5 rounded-full">{columns[col.id].length}</span>
                  </div>
                  <div className="space-y-2 min-h-[80px]">
                    {columns[col.id].length === 0 && (
                      <p className="text-[11px] text-text-muted italic text-center py-6">항목이 없습니다</p>
                    )}
                    {columns[col.id].map(t => <TodoRow key={t.id} t={t} />)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {todosByCategory.length === 0 && (
                <div className="p-10 text-center text-text-muted text-sm bg-surface rounded-2xl border border-border-color">등록된 할 일이 없습니다.</div>
              )}
              {todosByCategory.map(({ cat, items }) => (
                <div key={cat.id}>
                  <h4 className="text-xs font-bold text-text-main uppercase flex items-center gap-2 mb-2">
                    <span className={cn("w-2 h-2 rounded-full", cat.dot)} />{cat.label}
                    <span className="text-[10px] font-bold text-text-muted bg-surface border border-border-color px-2 py-0.5 rounded-full">{items.length}</span>
                  </h4>
                  <div className="space-y-2">
                    {items.map(t => <TodoRow key={t.id} t={t} compact />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {subTab === 'calendar' && (
        <div className="space-y-4">
          <div className="bg-surface rounded-2xl border border-border-color shadow-sm p-3 sm:p-8">
            <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4 mb-5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-xs font-bold text-text-muted mb-1.5">
                  <span>{format(calBaseDate, 'M월')} 할 일 진행률</span>
                  <span className="text-text-main">{monthProgress.done}/{monthProgress.total}건 완료 ({monthProgress.pct}%)</span>
                </div>
                <div className="w-full h-2 bg-bg-primary rounded-full overflow-hidden">
                  <div className="h-full bg-accent-color rounded-full transition-all" style={{ width: `${monthProgress.pct}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-2 lg:flex gap-2 shrink-0">
                <button onClick={() => { setIsIcsOpen(v => !v); setIsTripFormOpen(false); }} className={cn("h-9 px-3 lg:px-4 border rounded-full text-xs font-bold transition-colors flex items-center gap-1.5 justify-center whitespace-nowrap", isIcsOpen ? "bg-accent-color text-on-accent border-accent-color" : "bg-bg-primary border-border-color hover:bg-gray-50")}>
                  <CalendarIcon size={14} /> 폰 캘린더로
                </button>
                <button onClick={() => { setIsTripFormOpen(v => !v); setIsIcsOpen(false); }} className={cn("h-9 px-3 lg:px-4 border rounded-full text-xs font-bold transition-colors flex items-center gap-1.5 justify-center whitespace-nowrap", isTripFormOpen ? "bg-accent-color text-on-accent border-accent-color" : "bg-bg-primary border-border-color hover:bg-gray-50")}>
                  <Plane size={14} /> 출장 등록
                </button>
                <button onClick={printWeeklyExport} className="h-9 px-3 lg:px-4 bg-bg-primary border border-border-color rounded-full text-xs font-bold hover:bg-gray-50 transition-colors flex items-center gap-1.5 justify-center whitespace-nowrap">
                  <Printer size={14} /> 주간 인쇄
                </button>
                <button onClick={printMonthlyReport} className="h-9 px-3 lg:px-4 bg-bg-primary border border-border-color rounded-full text-xs font-bold hover:bg-gray-50 transition-colors flex items-center gap-1.5 justify-center whitespace-nowrap">
                  <FileText size={14} /> 월간 보고서
                </button>
              </div>
            </div>

            {isIcsOpen && (
              <div className="mb-5 p-4 bg-bg-primary border border-border-color rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-text-main flex items-center gap-1.5"><CalendarIcon size={13} /> 휴대폰 캘린더로 내보내기 <span className="font-normal text-text-muted">· 아이폰·구글 캘린더에 추가할 수 있는 파일(.ics)</span></h4>
                <div className="flex flex-wrap gap-2">
                  <div className="flex p-1 bg-surface border border-border-color rounded-full">
                    <button onClick={() => setIcsWho('me')} className={cn("px-3 py-1 rounded-full text-[11px] font-bold", icsWho === 'me' ? "bg-accent-color text-on-accent" : "text-text-muted")}>내 것만{myTeacherName ? ` (${myTeacherName})` : ''}</button>
                    <button onClick={() => setIcsWho('all')} className={cn("px-3 py-1 rounded-full text-[11px] font-bold", icsWho === 'all' ? "bg-accent-color text-on-accent" : "text-text-muted")}>전체</button>
                  </div>
                  <select value={icsMonths} onChange={(e) => setIcsMonths(Number(e.target.value))} className="h-8 px-2 bg-surface border border-border-color rounded-full text-[11px] font-bold outline-none">
                    <option value={1}>앞으로 1개월</option>
                    <option value={3}>앞으로 3개월</option>
                    <option value={6}>앞으로 6개월</option>
                    <option value={12}>앞으로 1년</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-text-main">
                  {([['수업·일정', icsClasses, setIcsClasses], ['출장', icsTrips, setIcsTrips], ['할 일·공문 마감', icsTodos, setIcsTodos], ['알림 넣기', icsAlarm, setIcsAlarm]] as [string, boolean, (v: boolean) => void][]).map(([label, val, set]) => (
                    <label key={label} className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input type="checkbox" checked={val} onChange={(e) => set(e.target.checked)} className="w-4 h-4 accent-[#344B68]" />{label}
                    </label>
                  ))}
                </div>
                {icsAlarm && <p className="text-[10px] text-text-muted">알림: 수업 30분 전 · 출장 전날 저녁 6시 · 마감 전날 오전 9시 (공문은 3일 전에도 한 번 더)</p>}
                <button onClick={exportIcs} className="w-full sm:w-auto h-10 px-5 bg-accent-color text-on-accent rounded-lg text-sm font-bold flex items-center gap-1.5 justify-center"><Download size={15} /> 캘린더 파일 받기</button>
                <div className="text-[10px] text-text-muted leading-relaxed space-y-0.5">
                  <p>📱 <b>아이폰:</b> 사파리에서 버튼을 누르면 캘린더 미리보기가 열려요 → <b>"모두 추가"</b> → 추가할 캘린더를 고르세요.</p>
                  <p>💡 다시 내보낼 땐 중복되지 않도록, 아이폰 캘린더 앱에 <b>"업무수첩" 캘린더를 따로 만들어</b> 그곳에 추가하고, 새로 받기 전에 그 캘린더를 지웠다가 다시 만드는 게 깔끔해요.</p>
                </div>
              </div>
            )}

            {isTripFormOpen && (
              <div className="mb-5 p-4 bg-bg-primary border border-border-color rounded-xl space-y-2">
                <h4 className="text-xs font-bold text-text-main flex items-center gap-1.5"><Plane size={13} /> 출장 등록 <span className="font-normal text-text-muted">· 기간 동안 캘린더에 띠로 표시됩니다</span></h4>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input type="text" value={tripTitle} onChange={(e) => setTripTitle(e.target.value)} placeholder="출장명 (예: 교육청 연수)" className="flex-1 h-10 px-3 bg-surface border border-border-color rounded-lg text-sm outline-none focus:border-accent-color" />
                  <select value={tripAssignee} onChange={(e) => setTripAssignee(e.target.value)} className="h-10 px-3 bg-surface border border-border-color rounded-lg text-sm outline-none focus:border-accent-color">
                    <option value="">출장자 선택</option>
                    {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <input type="text" value={tripPlace} onChange={(e) => setTripPlace(e.target.value)} placeholder="장소 (선택)" className="sm:w-40 h-10 px-3 bg-surface border border-border-color rounded-lg text-sm outline-none focus:border-accent-color" />
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-[11px] font-bold text-text-muted shrink-0 w-10">시작일</span>
                    <input type="date" value={tripStart} onChange={(e) => { setTripStart(e.target.value); if (!tripEnd || tripEnd < e.target.value) setTripEnd(e.target.value); }} className="flex-1 h-10 px-3 bg-surface border border-border-color rounded-lg text-sm outline-none focus:border-accent-color" />
                  </div>
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-[11px] font-bold text-text-muted shrink-0 w-10">종료일</span>
                    <input type="date" value={tripEnd} min={tripStart || undefined} onChange={(e) => setTripEnd(e.target.value)} className="flex-1 h-10 px-3 bg-surface border border-border-color rounded-lg text-sm outline-none focus:border-accent-color" />
                  </div>
                  <button onClick={addTrip} className="h-10 px-5 bg-accent-color text-on-accent rounded-lg text-sm font-bold hover:opacity-90 transition-all flex items-center gap-1.5 justify-center shrink-0">
                    <Plus size={16} /> 등록
                  </button>
                </div>
                <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer select-none">
                  <input type="checkbox" checked={tripMakeReport} onChange={(e) => setTripMakeReport(e.target.checked)} className="w-4 h-4 accent-[#344B68]" />
                  출장 다음 날 마감으로 <b className="text-text-main">복명서 작성 할 일</b>을 자동으로 만들기
                </label>
                {formConflicts.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                    <p className="text-[11px] font-bold text-amber-700 flex items-center gap-1"><AlertTriangle size={12} /> 이 기간에 출장자의 수업 {formConflicts.length}건이 겹쳐요</p>
                    <ul className="mt-1 text-[11px] text-amber-700 space-y-0.5">
                      {formConflicts.slice(0, 5).map(s => <li key={s.id}>· {s.date} ({s.day}) {s.startTime}~{s.endTime} {s.program} · {s.location}</li>)}
                      {formConflicts.length > 5 && <li>· 외 {formConflicts.length - 5}건</li>}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-3">
              <button onClick={() => setCalBaseDate(subMonths(calBaseDate, 1))} className="p-2.5 bg-bg-primary border border-border-color rounded-full hover:bg-gray-50 transition-colors"><ChevronLeft size={18} /></button>
              <h3 className="font-serif text-xl sm:text-2xl font-bold text-text-main min-w-[120px] sm:min-w-[160px] text-center">{format(calBaseDate, 'yyyy년 M월')}</h3>
              <button onClick={() => setCalBaseDate(addMonths(calBaseDate, 1))} className="p-2.5 bg-bg-primary border border-border-color rounded-full hover:bg-gray-50 transition-colors"><ChevronRight size={18} /></button>
              <button onClick={() => setCalBaseDate(startOfToday())} className="px-4 py-2 bg-bg-primary border border-border-color rounded-full text-sm font-bold hover:bg-gray-50 transition-colors">오늘</button>
            </div>
            <p className="text-center text-[11px] text-text-muted mb-4">날짜 칸을 <b>두 번 누르면</b> 메모 · 출장 띠를 누르면 상세 정보<span className="hidden lg:inline"> · 할 일과 출장 띠는 <b>끌어서</b> 다른 날로 옮길 수 있어요</span></p>

            <div className="rounded-xl overflow-hidden border border-border-color">
              <div className="grid grid-cols-7">
                {['일', '월', '화', '수', '목', '금', '토'].map(d => (
                  <div key={d} className={cn("text-center text-xs font-bold uppercase py-2 sm:py-3 bg-bg-primary border-b border-border-color", d === '일' ? "text-sun" : d === '토' ? "text-sat" : "text-text-muted")}>{d}</div>
                ))}
              </div>
              {calWeeks.map((week, wi) => (
                <div
                  key={wi}
                  className="grid grid-cols-7 min-h-[96px] sm:min-h-[128px]"
                  style={{ gridTemplateRows: ['auto', ...Array.from({ length: week.laneCount }, () => '20px'), '1fr'].join(' ') }}
                >
                  {/* 1) 날짜 칸 배경 (클릭 · 더블클릭 · 드롭 영역) */}
                  {week.days.map((d, di) => {
                    const dateStr = week.dayStrs[di];
                    const isCurMonth = isSameMonth(d, calBaseDate);
                    return (
                      <div
                        key={'bg' + di}
                        onClick={() => handleDayTap(dateStr)}
                        {...dropProps(dateStr)}
                        style={{ gridColumn: di + 1, gridRow: '1 / -1' }}
                        className={cn(
                          "border-b border-r border-border-color cursor-pointer transition-colors touch-manipulation",
                          di === 6 && "border-r-0",
                          !isCurMonth ? "bg-gray-50/30" : "bg-surface hover:bg-gray-50/50",
                          calSelectedDate === dateStr && "ring-2 ring-inset ring-accent-color",
                          dragOverDate === dateStr && "bg-blue-50 ring-2 ring-inset ring-blue-300"
                        )}
                      />
                    );
                  })}

                  {/* 2) 날짜 숫자 · 공휴일 · 메모 표시 · 날씨 */}
                  {week.days.map((d, di) => {
                    const dateStr = week.dayStrs[di];
                    const isCurMonth = isSameMonth(d, calBaseDate);
                    const isToday = isSameDay(d, startOfToday());
                    const holidayName = koreanHolidays[dateStr];
                    const dayWeather = weatherDaily[dateStr];
                    const isOffDay = !!holidayName || d.getDay() === 0;
                    const hasMemo = !!dayNotes[dateStr];
                    return (
                      <div key={'hd' + di} style={{ gridColumn: di + 1, gridRow: 1 }} className="pointer-events-none relative z-10 min-w-0 px-1 pt-1 sm:px-2.5 sm:pt-2.5 pb-1 flex items-start justify-between gap-1">
                        <div className="flex items-center gap-0.5 sm:gap-1 min-w-0">
                          <span className={cn("text-xs sm:text-sm font-bold w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center shrink-0", isToday ? "bg-accent-color text-on-accent" : !isCurMonth ? "text-gray-300" : isOffDay ? "text-sun" : d.getDay() === 6 ? "text-sat" : "text-text-main")}>{format(d, 'd')}</span>
                          {hasMemo && <StickyNote size={11} className="text-amber-600 shrink-0" />}
                          {holidayName && <span className="hidden sm:inline text-[8px] font-bold text-sun truncate" title={holidayName}>{holidayName}</span>}
                        </div>
                        {dayWeather && (
                          <span className="hidden sm:flex items-center gap-0.5 text-[9px] text-text-muted opacity-70 whitespace-nowrap shrink-0" title={weatherIconOf(dayWeather.code).label}>
                            <span>{weatherIconOf(dayWeather.code).icon}</span>
                            <span className="font-bold">{dayWeather.max}°/{dayWeather.min}°</span>
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {/* 3) 출장 띠 (여러 날을 가로지르는 막대, PC에선 끌어서 이동) */}
                  {week.segs.map(seg => (
                    <div
                      key={'trip' + seg.trip.id}
                      draggable
                      onDragStart={(e) => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const span = seg.endCol - seg.startCol + 1;
                        const idx = Math.min(span - 1, Math.max(0, Math.floor((e.clientX - rect.left) / (rect.width / span))));
                        e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'trip', id: seg.trip.id, origin: week.dayStrs[seg.startCol + idx] }));
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={() => setDragOverDate(null)}
                      onClick={(e) => { e.stopPropagation(); setSelectedTripId(seg.trip.id); setCalSelectedDate(null); }}
                      title={`${seg.trip.title}${seg.trip.assigneeName ? ' · ' + seg.trip.assigneeName : ''} (${seg.trip.startDate} ~ ${seg.trip.endDate})`}
                      style={{ gridColumn: `${seg.startCol + 1} / ${seg.endCol + 2}`, gridRow: seg.lane + 2 }}
                      className={cn(
                        "relative z-20 h-[18px] self-center flex items-center gap-1 px-1.5 text-[9px] sm:text-[10px] font-bold cursor-pointer shadow-sm hover:brightness-110 transition-all min-w-0 overflow-hidden",
                        tripColorOf(seg.trip),
                        seg.contL ? "ml-0 rounded-l-none" : "ml-1 rounded-l-full",
                        seg.contR ? "mr-0 rounded-r-none" : "mr-1 rounded-r-full",
                        selectedTripId === seg.trip.id && "ring-2 ring-offset-1 ring-accent-color"
                      )}
                    >
                      <Plane size={10} className="shrink-0" />
                      <span className="truncate">{seg.contL ? '…' : ''}{seg.trip.title}{seg.trip.assigneeName ? ` · ${seg.trip.assigneeName}` : ''}</span>
                      {tripConflicts(seg.trip.assigneeId, seg.trip.startDate, seg.trip.endDate).length > 0 && !seg.contL && <AlertTriangle size={10} className="shrink-0 ml-auto" />}
                    </div>
                  ))}

                  {/* 4) 할 일 (PC에선 끌어서 날짜 이동) */}
                  {week.days.map((d, di) => {
                    const dateStr = week.dayStrs[di];
                    const items = todosByDate[dateStr] || [];
                    return (
                      <div key={'it' + di} style={{ gridColumn: di + 1, gridRow: week.laneCount + 2 }} className="pointer-events-none relative z-10 min-w-0 px-1 sm:px-2.5 pt-1 pb-1.5 space-y-1 overflow-hidden">
                        {items.slice(0, 3).map((t: Todo) => {
                          const overdue = t.dueDate && t.dueDate < today && t.status !== 'done';
                          const cat = todoCategoryOf(t.category);
                          return (
                            <div
                              key={t.id}
                              title={`${t.title}${t.assigneeName ? ' · ' + t.assigneeName : ''}`}
                              draggable
                              onDragStart={(e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'todo', id: t.id })); e.dataTransfer.effectAllowed = 'move'; }}
                              onDragEnd={() => setDragOverDate(null)}
                              onClick={() => handleDayTap(dateStr)}
                              {...dropProps(dateStr)}
                              className={cn(
                                "lg:pointer-events-auto lg:cursor-grab lg:active:cursor-grabbing px-1 sm:px-1.5 py-0.5 sm:py-1 text-[9px] font-bold rounded border truncate flex items-center gap-1",
                                t.status === 'done' ? "bg-gray-50 text-gray-400 border-gray-100 line-through" : overdue ? "bg-red-50 text-red-600 border-red-200" : cn(cat.bg, cat.text, cat.border)
                              )}
                            >
                              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0 hidden sm:inline-block", cat.dot)} />
                              <span className="truncate">{t.title}</span>
                            </div>
                          );
                        })}
                        {items.length > 3 && (
                          <div className="text-[8px] text-text-muted pl-1 font-bold italic opacity-60">+ {items.length - 3}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {selectedTrip && (() => {
            const conflicts = tripConflicts(selectedTrip.assigneeId, selectedTrip.startDate, selectedTrip.endDate);
            const reportTodos = todos.filter(t => t.linkedTripId === selectedTrip.id);
            return (
              <div className="bg-surface rounded-2xl border border-border-color p-5 shadow-sm space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-text-main flex items-center gap-2"><span className={cn("w-5 h-5 rounded-full flex items-center justify-center shrink-0", tripColorOf(selectedTrip))}><Plane size={11} /></span>{selectedTrip.title}</h3>
                    <p className="text-xs text-text-muted mt-1">{selectedTrip.startDate} ~ {selectedTrip.endDate} · {tripNights(selectedTrip)}</p>
                  </div>
                  <button onClick={() => setSelectedTripId(null)} className="p-1.5 rounded-full hover:bg-gray-50 text-text-muted transition-colors shrink-0"><X size={16} /></button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedTrip.assigneeName && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-accent-color">{selectedTrip.assigneeName}</span>}
                  {selectedTrip.place && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-text-muted flex items-center gap-1"><MapPin size={10} />{selectedTrip.place}</span>}
                  {selectedTrip.authorName && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-text-muted">등록: {selectedTrip.authorName}</span>}
                </div>

                {conflicts.length > 0 && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                    <p className="text-xs font-bold text-amber-700 flex items-center gap-1.5"><AlertTriangle size={13} /> 출장 기간에 겹치는 수업 {conflicts.length}건 · 대체 수업이나 일정 조정이 필요해요</p>
                    <ul className="mt-1.5 text-[11px] text-amber-700 space-y-0.5">
                      {conflicts.map(s => <li key={s.id}>· {s.date} ({s.day}) {s.startTime}~{s.endTime} {s.program} · {s.location} · {s.target}</li>)}
                    </ul>
                  </div>
                )}

                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold text-text-muted">기간 변경</p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input type="date" value={tripEditStart} onChange={(e) => { setTripEditStart(e.target.value); if (tripEditEnd < e.target.value) setTripEditEnd(e.target.value); }} className={cn(inputCls, "h-9")} />
                    <input type="date" value={tripEditEnd} min={tripEditStart} onChange={(e) => setTripEditEnd(e.target.value)} className={cn(inputCls, "h-9")} />
                    <button onClick={() => shiftTrip(selectedTrip, tripEditStart, tripEditEnd)} disabled={tripEditStart === selectedTrip.startDate && tripEditEnd === selectedTrip.endDate} className="h-9 px-4 rounded-lg text-xs font-bold bg-bg-primary border border-border-color hover:border-accent-color disabled:opacity-40">기간 저장</button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold text-text-muted">복명서</p>
                  {reportTodos.length === 0 ? (
                    <p className="text-xs text-text-muted italic">연결된 복명서 할 일이 없습니다.</p>
                  ) : reportTodos.map(t => <TodoRow key={t.id} t={t} compact />)}
                </div>

                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold text-text-muted">출장 결과 메모 <span className="font-normal">(복명서 작성용)</span></p>
                  <textarea value={tripResultDraft} onChange={(e) => setTripResultDraft(e.target.value)} rows={4} placeholder="주요 내용, 협의 결과, 후속 조치 등을 적어두세요" className="w-full p-3 bg-bg-primary border border-border-color rounded-lg text-sm outline-none focus:border-accent-color resize-none" />
                  <div className="flex items-center gap-2">
                    <button onClick={() => saveTripResult(selectedTrip)} disabled={tripResultDraft === (selectedTrip.result || '')} className="h-8 px-4 rounded-lg text-xs font-bold bg-accent-color text-on-accent disabled:opacity-40">결과 저장</button>
                    <div className="flex-1" />
                    <button onClick={() => deleteTrip(selectedTrip.id)} className="h-8 px-3 rounded-lg text-xs font-bold text-red-500 border border-red-100 hover:bg-red-50 transition-colors flex items-center gap-1.5"><Trash2 size={13} /> 출장 삭제</button>
                  </div>
                </div>
              </div>
            );
          })()}

          {calSelectedDate && (
            <div className="bg-surface rounded-2xl border border-amber-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-text-main">{format(parseISO(calSelectedDate), 'M월 d일 (EEE)', { locale: ko })}</h3>
                <div className="flex items-center gap-1">
                  <button onClick={() => openMemo(calSelectedDate)} className="h-8 px-3 rounded-full text-xs font-bold bg-bg-primary border border-border-color hover:border-accent-color hover:text-accent-color transition-colors flex items-center gap-1.5"><StickyNote size={13} /> {dayNotes[calSelectedDate] ? '메모 수정' : '메모 쓰기'}</button>
                  <button onClick={() => setCalSelectedDate(null)} className="p-1.5 rounded-full hover:bg-gray-50 text-text-muted transition-colors"><X size={16} /></button>
                </div>
              </div>

              {dayNotes[calSelectedDate] && (
                <div onClick={() => openMemo(calSelectedDate)} className="p-3 rounded-xl bg-amber-50 border border-amber-200 cursor-pointer">
                  <p className="text-[10px] font-bold text-amber-700 mb-1 flex items-center gap-1"><StickyNote size={11} /> 메모{dayNotes[calSelectedDate].authorName ? ` · ${dayNotes[calSelectedDate].authorName}` : ''}</p>
                  <p className="text-sm text-text-main whitespace-pre-wrap leading-relaxed">{dayNotes[calSelectedDate].content}</p>
                </div>
              )}

              {tripsOnDate(calSelectedDate).length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold text-text-muted">출장</p>
                  {tripsOnDate(calSelectedDate).map(t => (
                    <div key={t.id} onClick={() => { setSelectedTripId(t.id); setCalSelectedDate(null); }} className="p-2.5 rounded-xl bg-bg-primary border border-border-color flex items-center gap-2 cursor-pointer hover:border-accent-color transition-colors">
                      <span className={cn("w-5 h-5 rounded-full flex items-center justify-center shrink-0", tripColorOf(t))}><Plane size={11} /></span>
                      <span className="text-sm font-semibold text-text-main truncate flex-1">{t.title}{t.assigneeName ? ` · ${t.assigneeName}` : ''}</span>
                      <span className="text-[10px] text-text-muted shrink-0">{t.startDate.slice(5)} ~ {t.endDate.slice(5)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <p className="text-[11px] font-bold text-text-muted">마감 할 일</p>
                {(todosByDate[calSelectedDate] || []).length === 0 ? (
                  <p className="text-xs text-text-muted italic py-1">이 날짜에 마감인 할 일이 없습니다.</p>
                ) : (
                  (todosByDate[calSelectedDate] || []).map(t => <TodoRow key={t.id} t={t} compact />)
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === 'notes' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-surface rounded-2xl border border-border-color p-5 shadow-sm h-fit space-y-3">
            <h3 className="text-xs font-bold text-text-main uppercase flex items-center gap-2"><Plus size={14} /> 새 메모 작성</h3>
            <input type="text" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="제목" className="w-full h-10 px-3 bg-bg-primary border border-border-color rounded-lg text-sm outline-none focus:border-accent-color" />
            <textarea value={noteContent} onChange={(e) => setNoteContent(e.target.value)} placeholder="업무 관련 내용을 적어주세요" rows={6} className="w-full p-3 bg-bg-primary border border-border-color rounded-lg text-sm outline-none focus:border-accent-color resize-none" />
            <button onClick={addNote} className="w-full h-10 bg-accent-color text-on-accent rounded-lg text-sm font-bold hover:opacity-90 transition-all">메모 남기기</button>
          </div>
          <div className="lg:col-span-2 space-y-3">
            {notes.length === 0 && <div className="p-10 text-center text-text-muted text-sm bg-surface rounded-2xl border border-border-color">아직 남겨진 메모가 없습니다.</div>}
            {notes.map(n => (
              <div key={n.id} id={'note-' + n.id} className={cn("bg-surface rounded-2xl border p-5 shadow-sm group transition-colors", highlightNoteId === n.id ? "border-accent-color ring-2 ring-accent-color/30" : "border-border-color")}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h4 className="text-sm font-bold text-text-main">{n.title}</h4>
                  <button onClick={() => deleteNote(n.id)} className="lg:opacity-0 lg:group-hover:opacity-100 text-text-muted hover:text-red-500 transition-all shrink-0"><Trash2 size={14} /></button>
                </div>
                <p className="text-sm text-text-muted whitespace-pre-wrap leading-relaxed">{n.content}</p>
                <div className="flex items-center gap-1.5 mt-3 text-[10px] text-text-muted"><UserIcon size={11} /><span className="font-bold">{n.authorName}</span><span>· {n.createdAt?.toDate ? format(n.createdAt.toDate(), 'yyyy-MM-dd HH:mm') : ''}</span></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {subTab === 'history' && (
        <div className="bg-surface rounded-2xl border border-border-color shadow-sm p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h3 className="text-sm font-bold text-text-main flex items-center gap-2"><History size={15} /> 변경 기록 <span className="text-xs font-normal text-text-muted">누가 언제 무엇을 바꿨는지 (최근 300건)</span></h3>
            <select value={logFilter} onChange={(e) => setLogFilter(e.target.value as typeof logFilter)} className="h-9 px-3 bg-bg-primary border border-border-color rounded-full text-xs font-bold outline-none">
              <option value="all">전체</option>
              {(Object.keys(LOG_TYPE_LABEL) as ActivityLog['targetType'][]).map(k => <option key={k} value={k}>{LOG_TYPE_LABEL[k]}</option>)}
            </select>
          </div>
          {filteredLogs.length === 0 ? (
            <p className="text-xs text-text-muted italic py-6 text-center">아직 기록이 없습니다. 지금부터 추가·수정·삭제가 기록됩니다.</p>
          ) : (
            <div className="divide-y divide-border-color">
              {filteredLogs.map(l => {
                const clickable = (l.targetType === 'todo' && todos.some(t => t.id === l.targetId)) || (l.targetType === 'trip' && trips.some(t => t.id === l.targetId));
                return (
                  <div
                    key={l.id}
                    onClick={() => { if (!clickable) return; if (l.targetType === 'todo') openTodoDetail(l.targetId); else openTrip(l.targetId); }}
                    className={cn("py-2.5 flex items-start gap-3", clickable && "cursor-pointer hover:bg-gray-50 rounded-lg px-1 -mx-1")}
                  >
                    <span className="text-[10px] text-text-muted w-[68px] shrink-0 pt-0.5">{logTime(l)}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-text-muted shrink-0">{LOG_TYPE_LABEL[l.targetType] || l.targetType}</span>
                    <span className="flex-1 min-w-0 text-sm text-text-main">
                      <b className="font-semibold">{l.title}</b> <span className="text-text-muted">— {l.action}</span>
                    </span>
                    <span className="text-[11px] font-bold text-text-muted shrink-0">{l.by}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== 날짜 메모 창 (날짜 칸 더블클릭 / 두 번 터치) ===== */}
      <AnimatePresence>
        {memoDate && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setMemoDate(null)}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[150] flex items-end sm:items-center justify-center p-0 sm:p-4"
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-md bg-surface border border-border-color rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 select-text"
              style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-serif text-lg font-bold text-text-main flex items-center gap-2"><StickyNote size={18} className="text-amber-600" />{format(parseISO(memoDate), 'yyyy년 M월 d일 (EEE)', { locale: ko })} 메모</h3>
                <button onClick={() => setMemoDate(null)} className="p-1.5 rounded-full hover:bg-gray-50 text-text-muted"><X size={18} /></button>
              </div>
              <textarea
                autoFocus
                value={memoText}
                onChange={(e) => setMemoText(e.target.value)}
                placeholder="이 날의 메모나 노트를 자유롭게 적어주세요"
                rows={8}
                className="w-full p-3 bg-bg-primary border border-border-color rounded-xl text-sm outline-none focus:border-accent-color resize-none leading-relaxed"
              />
              {dayNotes[memoDate]?.updatedAt?.toDate && (
                <p className="text-[10px] text-text-muted mt-1.5">마지막 수정: {dayNotes[memoDate].authorName || ''} · {format(dayNotes[memoDate].updatedAt.toDate(), 'yyyy-MM-dd HH:mm')}</p>
              )}
              <div className="flex items-center gap-2 mt-4">
                {dayNotes[memoDate] && (
                  <button onClick={deleteMemo} className="h-10 px-4 rounded-xl text-sm font-bold text-red-500 border border-red-100 hover:bg-red-50 transition-colors flex items-center gap-1.5"><Trash2 size={14} /> 삭제</button>
                )}
                <div className="flex-1" />
                <button onClick={() => setMemoDate(null)} className="h-10 px-4 rounded-xl text-sm font-bold text-text-muted border border-border-color hover:bg-gray-50 transition-colors">취소</button>
                <button onClick={saveMemo} disabled={memoSaving} className="h-10 px-5 rounded-xl text-sm font-bold bg-accent-color text-on-accent hover:opacity-90 transition-all disabled:opacity-50">{memoSaving ? '저장 중…' : '저장'}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== 할 일 상세 창 (체크리스트 · 댓글 · 공문 정보 · 변경 기록) ===== */}
      <AnimatePresence>
        {detailTodo && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setDetailTodoId(null)}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[150] flex items-end sm:items-center justify-center p-0 sm:p-4"
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-2xl max-h-[92dvh] overflow-y-auto overscroll-contain bg-surface border border-border-color rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 select-text space-y-5"
              style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
            >
              <div className="flex items-start gap-2">
                <input value={dTitle} onChange={(e) => setDTitle(e.target.value)} className="flex-1 min-w-0 font-serif text-lg font-bold text-text-main bg-transparent outline-none border-b border-transparent focus:border-accent-color py-1" />
                <button onClick={() => setDetailTodoId(null)} className="p-1.5 rounded-full hover:bg-gray-50 text-text-muted shrink-0"><X size={18} /></button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <label className="space-y-1">
                  <span className="text-[10px] font-bold text-text-muted">상태</span>
                  <select value={detailTodo.status} onChange={(e) => moveTodo(detailTodo.id, e.target.value as Todo['status'])} className={cn(inputCls, "w-full h-9 px-2")}>
                    {TODO_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold text-text-muted">분류</span>
                  <select value={dCategory} onChange={(e) => setDCategory(e.target.value)} className={cn(inputCls, "w-full h-9 px-2")}>
                    {TODO_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold text-text-muted">담당자</span>
                  <select value={dAssignee} onChange={(e) => setDAssignee(e.target.value)} className={cn(inputCls, "w-full h-9 px-2")}>
                    <option value="">미지정</option>
                    {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold text-text-muted">{dCategory === 'official' ? '제출 기한' : '마감일'}{(() => { const n = daysUntil(dDue); return n !== null && detailTodo.status !== 'done' ? ` · ${ddayLabel(n)}` : ''; })()}</span>
                  <input type="date" value={dDue} onChange={(e) => setDDue(e.target.value)} className={cn(inputCls, "w-full h-9 px-2")} />
                </label>
              </div>

              {dCategory === 'official' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 rounded-xl bg-red-50/60 border border-red-100">
                  <label className="space-y-1">
                    <span className="text-[10px] font-bold text-red-500 flex items-center gap-1"><FileText size={11} />공문 번호</span>
                    <input value={dDocNo} onChange={(e) => setDDocNo(e.target.value)} placeholder="예: 강원교육-12345" className={cn(inputCls, "w-full h-9 bg-surface")} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] font-bold text-red-500">제출처</span>
                    <input value={dDocTo} onChange={(e) => setDDocTo(e.target.value)} placeholder="예: 교육지원청" className={cn(inputCls, "w-full h-9 bg-surface")} />
                  </label>
                </div>
              )}

              <label className="block space-y-1">
                <span className="text-[10px] font-bold text-text-muted">메모</span>
                <textarea value={dNote} onChange={(e) => setDNote(e.target.value)} rows={3} placeholder="세부 내용, 참고 사항" className="w-full p-3 bg-bg-primary border border-border-color rounded-lg text-sm outline-none focus:border-accent-color resize-none" />
              </label>

              <div className="flex items-center gap-2">
                <button onClick={() => deleteTodo(detailTodo.id)} className="h-9 px-3 rounded-lg text-xs font-bold text-red-500 border border-red-100 hover:bg-red-50 flex items-center gap-1.5"><Trash2 size={13} /> 삭제</button>
                <div className="flex-1" />
                <button onClick={saveTodoDetail} className="h-9 px-5 rounded-lg text-sm font-bold bg-accent-color text-on-accent hover:opacity-90">저장</button>
              </div>

              {/* 체크리스트 */}
              <div className="space-y-2 pt-4 border-t border-border-color">
                {(() => {
                  const cl = detailTodo.checklist || [];
                  const done = cl.filter(c => c.done).length;
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-text-main flex items-center gap-1.5"><ListChecks size={14} /> 체크리스트</p>
                        {cl.length > 0 && <span className="text-[11px] font-bold text-text-muted">{done}/{cl.length} ({Math.round(done / cl.length * 100)}%)</span>}
                      </div>
                      {cl.length > 0 && (
                        <div className="w-full h-1.5 bg-bg-primary rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${Math.round(done / cl.length * 100)}%` }} />
                        </div>
                      )}
                      <div className="space-y-1">
                        {cl.map(item => (
                          <div key={item.id} className="flex items-center gap-2 group/item py-1">
                            <button
                              onClick={() => updateChecklist(detailTodo, cl.map(c => c.id === item.id ? { ...c, done: !c.done } : c))}
                              className={cn("w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all", item.done ? "bg-green-500 border-green-500" : "border-border-color hover:border-accent-color")}
                            >
                              {item.done && <span className="text-white text-[10px] font-bold">✓</span>}
                            </button>
                            <span className={cn("flex-1 text-sm text-text-main", item.done && "line-through opacity-50")}>{item.text}</span>
                            <button onClick={() => updateChecklist(detailTodo, cl.filter(c => c.id !== item.id))} className="lg:opacity-0 lg:group-hover/item:opacity-100 text-text-muted hover:text-red-500 shrink-0"><X size={13} /></button>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input value={dChecklistText} onChange={(e) => setDChecklistText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addChecklistItem(); }} placeholder="세부 항목 추가 (예: 버스 예약)" className={cn(inputCls, "flex-1 h-9")} />
                        <button onClick={addChecklistItem} className="h-9 px-3 rounded-lg text-xs font-bold bg-bg-primary border border-border-color hover:border-accent-color"><Plus size={14} /></button>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* 댓글 */}
              <div className="space-y-2 pt-4 border-t border-border-color">
                <p className="text-xs font-bold text-text-main flex items-center gap-1.5"><MessageSquare size={14} /> 댓글 <span className="font-normal text-text-muted">· 담당자에게 알림이 가요</span></p>
                {(commentsByTodo[detailTodo.id] || []).length === 0 && <p className="text-xs text-text-muted italic">아직 댓글이 없습니다.</p>}
                <div className="space-y-2">
                  {(commentsByTodo[detailTodo.id] || []).map(c => (
                    <div key={c.id} className="p-2.5 rounded-xl bg-bg-primary group/cmt">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[11px] font-bold text-text-main">{c.authorName}</span>
                        <span className="text-[10px] text-text-muted">{tsMillis(c.createdAt) ? format(new Date(tsMillis(c.createdAt)), 'M/d HH:mm') : ''}</span>
                        <div className="flex-1" />
                        {c.authorName === authorName && <button onClick={() => deleteComment(c.id)} className="lg:opacity-0 lg:group-hover/cmt:opacity-100 text-text-muted hover:text-red-500"><X size={12} /></button>}
                      </div>
                      <p className="text-sm text-text-main whitespace-pre-wrap">{c.text}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={dCommentText} onChange={(e) => setDCommentText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addComment(); }} placeholder="댓글을 입력하세요" className={cn(inputCls, "flex-1 h-9")} />
                  <button onClick={addComment} className="h-9 px-4 rounded-lg text-xs font-bold bg-accent-color text-on-accent">등록</button>
                </div>
              </div>

              {/* 변경 기록 */}
              <div className="space-y-1.5 pt-4 border-t border-border-color">
                <p className="text-xs font-bold text-text-main flex items-center gap-1.5"><History size={14} /> 변경 기록</p>
                {detailLogs.length === 0 ? (
                  <p className="text-xs text-text-muted italic">기록이 없습니다.</p>
                ) : detailLogs.slice(0, 20).map(l => (
                  <p key={l.id} className="text-[11px] text-text-muted"><span className="inline-block w-[68px]">{logTime(l)}</span><b className="text-text-main">{l.by}</b> · {l.action}</p>
                ))}
                <p className="text-[10px] text-text-muted pt-1">등록: {detailTodo.createdBy || '알 수 없음'}{tsMillis(detailTodo.createdAt) ? ` · ${format(new Date(tsMillis(detailTodo.createdAt)), 'yyyy-MM-dd HH:mm')}` : ''}</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function GnLinkedTags({ schedule, entries, rooms }: { schedule: Schedule; entries: GnEntry[]; rooms: GnRoom[] }) {
  const linked = findLinkedEntries(schedule, entries, rooms);
  if (linked.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {linked.map((e) => (
        <span
          key={e.id}
          title="강릉분원 방문예약 앱에 같은 실·같은 시간대 예약이 있습니다"
          className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200"
        >
          <Link2 size={10} />
          방문예약 {e.session === 'AM' ? '오전' : '오후'} · {e.org} {e.count}명{e.note ? ` (${e.note})` : ''}
        </span>
      ))}
    </div>
  );
}

function GnEntryChip({ entry, rooms, onClick }: { entry: GnEntry; rooms: GnRoom[]; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cn("p-2 rounded-xl border border-amber-200 bg-amber-50/70", onClick && "cursor-pointer hover:bg-amber-100 hover:border-amber-300 transition-all")}
      title={`강릉 방문예약 · ${roomLabel(rooms, entry.room)} · ${entry.org} ${entry.count}명${entry.note ? ` (${entry.note})` : ''}${onClick ? '\n\n클릭하면 아래에서 자세히 볼 수 있습니다' : ''}`}
    >
      <div className="text-[9px] font-bold text-amber-700 mb-0.5">{entry.session === 'AM' ? '오전' : '오후'} · 방문예약</div>
      <h4 className="text-[11px] font-bold text-text-main leading-tight mb-1 truncate">{entry.org} {entry.count}명</h4>
      <div className="text-[9px] text-text-muted truncate opacity-80">{roomLabel(rooms, entry.room)}</div>
    </div>
  );
}

function LoginOverlay({ 
  onLogin, 
  onGoogleLogin,
  isLoading,
  error,
  appName,
  appLogo
}: any) {
  const [localId, setLocalId] = useState('');
  const [localPw, setLocalPw] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(localId, localPw);
  };
  return (
    <div className="fixed inset-0 z-[200] bg-bg-primary flex items-center justify-center p-6 overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-100/30 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-50/20 blur-[120px] rounded-full" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[400px] bg-surface rounded-[32px] border border-border-color p-8 lg:p-10 shadow-2xl shadow-blue-900/5 relative z-10"
      >
        <div className="flex flex-col items-center text-center mb-10">
          <div className="w-16 h-16 bg-surface rounded-2xl flex items-center justify-center border border-border-color mb-6 shadow-sm p-2">
            <img src={appLogo} alt="Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-black text-text-main tracking-tight mb-2 whitespace-nowrap max-w-full overflow-hidden text-ellipsis px-2" title={appName}>{appName}</h1>
          <p className="text-sm text-text-muted font-medium">스마트한 교육 일정 관리 시스템</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest ml-1">아이디</label>
            <input 
              type="text" 
              placeholder="아이디를 입력하세요" 
              className="w-full h-12 px-4 bg-bg-primary border border-border-color rounded-2xl text-sm font-semibold outline-none focus:border-accent-color focus:ring-4 focus:ring-blue-50 transition-all"
              value={localId}
              onChange={(e) => setLocalId(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest ml-1">비밀번호</label>
            <input 
              type="password" 
              placeholder="••••••••" 
              className="w-full h-12 px-4 bg-bg-primary border border-border-color rounded-2xl text-sm font-semibold outline-none focus:border-accent-color focus:ring-4 focus:ring-blue-50 transition-all"
              value={localPw}
              onChange={(e) => setLocalPw(e.target.value)}
              required
            />
          </div>
          
          {error && <p className="text-[11px] font-bold text-red-500 text-center animate-shake">{error}</p>}

          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full h-12 bg-accent-color text-on-accent rounded-2xl text-sm font-bold shadow-xl shadow-blue-500/30 hover:bg-blue-700 transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-4"
          >
            {isLoading ? <div className="w-5 h-5 border-2 border-surface/30 border-t-white rounded-full animate-spin" /> : '로그인'}
          </button>
        </form>

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border-color" /></div>
          <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-widest"><span className="px-3 bg-surface text-text-muted/50">Admin Only</span></div>
        </div>

        <button 
          onClick={onGoogleLogin}
          className="w-full h-12 bg-surface border border-border-color text-text-main rounded-2xl text-sm font-bold hover:bg-gray-50 transition-all flex items-center justify-center gap-3"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="" />
          <span>구글 계정으로 로그인</span>
        </button>

        <p className="mt-8 text-center text-[10px] text-text-muted font-medium">
          관리자로부터 부여받은 계정으로 로그인해 주세요.<br/>
          분실 시 관리자에게 문의 바랍니다.
        </p>
        <p className="mt-4 text-center text-[9px] text-text-muted/50 font-bold uppercase tracking-widest">
          v2.7.5 - 모바일 헤더 알림 및 프로필 숏컷 추가
        </p>
      </motion.div>
    </div>
  );
}