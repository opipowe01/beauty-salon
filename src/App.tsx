import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, Clock, User, Star, Plus, Trash2, Edit2, ChevronRight, 
  CheckCircle2, XCircle, AlertCircle, Menu, X, Phone, MessageSquare, 
  Home, Settings, ClipboardList, Info, Image as ImageIcon, Newspaper, 
  ArrowRight, Heart, Share2, MapPin, LogIn, PlusCircle, CalendarDays,
  ChevronLeft, LayoutDashboard
} from 'lucide-react';
import { format, addDays, isSameDay, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { 
  collection, addDoc, getDocs, query, where, onSnapshot, doc, 
  updateDoc, deleteDoc, setDoc, getDoc, orderBy, limit
} from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { db, auth } from './firebase';
import { cn } from './lib/utils';

// --- Types ---
interface Service {
  id: string;
  name: string;
  shortDescription: string;
  fullDescription: string;
  price: number;
  duration: number;
}

interface Appointment {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  clientComment?: string;
  serviceId: string;
  serviceName: string;
  date: string;
  time: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'rejected';
  createdAt: string;
}

interface Availability {
  id: string;
  slots: string[];
}

// --- Components ---

const Card = ({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) => (
  <motion.div 
    whileHover={onClick ? { y: -4 } : {}}
    whileTap={onClick ? { scale: 0.98 } : {}}
    onClick={onClick}
    className={cn("bg-white rounded-[32px] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-[#f5f2ed] transition-all", className)}
  >
    {children}
  </motion.div>
);

const Button = ({ children, onClick, variant = 'primary', className, disabled }: any) => {
  const variants: any = {
    primary: "bg-[#e89a9a] text-white shadow-lg shadow-[#e89a9a]/20 hover:bg-[#d88a8a]",
    secondary: "bg-[#f5f2ed] text-[#2d2424] hover:bg-[#ebe8e3]",
    outline: "border-2 border-[#e89a9a] text-[#e89a9a] hover:bg-[#e89a9a]/5",
  };
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      disabled={disabled}
      className={cn("px-6 py-4 rounded-2xl font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2", variants[variant], className)}
    >
      {children}
    </motion.button>
  );
};

const Badge = ({ status }: { status: Appointment['status'] }) => {
  const styles = {
    pending: "bg-amber-50 text-amber-600 border-amber-100",
    confirmed: "bg-emerald-50 text-emerald-600 border-emerald-100",
    cancelled: "bg-rose-50 text-rose-600 border-rose-100",
    rejected: "bg-slate-50 text-slate-500 border-slate-100"
  };
  const labels = {
    pending: "Новая",
    confirmed: "Ок",
    cancelled: "Отмена",
    rejected: "Отказ"
  };
  return (
    <span className={cn("px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border", styles[status])}>
      {labels[status]}
    </span>
  );
};

const SectionTitle = ({ title, subtitle, backTo }: { title: string; subtitle?: string; backTo?: string }) => {
  const navigate = useNavigate();
  return (
    <div className="flex justify-between items-end mb-8 px-2">
      <div className="flex items-center gap-4">
        {backTo && (
          <button onClick={() => navigate(backTo)} className="p-2 bg-white rounded-full shadow-sm border border-[#f5f2ed]">
            <ChevronLeft size={20} />
          </button>
        )}
        <div>
          {subtitle && <p className="text-[#e89a9a] text-xs font-bold uppercase tracking-[0.2em] mb-1">{subtitle}</p>}
          <h2 className="text-3xl font-serif font-bold text-[#2d2424]">{title}</h2>
        </div>
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [masterInfo, setMasterInfo] = useState<any>(null);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }

    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        const userDoc = await getDoc(doc(db, 'users', u.uid));
        if (userDoc.exists() && userDoc.data().role === 'admin') {
          setIsAdmin(true);
        } else if (u.email === 'egor0info1@gmail.com') { 
          setIsAdmin(true);
          await setDoc(doc(db, 'users', u.uid), { role: 'admin', email: u.email }, { merge: true });
        }

        // Связываем Telegram ID с пользователем
        if (tg?.initDataUnsafe?.user) {
          fetch('/api/link-tg', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              uid: u.uid,
              tgId: tg.initDataUnsafe.user.id,
              firstName: tg.initDataUnsafe.user.first_name
            })
          });
        }
      } else {
        signInAnonymously(auth);
      }
    });

    onSnapshot(collection(db, 'services'), (s) => setServices(s.docs.map(d => ({ id: d.id, ...d.data() } as Service))));
    onSnapshot(doc(db, 'masterInfo', 'main'), (d) => d.exists() && setMasterInfo(d.data()));
    onSnapshot(collection(db, 'availability'), (s) => setAvailability(s.docs.map(d => ({ id: d.id, ...d.data() } as Availability))));

    setLoading(false);
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (user) {
      const q = isAdmin 
        ? query(collection(db, 'appointments'), orderBy('createdAt', 'desc'))
        : query(collection(db, 'appointments'), where('clientId', '==', user.uid), orderBy('createdAt', 'desc'));
      return onSnapshot(q, (s) => setAppointments(s.docs.map(d => ({ id: d.id, ...d.data() } as Appointment))));
    }
  }, [user, isAdmin]);

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  if (loading) return <div className="flex items-center justify-center h-screen text-[#e89a9a]">Загрузка...</div>;

  return (
    <Router>
      <div className="min-h-screen bg-[#fdfbf7] text-[#2d2424] pb-28">
        <div className="max-w-md mx-auto px-5 pt-8">
          <Routes>
            <Route path="/" element={<HomeView masterInfo={masterInfo} isAdmin={isAdmin} onLogin={handleGoogleLogin} />} />
            <Route path="/services" element={<PriceList services={services} />} />
            <Route path="/book" element={<Booking services={services} user={user} availability={availability} />} />
            <Route path="/my-appointments" element={<MyAppointments appointments={appointments} />} />
            {isAdmin && (
              <>
                <Route path="/master" element={<MasterMenu />} />
                <Route path="/master/services" element={<ManageServices services={services} />} />
                <Route path="/master/appointments" element={<ManageAppointments appointments={appointments} />} />
                <Route path="/master/calendar" element={<ManageCalendar availability={availability} />} />
                <Route path="/master/profile" element={<ManageProfile masterInfo={masterInfo} />} />
              </>
            )}
          </Routes>
        </div>
        <nav className="fixed bottom-6 left-5 right-5 h-20 bg-white/90 backdrop-blur-2xl rounded-[32px] shadow-lg border border-white/50 px-8 flex justify-between items-center z-50">
          <NavLink to="/" icon={<Home size={22} />} label="Главная" />
          <NavLink to="/services" icon={<ClipboardList size={22} />} label="Прайс" />
          <NavLink to="/book" icon={<Plus size={28} className="text-white" />} label="Запись" isFab />
          <NavLink to="/my-appointments" icon={<Calendar size={22} />} label="Записи" />
          <NavLink to={isAdmin ? "/master" : "/"} icon={isAdmin ? <LayoutDashboard size={22} /> : <User size={22} />} label={isAdmin ? "Мастер" : "Профиль"} />
        </nav>
      </div>
    </Router>
  );
}

