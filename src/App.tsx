import React, { useState, useEffect, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, Clock, User, Star, Plus, Trash2, Edit2, ChevronRight, 
  CheckCircle2, XCircle, Menu, X, Phone, MessageSquare, Home, 
  Settings, ClipboardList, Info, Image as ImageIcon, Heart, ArrowRight, MapPin, Save
} from 'lucide-react';
import { format, addDays, isSameDay, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { 
  collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, setDoc, query, where, orderBy, limit, getDoc 
} from 'firebase/firestore';
import { db } from './firebase';
import { cn } from './lib/utils';

// --- UI Components ---

const Card = ({ children, className, onClick }: any) => (
  <motion.div 
    whileHover={onClick ? { y: -4 } : {}}
    whileTap={onClick ? { scale: 0.98 } : {}}
    onClick={onClick}
    className={cn("bg-white rounded-[32px] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.02)] border border-[#f5f2ed] transition-all", className)}
  >
    {children}
  </motion.div>
);

const Button = ({ children, onClick, variant = 'primary', className, disabled }: any) => {
  const variants = {
    primary: "bg-[#e89a9a] text-white shadow-xl shadow-[#e89a9a]/20 hover:bg-[#d88a8a]",
    secondary: "bg-[#f5f2ed] text-[#2d2424] hover:bg-[#ebe8e3]",
    outline: "border-2 border-[#e89a9a] text-[#e89a9a]",
    ghost: "text-slate-400 hover:text-[#e89a9a]"
  };
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      disabled={disabled}
      className={cn("px-8 py-4 rounded-2xl font-semibold transition-all flex items-center justify-center gap-2", variants[variant as keyof typeof variants], className)}
    >
      {children}
    </motion.button>
  );
};

const SectionTitle = ({ title, subtitle, action }: any) => (
  <div className="flex justify-between items-end mb-8 px-2">
    <div className="space-y-1">
      {subtitle && <p className="text-[#e89a9a] text-[10px] font-bold uppercase tracking-[0.3em]">{subtitle}</p>}
      <h2 className="text-3xl font-serif font-bold text-[#2d2424] leading-tight">{title}</h2>
    </div>
    {action}
  </div>
);

// --- Main App ---

