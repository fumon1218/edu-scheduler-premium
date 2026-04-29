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
  getDocFromServer,
  serverTimestamp,
  setDoc
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  User 
} from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { auth, db } from './lib/firebase';
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
  teacherId?: string; // ID of the teacher assigned
  teacherName?: string; // Name of the teacher (denormalized for easy display)
  createdAt: any;
}

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

export default function App() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'calendar' | 'teacher'>('list');
  const [calendarView, setCalendarView] = useState<'week' | 'month'>('week');
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

  // Dynamic Lists State
  const [programs, setPrograms] = useState<string[]>(DEFAULT_PROGRAMS);
  const [locations, setLocations] = useState<string[]>(DEFAULT_LOCATIONS);
  const [targets, setTargets] = useState<string[]>(DEFAULT_TARGETS);
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
    teacherId: ''
  });

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

  // Auth State & Role Check
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Simple Admin Check: If ID starts with 'admin'
        const id = u.email?.split('@')[0];
        if (id?.startsWith('admin')) {
          setIsAdmin(true);
        } else {
          // Check Firestore for role
          const userDoc = await getDocFromServer(doc(db, 'registered_users', u.uid));
          if (userDoc.exists() && userDoc.data().role === 'admin') {
            setIsAdmin(true);
          } else {
            setIsAdmin(false);
          }
        }
      } else {
        setIsAdmin(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch Registered Users (for Admin)
  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, 'registered_users'), orderBy('id'));
    return onSnapshot(q, (snapshot) => {
      setRegisteredUsers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });
  }, [isAdmin]);

  // Fetch Schedules
  useEffect(() => {
    const q = query(collection(db, 'schedules'), orderBy('startTime'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSchedules(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Schedule));
    });
    return () => unsubscribe();
  }, []);

  // Fetch Notifications
  useEffect(() => {
    const q = query(collection(db, 'system_notifications'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      setNotifs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as SystemNotification));
    });
  }, []);

  // Fetch Teachers
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

  // Fetch App Settings (Categories)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'config'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.programs) setPrograms(data.programs);
        if (data.locations) setLocations(data.locations);
        if (data.targets) setTargets(data.targets);
      } else {
        // Initialize with defaults if not exists
        updateDoc(doc(db, 'settings', 'config'), {
          programs: DEFAULT_PROGRAMS,
          locations: DEFAULT_LOCATIONS,
          targets: DEFAULT_TARGETS
        }).catch(() => {
          // If update fails (e.g. doc doesn't exist at all), try setDoc or just use defaults
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

  // Update Form Defaults when categories load
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

  // Calendar Helpers
  const calendarDays = useMemo(() => {
    try {
      const monthStart = startOfMonth(baseDate);
      if (!isValid(monthStart)) return [];
      
      const startOfGrid = startOfWeek(monthStart, { weekStartsOn: 1 });
      if (!isValid(startOfGrid)) return [];

      return Array.from({ length: 42 }).map((_, i) => addDays(startOfGrid, i));
    } catch (err) {
      console.error("Calendar engine error:", err);
      return [];
    }
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

  const filteredSchedules = useMemo(() => {
    return schedules.filter(s => {
      const matchesSearch = 
        [s.program, s.location, s.target, s.teacherName].some(v => (v || '').toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesDay = selectedDay ? s.day === selectedDay : true;
      const matchesTeacher = viewMode === 'teacher' ? s.teacherId === selectedTeacherId : true;
      return matchesSearch && matchesDay && matchesTeacher;
    });
  }, [schedules, searchTerm, selectedDay, viewMode, selectedTeacherId]);

  // Actions
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
        // Bootstrap: If trying to login as an admin-prefixed account and it fails, attempt to create it
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
            console.error("Bootstrap error:", createErr);
            // If creation fails, throw the creation error instead to see why it's failing
            throw createErr;
          }
        } else {
          throw err;
        }
      }
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const teacherName = teachers.find(t => t.id === formData.teacherId)?.name || '';
      const dataToSave = { ...formData, teacherName, updatedAt: Timestamp.now() };

      if (editingId) {
        await updateDoc(doc(db, 'schedules', editingId), dataToSave);
        showNotify('일정이 수정되었습니다.');
      } else {
        await addDoc(collection(db, 'schedules'), { ...dataToSave, createdAt: Timestamp.now() });
        showNotify('일정이 추가되었습니다.');
      }
      resetForm();
    } catch (err) { console.error(err); }
  };

  const handleEdit = (schedule: Schedule) => {
    setFormData({
      day: schedule.day, date: schedule.date, startTime: schedule.startTime, endTime: schedule.endTime,
      program: schedule.program, location: schedule.location, target: schedule.target,
      teacherId: schedule.teacherId || ''
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

  // Notification CRUD
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

  // Teacher Actions
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

  // Account Management Actions
  const createNewAccount = async () => {
    if (!newUserId.trim() || !newUserPw.trim()) return;
    try {
      const email = newUserId.includes('@') ? newUserId : `${newUserId}@edu.com`;
      
      // Use secondary app to create user without logging out current admin
      const secondaryApp = initializeApp(firebaseConfig, 'Secondary');
      const secondaryAuth = getAuth(secondaryApp);
      
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, newUserPw);
      const newUid = userCredential.user.uid;
      
      // Save user info to Firestore
      await updateDoc(doc(db, 'registered_users', newUid), {
        id: newUserId,
        email: email,
        role: 'user',
        createdAt: serverTimestamp()
      }).catch(async () => {
        // If update fails, use setDoc
        const { setDoc } = await import('firebase/firestore');
        await setDoc(doc(db, 'registered_users', newUid), {
          id: newUserId,
          email: email,
          role: 'user',
          createdAt: serverTimestamp()
        });
      });

      await deleteApp(secondaryApp);
      
      setNewUserId('');
      setNewUserPw('');
      showNotify(`계정(${newUserId})이 생성되었습니다.`);
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
    if (!window.confirm(`계정(${userId})을 목록에서 삭제하시겠습니까? (인증 서버 데이터는 유지됩니다)`)) return;
    try {
      await deleteDoc(doc(db, 'registered_users', uid));
      showNotify('계정 정보가 삭제되었습니다.');
    } catch (err) {
      showNotify('삭제 중 오류가 발생했습니다.');
    }
  };

  // Category Actions
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
    const currentList = type === 'programs' ? programs : type === 'locations' ? locations : targets;
    updateCategories(type, currentList.filter(item => item !== value));
  };

  const resetForm = () => {
    setFormData({
      day: '월', date: format(startOfToday(), 'yyyy-MM-dd'), startTime: '10:00', endTime: '12:00',
      program: programs[0] || '', location: locations[0] || '', target: targets[0] || '', teacherId: ''
    });
    setEditingId(null);
    setIsEditing(false);
  };

  const showNotify = (msg: string) => {
    setNotificationMsg(msg);
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 3000);
  };

  if (!user) {
    return (
      <LoginOverlay 
        onLogin={handleIdPasswordLogin}
        onGoogleLogin={handleGoogleLogin}
        id={loginId}
        setId={setLoginId}
        pw={loginPw}
        setPw={setLoginPw}
        isLoading={isLoginLoading}
        error={loginError}
      />
    );
  }

  return (
    <div className="flex h-screen bg-bg-primary overflow-hidden font-sans select-none">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-md border-b border-border-color z-40 px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="./app-logo.png" alt="Logo" className="w-7 h-7 object-contain" />
          <span className="font-bold text-base tracking-tight text-accent-color">EduScheduler</span>
        </div>
        <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="p-2 text-text-muted hover:text-accent-color transition-colors">
          <Settings size={20} />
        </button>
      </header>

      {/* Sidebar (Desktop) */}
      <aside className="hidden lg:flex w-64 bg-sidebar-bg border-r border-border-color flex-col p-6 shrink-0">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl overflow-hidden border border-border-color shadow-sm shrink-0 bg-white p-1">
            <img src="./app-logo.png" alt="Logo" className="w-full h-full object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
          </div>
          <span className="font-bold text-lg tracking-tight text-accent-color">EduScheduler</span>
        </div>
        
        <nav className="flex-1 space-y-1">
          <div onClick={() => { setViewMode('list'); setSelectedDay(null); }} className={cn("px-4 py-2.5 rounded-lg text-sm font-semibold cursor-pointer flex items-center gap-3 transition-colors", viewMode === 'list' ? "bg-accent-color text-white shadow-sm" : "text-text-muted hover:bg-gray-50")}><LayoutList size={18} /><span>리스트 보기</span></div>
          <div onClick={() => setViewMode('calendar')} className={cn("px-4 py-2.5 rounded-lg text-sm font-semibold cursor-pointer flex items-center gap-3 transition-colors", viewMode === 'calendar' ? "bg-accent-color text-white shadow-sm" : "text-text-muted hover:bg-gray-50")}><CalendarDays size={18} /><span>달력 보기</span></div>
          <div onClick={() => setViewMode('teacher')} className={cn("px-4 py-2.5 rounded-lg text-sm font-semibold cursor-pointer flex items-center gap-3 transition-colors", viewMode === 'teacher' ? "bg-accent-color text-white shadow-sm" : "text-text-muted hover:bg-gray-50")}><Users size={18} /><span>교사 시간표</span></div>
          <div onClick={() => setIsSettingsOpen(!isSettingsOpen)} className={cn("px-4 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors flex items-center gap-3", isSettingsOpen ? "bg-gray-100 text-text-main" : "text-text-muted hover:bg-gray-50")}><Settings size={18} /><span>설정</span></div>
          
          <div className="mt-auto pt-6 px-4 space-y-4">
            <div className="bg-bg-primary/50 border border-border-color/50 rounded-xl p-3">
              <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest opacity-50 mb-1">Version</p>
              <p className="text-xs font-black text-accent-color">Premium v1.2.0</p>
            </div>
            
            <div className="space-y-3">
              {[
                { name: '강릉분원', src: './logo.png' },
                { name: '춘천본원', src: './logo-chuncheon.jpg' },
                { name: '원주분원', src: './logo-wonju.jpg' }
              ].map(diorama => (
                <div key={diorama.name} className="rounded-xl overflow-hidden border border-border-color shadow-sm cursor-help group bg-white">
                  <img src={diorama.src} alt={diorama.name} className="w-full h-20 object-cover group-hover:scale-110 transition-transform duration-700" />
                  <div className="p-1.5 bg-white/80 backdrop-blur-sm border-t border-border-color/30">
                    <p className="text-[8px] font-bold text-text-muted text-center">{diorama.name} 디오라마</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </nav>

        <div className="pt-6 border-t border-border-color">
          {user ? (
            <button onClick={handleLogout} className="flex items-center gap-3 w-full px-4 py-2.5 text-text-muted hover:text-red-500 transition-colors text-sm font-medium"><LogOut size={18} /><span>로그아웃</span></button>
          ) : (
            <button onClick={handleLogin} className="flex items-center gap-3 w-full px-4 py-2.5 text-accent-color hover:bg-blue-50 transition-colors text-sm font-bold"><LogIn size={18} /><span>로그인</span></button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-[72px] bg-white border-b border-border-color flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-4 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted/50" size={16} />
              <input type="text" placeholder="프로그램, 장소, 대상 검색..." className="w-full h-10 pl-11 pr-4 bg-bg-primary border border-border-color rounded-full text-sm outline-none focus:border-accent-color transition-colors" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative w-10 h-10 bg-bg-primary rounded-full flex items-center justify-center cursor-pointer hover:bg-gray-100 transition-colors"><Bell size={18} className="text-text-main" /><span className="absolute top-2 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white" /></div>
            <div className="flex items-center gap-3">
              {user && (
                <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block"><p className="text-sm font-semibold text-text-main">{user.displayName}</p><p className="text-[10px] text-text-muted uppercase font-bold">{isAdmin ? 'Admin' : 'Staff'}</p></div>
                  <div className="w-8 h-8 rounded-full bg-gray-200 border border-border-color overflow-hidden">
                    {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-gray-400">{user.displayName?.[0]}</div>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content Viewport */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-10 pb-32 lg:pb-10 bg-[#FAFAFB]">
          <div className="max-w-[1400px] mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 lg:gap-12">
              <div className="lg:col-span-3">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 lg:mb-12">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                    <div className="relative">
                  <h2 
                    onClick={() => (viewMode === 'calendar' || viewMode === 'teacher') && setIsDatePickerOpen(!isDatePickerOpen)} 
                    className={cn(
                      "text-2xl font-bold text-text-main transition-all",
                      (viewMode === 'calendar' || viewMode === 'teacher') && "cursor-pointer hover:text-accent-color flex items-center gap-2 group"
                    )}
                  >
                    {viewMode === 'list' ? '스케줄 관리' : 
                     viewMode === 'teacher' ? '교사 시간표' : 
                     `${safeFormat(baseDate, 'yyyy년 M월')} 일정표`}
                  </h2>
                  <p className="text-sm text-text-muted">
                    {viewMode === 'teacher' ? '교사별 개인 시간표를 확인하세요' : '교육 프로그램 일정을 효율적으로 관리하세요'}
                  </p>
                  
                  {/* Month/Year Picker Popover */}
                  <AnimatePresence>
                    {isDatePickerOpen && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute top-full left-0 mt-2 p-4 bg-white border border-border-color rounded-2xl shadow-2xl z-[50] min-w-[280px]"
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
                                  isSelected ? "bg-accent-color text-white shadow-md" : "hover:bg-gray-50 text-text-muted hover:text-text-main"
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
                  <div className="flex items-center gap-2 px-1 py-1 bg-white border border-border-color rounded-xl h-fit shrink-0">
                    <button onClick={() => setCalendarView('week')} className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", calendarView === 'week' ? "bg-accent-color text-white shadow-sm" : "text-text-muted hover:text-text-main")}>주간</button>
                    <button onClick={() => setCalendarView('month')} className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", calendarView === 'month' ? "bg-accent-color text-white shadow-sm" : "text-text-muted hover:text-text-main")}>월간</button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 w-full overflow-hidden">
                {viewMode === 'list' ? (
                  <div className="flex-1 flex p-1 bg-white border border-border-color rounded-xl overflow-x-auto no-scrollbar scroll-smooth">
                    <button onClick={() => { setSelectedDay(null); }} className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap", !selectedDay ? "bg-accent-color text-white shadow-sm" : "text-text-muted hover:text-text-main")}>전체</button>
                    {DAYS.map(day => (<button key={day} onClick={() => { setSelectedDay(day); }} className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap", selectedDay === day ? "bg-accent-color text-white shadow-sm" : "text-text-muted hover:text-text-main")}>{day}요일</button>))}
                  </div>
                ) : viewMode === 'calendar' || viewMode === 'teacher' ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setBaseDate(subMonths(baseDate, 1))} className="p-2 bg-white border border-border-color rounded-lg hover:bg-gray-50 transition-colors"><ChevronLeft size={16} /></button>
                    <button onClick={() => setBaseDate(startOfToday())} className="px-4 py-1.5 bg-white border border-border-color rounded-lg text-xs font-bold hover:bg-gray-50 transition-colors">오늘</button>
                    <button onClick={() => setBaseDate(addMonths(baseDate, 1))} className="p-2 bg-white border border-border-color rounded-lg hover:bg-gray-50 transition-colors"><ChevronRight size={16} /></button>
                  </div>
                ) : null}
                <div className="h-8 w-[1px] bg-border-color mx-1 shrink-0 hidden sm:block" />
                <button onClick={() => setViewMode(prev => prev === 'list' ? 'calendar' : 'list')} className="bg-white border border-border-color rounded-xl hover:bg-gray-50 transition-colors text-text-main flex items-center gap-2 px-4 h-[40px] shadow-sm shrink-0">
                  {viewMode === 'list' ? <><CalendarDays size={16} className="text-accent-color" /><span className="text-xs font-bold whitespace-nowrap">달력 보기</span></> : <><LayoutList size={16} className="text-accent-color" /><span className="text-xs font-bold whitespace-nowrap">리스트 보기</span></>}
                </button>
              </div>
            </div>

            {(viewMode === 'calendar' || viewMode === 'teacher') && calendarView === 'week' && (
              <div className="flex p-1 bg-white border border-border-color rounded-xl mb-6 w-full sm:w-fit mx-auto shadow-sm overflow-x-auto no-scrollbar">
                {weeksOfCurrentMonth.map((week, idx) => (
                  <button key={idx} onClick={() => setSelectedWeekIndex(idx)} className={cn("px-6 py-2 rounded-lg text-sm font-bold transition-all flex flex-col items-center min-w-[100px]", selectedWeekIndex === idx ? "bg-accent-color text-white shadow-md scale-105" : "text-text-muted hover:text-text-main")}>
                    <span>{idx + 1}주차</span>
                    <span className={cn("text-[10px] opacity-60 font-normal", selectedWeekIndex === idx ? "text-white" : "text-text-muted")}>
                      {safeFormat(week[0], 'M.d')}~{safeFormat(week[6], 'M.d')}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {viewMode === 'teacher' && (
              <div className="flex p-1 bg-white border border-border-color rounded-xl mb-6 w-full sm:w-fit mx-auto shadow-sm overflow-x-auto no-scrollbar">
                {teachers.map((teacher) => (
                  <button key={teacher.id} onClick={() => setSelectedTeacherId(teacher.id)} className={cn("px-6 py-2 rounded-lg text-sm font-bold transition-all min-w-[100px]", selectedTeacherId === teacher.id ? "bg-blue-600 text-white shadow-md" : "text-text-muted hover:text-text-main")}>
                    {teacher.name}
                  </button>
                ))}
                {teachers.length === 0 && <p className="px-6 py-2 text-sm text-text-muted italic">등록된 교사가 없습니다. 교사 관리에서 추가해주세요.</p>}
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-[1fr,320px] gap-8">
              <div className="space-y-6">
                {viewMode === 'list' ? (
                  <div className="bg-white rounded-2xl border border-border-color overflow-hidden shadow-sm">
                    <div className="px-6 py-4 border-b border-border-color flex items-center justify-between bg-[#FDFDFD]">
                      <span className="text-sm font-bold text-text-main uppercase tracking-tight">수업 일정표</span>
                      <span className="text-xs font-medium text-text-muted">{filteredSchedules.length}개의 일정</span>
                    </div>
                    <div className="divide-y divide-border-color">
                      {filteredSchedules.map((s) => (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key={s.id} className="p-4 sm:p-6 hover:bg-gray-50/50 transition-colors group relative">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                            <div className="w-16 h-16 rounded-xl bg-bg-primary border border-border-color flex flex-col items-center justify-center shrink-0"><span className="text-xs font-bold text-text-muted">{s.day}</span><span className="text-[10px] font-medium text-text-muted opacity-60">요일</span></div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-1"><div className="flex items-center gap-1.5 text-accent-color"><Clock size={14} /><span className="text-xs font-bold">{s.startTime} - {s.endTime}</span></div><div className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{s.date}</div></div>
                              <h3 className="text-base font-bold text-text-main truncate mb-1">{s.program}</h3>
                              <div className="flex flex-wrap gap-4 items-center"><div className="flex items-center gap-1.5 text-xs text-text-muted"><MapPin size={12} className="opacity-50" /><span>{s.location}</span></div><div className="flex items-center gap-1.5 text-xs text-text-muted"><Users size={12} className="opacity-50" /><span>{s.target}</span></div></div>
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
                  <div className="bg-white rounded-2xl border border-border-color overflow-hidden shadow-sm">
                    <div className="grid grid-cols-7 border-b border-border-color bg-[#FDFDFD]">
                      {currentViewWeek.map((dayDate, idx) => (
                        <div key={idx} className={cn("py-4 text-center border-r border-border-color last:border-r-0", !safeIsSameMonth(dayDate, baseDate) && "opacity-30 bg-gray-50", safeIsSameDay(dayDate, startOfToday()) && "bg-blue-50/50")}>
                          <span className="text-[10px] font-bold text-text-muted block mb-1 uppercase tracking-tighter">{safeFormat(dayDate, 'EEE', { locale: ko })}</span>
                          <span className={cn("text-lg font-black", safeIsSameDay(dayDate, startOfToday()) ? "text-accent-color" : "text-text-main")}>{safeFormat(dayDate, 'd')}</span>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 min-h-[550px] divide-x divide-border-color">
                      {currentViewWeek.map((dayDate, idx) => {
                        const dateStr = safeFormat(dayDate, 'yyyy-MM-dd');
                        const daySchedules = filteredSchedules.filter(s => s.date === dateStr);
                        return (
                          <div key={idx} className={cn("p-2 space-y-2 min-h-[400px]", !safeIsSameMonth(dayDate, baseDate) ? "bg-gray-50/30" : "bg-white")}>
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
                            {daySchedules.map(s => (<motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} key={s.id} onClick={() => handleEdit(s)} className="p-2 rounded-xl border border-border-color bg-bg-primary hover:border-accent-color hover:shadow-md transition-all cursor-pointer group relative"><div className="text-[9px] font-bold text-accent-color mb-0.5">{s.startTime}</div><h4 className="text-[11px] font-bold text-text-main leading-tight mb-1 truncate">{s.program}</h4><div className="text-[9px] text-text-muted truncate opacity-80">{s.location}</div>{viewMode !== 'teacher' && <div className="text-[8px] font-bold text-gray-400 mt-1">{s.teacherName}</div>}</motion.div>))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-border-color overflow-hidden shadow-sm min-h-[700px] flex flex-col">
                    {/* Weekday Header */}
                    <div className="grid grid-cols-7 border-b border-border-color bg-[#FDFDFD]">
                      {['월', '화', '수', '목', '금', '토', '일'].map(d => (
                        <div key={d} className="py-3 text-center text-[10px] font-bold text-text-muted uppercase tracking-widest">{d}</div>
                      ))}
                    </div>

                    {/* Monthly Grid */}
                    <div className="grid grid-cols-7 flex-1 divide-x divide-y divide-border-color">
                      {calendarDays.length > 0 ? (
                        calendarDays.map((dayDate, idx) => {
                          const dateStr = safeFormat(dayDate, 'yyyy-MM-dd');
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
                                setTimeout(() => document.getElementById('program-input')?.focus(), 100);
                              }}
                              className={cn(
                                "min-h-[120px] p-2 flex flex-col transition-colors hover:bg-gray-50/10 cursor-pointer group/cell",
                                !isCurMonth ? "bg-gray-50/30 text-gray-300" : "bg-white text-text-main"
                              )}
                            >
                              <div className="flex justify-between items-start mb-2">
                                <span className={cn(
                                  "text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center transition-all",
                                  isToday ? "bg-accent-color text-white shadow-sm" : "text-text-muted group-hover/cell:text-accent-color"
                                )}>
                                  {safeFormat(dayDate, 'd')}
                                </span>
                                <Plus size={12} className="text-gray-200 opacity-0 group-hover/cell:opacity-100 transition-opacity" />
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
                                    className="px-1.5 py-1 bg-blue-50/50 text-accent-color text-[9px] font-bold rounded border border-blue-100/50 truncate cursor-pointer hover:bg-blue-100 hover:border-blue-300 transition-all shadow-sm"
                                  >
                                    {s.startTime} {s.program}
                                  </div>
                                ))}
                                {daySchedules.length > 4 && (
                                  <div className="text-[8px] text-text-muted pl-1 font-bold italic opacity-60">
                                    + {daySchedules.length - 4} more
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
                  className="bg-white rounded-2xl border border-border-color p-6 shadow-sm relative overflow-hidden"
                >
                  <h3 className="text-sm font-bold text-text-main uppercase mb-6 flex items-center gap-2"><div className="w-1.5 h-4 bg-accent-color rounded-full" />{editingId ? '일정 수정' : '신규 일정 등록'}</h3>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider block ml-1">날짜 선택</label>
                      <input type="date" required className="w-full h-10 px-3 bg-bg-primary border border-border-color rounded-lg text-sm font-medium outline-none focus:border-accent-color" value={formData.date} onChange={(e) => { const dateObj = parseISO(e.target.value); setFormData({ ...formData, date: e.target.value, day: safeFormat(dateObj, 'EEE', { locale: ko })[0] }); }} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5"><label className="text-[10px] font-bold text-text-muted uppercase tracking-wider block ml-1">시작 시간</label><input type="time" required className="w-full h-10 px-3 bg-bg-primary border border-border-color rounded-lg text-sm font-medium outline-none focus:border-accent-color" value={formData.startTime} onChange={(e) => setFormData({...formData, startTime: e.target.value})} /></div>
                      <div className="space-y-1.5"><label className="text-[10px] font-bold text-text-muted uppercase tracking-wider block ml-1">종료 시간</label><input type="time" required className="w-full h-10 px-3 bg-bg-primary border border-border-color rounded-lg text-sm font-medium outline-none focus:border-accent-color" value={formData.endTime} onChange={(e) => setFormData({...formData, endTime: e.target.value})} /></div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider block ml-1">프로그램 명</label>
                      <div className="relative">
                        <select 
                          id="program-input"
                          required 
                          className="w-full h-10 pl-3 pr-10 bg-bg-primary border border-border-color rounded-lg text-sm font-medium outline-none focus:border-accent-color appearance-none cursor-pointer" 
                          value={formData.program} 
                          onChange={(e) => setFormData({...formData, program: e.target.value})}
                        >
                          {(!programs.includes(formData.program) && formData.program) && (
                            <option value={formData.program}>{formData.program} (삭제됨)</option>
                          )}
                          {programs.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-text-muted/50 pointer-events-none" size={14} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider block ml-1">장소</label>
                      <div className="relative">
                        <select required className="w-full h-10 pl-3 pr-10 bg-bg-primary border border-border-color rounded-lg text-sm font-medium outline-none focus:border-accent-color appearance-none cursor-pointer" value={formData.location} onChange={(e) => setFormData({...formData, location: e.target.value})}>
                          {(!locations.includes(formData.location) && formData.location) && (
                            <option value={formData.location}>{formData.location} (삭제됨)</option>
                          )}
                          {locations.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                        <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-text-muted/50 pointer-events-none" size={14} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider block ml-1">대상</label>
                      <div className="relative">
                        <select required className="w-full h-10 pl-3 pr-10 bg-bg-primary border border-border-color rounded-lg text-sm font-medium outline-none focus:border-accent-color appearance-none cursor-pointer" value={formData.target} onChange={(e) => setFormData({...formData, target: e.target.value})}>
                          {(!targets.includes(formData.target) && formData.target) && (
                            <option value={formData.target}>{formData.target} (삭제됨)</option>
                          )}
                          {targets.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-text-muted/50 pointer-events-none" size={14} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider block ml-1">담당 교사</label>
                      <div className="relative">
                        <select className="w-full h-10 pl-3 pr-10 bg-bg-primary border border-border-color rounded-lg text-sm font-medium outline-none focus:border-accent-color appearance-none cursor-pointer" value={formData.teacherId} onChange={(e) => setFormData({...formData, teacherId: e.target.value})}>
                          <option value="">교사 미지정</option>
                          {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-text-muted/50 pointer-events-none" size={14} />
                      </div>
                    </div>
                    <button type="submit" className="w-full py-3 bg-accent-color text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all active:scale-[0.98] mt-2 disabled:bg-gray-400 disabled:shadow-none">{editingId ? '수정 완료' : '일정 추가하기'}</button>
                    {editingId && (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => handleDelete(editingId)} className="flex-1 py-3 bg-red-50 text-red-500 rounded-xl text-xs font-bold hover:bg-red-100 transition-all flex items-center justify-center gap-2 mt-2">
                          <Trash2 size={14} /> 일정 삭제
                        </button>
                        <button type="button" onClick={resetForm} className="flex-1 py-3 text-text-muted text-xs font-bold hover:text-text-main transition-colors mt-2">취소</button>
                      </div>
                    )}
                  </form>
                </motion.div>

                {isSettingsOpen && (
                  <div className="bg-white rounded-2xl border border-border-color p-6 shadow-sm animate-in fade-in slide-in-from-right-4 duration-300 space-y-8 max-h-[80vh] overflow-y-auto">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-bold text-text-main uppercase tracking-tight flex items-center gap-2"><Settings size={16} className="text-accent-color" />시스템 설정</h3>
                      <button onClick={() => setIsSettingsOpen(false)} className="text-text-muted hover:text-text-main"><X size={18} /></button>
                    </div>

                    {/* Teacher Management Section */}
                    <section className="space-y-4">
                      <div className="flex items-center justify-between border-b border-border-color pb-2">
                        <h4 className="text-xs font-bold text-text-main flex items-center gap-2"><Users size={14} />교사 명단 관리</h4>
                      </div>
                      <div className="flex gap-2">
                        <input type="text" placeholder="교사 이름 추가" className="flex-1 h-9 px-3 bg-bg-primary border border-border-color rounded-lg text-xs outline-none focus:border-accent-color" value={newTeacherName} onChange={(e) => setNewTeacherName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTeacher()} />
                        <button onClick={addTeacher} className="px-4 bg-accent-color text-white rounded-lg text-xs font-bold shadow-sm hover:bg-blue-700 transition-colors">추가</button>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {teachers.map(t => (
                          <div key={t.id} className="flex items-center gap-2 px-3 py-1.5 bg-blue-50/50 border border-blue-100 rounded-full group transition-all hover:bg-blue-50">
                            <span className="text-[11px] font-bold text-accent-color">{t.name}</span>
                            <button onClick={() => deleteTeacher(t.id)} className="text-blue-300 hover:text-red-500 transition-colors"><X size={12} /></button>
                          </div>
                        ))}
                        {teachers.length === 0 && <p className="text-[10px] text-text-muted italic py-2">등록된 교사가 없습니다.</p>}
                      </div>
                    </section>

                    {/* Category Management Section */}
                    <section className="space-y-6">
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
                              <div key={item} className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-100 rounded-lg group hover:bg-white transition-all">
                                <span className="text-[10px] font-medium text-text-main">{item}</span>
                                <button onClick={() => deleteCategoryItem(cat.type, item)} className="text-gray-300 hover:text-red-500 transition-colors"><X size={10} /></button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </section>

                    {/* Account Management Section (Admin Only) */}
                    {isAdmin && (
                      <section className="space-y-4 pt-4 border-t border-border-color">
                        <div className="flex items-center justify-between border-b border-border-color pb-2">
                          <h4 className="text-xs font-bold text-text-main flex items-center gap-2"><Users size={14} />계정 관리 (공유용)</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input type="text" placeholder="아이디 (예: user1)" className="h-9 px-3 bg-bg-primary border border-border-color rounded-lg text-xs outline-none focus:border-accent-color" value={newUserId} onChange={(e) => setNewUserId(e.target.value)} />
                          <input type="text" placeholder="비밀번호" className="h-9 px-3 bg-bg-primary border border-border-color rounded-lg text-xs outline-none focus:border-accent-color" value={newUserPw} onChange={(e) => setNewUserPw(e.target.value)} />
                        </div>
                        <button onClick={createNewAccount} className="w-full py-2 bg-accent-color text-white rounded-lg text-xs font-bold shadow-sm hover:bg-blue-700 transition-colors">새 계정 생성</button>
                        
                        <div className="space-y-2 pt-2">
                          <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">생성된 계정 목록</p>
                          <div className="divide-y divide-border-color border border-border-color rounded-xl overflow-hidden">
                            {registeredUsers.map(ru => (
                              <div key={ru.id} className="flex items-center justify-between p-3 bg-gray-50/50">
                                <div>
                                  <p className="text-xs font-bold text-text-main">{ru.id}</p>
                                  <p className="text-[9px] text-text-muted">{ru.role === 'admin' ? '관리자' : '일반 사용자'}</p>
                                </div>
                                {ru.id !== 'admin' && (
                                  <button onClick={() => deleteAccount(ru.id, ru.id)} className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                                )}
                              </div>
                            ))}
                            {registeredUsers.length === 0 && <p className="p-4 text-center text-[10px] text-text-muted italic">생성된 계정이 없습니다.</p>}
                          </div>
                        </div>
                      </section>
                    )}
                  </div>
                )}
                <div className="bg-white rounded-2xl border-l-4 border-l-yellow-400 border border-border-color p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-text-main uppercase flex items-center gap-2"><Bell size={14} className="text-yellow-500" />시스템 알림</h4>
                    {isAdmin && (
                      <button onClick={() => { setEditingNotifId('new'); setNotifForm({ title: '', content: '' }); }} className="p-1 hover:bg-yellow-50 rounded-lg text-yellow-600 transition-colors"><Plus size={14} /></button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {editingNotifId === 'new' && (
                      <div className="p-3 bg-yellow-50/50 rounded-lg border border-yellow-200 space-y-2">
                        <input className="w-full bg-transparent text-[11px] font-bold outline-none border-b border-yellow-200" placeholder="제목" value={notifForm.title} onChange={e => setNotifForm({...notifForm, title: e.target.value})} autoFocus />
                        <input className="w-full bg-transparent text-[10px] outline-none" placeholder="내용" value={notifForm.content} onChange={e => setNotifForm({...notifForm, content: e.target.value})} />
                        <div className="flex justify-end gap-2 pt-1 text-[10px] font-bold">
                          <button onClick={() => setEditingNotifId(null)} className="text-gray-400">취소</button>
                          <button onClick={saveNotif} className="text-yellow-600">저장</button>
                        </div>
                      </div>
                    )}
                    {notifs.map(n => (
                      <div key={n.id} className="p-3 bg-bg-primary rounded-lg border border-border-color group relative">
                        {editingNotifId === n.id ? (
                          <div className="space-y-2">
                            <input className="w-full bg-transparent text-[11px] font-bold outline-none border-b border-gray-200" value={notifForm.title} onChange={e => setNotifForm({...notifForm, title: e.target.value})} autoFocus />
                            <input className="w-full bg-transparent text-[10px] outline-none" value={notifForm.content} onChange={e => setNotifForm({...notifForm, content: e.target.value})} />
                            <div className="flex justify-end gap-2 pt-1 text-[10px] font-bold">
                              <button onClick={() => setEditingNotifId(null)} className="text-gray-400">취소</button>
                              <button onClick={saveNotif} className="text-accent-color">수정</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-[11px] font-bold text-text-main mb-0.5">{n.title}</p>
                            <p className="text-[10px] text-text-muted">{n.content}</p>
                            {isAdmin && (
                              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                <button onClick={() => { setEditingNotifId(n.id); setNotifForm({ title: n.title, content: n.content }); }} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-accent-color"><Edit2 size={10} /></button>
                                <button onClick={() => deleteNotif(n.id)} className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500"><X size={10} /></button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                    {notifs.length === 0 && !editingNotifId && (
                      <p className="text-[10px] text-text-muted italic py-4 text-center">공지사항이 없습니다.</p>
                    )}
                  </div>
                </div>
              </div>
              </div>
            </div>
          </div>
        </div>
      </div>

        {/* Mobile Bottom Navigation Bar */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-border-color z-[100] px-6 py-2 pb-safe flex items-center justify-between shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
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
              className="w-14 h-14 bg-accent-color text-white rounded-2xl shadow-xl shadow-blue-500/40 flex items-center justify-center border-4 border-white active:scale-90 transition-all group"
            >
              <Plus size={28} strokeWidth={3} className="group-active:rotate-90 transition-transform" />
            </button>
          </div>
          
          <button onClick={() => setViewMode('teacher')} className={cn("flex flex-col items-center gap-1 transition-all flex-1", viewMode === 'teacher' ? "text-accent-color scale-110" : "text-text-muted opacity-60")}>
            <Users size={20} strokeWidth={2.5} />
            <span className="text-[9px] font-black tracking-tighter">교사</span>
          </button>
          <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className={cn("flex flex-col items-center gap-1 transition-all flex-1", isSettingsOpen ? "text-accent-color scale-110" : "text-text-muted opacity-60")}>
            <Settings size={20} strokeWidth={2.5} />
            <span className="text-[9px] font-black tracking-tighter">설정</span>
          </button>
        </nav>
      </div>
      <AnimatePresence>{showNotification && (<motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} className="fixed bottom-24 right-8 bg-text-main text-white px-6 py-4 rounded-2xl shadow-2xl z-[100] flex items-center gap-3 border border-gray-700"><Bell className="text-accent-color" size={18} /><span className="text-sm font-medium">{notificationMsg}</span></motion.div>)}</AnimatePresence>
    </div>
  );
}

// --- Components ---
function LoginOverlay({ 
  onLogin, 
  onGoogleLogin,
  id, 
  setId, 
  pw, 
  setPw, 
  isLoading,
  error 
}: any) {
  return (
    <div className="fixed inset-0 z-[200] bg-bg-primary flex items-center justify-center p-6 overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-100/30 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-50/20 blur-[120px] rounded-full" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[400px] bg-white rounded-[32px] border border-border-color p-8 lg:p-10 shadow-2xl shadow-blue-900/5 relative z-10"
      >
        <div className="flex flex-col items-center text-center mb-10">
          <div className="w-16 h-16 bg-bg-primary rounded-2xl flex items-center justify-center border border-border-color mb-6 shadow-inner">
            <img src="./app-logo.png" alt="Logo" className="w-10 h-10 object-contain" />
          </div>
          <h1 className="text-2xl font-black text-text-main tracking-tight mb-2">EduScheduler</h1>
          <p className="text-sm text-text-muted font-medium">스마트한 교육 일정 관리 시스템</p>
        </div>

        <form onSubmit={onLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest ml-1">아이디</label>
            <input 
              type="text" 
              placeholder="아이디를 입력하세요" 
              className="w-full h-12 px-4 bg-bg-primary border border-border-color rounded-2xl text-sm font-semibold outline-none focus:border-accent-color focus:ring-4 focus:ring-blue-50 transition-all"
              value={id}
              onChange={(e) => setId(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest ml-1">비밀번호</label>
            <input 
              type="password" 
              placeholder="••••••••" 
              className="w-full h-12 px-4 bg-bg-primary border border-border-color rounded-2xl text-sm font-semibold outline-none focus:border-accent-color focus:ring-4 focus:ring-blue-50 transition-all"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              required
            />
          </div>
          
          {error && <p className="text-[11px] font-bold text-red-500 text-center animate-shake">{error}</p>}

          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full h-12 bg-accent-color text-white rounded-2xl text-sm font-bold shadow-xl shadow-blue-500/30 hover:bg-blue-700 transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-4"
          >
            {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : '로그인'}
          </button>
        </form>

        {/* Optional Google Login Divider */}
        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border-color" /></div>
          <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-widest"><span className="px-3 bg-white text-text-muted/50">Admin Only</span></div>
        </div>

        <button 
          onClick={onGoogleLogin}
          className="w-full h-12 bg-white border border-border-color text-text-main rounded-2xl text-sm font-bold hover:bg-gray-50 transition-all flex items-center justify-center gap-3"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="" />
          <span>구글 계정으로 로그인</span>
        </button>

        <p className="mt-8 text-center text-[10px] text-text-muted font-medium">
          관리자로부터 부여받은 계정으로 로그인해 주세요.<br/>
          분실 시 관리자에게 문의 바랍니다.
        </p>
      </motion.div>
    </div>
  );
}
