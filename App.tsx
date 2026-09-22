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
  ListChecks,
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
  '2026-05-24': '부처님오신날',
  '2026-05-25': '대체공휴일',
  '2026-09-24': '추석 연휴',
  '2026-09-25': '추석',
  '2026-09-26': '추석 연휴',
};

const getHolidayName = (dateStr: string) => {
  if (!dateStr) return null;
  const monthDay = dateStr.slice(5);
  return KOREAN_HOLIDAYS[dateStr] || KOREAN_HOLIDAYS[monthDay] || null;
};

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

  // 실시간 날씨 데이터 (강릉 기준 Open-Meteo API)
  const [weather, setWeather] = useState<{ temp: number; text: string } | null>(null);

  useEffect(() => {
    fetch('https://api.open-meteo.com/v1/forecast?latitude=37.7519&longitude=128.8761&current_weather=true')
      .then(res => res.json())
      .then(data => {
        if (data.current_weather) {
          const code = data.current_weather.weathercode;
          let text = '맑음';
          if (code >= 1 && code <= 3) text = '구름조금';
          else if (code >= 45 && code <= 48) text = '안개';
          else if (code >= 51 && code <= 67) text = '비';
          else if (code >= 71 && code <= 77) text = '눈';
          else if (code >= 80) text = '소나기';

          setWeather({
            temp: Math.round(data.current_weather.temperature),
            text: text
          });
        }
      })
      .catch(err => console.error("Weather fetch error:", err));
  }, []);

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

  // 강릉분원 방문예약 앱 연동 State
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

  // 화면 테마
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  );
  const [accentColor, setAccentColor] = useState<string | null>(() => {
    try { return localStorage.getItem('eduAccentColorV1'); } catch { return null; }
  });
  useEffect(() => { if (accentColor) applyAccentColor(accentColor); }, [accentColor]);
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
  const [registeredUsers, setRegisteredUsers] = useState<{id: string, role: string}[]>([]);

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
        if (id?.startsWith('admin')) {
          setIsAdmin(true);
        } else {
          try {
            const userDoc = await getDoc(doc(db, 'registered_users', u.uid));
            if (userDoc.exists()) {
              setIsAdmin(userDoc.data().role === 'admin');
            } else {
              setIsAdmin(false);
            }
          } catch (e) {
            setIsAdmin(false);
          }
        }
      } else {
        setIsAdmin(false);
      }
      
      try {
        const appConfig = await getDoc(doc(db, 'settings', 'app_config'));
        if (appConfig.exists()) {
          setAppName(appConfig.data().appName || 'EduScheduler');
          setAppLogo(appConfig.data().appLogo || './app-logo.png');
          setDioramaUrls(appConfig.data().dioramaUrls || { '강릉분원': '', '춘천본원': '', '원주분원': '' });
        }
      } catch (err) { }

      setIsAuthInitialCheckDone(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, 'registered_users'), orderBy('id'));
    return onSnapshot(q, (snapshot) => {
      setRegisteredUsers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });
  }, [isAdmin]);

  useEffect(() => {
    const q = query(collection(db, 'schedules'), orderBy('startTime'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSchedules(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Schedule));
      if (!snapshot.metadata.fromCache) setSchedulesLoaded(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
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
  }, [user?.uid]);

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
    const q = query(collection(db, 'system_notifications'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      setNotifs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as SystemNotification));
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, 'gnEntryTeachers'), (snapshot) => {
      const map: Record<string, string> = {};
      snapshot.forEach(d => { const v = d.data().teacherId; if (v) map[d.id] = v; });
      setGnEntryTeachers(map);
    }, err => console.warn('gnEntryTeachers snapshot error', err));
  }, [user?.uid]);

  const assignGnEntryTeacher = async (entryId: string, teacherId: string) => {
    try {
      if (!teacherId) {
        await deleteDoc(doc(db, 'gnEntryTeachers', entryId));
      } else {
        await setDoc(doc(db, 'gnEntryTeachers', entryId), { teacherId, updatedAt: serverTimestamp() });
      }
    } catch (e) {
      showNotify('담당 교사 저장에 실패했습니다.');
    }
  };

  useEffect(() => {
    const q = query(collection(db, 'teachers'), orderBy('name'));
    return onSnapshot(q, (snapshot) => {
      const fetchedTeachers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Teacher);
      setTeachers(fetchedTeachers);
      if (fetchedTeachers.length > 0 && !selectedTeacherId) {
        setSelectedTeacherId(fetchedTeachers[0].id);
      }
    });
  }, [selectedTeacherId]);

  useEffect(() => {
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
    });
    return () => unsub();
  }, []);

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

  const calendarDays = useMemo(() => {
    try {
      const monthStart = startOfMonth(baseDate);
      if (!isValid(monthStart)) return [];
      const startOfGrid = startOfWeek(monthStart, { weekStartsOn: 1 });
      if (!isValid(startOfGrid)) return [];
      return Array.from({ length: 42 }).map((_, i) => addDays(startOfGrid, i));
    } catch { return []; }
  }, [baseDate]);

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
      try {
        await signInWithEmailAndPassword(auth, email, loginPw);
      } catch (err: any) {
        if (loginId.startsWith('admin')) {
          try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, loginPw);
            await setDoc(doc(db, 'registered_users', userCredential.user.uid), {
              id: loginId,
              email: email,
              role: 'admin',
              createdAt: serverTimestamp()
            });
          } catch (createErr: any) {
            throw createErr;
          }
        } else {
          throw err;
        }
      }
      setLoginId('');
      setLoginPw('');
    } catch (err: any) {
      setLoginError('아이디 또는 비밀번호가 일치하지 않습니다.');
    } finally {
      setIsLoginLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (err) { }
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
      showNotify('사진 업로드 중 오류가 발생했습니다.');
    } finally {
      setIsUploading(false);
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
    } catch (err) { showNotify('저장 중 오류가 발생했습니다.'); }
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

  if (!isAuthInitialCheckDone) return null;
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

  // ✅ 강릉분원 이미지 경로를 logo-gangneung.jpg로 올바르게 지정
  const DIORAMA_ITEMS = [
    { name: '강릉분원', src: './logo-gangneung.jpg', url: 'https://www.gninjae.or.kr' },
    { name: '춘천본원', src: './logo-chuncheon.jpg', url: 'https://jinro.gwe.go.kr' },
    { name: '원주분원', src: './logo-wonju.jpg', url: 'https://wj.gwe.go.kr' }
  ];

  return (
    <div className="flex h-screen bg-bg-primary overflow-hidden font-sans select-none">
      {/* Sidebar (Desktop) */}
      <aside className="hidden lg:flex w-64 bg-sidebar-bg border-r border-border-color flex-col p-6 shrink-0">
        <div 
          onClick={() => { setViewMode('list'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          className="flex items-center gap-3 px-2 mb-10 cursor-pointer hover:opacity-80 transition-opacity"
        >
          <div className="w-10 h-10 bg-surface rounded-xl flex items-center justify-center shadow-md border border-border-color overflow-hidden p-1">
            <img src={appLogo} alt="Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="font-serif text-sm font-bold text-accent-color tracking-tight whitespace-nowrap overflow-hidden text-ellipsis min-w-0 flex-1">{appName}</h1>
        </div>
        
        <nav className="flex-1 space-y-1">
          <div onClick={() => { setViewMode('list'); setSelectedDay(null); }} className={cn("px-4 py-2.5 rounded-full text-sm font-semibold cursor-pointer flex items-center gap-3 transition-colors", viewMode === 'list' ? "bg-accent-color text-on-accent shadow-sm" : "text-text-muted hover:bg-gray-50")}><LayoutList size={18} /><span>리스트 보기</span></div>
          <div onClick={() => setViewMode('calendar')} className={cn("px-4 py-2.5 rounded-full text-sm font-semibold cursor-pointer flex items-center gap-3 transition-colors", viewMode === 'calendar' ? "bg-accent-color text-on-accent shadow-sm" : "text-text-muted hover:bg-gray-50")}><CalendarDays size={18} /><span>달력 보기</span></div>
          <div onClick={() => setViewMode('teacher')} className={cn("px-4 py-2.5 rounded-full text-sm font-semibold cursor-pointer flex items-center gap-3 transition-colors", viewMode === 'teacher' ? "bg-accent-color text-on-accent shadow-sm" : "text-text-muted hover:bg-gray-50")}><Users size={18} /><span>교사 시간표</span></div>
          <div onClick={() => setViewMode('tasks')} className={cn("px-4 py-2.5 rounded-full text-sm font-semibold cursor-pointer flex items-center gap-3 transition-colors", viewMode === 'tasks' ? "bg-accent-color text-on-accent shadow-sm" : "text-text-muted hover:bg-gray-50")}><ListChecks size={18} /><span>업무 관리</span></div>
          <div onClick={() => setIsSettingsOpen(!isSettingsOpen)} className={cn("px-4 py-2.5 rounded-full text-sm font-medium cursor-pointer transition-colors flex items-center gap-3", isSettingsOpen ? "bg-gray-100 text-text-main" : "text-text-muted hover:bg-gray-50")}><Settings size={18} /><span>설정</span></div>
          
          <div className="mt-auto pt-6 px-4 space-y-4">
            <div className="bg-bg-primary/50 border border-border-color/50 rounded-xl p-3">
              <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest opacity-50 mb-1">Version</p>
              <p className="text-xs font-black text-accent-color tracking-tighter">Premium v2.7.5</p>
            </div>
            
            {/* 디오라마 이미지 카드 */}
            <div className="space-y-3">
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
          </div>
        </nav>

        <div className="pt-6 border-t border-border-color">
          <button onClick={toggleTheme} className="flex items-center gap-3 w-full px-4 py-2.5 rounded-full text-text-muted hover:bg-gray-50 transition-colors text-sm font-medium mb-1">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            <span>{theme === 'dark' ? '라이트 모드' : '다크 모드'}</span>
          </button>
          <button onClick={handleLogout} className="flex items-center gap-3 w-full px-4 py-2.5 text-text-muted hover:text-red-500 transition-colors text-sm font-medium"><LogOut size={18} /><span>로그아웃</span></button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-[72px] bg-surface border-b border-border-color flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-4 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted/50" size={16} />
              <input type="text" placeholder="프로그램, 장소, 대상 검색..." className="w-full h-10 pl-11 pr-4 bg-bg-primary border border-border-color rounded-full text-sm outline-none focus:border-accent-color transition-colors" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* 실시간 강릉 날씨 위젯 */}
            {weather && (
              <div className="flex items-center gap-2 px-3.5 py-1.5 bg-blue-50/80 border border-blue-200 rounded-full text-xs font-bold text-blue-900 shadow-sm">
                <Sun className="text-amber-500 animate-spin-slow" size={16} />
                <span>강릉 {weather.temp}°C</span>
                <span className="text-blue-600 font-medium">({weather.text})</span>
              </div>
            )}

            <div className="flex items-center gap-3">
              {user && (
                <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block"><p className="text-sm font-semibold text-text-main">{user.displayName || user.email?.split('@')[0]}</p><p className="text-[10px] text-text-muted uppercase font-bold">{isAdmin ? 'Admin' : 'Staff'}</p></div>
                  <div className="relative group">
                    <div className="w-9 h-9 rounded-full bg-gray-100 border border-border-color overflow-hidden flex items-center justify-center shadow-inner">
                      {isUploading ? (
                        <div className="w-4 h-4 border-2 border-accent-color border-t-transparent rounded-full animate-spin" />
                      ) : user.photoURL ? (
                        <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs font-black text-gray-400 bg-gray-50">{user.displayName?.[0] || user.email?.[0]?.toUpperCase()}</div>
                      )}
                    </div>
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
                    <div>
                      <h2 className="font-serif text-2xl font-bold text-text-main">
                        {viewMode === 'list' ? '스케줄 관리' : viewMode === 'teacher' ? '교사 시간표' : `${safeFormat(baseDate, 'yyyy년 M월')} 일정표`}
                      </h2>
                      <p className="text-sm text-text-muted">교육 프로그램 일정을 효율적으로 관리하세요</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setBaseDate(subMonths(baseDate, 1))} className="p-2 bg-surface border border-border-color rounded-full"><ChevronLeft size={16} /></button>
                    <button onClick={() => setBaseDate(startOfToday())} className="px-4 py-1.5 bg-surface border border-border-color rounded-full text-xs font-bold">오늘</button>
                    <button onClick={() => setBaseDate(addMonths(baseDate, 1))} className="p-2 bg-surface border border-border-color rounded-full"><ChevronRight size={16} /></button>
                  </div>
                </div>

                {/* Calendar View */}
                <div className="bg-surface rounded-2xl border border-border-color overflow-hidden shadow-sm min-h-[700px] flex flex-col">
                  <div className="grid grid-cols-7 border-b border-border-color bg-soft">
                    {['월', '화', '수', '목', '금', '토', '일'].map(d => (
                      <div key={d} className={cn("py-3 text-center text-[10px] font-bold uppercase", d === '일' ? "text-sun" : d === '토' ? "text-sat" : "text-text-muted")}>{d}</div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 flex-1 divide-x divide-y divide-border-color">
                    {calendarDays.map((dayDate, idx) => {
                      const dateStr = safeFormat(dayDate, 'yyyy-MM-dd');
                      const holidayName = getHolidayName(dateStr);
                      const daySchedules = filteredSchedules.filter(s => s.date === dateStr);
                      const isToday = safeIsSameDay(dayDate, startOfToday());
                      const isCurMonth = safeIsSameMonth(dayDate, baseDate);

                      return (
                        <div 
                          key={dateStr || idx} 
                          onClick={() => {
                            setFormData({ ...formData, date: dateStr, day: safeFormat(dayDate, 'EEE', { locale: ko })[0] });
                            setEditingId(null);
                            document.getElementById('schedule-form')?.scrollIntoView({ behavior: 'smooth' });
                          }}
                          className={cn(
                            "min-h-[120px] p-2 flex flex-col transition-colors hover:bg-gray-50/10 cursor-pointer group/cell",
                            !isCurMonth ? "bg-gray-50/30 text-gray-300" : "bg-surface text-text-main"
                          )}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className={cn(
                              "font-serif text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center transition-all",
                              isToday ? "bg-accent-color text-on-accent shadow-sm" : holidayName || dayDate.getDay() === 0 ? "text-sun" : dayDate.getDay() === 6 ? "text-sat" : "text-text-muted",
                              !isCurMonth && !isToday && "opacity-50"
                            )}>
                              {safeFormat(dayDate, 'd')}
                            </span>
                            
                            {/* 국경일 배지 출력 */}
                            {holidayName && (
                              <span className="text-[9px] font-black text-red-500 bg-red-50 px-1 py-0.5 rounded border border-red-100 truncate max-w-[60px]" title={holidayName}>
                                {holidayName}
                              </span>
                            )}
                          </div>

                          <div className="flex-1 space-y-1">
                            {daySchedules.slice(0, 4).map(s => (
                              <div 
                                key={s.id}
                                onClick={(e) => { e.stopPropagation(); handleEdit(s); }}
                                className={cn("px-1.5 py-1 text-[9px] font-bold rounded border truncate cursor-pointer transition-all shadow-sm", categoryOf(s.category).bg, categoryOf(s.category).text, categoryOf(s.category).border)}
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

                {/* Schedule Registration Form */}
                <div className="mt-8 space-y-6" id="schedule-form">
                  <div className="bg-surface rounded-2xl border border-border-color p-6 shadow-sm">
                    <h3 className="text-sm font-bold text-text-main uppercase mb-6">{editingId ? '일정 수정' : '신규 일정 등록'}</h3>
                    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
                      <input type="date" required className="h-9 px-2 bg-bg-primary border border-border-color rounded-lg text-xs" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} />
                      <input type="time" required className="h-9 px-2 bg-bg-primary border border-border-color rounded-lg text-xs" value={formData.startTime} onChange={(e) => setFormData({...formData, startTime: e.target.value})} />
                      <input type="time" required className="h-9 px-2 bg-bg-primary border border-border-color rounded-lg text-xs" value={formData.endTime} onChange={(e) => setFormData({...formData, endTime: e.target.value})} />
                      <select required className="h-9 px-2 bg-bg-primary border border-border-color rounded-lg text-xs" value={formData.program} onChange={(e) => setFormData({...formData, program: e.target.value})}>
                        {programs.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <select required className="h-9 px-2 bg-bg-primary border border-border-color rounded-lg text-xs" value={formData.location} onChange={(e) => setFormData({...formData, location: e.target.value})}>
                        {locations.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                      <select required className="h-9 px-2 bg-bg-primary border border-border-color rounded-lg text-xs" value={formData.target} onChange={(e) => setFormData({...formData, target: e.target.value})}>
                        {targets.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <button type="submit" className="h-9 px-5 bg-accent-color text-on-accent rounded-lg text-xs font-bold">{editingId ? '수정 완료' : '추가'}</button>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          </div>
          )}
          {viewMode === 'tasks' && <TasksView teachers={teachers} authorName={user?.displayName || '관리자'} />}
        </div>
      </div>
    </div>
  );
}

// Tasks View & LoginOverlay Components
function TasksView({ teachers, authorName }: any) {
  return <div className="p-6 bg-surface rounded-2xl border border-border-color">업무 관리 화면입니다.</div>;
}

function LoginOverlay({ onLogin, onGoogleLogin, isLoading, error, appName, appLogo }: any) {
  return (
    <div className="fixed inset-0 z-[200] bg-bg-primary flex items-center justify-center p-6">
      <div className="w-full max-w-[400px] bg-surface rounded-[32px] border border-border-color p-8 shadow-2xl text-center">
        <img src={appLogo} alt="Logo" className="w-16 h-16 mx-auto mb-4 object-contain" />
        <h1 className="text-2xl font-black mb-6">{appName}</h1>
        <button onClick={onGoogleLogin} className="w-full h-12 bg-accent-color text-on-accent font-bold rounded-2xl">로그인</button>
      </div>
    </div>
  );
}