export default function App() {
  const [services, setServices] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [masterInfo, setMasterInfo] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('master_mode') === 'true');

  const clientId = useMemo(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.initDataUnsafe?.user?.id) return `tg_${tg.initDataUnsafe.user.id}`;
    return localStorage.getItem('client_id') || `client_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  useEffect(() => {
    onSnapshot(collection(db, 'services'), (s) => setServices(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    onSnapshot(doc(db, 'masterInfo', 'main'), (d) => d.exists() && setMasterInfo(d.data()));
    onSnapshot(query(collection(db, 'reviews'), orderBy('date', 'desc')), (s) => setReviews(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    onSnapshot(query(collection(db, 'portfolio'), orderBy('date', 'desc')), (s) => setPortfolio(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    onSnapshot(doc(db, 'settings', 'schedule'), (d) => d.exists() && setBlockedDates(d.data()?.blocked || []));
    
    const q = isAdmin ? collection(db, 'appointments') : query(collection(db, 'appointments'), where('clientId', '==', clientId));
    onSnapshot(q, (s) => setAppointments(s.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [isAdmin, clientId]);

  return (
    <Router>
      <div className="min-h-screen bg-[#fdfbf7] text-[#2d2424] pb-28">
        <div className="max-w-md mx-auto px-5 pt-8">
          <Routes>
            <Route path="/" element={<ClientHome masterInfo={masterInfo} portfolio={portfolio} reviews={reviews} />} />
            <Route path="/services" element={<PriceList services={services} />} />
            <Route path="/book" element={<Booking services={services} clientId={clientId} blockedDates={blockedDates} />} />
            <Route path="/my-appointments" element={<MyAppointments appointments={appointments} />} />
            <Route path="/profile" element={<Profile isAdmin={isAdmin} setIsAdmin={setIsAdmin} />} />
            
            {isAdmin && (
              <>
                <Route path="/master/appointments" element={<ManageAppointments appointments={appointments} />} />
                <Route path="/master/services" element={<ManageServices services={services} />} />
                <Route path="/master/portfolio" element={<ManagePortfolio portfolio={portfolio} />} />
                <Route path="/master/reviews" element={<ManageReviews reviews={reviews} />} />
                <Route path="/master/info" element={<ManageInfo masterInfo={masterInfo} />} />
                <Route path="/master/schedule" element={<ManageSchedule blockedDates={blockedDates} />} />
              </>
            )}
          </Routes>
        </div>

        <nav className="fixed bottom-6 left-5 right-5 h-20 bg-white/90 backdrop-blur-xl rounded-[32px] shadow-xl border border-white/50 px-8 flex justify-between items-center z-50">
          <NavLink to="/" icon={<Home size={22} />} label="Главная" />
          <NavLink to="/services" icon={<ClipboardList size={22} />} label="Прайс" />
          <NavLink to="/book" icon={<Plus size={28} className="text-white" />} label="Запись" isFab />
          <NavLink to="/my-appointments" icon={<Calendar size={22} />} label="Записи" />
          <NavLink to="/profile" icon={<User size={22} />} label="Профиль" />
        </nav>
      </div>
    </Router>
  );
}

// --- Views ---

function ClientHome({ masterInfo, portfolio, reviews }: any) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-12">
      <header className="text-center space-y-6 pt-10">
        <div className="w-40 h-40 mx-auto rounded-[56px] overflow-hidden border-[10px] border-white shadow-xl">
          <img src={masterInfo?.photoUrl || "https://picsum.photos/seed/master/400"} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        </div>
        <h1 className="text-4xl font-serif font-bold">{masterInfo?.name || "Маргарита"}</h1>
        <div className="inline-block px-4 py-1.5 bg-[#e89a9a]/10 rounded-full text-[#e89a9a] font-bold text-[10px] uppercase tracking-widest">
          {masterInfo?.experience || "5 лет опыта"}
        </div>
      </header>
      <Link to="/book" className="block"><Button className="w-full py-6 text-lg">Записаться онлайн</Button></Link>
      <Card className="text-center italic font-serif text-lg">"{masterInfo?.bio || "Ваша красота — моё вдохновение."}"</Card>
      <section>
        <SectionTitle title="Портфолио" subtitle="Мои работы" />
        <div className="grid grid-cols-2 gap-4">
          {portfolio.slice(0, 4).map((p: any, i: number) => (
            <div key={i} className={cn("aspect-[4/5] rounded-[28px] overflow-hidden shadow-sm", i % 2 === 1 && "mt-4")}>
              <img src={p.imageUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </div>
          ))}
        </div>
      </section>
    </motion.div>
  );
}

function Profile({ isAdmin, setIsAdmin }: any) {
  const [code, setCode] = useState('');
  return (
    <div className="space-y-8">
      <SectionTitle title="Профиль" subtitle={isAdmin ? "Меню Мастера" : "Настройки"} />
      {!isAdmin ? (
        <Card className="space-y-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Вход для мастера</p>
          <input type="password" value={code} onChange={e => setCode(e.target.value)} placeholder="Код доступа" className="w-full p-4 rounded-2xl bg-[#f5f2ed] border-none" />
          <Button className="w-full" onClick={() => code === 'MARGO26' && (setIsAdmin(true), localStorage.setItem('master_mode', 'true'))}>Войти</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          <Link to="/master/appointments"><Button variant="secondary" className="w-full justify-start gap-4"><Calendar size={20}/> Заявки и записи</Button></Link>
          <Link to="/master/schedule"><Button variant="secondary" className="w-full justify-start gap-4"><Clock size={20}/> График работы</Button></Link>
          <Link to="/master/services"><Button variant="secondary" className="w-full justify-start gap-4"><ClipboardList size={20}/> Услуги и цены</Button></Link>
          <Link to="/master/portfolio"><Button variant="secondary" className="w-full justify-start gap-4"><ImageIcon size={20}/> Портфолио</Button></Link>
          <Link to="/master/reviews"><Button variant="secondary" className="w-full justify-start gap-4"><Star size={20}/> Управление отзывами</Button></Link>
          <Link to="/master/info"><Button variant="secondary" className="w-full justify-start gap-4"><Info size={20}/> О себе и фото</Button></Link>
          <Button variant="outline" className="mt-8 border-red-100 text-red-400" onClick={() => (setIsAdmin(false), localStorage.removeItem('master_mode'))}>Выйти из режима мастера</Button>
        </div>
      )}
    </div>
  );
}

// --- Master Components ---

function ManageSchedule({ blockedDates }: any) {
  const toggleDate = async (dateStr: string) => {
    const newBlocked = blockedDates.includes(dateStr) ? blockedDates.filter((d: string) => d !== dateStr) : [...blockedDates, dateStr];
    await setDoc(doc(db, 'settings', 'schedule'), { blocked: newBlocked });
  };
  return (
    <div className="space-y-6">
      <SectionTitle title="График" subtitle="Свободные даты" />
      <div className="grid grid-cols-1 gap-3">
        {[...Array(14)].map((_, i) => {
          const d = addDays(new Date(), i);
          const dStr = format(d, 'yyyy-MM-dd');
          const isBlocked = blockedDates.includes(dStr);
          return (
            <Card key={i} onClick={() => toggleDate(dStr)} className={cn("flex justify-between items-center py-4", isBlocked && "bg-slate-50 opacity-60")}>
              <div>
                <p className="font-bold">{format(d, 'd MMMM', { locale: ru })}</p>
                <p className="text-[10px] uppercase tracking-widest text-slate-400">{format(d, 'EEEE', { locale: ru })}</p>
              </div>
              <span className={cn("text-[10px] font-bold px-3 py-1 rounded-full", isBlocked ? "bg-red-50 text-red-500" : "bg-emerald-50 text-emerald-500")}>
                {isBlocked ? "Закрыто" : "Открыто"}
              </span>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ManageReviews({ reviews }: any) {
  const [editing, setEditing] = useState<any>(null);
  const save = async () => {
    await updateDoc(doc(db, 'reviews', editing.id), { comment: editing.comment, rating: editing.rating });
    setEditing(null);
  };
  return (
    <div className="space-y-6">
      <SectionTitle title="Отзывы" subtitle="Модерация" />
      {reviews.map((r: any) => (
        <Card key={r.id} className="space-y-3">
          <div className="flex justify-between items-start">
            <div><p className="font-bold">{r.clientName}</p><div className="flex gap-1">{[...Array(5)].map((_, i) => <Star key={i} size={10} fill={i < r.rating ? "#fbbf24" : "none"} className={i < r.rating ? "text-yellow-400" : "text-slate-200"} />)}</div></div>
            <div className="flex gap-2">
              <Button variant="ghost" className="p-2" onClick={() => setEditing(r)}><Edit2 size={16}/></Button>
              <Button variant="ghost" className="p-2 text-red-400" onClick={() => deleteDoc(doc(db, 'reviews', r.id))}><Trash2 size={16}/></Button>
            </div>
          </div>
          <p className="text-sm italic text-slate-600">"{r.comment}"</p>
        </Card>
      ))}
      <AnimatePresence>
        {editing && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white w-full rounded-[32px] p-8 space-y-6">
              <h3 className="text-2xl font-serif font-bold">Редактировать отзыв</h3>
              <div className="space-y-4">
                <div className="flex gap-2 justify-center">
                  {[1,2,3,4,5].map(star => <Star key={star} onClick={() => setEditing({...editing, rating: star})} size={32} fill={star <= editing.rating ? "#fbbf24" : "none"} className={cn("cursor-pointer", star <= editing.rating ? "text-yellow-400" : "text-slate-200")} />)}
                </div>
                <textarea value={editing.comment} onChange={e => setEditing({...editing, comment: e.target.value})} className="w-full p-4 bg-[#f5f2ed] rounded-2xl h-32 border-none" />
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setEditing(null)}>Отмена</Button>
                <Button className="flex-1" onClick={save}>Сохранить</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Other components (ManageAppointments, ManageServices, etc.) remain similar to previous versions ---
// [Код ManageAppointments, ManageServices, ManagePortfolio, ManageInfo из предыдущего ответа]

function ManageAppointments({ appointments }: any) {
  const updateStatus = async (id: string, status: string, app: any) => {
    await updateDoc(doc(db, 'appointments', id), { status });
    fetch('/api/notify-client', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ appointment: app, status }) });
  };
  return (
    <div className="space-y-6">
      <SectionTitle title="Заявки" subtitle="Управление" />
      {appointments.map((app: any) => (
        <Card key={app.id} className="space-y-4">
          <div className="flex justify-between">
            <div><p className="font-bold">{app.clientName}</p><p className="text-xs text-slate-400">{app.serviceName}</p></div>
            <p className="font-serif font-bold text-[#e89a9a]">{app.date}</p>
          </div>
          {app.status === 'pending' && (
            <div className="flex gap-2">
              <Button className="flex-1 py-3 text-xs" onClick={() => updateStatus(app.id, 'confirmed', app)}>Принять</Button>
              <Button variant="secondary" className="flex-1 py-3 text-xs" onClick={() => updateStatus(app.id, 'rejected', app)}>Отказать</Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function ManageServices({ services }: any) {
  const addService = () => {
    const name = prompt('Название:');
    const price = Number(prompt('Цена:'));
    if (name && price) addDoc(collection(db, 'services'), { name, price, duration: 60, description: '', priceRange: 'от' });
  };
  return (
    <div className="space-y-6">
      <SectionTitle title="Услуги" subtitle="Прайс-лист" action={<Button onClick={addService} className="p-3 rounded-full"><Plus size={20}/></Button>} />
      {services.map((s: any) => (
        <Card key={s.id} className="flex justify-between items-center">
          <div><p className="font-bold">{s.name}</p><p className="text-xs text-[#e89a9a]">{s.price} ₽</p></div>
          <Button variant="ghost" onClick={() => deleteDoc(doc(db, 'services', s.id))}><Trash2 size={18}/></Button>
        </Card>
      ))}
    </div>
  );
}

function ManagePortfolio({ portfolio }: any) {
  const addItem = () => {
    const url = prompt('URL фото:');
    if (url) addDoc(collection(db, 'portfolio'), { imageUrl: url, date: new Date().toISOString() });
  };
  return (
    <div className="space-y-6">
      <SectionTitle title="Портфолио" subtitle="Мои работы" action={<Button onClick={addItem} className="p-3 rounded-full"><Plus size={20}/></Button>} />
      <div className="grid grid-cols-2 gap-4">
        {portfolio.map((p: any) => (
          <div key={p.id} className="relative">
            <img src={p.imageUrl} className="aspect-square object-cover rounded-2xl" referrerPolicy="no-referrer" />
            <button onClick={() => deleteDoc(doc(db, 'portfolio', p.id))} className="absolute top-2 right-2 bg-white/80 p-2 rounded-full text-red-500"><Trash2 size={14}/></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ManageInfo({ masterInfo }: any) {
  const [info, setInfo] = useState(masterInfo || {});
  const save = async () => { await setDoc(doc(db, 'masterInfo', 'main'), info); alert('Сохранено!'); };
  return (
    <div className="space-y-6">
      <SectionTitle title="О себе" subtitle="Информация" />
      <Card className="space-y-4">
        <input value={info.name || ''} onChange={e => setInfo({...info, name: e.target.value})} placeholder="Имя" className="w-full p-4 rounded-xl bg-[#f5f2ed] border-none" />
        <input value={info.experience || ''} onChange={e => setInfo({...info, experience: e.target.value})} placeholder="Опыт" className="w-full p-4 rounded-xl bg-[#f5f2ed] border-none" />
        <textarea value={info.bio || ''} onChange={e => setInfo({...info, bio: e.target.value})} placeholder="О себе" className="w-full p-4 rounded-xl bg-[#f5f2ed] border-none h-32" />
        <input value={info.photoUrl || ''} onChange={e => setInfo({...info, photoUrl: e.target.value})} placeholder="URL фото профиля" className="w-full p-4 rounded-xl bg-[#f5f2ed] border-none" />
        <Button className="w-full" onClick={save}>Сохранить</Button>
      </Card>
    </div>
  );
}

// --- Client Helpers ---

function PriceList({ services }: any) {
  return (
    <div className="space-y-8">
      <SectionTitle title="Прайс-лист" subtitle="Наши услуги" />
      <div className="space-y-4">
        {services.map((s: any) => (
          <div key={s.id} className="flex justify-between items-center p-5 border-b border-[#f5f2ed]">
            <div><h3 className="font-bold text-lg">{s.name}</h3><p className="text-xs text-slate-400">~{s.duration} мин</p></div>
            <p className="text-xl font-serif font-bold">{s.price} ₽</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Booking({ services, clientId, blockedDates }: any) {
  const [step, setStep] = useState(1);
  const [selectedService, setSelectedService] = useState<any>(null);
  const navigate = useNavigate();
  const handleBook = async () => {
    const app = { clientId, clientName: 'Клиент', serviceName: selectedService.name, date: format(addDays(new Date(), 1), 'd MMMM, 10:00', { locale: ru }), status: 'pending', createdAt: new Date().toISOString() };
    await addDoc(collection(db, 'appointments'), app);
    fetch('/api/notify-master', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ appointment: app, type: 'new' }) });
    setStep(2);
  };
  return (
    <div className="space-y-8">
      {step === 1 ? (
        <>
          <SectionTitle title="Запись" subtitle="Выбор услуги" />
          <div className="space-y-4">
            {services.map((s: any) => (
              <Card key={s.id} onClick={() => setSelectedService(s)} className={cn(selectedService?.id === s.id && "border-[#e89a9a] bg-[#e89a9a]/5")}>
                <div className="flex justify-between items-center">
                  <div><p className="font-bold">{s.name}</p><p className="text-xs text-slate-400">{s.price} ₽</p></div>
                  {selectedService?.id === s.id && <CheckCircle2 className="text-[#e89a9a]" />}
                </div>
              </Card>
            ))}
            <Button className="w-full py-6" disabled={!selectedService} onClick={handleBook}>Записаться на завтра</Button>
          </>
      ) : (
        <div className="text-center space-y-6 py-12">
          <CheckCircle2 size={64} className="mx-auto text-emerald-500" />
          <h2 className="text-3xl font-serif font-bold">Готово!</h2>
          <p className="text-slate-500">Мастер подтвердит запись в Telegram.</p>
          <Button className="w-full" onClick={() => navigate('/my-appointments')}>Мои записи</Button>
        </div>
      )}
    </div>
  );
}

function MyAppointments({ appointments }: any) {
  return (
    <div className="space-y-8">
      <SectionTitle title="Записи" subtitle="Мои визиты" />
      {appointments.map((app: any) => (
        <Card key={app.id} className="flex justify-between items-center">
          <div><p className="font-bold">{app.serviceName}</p><p className="text-xs text-slate-400">{app.date}</p></div>
          <span className={cn("text-[10px] font-bold px-3 py-1 rounded-full", app.status === 'confirmed' ? "bg-emerald-50 text-emerald-500" : "bg-amber-50 text-amber-500")}>
            {app.status === 'confirmed' ? 'Одобрено' : 'Ожидание'}
          </span>
        </Card>
      ))}
    </div>
  );
}

function NavLink({ to, icon, label, isFab }: any) {
  const location = useLocation();
  const isActive = location.pathname === to;
  if (isFab) return <Link to={to} className="relative -top-10"><div className="bg-[#e89a9a] p-5 rounded-full shadow-lg text-white">{icon}</div></Link>;
  return <Link to={to} className={cn("flex flex-col items-center gap-1", isActive ? "text-[#e89a9a]" : "text-slate-300")}>{icon}<span className="text-[9px] font-bold uppercase tracking-widest">{label}</span></Link>;
}