function NavLink({ to, icon, label, isFab }: any) {
  const location = useLocation();
  const isActive = location.pathname === to || (to === '/master' && location.pathname.startsWith('/master'));
  if (isFab) return (
    <Link to={to} className="relative -top-10">
      <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="bg-[#e89a9a] p-5 rounded-full shadow-xl text-white">
        {icon}
      </motion.div>
    </Link>
  );
  return (
    <Link to={to} className={cn("flex flex-col items-center gap-1 transition-all", isActive ? "text-[#e89a9a] scale-110" : "text-slate-300")}>
      {icon}
      <span className="text-[9px] font-bold uppercase tracking-widest">{label}</span>
    </Link>
  );
}

// --- Views ---

function HomeView({ masterInfo, isAdmin, onLogin }: any) {
  return (
    <div className="space-y-10 text-center">
      {!isAdmin && (
        <div className="flex justify-end">
          <button onClick={onLogin} className="text-[10px] text-slate-300 uppercase font-bold tracking-widest flex items-center gap-1">
            <LogIn size={12} /> Вход
          </button>
        </div>
      )}
      <header className="space-y-4">
        <div className="w-32 h-32 mx-auto rounded-[48px] overflow-hidden border-8 border-white shadow-2xl rotate-3">
          <img src={masterInfo?.photoUrl || "https://picsum.photos/seed/master/400"} alt="Master" className="w-full h-full object-cover" />
        </div>
        <h1 className="text-4xl font-serif font-bold">{masterInfo?.name || "Ваш Мастер"}</h1>
        <p className="text-[#e89a9a] font-bold uppercase tracking-widest text-xs">{masterInfo?.experience || "5 лет опыта"}</p>
      </header>
      <Card className="bg-[#f5f2ed]/50 border-none italic text-sm text-slate-600">
        {masterInfo?.bio || "Добро пожаловать в мой салон!"}
      </Card>
      <Link to="/book" className="block">
        <Button className="w-full py-5 text-lg">Записаться онлайн</Button>
      </Link>
    </div>
  );
}

function MasterMenu() {
  const menuItems = [
    { to: "/master/appointments", icon: <ClipboardList size={32} />, label: "Заявки", color: "bg-amber-50 text-amber-500" },
    { to: "/master/calendar", icon: <CalendarDays size={32} />, label: "График", color: "bg-emerald-50 text-emerald-500" },
    { to: "/master/services", icon: <PlusCircle size={32} />, label: "Услуги", color: "bg-blue-50 text-blue-500" },
    { to: "/master/profile", icon: <User size={32} />, label: "Профиль", color: "bg-purple-50 text-purple-500" },
  ];

  return (
    <div className="space-y-8">
      <SectionTitle title="Меню" subtitle="Мастер" />
      <div className="grid grid-cols-2 gap-4">
        {menuItems.map((item) => (
          <Link key={item.to} to={item.to}>
            <Card className="flex flex-col items-center gap-4 py-8 hover:bg-[#e89a9a]/5">
              <div className={cn("p-4 rounded-2xl", item.color)}>
                {item.icon}
              </div>
              <span className="font-bold uppercase tracking-widest text-xs">{item.label}</span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function PriceList({ services }: any) {
  const [selectedService, setSelectedService] = useState<Service | null>(null);

  return (
    <div className="space-y-8">
      <SectionTitle title="Прайс" subtitle="Услуги" />
      <div className="space-y-4">
        {services.map((s) => (
          <Card key={s.id} onClick={() => setSelectedService(s)} className="cursor-pointer">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-lg">{s.name}</h3>
                <p className="text-xs text-slate-400">{s.shortDescription}</p>
              </div>
              <div className="text-xl font-serif font-bold text-[#e89a9a]">{s.price} ₽</div>
            </div>
          </Card>
        ))}
      </div>

      <AnimatePresence>
        {selectedService && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-end">
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="bg-white w-full rounded-t-[40px] p-8 space-y-6">
              <div className="flex justify-between items-start">
                <h2 className="text-2xl font-serif font-bold">{selectedService.name}</h2>
                <button onClick={() => setSelectedService(null)}><XCircle className="text-slate-300" /></button>
              </div>
              <p className="text-slate-500 leading-relaxed">{selectedService.fullDescription}</p>
              <div className="flex justify-between items-center pt-4 border-t">
                <span className="text-2xl font-serif font-bold">{selectedService.price} ₽</span>
                <Link to="/book" state={{ serviceId: selectedService.id }}>
                  <Button onClick={() => setSelectedService(null)}>Записаться</Button>
                </Link>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Booking({ services, user, availability }: any) {
  const location = useLocation();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    service: services.find((s: any) => s.id === location.state?.serviceId) || null,
    date: null as Date | null,
    time: null as string | null,
    name: '',
    phone: '',
    comment: ''
  });

  const dateStr = formData.date ? format(formData.date, 'yyyy-MM-dd') : '';
  const availableTimes = availability.find(a => a.id === dateStr)?.slots || [];

  const handleBook = async () => {
    const appData = {
      clientId: user.uid,
      clientName: formData.name,
      clientPhone: formData.phone,
      clientComment: formData.comment,
      serviceId: formData.service.id,
      serviceName: formData.service.name,
      date: dateStr,
      time: formData.time,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    const docRef = await addDoc(collection(db, 'appointments'), appData);
    
    // Уведомляем мастера через сервер
    fetch('/api/notify-master', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointment: appData, appId: docRef.id })
    });

    setStep(5);
  };

  return (
    <div className="space-y-8">
      {step === 1 && (
        <div className="space-y-6">
          <SectionTitle title="Услуга" subtitle="Шаг 1" />
          {services.map((s: any) => (
            <Card key={s.id} onClick={() => setFormData({...formData, service: s})} className={cn(formData.service?.id === s.id && "border-[#e89a9a] bg-[#e89a9a]/5")}>
              <div className="flex justify-between items-center">
                <span className="font-bold">{s.name}</span>
                <span className="text-[#e89a9a] font-bold">{s.price} ₽</span>
              </div>
            </Card>
          ))}
          <Button className="w-full" disabled={!formData.service} onClick={() => setStep(2)}>Далее</Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-8">
          <SectionTitle title="Дата" subtitle="Шаг 2" />
          <div className="grid grid-cols-4 gap-3">
            {[...Array(12)].map((_, i) => {
              const d = addDays(new Date(), i);
              const hasSlots = availability.some(a => a.id === format(d, 'yyyy-MM-dd') && a.slots.length > 0);
              return (
                <div key={i} onClick={() => hasSlots && setFormData({...formData, date: d})} className={cn("h-20 rounded-2xl flex flex-col items-center justify-center border-2 transition-all", !hasSlots ? "opacity-20 grayscale" : isSameDay(d, formData.date!) ? "bg-[#e89a9a] text-white border-[#e89a9a]" : "bg-white border-[#f5f2ed]")}>
                  <span className="text-[10px] uppercase font-bold">{format(d, 'EEE', { locale: ru })}</span>
                  <span className="text-xl font-serif font-bold">{format(d, 'd')}</span>
                </div>
              );
            })}
          </div>
          <Button className="w-full" disabled={!formData.date} onClick={() => setStep(3)}>Далее</Button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-8">
          <SectionTitle title="Время" subtitle="Шаг 3" />
          <div className="grid grid-cols-3 gap-3">
            {availableTimes.map(t => (
              <div key={t} onClick={() => setFormData({...formData, time: t})} className={cn("py-4 rounded-2xl text-center font-bold border-2", formData.time === t ? "bg-[#e89a9a] text-white border-[#e89a9a]" : "bg-white border-[#f5f2ed]")}>
                {t}
              </div>
            ))}
          </div>
          <Button className="w-full" disabled={!formData.time} onClick={() => setStep(4)}>Далее</Button>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-6">
          <SectionTitle title="Контакты" subtitle="Шаг 4" />
          <Card className="space-y-4">
            <input className="w-full p-4 bg-[#f5f2ed]/50 rounded-2xl focus:outline-none" placeholder="Ваше Имя и Фамилия" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            <input className="w-full p-4 bg-[#f5f2ed]/50 rounded-2xl focus:outline-none" placeholder="Номер телефона" type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
            <textarea className="w-full p-4 bg-[#f5f2ed]/50 rounded-2xl focus:outline-none text-sm" placeholder="Комментарий" value={formData.comment} onChange={e => setFormData({...formData, comment: e.target.value})} />
          </Card>
          <Button className="w-full" disabled={!formData.name || !formData.phone} onClick={handleBook}>Подтвердить</Button>
        </div>
      )}

      {step === 5 && (
        <div className="text-center space-y-6 py-12">
          <CheckCircle2 size={64} className="mx-auto text-emerald-500" />
          <h2 className="text-3xl font-serif font-bold">Готово!</h2>
          <Button className="w-full" onClick={() => navigate('/my-appointments')}>Мои записи</Button>
        </div>
      )}
    </div>
  );
}

function MyAppointments({ appointments }: any) {
  return (
    <div className="space-y-8">
      <SectionTitle title="Записи" subtitle="Мои" />
      {appointments.length === 0 ? (
        <p className="text-center text-slate-400 py-10">Записей пока нет</p>
      ) : (
        appointments.map((app: any) => (
          <Card key={app.id} className="space-y-2">
            <div className="flex justify-between items-start">
              <h3 className="font-bold text-lg">{app.serviceName}</h3>
              <Badge status={app.status} />
            </div>
            <div className="flex items-center gap-2 text-xs text-[#e89a9a] font-bold uppercase">
              <Calendar size={14} /> {app.date} в {app.time}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

// --- Master Views ---

function ManageServices({ services }: any) {
  const [form, setForm] = useState({ name: '', short: '', full: '', price: '' });
  const handleAdd = async () => {
    await addDoc(collection(db, 'services'), { 
      name: form.name, 
      shortDescription: form.short, 
      fullDescription: form.full, 
      price: Number(form.price) 
    });
    setForm({ name: '', short: '', full: '', price: '' });
  };
  return (
    <div className="space-y-8">
      <SectionTitle title="Услуги" subtitle="Мастер" backTo="/master" />
      <Card className="space-y-4">
        <input className="w-full p-3 border rounded-xl" placeholder="Название" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
        <input className="w-full p-3 border rounded-xl" placeholder="Краткое описание" value={form.short} onChange={e => setForm({...form, short: e.target.value})} />
        <textarea className="w-full p-3 border rounded-xl" placeholder="Полное описание" value={form.full} onChange={e => setForm({...form, full: e.target.value})} />
        <input className="w-full p-3 border rounded-xl" placeholder="Цена" type="number" value={form.price} onChange={e => setForm({...form, price: e.target.value})} />
        <Button className="w-full py-3" onClick={handleAdd}>Добавить</Button>
      </Card>
      {services.map((s: any) => (
        <Card key={s.id} className="flex justify-between items-center">
          <div><div className="font-bold">{s.name}</div><div className="text-xs text-slate-400">{s.price} ₽</div></div>
          <button onClick={() => deleteDoc(doc(db, 'services', s.id))}><Trash2 size={18} className="text-rose-500" /></button>
        </Card>
      ))}
    </div>
  );
}

function ManageAppointments({ appointments }: any) {
  const updateStatus = async (id: string, status: string) => {
    await updateDoc(doc(db, 'appointments', id), { status });
  };
  return (
    <div className="space-y-8">
      <SectionTitle title="Заявки" subtitle="Мастер" backTo="/master" />
      {appointments.map((app: any) => (
        <Card key={app.id} className="space-y-4">
          <div className="flex justify-between">
            <div>
              <div className="font-bold text-lg">{app.clientName}</div>
              <div className="flex items-center gap-1 text-[#e89a9a] font-bold text-sm"><Phone size={14} /> {app.clientPhone}</div>
            </div>
            <Badge status={app.status} />
          </div>
          <div className="bg-[#f5f2ed]/50 p-4 rounded-2xl space-y-2 text-sm">
            <div className="flex justify-between"><span>Услуга:</span><span className="font-bold">{app.serviceName}</span></div>
            <div className="flex justify-between"><span>Дата:</span><span className="font-bold">{app.date} в {app.time}</span></div>
            {app.clientComment && <div className="pt-2 border-t border-white italic">"{app.clientComment}"</div>}
          </div>
          {app.status === 'pending' && (
            <div className="flex gap-2">
              <Button className="flex-1 py-3" onClick={() => updateStatus(app.id, 'confirmed')}>Ок</Button>
              <Button variant="secondary" className="flex-1 py-3 text-rose-500" onClick={() => updateStatus(app.id, 'rejected')}>Нет</Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function ManageCalendar({ availability }: any) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [timeInput, setTimeInput] = useState('');
  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const slots = availability.find(a => a.id === dateStr)?.slots || [];

  const addSlot = async () => {
    if (!timeInput) return;
    const newSlots = [...slots, timeInput].sort();
    await setDoc(doc(db, 'availability', dateStr), { slots: newSlots });
    setTimeInput('');
  };

  const removeSlot = async (slot: string) => {
    const newSlots = slots.filter(s => s !== slot);
    await setDoc(doc(db, 'availability', dateStr), { slots: newSlots });
  };

  return (
    <div className="space-y-8">
      <SectionTitle title="График" subtitle="Мастер" backTo="/master" />
      <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar">
        {[...Array(14)].map((_, i) => {
          const d = addDays(new Date(), i);
          return (
            <div key={i} onClick={() => setSelectedDate(d)} className={cn("flex-shrink-0 w-16 h-20 rounded-2xl flex flex-col items-center justify-center border-2 transition-all", isSameDay(d, selectedDate) ? "bg-[#e89a9a] text-white border-[#e89a9a]" : "bg-white border-[#f5f2ed]")}>
              <span className="text-[10px] uppercase font-bold">{format(d, 'EEE', { locale: ru })}</span>
              <span className="text-xl font-serif font-bold">{format(d, 'd')}</span>
            </div>
          );
        })}
      </div>
      <Card className="space-y-6">
        <h3 className="font-bold text-center">{format(selectedDate, 'd MMMM', { locale: ru })}</h3>
        <div className="grid grid-cols-3 gap-2">
          {slots.map(s => (
            <div key={s} className="bg-[#f5f2ed] py-2 rounded-xl flex items-center justify-center gap-2">
              <span className="font-bold text-sm">{s}</span>
              <button onClick={() => removeSlot(s)}><X size={14} className="text-rose-500" /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input type="time" className="flex-1 p-3 border rounded-xl" value={timeInput} onChange={e => setTimeInput(e.target.value)} />
          <Button onClick={addSlot} className="px-4"><Plus size={20} /></Button>
        </div>
      </Card>
    </div>
  );
}

function ManageProfile({ masterInfo }: any) {
  const [name, setName] = useState(masterInfo?.name || '');
  const handleSave = async () => {
    await setDoc(doc(db, 'masterInfo', 'main'), { name, bio: masterInfo?.bio || '', experience: masterInfo?.experience || '', photoUrl: masterInfo?.photoUrl || '' }, { merge: true });
    alert('Сохранено!');
  };
  return (
    <div className="space-y-8">
      <SectionTitle title="Профиль" subtitle="Мастер" backTo="/master" />
      <Card className="space-y-4">
        <input className="w-full p-4 bg-[#f5f2ed]/50 rounded-2xl" value={name} onChange={e => setName(e.target.value)} placeholder="Имя мастера" />
        <Button className="w-full" onClick={handleSave}>Сохранить</Button>
      </Card>
    </div>
  );
}