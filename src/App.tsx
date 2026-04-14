import React, { useState, useEffect, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, 
  Clock, 
  User, 
  Star, 
  Plus, 
  Trash2, 
  Edit2, 
  ChevronRight, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Menu,
  X,
  Phone,
  MessageSquare,
  Home,
  Settings,
  ClipboardList,
  Info,
  Image as ImageIcon,
  Newspaper,
  ArrowRight,
  Heart,
  Share2,
  MapPin
} from 'lucide-react';
import { format, addDays, startOfDay, isSameDay, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc, 
  deleteDoc, 
  setDoc, 
  getDoc,
  orderBy,
  limit
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged,
  signOut
} from 'firebase/auth';
import { db, auth } from './firebase';
import { cn } from './lib/utils';

// --- Types ---
const DEFAULT_TIME_SLOTS = ["10:00", "11:30", "13:00", "14:30", "16:00", "17:30", "19:00"];

interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  priceRange: string;
  duration: number;
}

interface Appointment {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone?: string;
  serviceId: string;
  serviceName: string;
  date: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'rejected';
  price?: number;
  notes?: string;
  createdAt: string;
}

interface Review {
  id: string;
  clientId: string;
  clientName: string;
  rating: number;
  comment: string;
  date: string;
}

interface MasterInfo {
  name: string;
  bio: string;
  experience: string;
  photoUrl: string;
  phone?: string;
  telegram?: string;
}

interface News {
  id: string;
  title: string;
  content: string;
  imageUrl?: string;
  date: string;
  active: boolean;
}

interface Portfolio {
  id: string;
  imageUrl: string;
  title?: string;
  category?: string;
  date: string;
}

// --- Components ---

const Card = ({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) => (
  <motion.div 
    whileHover={onClick ? { y: -4, boxShadow: "0 20px 40px rgba(0,0,0,0.08)" } : {}}
    whileTap={onClick ? { scale: 0.98 } : {}}
    onClick={onClick}
    className={cn(
      "bg-white rounded-[32px] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.02)] border border-brand-secondary/50 transition-all",
      className
    )}
  >
    {children}
  </motion.div>
);

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  className,
  disabled
}: { 
  children: React.ReactNode; 
  onClick?: () => void; 
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  className?: string;
  disabled?: boolean;
}) => {
  const variants = {
    primary: "bg-brand-primary text-white shadow-xl shadow-brand-primary/20 hover:bg-brand-primary/90",
    secondary: "bg-brand-secondary text-brand-dark hover:bg-brand-secondary/80",
    outline: "border-2 border-brand-primary text-brand-primary hover:bg-brand-primary/5",
    ghost: "text-slate-400 hover:text-brand-primary"
  };

  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-8 py-4 rounded-2xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 no-underline",
        variants[variant],
        className
      )}
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
    pending: "В ожидании",
    confirmed: "Записано",
    cancelled: "Отменено",
    rejected: "Не получится"
  };

  return (
    <span className={cn("px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border", styles[status])}>
      {labels[status]}
    </span>
  );
};

const SectionTitle = ({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) => (
  <div className="flex justify-between items-end mb-8 px-2">
    <div className="space-y-1">
      {subtitle && <p className="text-brand-primary text-[10px] font-bold uppercase tracking-[0.3em]">{subtitle}</p>}
      <h2 className="text-3xl font-serif font-bold text-brand-dark leading-tight">{title}</h2>
    </div>
    {action}
  </div>
);

// --- Main App ---

export default function App() {
  const [tgUser, setTgUser] = useState<any>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [masterInfo, setMasterInfo] = useState<MasterInfo | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [news, setNews] = useState<News[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio[]>([]);
  const [schedule, setSchedule] = useState<Record<string, string[]>>({});
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('master_mode') === 'true');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  // Stable client ID for Telegram or Browser
  const clientId = useMemo(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.initDataUnsafe?.user?.id) return `tg_${tg.initDataUnsafe.user.id}`;
    
    let localId = localStorage.getItem('client_id');
    if (!localId) {
      localId = `client_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('client_id', localId);
    }
    return localId;
  }, []);

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      setTgUser(tg.initDataUnsafe?.user);
      tg.setHeaderColor('#fdfbf7');
    }

    const unsubServices = onSnapshot(collection(db, 'services'), (snapshot) => {
      setServices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Service)));
    });

    const unsubMaster = onSnapshot(doc(db, 'masterInfo', 'main'), (doc) => {
      if (doc.exists()) setMasterInfo(doc.data() as MasterInfo);
    });

    const unsubReviews = onSnapshot(query(collection(db, 'reviews'), orderBy('date', 'desc'), limit(10)), (snapshot) => {
      setReviews(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Review)));
    });

    const unsubNews = onSnapshot(query(collection(db, 'news'), where('active', '==', true), orderBy('date', 'desc')), (snapshot) => {
      setNews(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as News)));
    });

    const unsubPortfolio = onSnapshot(query(collection(db, 'portfolio'), orderBy('date', 'desc'), limit(8)), (snapshot) => {
      setPortfolio(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Portfolio)));
    });

    const unsubSchedule = onSnapshot(doc(db, 'settings', 'schedule'), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        // Support both old 'blocked' array and new 'days' map
        const newSchedule: Record<string, string[]> = data.days || {};
        if (data.blocked) {
          data.blocked.forEach((d: string) => {
            if (!newSchedule[d]) newSchedule[d] = [];
          });
        }
        setSchedule(newSchedule);
      }
    });

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user?.email === 'lolkapulya@gmail.com') {
        setIsAdmin(true);
        localStorage.setItem('master_mode', 'true');
      }
    });

    setLoading(false);

    return () => {
      unsubServices();
      unsubMaster();
      unsubReviews();
      unsubNews();
      unsubPortfolio();
      unsubSchedule();
      unsubAuth();
    };
  }, []);

  useEffect(() => {
    if (clientId) {
      const q = isAdmin 
        ? query(collection(db, 'appointments'), orderBy('date', 'desc'))
        : query(collection(db, 'appointments'), where('clientId', '==', clientId), orderBy('date', 'desc'));
      
      const unsubAppointments = onSnapshot(q, (snapshot) => {
        setAppointments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment)));
      });
      return () => unsubAppointments();
    }
  }, [clientId, isAdmin]);

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      if (result.user.email === 'egor0info1@gmail.com') {
        setIsAdmin(true);
        localStorage.setItem('master_mode', 'true');
        return true;
      } else {
        alert('У вас нет прав доступа мастера.');
        await signOut(auth);
      }
    } catch (error) {
      console.error("Login error:", error);
    }
    return false;
  };

  const toggleAdmin = (code: string) => {
    if (code === 'MARGO26') {
      setIsAdmin(true);
      localStorage.setItem('master_mode', 'true');
      return true;
    }
    return false;
  };

  const logoutAdmin = async () => {
    await signOut(auth);
    setIsAdmin(false);
    localStorage.removeItem('master_mode');
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#fdfbf7] space-y-4">
      <motion.div 
        animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }} 
        transition={{ repeat: Infinity, duration: 2 }}
        className="text-3xl font-serif italic text-[#e89a9a]"
      >
        Beauty Salon
      </motion.div>
      <div className="w-12 h-0.5 bg-[#e89a9a]/20 rounded-full overflow-hidden">
        <motion.div 
          animate={{ x: [-50, 50] }} 
          transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
          className="w-1/2 h-full bg-[#e89a9a]"
        />
      </div>
    </div>
  );

  return (
    <Router>
      <div className="min-h-screen bg-[#fdfbf7] text-[#2d2424] font-sans pb-28 selection:bg-[#e89a9a]/20">
        <div className="max-w-md mx-auto px-5 pt-8">
          <Routes>
            <Route path="/" element={<ClientHome masterInfo={masterInfo} news={news} portfolio={portfolio} reviews={reviews} />} />
            <Route path="/services" element={<PriceList services={services} isAdmin={isAdmin} />} />
            <Route path="/book" element={<Booking services={services} clientId={clientId} tgUser={tgUser} masterInfo={masterInfo} schedule={schedule} />} />
            <Route path="/my-appointments" element={<MyAppointments appointments={appointments} />} />
            <Route path="/profile" element={<ClientProfile tgUser={tgUser} appointments={appointments} isAdmin={isAdmin} toggleAdmin={toggleAdmin} handleGoogleLogin={handleGoogleLogin} logoutAdmin={logoutAdmin} />} />
            <Route path="/reviews" element={<Reviews reviews={reviews} clientId={clientId} tgUser={tgUser} />} />
            
            {/* Master Routes */}
            {isAdmin && (
              <>
                <Route path="/master/services" element={<ManageServices services={services} />} />
                <Route path="/master/appointments" element={<ManageAppointments appointments={appointments} />} />
                <Route path="/master/profile" element={<ManageProfile masterInfo={masterInfo} />} />
                <Route path="/master/news" element={<ManageNews news={news} />} />
                <Route path="/master/portfolio" element={<ManagePortfolio portfolio={portfolio} />} />
                <Route path="/master/reviews" element={<ManageReviews reviews={reviews} />} />
                <Route path="/master/schedule" element={<ManageSchedule schedule={schedule} />} />
              </>
            )}
          </Routes>
        </div>

        {/* Bottom Navigation */}
        <nav className="fixed bottom-6 left-5 right-5 h-20 bg-white/95 backdrop-blur-xl rounded-[32px] shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-white/50 px-8 flex justify-between items-center z-50">
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

function NavLink({ to, icon, label, isFab }: { to: string; icon: React.ReactNode; label: string; isFab?: boolean }) {
  const location = useLocation();
  const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  if (isFab) {
    return (
      <Link to={to} className="relative -top-10">
        <motion.div 
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="bg-[#e89a9a] p-5 rounded-full shadow-[0_15px_30px_rgba(232,154,154,0.4)] text-white"
        >
          {icon}
        </motion.div>
      </Link>
    );
  }

  return (
    <Link to={to} className={cn("flex flex-col items-center gap-1.5 transition-all duration-300", isActive ? "text-[#e89a9a] scale-110" : "text-slate-300")}>
      <div className={cn("transition-transform duration-300", isActive && "scale-110")}>
        {icon}
      </div>
      <span className={cn("text-[9px] font-bold uppercase tracking-[0.15em] transition-opacity", isActive ? "opacity-100" : "opacity-60")}>{label}</span>
    </Link>
  );
}

// --- Client Views ---

function ClientHome({ masterInfo, news, portfolio, reviews }: { masterInfo: MasterInfo | null; news: News[]; portfolio: Portfolio[]; reviews: Review[] }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      className="space-y-16 pb-12"
    >
      {/* Hero Section */}
      <header className="text-center space-y-8 pt-10 relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-72 bg-brand-primary/5 rounded-full blur-[100px] -z-10" />
        
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", damping: 20 }}
          className="relative inline-block"
        >
          <div className="w-44 h-44 mx-auto rounded-[64px] overflow-hidden border-[12px] border-white shadow-[0_30px_60px_rgba(0,0,0,0.12)]">
            <img 
              src={masterInfo?.photoUrl || "https://picsum.photos/seed/master/400"} 
              alt="Master" 
              className="w-full h-full object-cover transition-transform duration-1000 hover:scale-110"
              referrerPolicy="no-referrer"
            />
          </div>
          <motion.div 
            animate={{ y: [0, -8, 0], rotate: [0, 5, 0] }}
            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
            className="absolute -bottom-3 -right-3 bg-white p-4 rounded-[24px] shadow-2xl text-brand-primary"
          >
            <Heart size={28} fill="currentColor" />
          </motion.div>
        </motion.div>

        <div className="space-y-3">
          <h1 className="text-5xl font-serif font-bold text-brand-dark tracking-tight">
            {masterInfo?.name || "Маргарита"}
          </h1>
          <div className="inline-flex items-center px-5 py-2 bg-brand-primary/10 rounded-full">
            <p className="text-brand-primary font-bold uppercase tracking-[0.3em] text-[9px]">
              {masterInfo?.experience || "5 лет опыта"}
            </p>
          </div>
        </div>
      </header>

      {/* Quick Action */}
      <div className="px-2">
        <Link to="/book" className="block no-underline">
          <Button className="w-full py-7 text-xl shadow-[0_25px_50px_rgba(232,154,154,0.35)] rounded-[24px]">
            Записаться онлайн
          </Button>
        </Link>
      </div>

      {/* Bio */}
      <section className="px-2">
        <div className="bg-white rounded-[48px] p-10 shadow-[0_15px_50px_rgba(0,0,0,0.02)] border border-brand-secondary/50 relative overflow-hidden text-center">
          <div className="absolute -top-10 -right-10 p-4 opacity-[0.03] text-brand-dark">
            <Info size={160} />
          </div>
          <p className="text-brand-dark/80 leading-relaxed text-xl font-serif italic relative z-10">
            "{masterInfo?.bio || "Добро пожаловать в мой уютный салон! Я специализируюсь на современных техниках окрашивания и стрижках. Моя цель — подчеркнуть вашу естественную красоту."}"
          </p>
        </div>
      </section>

      {/* News / Promotions */}
      {news.length > 0 && (
        <section>
          <SectionTitle title="Новости" subtitle="Акции и события" />
          <div className="flex gap-5 overflow-x-auto pb-6 no-scrollbar px-2">
            {news.map(item => (
              <motion.div 
                key={item.id} 
                whileHover={{ y: -5 }}
                className="flex-shrink-0 w-80 bg-white rounded-[40px] overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.05)] border border-[#f5f2ed]"
              >
                {item.imageUrl && (
                  <div className="h-48 overflow-hidden">
                    <img src={item.imageUrl} className="w-full h-full object-cover" alt={item.title} referrerPolicy="no-referrer" />
                  </div>
                )}
                <div className="p-6 space-y-3">
                  <h3 className="font-bold text-xl text-[#2d2424]">{item.title}</h3>
                  <p className="text-sm text-slate-500 line-clamp-2 leading-relaxed">{item.content}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Portfolio Preview */}
      <section>
        <SectionTitle 
          title="Портфолио" 
          subtitle="Наши работы" 
          action={<Link to="/master/portfolio" className="text-[10px] font-bold text-[#e89a9a] uppercase tracking-[0.2em] flex items-center gap-1 bg-[#e89a9a]/5 px-3 py-1.5 rounded-full">Все работы <ChevronRight size={12} /></Link>}
        />
        <div className="grid grid-cols-2 gap-4 px-2">
          {portfolio.length > 0 ? portfolio.slice(0, 4).map((item, idx) => (
            <motion.div 
              key={item.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.1 }}
              className={cn(
                "aspect-[4/5] rounded-[32px] overflow-hidden shadow-sm relative group",
                idx % 2 === 1 ? "mt-6" : ""
              )}
            >
              <img 
                src={item.imageUrl} 
                className="w-full h-full object-cover" 
                alt="Work"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </motion.div>
          )) : [1, 2, 3, 4].map(i => (
            <div key={i} className="aspect-square bg-slate-100 rounded-[32px] animate-pulse" />
          ))}
        </div>
      </section>

      {/* Reviews Preview */}
      <section className="px-2">
        <SectionTitle title="Отзывы" subtitle="Что говорят клиенты" />
        <div className="space-y-5">
          {reviews.slice(0, 2).map(review => (
            <Card key={review.id} className="p-8">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#f5f2ed] rounded-full flex items-center justify-center text-[#e89a9a] font-bold text-xs">
                    {review.clientName[0]}
                  </div>
                  <span className="font-bold text-sm">{review.clientName}</span>
                </div>
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} size={12} className={cn(i < review.rating ? "fill-yellow-400 text-yellow-400" : "text-slate-200")} />
                  ))}
                </div>
              </div>
              <p className="text-sm text-slate-600 italic leading-relaxed font-serif">"{review.comment}"</p>
            </Card>
          ))}
          <Link to="/reviews">
            <Button variant="secondary" className="w-full py-5 rounded-[24px]">Посмотреть все отзывы</Button>
          </Link>
        </div>
      </section>
    </motion.div>
  );
}

function PriceList({ services, isAdmin }: { services: Service[]; isAdmin: boolean }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="flex justify-between items-end px-2">
        <div>
          <p className="text-[#e89a9a] text-xs font-bold uppercase tracking-[0.2em] mb-1">Услуги</p>
          <h1 className="text-4xl font-serif font-bold">Прайс-лист</h1>
        </div>
        {isAdmin && (
          <Link to="/master/services">
            <Button variant="secondary" className="px-4 py-2 text-xs uppercase tracking-widest">Управлять</Button>
          </Link>
        )}
      </div>
      
      <Card className="bg-[#e89a9a]/5 border-[#e89a9a]/10 p-4">
        <p className="text-xs text-[#e89a9a] font-medium leading-relaxed italic">
          * Стоимость указана ориентировочно. Точная цена зависит от расхода материалов и сложности работы.
        </p>
      </Card>

      <div className="space-y-4">
        {services.map(service => (
          <motion.div 
            key={service.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex justify-between items-center p-4 border-b border-[#f5f2ed] group hover:bg-white hover:rounded-2xl transition-all"
          >
            <div className="space-y-1">
              <h3 className="font-bold text-lg text-[#2d2424] group-hover:text-[#e89a9a] transition-colors">{service.name}</h3>
              <p className="text-xs text-slate-400 max-w-[200px]">{service.description}</p>
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                <Clock size={12} />
                <span>~{service.duration} мин</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-serif font-bold text-[#2d2424]">{service.price} ₽</div>
              <div className="text-[10px] font-bold text-[#e89a9a] uppercase tracking-widest">{service.priceRange}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function Booking({ services, clientId, tgUser, masterInfo, schedule }: { services: Service[]; clientId: string; tgUser: any; masterInfo: MasterInfo | null; schedule: Record<string, string[]> }) {
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(addDays(new Date(), 1));
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [phone, setPhone] = useState(tgUser?.phone_number || '');
  const [notes, setNotes] = useState('');
  const [step, setStep] = useState(1);
  const navigate = useNavigate();

  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const availableSlots = schedule[dateStr] !== undefined ? schedule[dateStr] : DEFAULT_TIME_SLOTS;
  const isBlocked = availableSlots.length === 0;

  const handleBook = async () => {
    if (!selectedService || !selectedTime || !clientId) return;

    const appointmentDate = format(selectedDate, 'yyyy-MM-dd') + ' ' + selectedTime;
    
    try {
      const newAppointment = {
        clientId: clientId,
        clientName: tgUser?.first_name || 'Клиент',
        clientPhone: phone,
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        date: appointmentDate,
        status: 'pending',
        notes,
        createdAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, 'appointments'), newAppointment);

      // Notify master via API
      fetch('/api/notify-master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointment: { ...newAppointment, id: docRef.id },
          type: 'new'
        })
      });

      setStep(4);
    } catch (error) {
      console.error("Booking error:", error);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="flex items-center gap-3 px-2">
        {[1, 2, 3].map(i => (
          <div key={i} className={cn("h-1.5 flex-1 rounded-full transition-all duration-500", step >= i ? "bg-[#e89a9a]" : "bg-[#f5f2ed]")} />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-6">
          <SectionTitle title="Услуга" subtitle="Шаг 1 из 3" />
          <div className="space-y-4">
            {services.map(service => (
              <Card 
                key={service.id} 
                className={cn(
                  "cursor-pointer border-2 transition-all p-5",
                  selectedService?.id === service.id ? "border-[#e89a9a] bg-[#e89a9a]/5" : "border-transparent"
                )}
                onClick={() => setSelectedService(service)}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-lg">{service.name}</h3>
                    <p className="text-xs text-slate-400">{service.description}</p>
                  </div>
                  <div className="text-right">
                    <div className="font-serif font-bold text-xl text-[#e89a9a]">{service.price} ₽</div>
                    <div className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">~{service.duration} мин</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <Button 
            className="w-full py-5" 
            disabled={!selectedService} 
            onClick={() => setStep(2)}
          >
            Продолжить <ArrowRight size={18} />
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-8">
          <SectionTitle title="Дата и время" subtitle="Шаг 2 из 3" />
          
          <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar px-2">
            {[...Array(14)].map((_, i) => {
              const date = addDays(new Date(), i + 1);
              const dStr = format(date, 'yyyy-MM-dd');
              const isSelected = isSameDay(date, selectedDate);
              const daySlots = schedule[dStr] !== undefined ? schedule[dStr] : DEFAULT_TIME_SLOTS;
              const dayBlocked = daySlots.length === 0;
              
              return (
                <motion.div
                  key={i}
                  whileTap={!dayBlocked ? { scale: 0.9 } : {}}
                  onClick={() => !dayBlocked && setSelectedDate(date)}
                  className={cn(
                    "flex-shrink-0 w-20 h-24 rounded-[28px] flex flex-col items-center justify-center cursor-pointer transition-all border-2",
                    isSelected ? "bg-[#e89a9a] text-white border-[#e89a9a] shadow-xl shadow-[#e89a9a]/30" : "bg-white text-slate-600 border-[#f5f2ed]",
                    dayBlocked && "opacity-30 grayscale cursor-not-allowed"
                  )}
                >
                  <span className="text-[10px] uppercase font-bold tracking-widest opacity-70 mb-1">{format(date, 'EEE', { locale: ru })}</span>
                  <span className="text-2xl font-serif font-bold">{format(date, 'd')}</span>
                  {dayBlocked && <span className="text-[8px] font-bold uppercase mt-1">Занято</span>}
                </motion.div>
              );
            })}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {availableSlots.map(time => (
              <motion.div
                key={time}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedTime(time)}
                className={cn(
                  "py-4 rounded-2xl text-center font-bold cursor-pointer border-2 transition-all",
                  selectedTime === time ? "bg-[#e89a9a] text-white border-[#e89a9a] shadow-lg shadow-[#e89a9a]/20" : "bg-white text-slate-600 border-[#f5f2ed]"
                )}
              >
                {time}
              </motion.div>
            ))}
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setStep(1)}>Назад</Button>
            <Button className="flex-[2]" disabled={!selectedTime} onClick={() => setStep(3)}>Далее</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-8">
          <SectionTitle title="Контактные данные" subtitle="Шаг 3 из 3" />
          <Card className="space-y-6 p-8 bg-[#f5f2ed]/30 border-none">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Ваш номер телефона</label>
                <input
                  type="tel"
                  placeholder="+7 (999) 000-00-00"
                  className="w-full p-4 rounded-2xl bg-white border border-[#f5f2ed] focus:outline-none focus:ring-2 focus:ring-[#e89a9a]/20"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Комментарий (необязательно)</label>
                <textarea
                  placeholder="Добавьте пожелания..."
                  className="w-full p-4 rounded-2xl bg-white border border-[#f5f2ed] focus:outline-none focus:ring-2 focus:ring-[#e89a9a]/20 min-h-[100px]"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="pt-4 border-t border-[#e89a9a]/10 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400 italic">Услуга:</span>
                <span className="font-bold">{selectedService?.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400 italic">Дата:</span>
                <span className="font-bold">{format(selectedDate, 'd MMMM', { locale: ru })} в {selectedTime}</span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="text-slate-400 italic">Итого:</span>
                <span className="font-serif font-bold text-2xl text-[#e89a9a]">{selectedService?.price} ₽</span>
              </div>
            </div>
          </Card>

          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setStep(2)}>Назад</Button>
            <Button className="flex-[2]" disabled={!phone} onClick={handleBook}>Подтвердить запись</Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }} 
          animate={{ scale: 1, opacity: 1 }}
          className="text-center space-y-8 py-12"
        >
          <div className="relative inline-block">
            <div className="w-24 h-24 bg-emerald-50 text-emerald-500 rounded-[40px] flex items-center justify-center mx-auto rotate-12">
              <CheckCircle2 size={48} className="-rotate-12" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-serif font-bold">Заявка принята!</h2>
            <p className="text-slate-500 text-sm leading-relaxed max-w-[280px] mx-auto">
              Мастер рассмотрит вашу запись и подтвердит её. Вы получите уведомление в Telegram.
            </p>
          </div>
          
          <div className="space-y-4 pt-4">
            <Button className="w-full" onClick={() => navigate('/my-appointments')}>Посмотреть мои записи</Button>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" className="text-xs" onClick={() => window.open(`tel:${masterInfo?.phone || ''}`)}>
                <Phone size={16} /> Позвонить
              </Button>
              <Button variant="secondary" className="text-xs" onClick={() => window.open(`https://t.me/${masterInfo?.telegram || ''}`)}>
                <MessageSquare size={16} /> Написать
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function MyAppointments({ appointments }: { appointments: Appointment[] }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <SectionTitle title="Мои записи" subtitle="История и статус" />
      
      {appointments.length === 0 ? (
        <div className="text-center py-24 space-y-4">
          <div className="w-20 h-20 bg-[#f5f2ed] rounded-[32px] flex items-center justify-center mx-auto text-slate-300">
            <Calendar size={32} />
          </div>
          <p className="text-slate-400 font-medium">У вас пока нет записей</p>
          <Link to="/book" className="inline-block">
            <Button variant="outline" className="text-xs">Записаться сейчас</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {appointments.map(app => (
            <Card key={app.id} className="space-y-4 overflow-hidden relative">
              <div className="absolute top-0 right-0 p-4">
                <Badge status={app.status} />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-xl pr-24 leading-tight">{app.serviceName}</h3>
                <div className="flex items-center gap-4 text-slate-400 text-xs font-bold uppercase tracking-widest">
                  <div className="flex items-center gap-1">
                    <Calendar size={14} className="text-[#e89a9a]" />
                    <span>{format(parseISO(app.date.split(' ')[0]), 'd MMMM', { locale: ru })}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock size={14} className="text-[#e89a9a]" />
                    <span>{app.date.split(' ')[1]}</span>
                  </div>
                </div>
              </div>
              {app.notes && (
                <div className="bg-[#f5f2ed]/50 p-4 rounded-2xl text-xs text-slate-500 italic border-l-4 border-[#e89a9a]">
                  "{app.notes}"
                </div>
              )}
              {app.status === 'pending' && (
                <div className="flex items-center gap-2 text-[10px] font-bold text-amber-500 uppercase tracking-widest">
                  <AlertCircle size={12} />
                  <span>Ожидает подтверждения мастером</span>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function ClientProfile({ tgUser, appointments, isAdmin, toggleAdmin, handleGoogleLogin, logoutAdmin }: { tgUser: any; appointments: Appointment[]; isAdmin: boolean; toggleAdmin: (code: string) => boolean; handleGoogleLogin: () => Promise<boolean>; logoutAdmin: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  const handleLogin = () => {
    if (toggleAdmin(code)) {
      setShowAdminLogin(false);
      setCode('');
      setError('');
    } else {
      setError('Неверный код доступа');
    }
  };

  const confirmedCount = appointments.filter(a => a.status === 'confirmed').length;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <SectionTitle title="Профиль" subtitle="Личный кабинет" />

      <Card className="flex items-center gap-6 p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#e89a9a]/5 rounded-full -mr-16 -mt-16" />
        <div className="w-20 h-20 bg-[#f5f2ed] rounded-[28px] flex items-center justify-center text-[#e89a9a] text-3xl font-serif font-bold shadow-inner">
          {tgUser?.first_name?.[0] || 'К'}
        </div>
        <div className="space-y-1">
          <h2 className="text-2xl font-serif font-bold text-[#2d2424]">{tgUser?.first_name || 'Гость'}</h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Клиент салона</p>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card className="text-center p-6 bg-emerald-50/30 border-none">
          <div className="text-2xl font-serif font-bold text-emerald-600">{confirmedCount}</div>
          <p className="text-[10px] font-bold text-emerald-600/60 uppercase tracking-widest mt-1">Визитов</p>
        </Card>
        <Card className="text-center p-6 bg-amber-50/30 border-none">
          <div className="text-2xl font-serif font-bold text-amber-600">{appointments.length}</div>
          <p className="text-[10px] font-bold text-amber-600/60 uppercase tracking-widest mt-1">Всего записей</p>
        </Card>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-400 ml-2">
          {isAdmin ? 'Управление салоном' : 'Настройки'}
        </h3>
        <Card className="p-0 overflow-hidden">
          {!isAdmin ? (
            <button 
              onClick={() => setShowAdminLogin(true)}
              className="w-full p-6 flex justify-between items-center hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400">
                  <Settings size={20} />
                </div>
                <span className="font-bold text-sm">Панель мастера</span>
              </div>
              <ChevronRight size={18} className="text-slate-300" />
            </button>
          ) : (
            <div className="divide-y divide-slate-50">
              <Link to="/master/appointments" className="w-full p-6 flex justify-between items-center hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400">
                    <Calendar size={20} />
                  </div>
                  <span className="font-bold text-sm">Заявки и записи</span>
                </div>
                <ChevronRight size={18} className="text-slate-300" />
              </Link>
              <Link to="/master/schedule" className="w-full p-6 flex justify-between items-center hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400">
                    <Clock size={20} />
                  </div>
                  <span className="font-bold text-sm">График работы</span>
                </div>
                <ChevronRight size={18} className="text-slate-300" />
              </Link>
              <Link to="/master/services" className="w-full p-6 flex justify-between items-center hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400">
                    <ClipboardList size={20} />
                  </div>
                  <span className="font-bold text-sm">Услуги и цены</span>
                </div>
                <ChevronRight size={18} className="text-slate-300" />
              </Link>
              <Link to="/master/portfolio" className="w-full p-6 flex justify-between items-center hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400">
                    <ImageIcon size={20} />
                  </div>
                  <span className="font-bold text-sm">Портфолио</span>
                </div>
                <ChevronRight size={18} className="text-slate-300" />
              </Link>
              <Link to="/master/reviews" className="w-full p-6 flex justify-between items-center hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400">
                    <Star size={20} />
                  </div>
                  <span className="font-bold text-sm">Управление отзывами</span>
                </div>
                <ChevronRight size={18} className="text-slate-300" />
              </Link>
              <Link to="/master/profile" className="w-full p-6 flex justify-between items-center hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400">
                    <Info size={20} />
                  </div>
                  <span className="font-bold text-sm">О себе и фото</span>
                </div>
                <ChevronRight size={18} className="text-slate-300" />
              </Link>
              <button 
                onClick={logoutAdmin}
                className="w-full p-6 flex justify-between items-center hover:bg-rose-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center text-rose-400">
                    <XCircle size={20} />
                  </div>
                  <span className="font-bold text-sm text-rose-500">Выйти из режима мастера</span>
                </div>
              </button>
            </div>
          )}
        </Card>
      </div>

      <AnimatePresence>
        {showAdminLogin && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#2d2424]/60 backdrop-blur-md z-[100] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-sm rounded-[40px] p-10 shadow-2xl space-y-8"
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-[#e89a9a]/10 text-[#e89a9a] rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Settings size={32} />
                </div>
                <h2 className="text-2xl font-serif font-bold">Вход для мастера</h2>
                <p className="text-xs text-slate-400">Введите секретный код доступа</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Вариант 1: Через Google (Рекомендуется)</p>
                  <Button 
                    variant="outline" 
                    className="w-full py-4 border-slate-200 text-slate-600 hover:bg-slate-50"
                    onClick={async () => {
                      const success = await handleGoogleLogin();
                      if (success) setShowAdminLogin(false);
                    }}
                  >
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="" />
                    Войти через Google
                  </Button>
                </div>

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
                  <div className="relative flex justify-center text-[10px] uppercase font-bold text-slate-300 bg-white px-2">или</div>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Вариант 2: Секретный код</p>
                  <input 
                    type="password" 
                    placeholder="Код доступа"
                    className="w-full p-5 rounded-2xl bg-slate-50 border-none focus:ring-4 focus:ring-[#e89a9a]/10 text-center text-xl tracking-[0.5em] font-bold"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                  />
                </div>
                
                {error && <p className="text-rose-500 text-[10px] font-bold text-center uppercase tracking-widest">{error}</p>}
                <div className="flex gap-3">
                  <Button variant="secondary" className="flex-1" onClick={() => setShowAdminLogin(false)}>Отмена</Button>
                  <Button className="flex-1" onClick={handleLogin}>Войти</Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Reviews({ reviews, clientId, tgUser }: { reviews: Review[]; clientId: string; tgUser: any }) {
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  const handleSubmit = async () => {
    if (!clientId) return;
    await addDoc(collection(db, 'reviews'), {
      clientId: clientId,
      clientName: tgUser?.first_name || 'Клиент',
      rating,
      comment,
      date: new Date().toISOString()
    });
    setShowForm(false);
    setComment('');
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <SectionTitle 
        title="Отзывы" 
        subtitle="Мнение клиентов" 
        action={
          <Button variant="secondary" className="px-4 py-2 text-[10px] uppercase tracking-widest" onClick={() => setShowForm(true)}>
            Написать
          </Button>
        }
      />

      <AnimatePresence>
        {showForm && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }} 
            animate={{ height: 'auto', opacity: 1 }} 
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <Card className="space-y-6 mb-8 bg-[#e89a9a]/5 border-[#e89a9a]/20">
              <div className="flex justify-center gap-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <motion.div key={i} whileTap={{ scale: 0.8 }}>
                    <Star 
                      size={36} 
                      className={cn("cursor-pointer transition-all", i <= rating ? "fill-yellow-400 text-yellow-400 scale-110" : "text-slate-200")} 
                      onClick={() => setRating(i)}
                    />
                  </motion.div>
                ))}
              </div>
              <textarea
                placeholder="Ваш отзыв очень важен для нас..."
                className="w-full p-5 rounded-[24px] bg-white border border-[#f5f2ed] focus:outline-none focus:ring-4 focus:ring-[#e89a9a]/10 text-sm"
                rows={4}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <div className="flex gap-3">
                <Button variant="secondary" className="flex-1" onClick={() => setShowForm(false)}>Отмена</Button>
                <Button className="flex-1" onClick={handleSubmit}>Отправить</Button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-6">
        {reviews.map(review => (
          <Card key={review.id} className="space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#f5f2ed] rounded-full flex items-center justify-center text-[#e89a9a] font-bold">
                  {review.clientName[0]}
                </div>
                <span className="font-bold text-sm">{review.clientName}</span>
              </div>
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={12} className={cn(i < review.rating ? "fill-yellow-400 text-yellow-400" : "text-slate-200")} />
                ))}
              </div>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed italic">"{review.comment}"</p>
            <div className="text-[10px] font-bold text-slate-300 uppercase tracking-widest text-right">
              {format(parseISO(review.date), 'd MMMM yyyy', { locale: ru })}
            </div>
          </Card>
        ))}
      </div>
    </motion.div>
  );
}

// --- Master Management Views ---

function ManageSchedule({ schedule }: { schedule: Record<string, string[]> }) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [customTime, setCustomTime] = useState('');

  const updateDaySlots = async (dateStr: string, slots: string[]) => {
    const newDays = { ...schedule, [dateStr]: slots };
    await setDoc(doc(db, 'settings', 'schedule'), { days: newDays });
  };

  const toggleSlot = (dateStr: string, slot: string) => {
    const currentSlots = schedule[dateStr] !== undefined ? schedule[dateStr] : DEFAULT_TIME_SLOTS;
    const newSlots = currentSlots.includes(slot)
      ? currentSlots.filter(s => s !== slot)
      : [...currentSlots, slot].sort();
    updateDaySlots(dateStr, newSlots);
  };

  const addCustomSlot = (dateStr: string) => {
    if (!customTime || !customTime.includes(':')) return;
    const currentSlots = schedule[dateStr] !== undefined ? schedule[dateStr] : DEFAULT_TIME_SLOTS;
    if (!currentSlots.includes(customTime)) {
      const newSlots = [...currentSlots, customTime].sort();
      updateDaySlots(dateStr, newSlots);
    }
    setCustomTime('');
  };

  const blockDay = (dateStr: string) => {
    updateDaySlots(dateStr, []);
  };

  const resetDay = async (dateStr: string) => {
    const newDays = { ...schedule };
    delete newDays[dateStr];
    await setDoc(doc(db, 'settings', 'schedule'), { days: newDays });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 pb-24">
      <SectionTitle title="График" subtitle="Управление временем" />
      
      <Card className="bg-amber-50/30 border-amber-100 p-6">
        <div className="flex gap-3 items-start">
          <AlertCircle className="text-amber-500 flex-shrink-0" size={20} />
          <p className="text-xs text-amber-700 leading-relaxed">
            Нажмите на дату, чтобы настроить доступные часы. Вы можете выбирать из стандартных или добавить свое время (например, 19:05).
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3">
        {[...Array(21)].map((_, i) => {
          const date = addDays(new Date(), i);
          const dateStr = format(date, 'yyyy-MM-dd');
          const daySlots = schedule[dateStr] !== undefined ? schedule[dateStr] : DEFAULT_TIME_SLOTS;
          const isBlocked = daySlots.length === 0;
          const isCustom = schedule[dateStr] !== undefined;
          const isExpanded = selectedDate === dateStr;
          
          return (
            <div key={dateStr} className="space-y-2">
              <Card 
                onClick={() => setSelectedDate(isExpanded ? null : dateStr)}
                className={cn(
                  "flex justify-between items-center py-5 px-6 cursor-pointer transition-all",
                  isBlocked ? "bg-rose-50/50 border-rose-100" : isCustom ? "bg-emerald-50/30 border-emerald-100" : "hover:bg-slate-50"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex flex-col items-center justify-center font-bold",
                    isBlocked ? "bg-rose-100 text-rose-600" : isCustom ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-600"
                  )}>
                    <span className="text-[10px] uppercase">{format(date, 'EEE', { locale: ru })}</span>
                    <span className="text-lg">{format(date, 'd')}</span>
                  </div>
                  <div>
                    <p className="font-bold text-sm">{format(date, 'd MMMM', { locale: ru })}</p>
                    <p className={cn("text-[10px] font-bold uppercase tracking-widest", isBlocked ? "text-rose-400" : "text-slate-400")}>
                      {isBlocked ? "День полностью закрыт" : `${daySlots.length} доступных окон`}
                    </p>
                  </div>
                </div>
                <ChevronRight size={18} className={cn("text-slate-300 transition-transform", isExpanded && "rotate-90")} />
              </Card>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <Card className="bg-slate-50/50 border-slate-100 p-6 space-y-6">
                      <div className="space-y-4">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Доступные часы:</p>
                        
                        {/* Custom Time Input */}
                        <div className="flex gap-2">
                          <input 
                            type="time" 
                            value={customTime}
                            onChange={(e) => setCustomTime(e.target.value)}
                            className="flex-1 p-3 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#e89a9a]/20"
                          />
                          <Button 
                            onClick={() => addCustomSlot(dateStr)}
                            className="px-4 py-3 text-xs"
                          >
                            Добавить
                          </Button>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          {/* Show all currently active slots for this day */}
                          {daySlots.map(slot => (
                            <button
                              key={slot}
                              onClick={() => toggleSlot(dateStr, slot)}
                              className="py-3 rounded-xl text-xs font-bold transition-all border-2 bg-[#2d2424] text-white border-[#2d2424]"
                            >
                              {slot}
                            </button>
                          ))}
                          
                          {/* Show default slots that are NOT active, so they can be toggled ON */}
                          {DEFAULT_TIME_SLOTS.filter(s => !daySlots.includes(s)).map(slot => (
                            <button
                              key={slot}
                              onClick={() => toggleSlot(dateStr, slot)}
                              className="py-3 rounded-xl text-xs font-bold transition-all border-2 bg-white text-slate-400 border-slate-100"
                            >
                              {slot}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button 
                          variant="secondary" 
                          className="flex-1 text-[10px] py-3 bg-rose-50 text-rose-600 border-rose-100"
                          onClick={() => blockDay(dateStr)}
                        >
                          Закрыть день
                        </Button>
                        <Button 
                          variant="secondary" 
                          className="flex-1 text-[10px] py-3 bg-slate-100 text-slate-600"
                          onClick={() => updateDaySlots(dateStr, [])}
                        >
                          Очистить всё
                        </Button>
                        <Button 
                          variant="secondary" 
                          className="flex-1 text-[10px] py-3"
                          onClick={() => resetDay(dateStr)}
                        >
                          Сбросить
                        </Button>
                      </div>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

function ManageServices({ services }: { services: Service[] }) {
  const [editing, setEditing] = useState<Partial<Service> | null>(null);

  const handleSave = async () => {
    if (!editing?.name || !editing?.price) return;
    if (editing.id) {
      await updateDoc(doc(db, 'services', editing.id), editing);
    } else {
      await addDoc(collection(db, 'services'), editing);
    }
    setEditing(null);
  };

  return (
    <div className="space-y-8">
      <SectionTitle title="Услуги" subtitle="Управление" action={
        <Button variant="primary" className="p-3 rounded-full" onClick={() => setEditing({})}>
          <Plus size={24} />
        </Button>
      } />

      {editing && (
        <Card className="space-y-4 border-[#e89a9a]/30">
          <input placeholder="Название" className="w-full p-4 bg-[#f5f2ed]/50 rounded-2xl focus:outline-none" value={editing.name || ''} onChange={e => setEditing({...editing, name: e.target.value})} />
          <textarea placeholder="Описание" className="w-full p-4 bg-[#f5f2ed]/50 rounded-2xl focus:outline-none" value={editing.description || ''} onChange={e => setEditing({...editing, description: e.target.value})} />
          <div className="grid grid-cols-2 gap-3">
            <input type="number" placeholder="Цена" className="w-full p-4 bg-[#f5f2ed]/50 rounded-2xl focus:outline-none" value={editing.price || ''} onChange={e => setEditing({...editing, price: Number(e.target.value)})} />
            <input placeholder="Погрешность (+-)" className="w-full p-4 bg-[#f5f2ed]/50 rounded-2xl focus:outline-none" value={editing.priceRange || ''} onChange={e => setEditing({...editing, priceRange: e.target.value})} />
          </div>
          <input type="number" placeholder="Длительность (мин)" className="w-full p-4 bg-[#f5f2ed]/50 rounded-2xl focus:outline-none" value={editing.duration || ''} onChange={e => setEditing({...editing, duration: Number(e.target.value)})} />
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setEditing(null)}>Отмена</Button>
            <Button className="flex-1" onClick={handleSave}>Сохранить</Button>
          </div>
        </Card>
      )}

      <div className="space-y-4">
        {services.map(service => (
          <Card key={service.id} className="flex justify-between items-center p-5">
            <div>
              <h3 className="font-bold text-lg">{service.name}</h3>
              <p className="text-xs text-[#e89a9a] font-bold uppercase tracking-widest">{service.price} ₽ {service.priceRange}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditing(service)} className="p-2 text-slate-300 hover:text-[#e89a9a] transition-colors"><Edit2 size={20} /></button>
              <button onClick={() => deleteDoc(doc(db, 'services', service.id))} className="p-2 text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={20} /></button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ManageAppointments({ appointments }: { appointments: Appointment[] }) {
  const handleStatus = async (app: Appointment, status: Appointment['status']) => {
    await updateDoc(doc(db, 'appointments', app.id), { status });
    
    // Notify client via API
    fetch('/api/notify-client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appointment: app,
        status: status
      })
    });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <SectionTitle title="Заявки" subtitle="Управление записями" />
      
      <div className="space-y-4">
        {appointments.map(app => (
          <Card key={app.id} className="space-y-4 border-l-4 border-[#e89a9a]">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <h3 className="font-bold text-lg">{app.clientName}</h3>
                <div className="flex items-center gap-2 text-xs text-slate-400 font-bold uppercase tracking-widest">
                  <Phone size={12} className="text-[#e89a9a]" />
                  <span>{app.clientPhone || 'Нет телефона'}</span>
                </div>
              </div>
              <Badge status={app.status} />
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Услуга:</span>
                <span className="font-bold">{app.serviceName}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Дата:</span>
                <span className="font-bold">{app.date}</span>
              </div>
            </div>

            {app.notes && (
              <p className="text-xs text-slate-500 italic px-2">"{app.notes}"</p>
            )}

            <div className="flex gap-2 pt-2">
              {app.status === 'pending' && (
                <>
                  <Button className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600" onClick={() => handleStatus(app, 'confirmed')}>
                    <CheckCircle2 size={16} /> Принять
                  </Button>
                  <Button className="flex-1 py-3 bg-rose-500 hover:bg-rose-600" onClick={() => handleStatus(app, 'rejected')}>
                    <XCircle size={16} /> Отказать
                  </Button>
                </>
              )}
              {app.status !== 'pending' && (
                <Button variant="outline" className="w-full py-3" onClick={() => handleStatus(app, 'pending')}>
                  Вернуть в ожидание
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </motion.div>
  );
}

function ManageProfile({ masterInfo }: { masterInfo: MasterInfo | null }) {
  const [editing, setEditing] = useState<MasterInfo>(masterInfo || { name: '', bio: '', experience: '', photoUrl: '', phone: '', telegram: '' });

  const handleSave = async () => {
    await setDoc(doc(db, 'masterInfo', 'main'), editing);
    alert('Профиль обновлен!');
  };

  return (
    <div className="space-y-8">
      <SectionTitle title="Профиль" subtitle="Информация о мастере" />
      <Card className="space-y-6">
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-2">Имя мастера</label>
          <input className="w-full p-4 bg-[#f5f2ed]/50 rounded-2xl focus:outline-none" value={editing.name} onChange={e => setEditing({...editing, name: e.target.value})} />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-2">Опыт работы</label>
          <input className="w-full p-4 bg-[#f5f2ed]/50 rounded-2xl focus:outline-none" value={editing.experience} onChange={e => setEditing({...editing, experience: e.target.value})} />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-2">Биография</label>
          <textarea className="w-full p-4 bg-[#f5f2ed]/50 rounded-2xl focus:outline-none h-32" value={editing.bio} onChange={e => setEditing({...editing, bio: e.target.value})} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-2">Телефон</label>
            <input className="w-full p-4 bg-[#f5f2ed]/50 rounded-2xl focus:outline-none" value={editing.phone || ''} onChange={e => setEditing({...editing, phone: e.target.value})} />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-2">Telegram @</label>
            <input className="w-full p-4 bg-[#f5f2ed]/50 rounded-2xl focus:outline-none" value={editing.telegram || ''} onChange={e => setEditing({...editing, telegram: e.target.value})} />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-2">URL Фото</label>
          <input className="w-full p-4 bg-[#f5f2ed]/50 rounded-2xl focus:outline-none" value={editing.photoUrl} onChange={e => setEditing({...editing, photoUrl: e.target.value})} />
        </div>
        <Button className="w-full" onClick={handleSave}>Сохранить изменения</Button>
      </Card>
      
      <div className="grid grid-cols-2 gap-4">
        <Link to="/master/news" className="block">
          <Card className="text-center p-6 hover:bg-[#e89a9a]/5 transition-colors">
            <Newspaper size={32} className="mx-auto mb-2 text-[#e89a9a]" />
            <span className="text-xs font-bold uppercase tracking-widest">Новости</span>
          </Card>
        </Link>
        <Link to="/master/portfolio" className="block">
          <Card className="text-center p-6 hover:bg-[#e89a9a]/5 transition-colors">
            <ImageIcon size={32} className="mx-auto mb-2 text-[#e89a9a]" />
            <span className="text-xs font-bold uppercase tracking-widest">Портфолио</span>
          </Card>
        </Link>
        <Link to="/master/reviews" className="block col-span-2">
          <Card className="text-center p-6 hover:bg-[#e89a9a]/5 transition-colors">
            <Star size={32} className="mx-auto mb-2 text-[#e89a9a]" />
            <span className="text-xs font-bold uppercase tracking-widest">Управление отзывами</span>
          </Card>
        </Link>
      </div>
    </div>
  );
}

function ManageNews({ news }: { news: News[] }) {
  const [editing, setEditing] = useState<Partial<News> | null>(null);

  const handleSave = async () => {
    if (!editing?.title || !editing?.content) return;
    const data = { ...editing, date: new Date().toISOString(), active: true };
    if (editing.id) {
      await updateDoc(doc(db, 'news', editing.id), data);
    } else {
      await addDoc(collection(db, 'news'), data);
    }
    setEditing(null);
  };

  return (
    <div className="space-y-8">
      <SectionTitle title="Новости" subtitle="Акции и события" action={
        <Button variant="primary" className="p-3 rounded-full" onClick={() => setEditing({})}>
          <Plus size={24} />
        </Button>
      } />

      {editing && (
        <Card className="space-y-4">
          <input placeholder="Заголовок" className="w-full p-4 bg-[#f5f2ed]/50 rounded-2xl focus:outline-none" value={editing.title || ''} onChange={e => setEditing({...editing, title: e.target.value})} />
          <textarea placeholder="Текст новости" className="w-full p-4 bg-[#f5f2ed]/50 rounded-2xl focus:outline-none h-32" value={editing.content || ''} onChange={e => setEditing({...editing, content: e.target.value})} />
          <input placeholder="URL Картинки" className="w-full p-4 bg-[#f5f2ed]/50 rounded-2xl focus:outline-none" value={editing.imageUrl || ''} onChange={e => setEditing({...editing, imageUrl: e.target.value})} />
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setEditing(null)}>Отмена</Button>
            <Button className="flex-1" onClick={handleSave}>Опубликовать</Button>
          </div>
        </Card>
      )}

      <div className="space-y-4">
        {news.map(item => (
          <Card key={item.id} className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              {item.imageUrl && <img src={item.imageUrl} className="w-12 h-12 rounded-xl object-cover" alt="" referrerPolicy="no-referrer" />}
              <div>
                <h3 className="font-bold">{item.title}</h3>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest">{format(parseISO(item.date), 'd MMM')}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditing(item)} className="p-2 text-slate-300 hover:text-[#e89a9a]"><Edit2 size={18} /></button>
              <button onClick={() => deleteDoc(doc(db, 'news', item.id))} className="p-2 text-slate-300 hover:text-rose-500"><Trash2 size={18} /></button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ManagePortfolio({ portfolio }: { portfolio: Portfolio[] }) {
  const [editing, setEditing] = useState<Partial<Portfolio> | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploading(true);
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditing(prev => ({ ...prev, imageUrl: reader.result as string }));
        setUploading(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!editing?.imageUrl) return;
    const data = { ...editing, date: new Date().toISOString() };
    if (editing.id) {
      await updateDoc(doc(db, 'portfolio', editing.id), data);
    } else {
      await addDoc(collection(db, 'portfolio'), data);
    }
    setEditing(null);
  };

  return (
    <div className="space-y-8">
      <SectionTitle title="Портфолио" subtitle="Галерея работ" action={
        <Button variant="primary" className="p-3 rounded-full" onClick={() => setEditing({})}>
          <Plus size={24} />
        </Button>
      } />

      {editing && (
        <Card className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-2">Загрузить фото</label>
            <div className="relative h-48 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center overflow-hidden">
              {editing.imageUrl ? (
                <img src={editing.imageUrl} className="w-full h-full object-cover" alt="Preview" />
              ) : (
                <div className="text-center p-4">
                  <ImageIcon size={32} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Нажмите для выбора файла</p>
                </div>
              )}
              <input 
                type="file" 
                accept="image/*" 
                className="absolute inset-0 opacity-0 cursor-pointer" 
                onChange={handleFileChange}
              />
            </div>
            {uploading && <p className="text-[10px] text-[#e89a9a] font-bold animate-pulse text-center">Обработка...</p>}
          </div>
          
          <input placeholder="Название (необяз.)" className="w-full p-4 bg-[#f5f2ed]/50 rounded-2xl focus:outline-none" value={editing.title || ''} onChange={e => setEditing({...editing, title: e.target.value})} />
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setEditing(null)}>Отмена</Button>
            <Button className="flex-1" disabled={!editing.imageUrl || uploading} onClick={handleSave}>Добавить</Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4">
        {portfolio.map(item => (
          <div key={item.id} className="relative group">
            <img src={item.imageUrl} className="w-full aspect-square object-cover rounded-[24px] shadow-sm" alt="" referrerPolicy="no-referrer" />
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => setEditing(item)} className="bg-white/90 p-2 rounded-full text-[#e89a9a] shadow-sm"><Edit2 size={14} /></button>
              <button onClick={() => deleteDoc(doc(db, 'portfolio', item.id))} className="bg-white/90 p-2 rounded-full text-rose-500 shadow-sm"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ManageReviews({ reviews }: { reviews: Review[] }) {
  const [editing, setEditing] = useState<Partial<Review> | null>(null);

  const handleSave = async () => {
    if (!editing?.comment || !editing?.rating || !editing.id) return;
    await updateDoc(doc(db, 'reviews', editing.id), {
      comment: editing.comment,
      rating: editing.rating
    });
    setEditing(null);
  };

  return (
    <div className="space-y-8">
      <SectionTitle title="Отзывы" subtitle="Управление" />

      {editing && (
        <Card className="space-y-4 border-[#e89a9a]/30">
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map(i => (
              <Star 
                key={i} 
                size={24} 
                className={cn("cursor-pointer", i <= (editing.rating || 0) ? "fill-yellow-400 text-yellow-400" : "text-slate-200")} 
                onClick={() => setEditing({...editing, rating: i})}
              />
            ))}
          </div>
          <textarea 
            className="w-full p-4 bg-[#f5f2ed]/50 rounded-2xl focus:outline-none h-32" 
            value={editing.comment || ''} 
            onChange={e => setEditing({...editing, comment: e.target.value})} 
          />
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setEditing(null)}>Отмена</Button>
            <Button className="flex-1" onClick={handleSave}>Сохранить</Button>
          </div>
        </Card>
      )}

      <div className="space-y-4">
        {reviews.map(review => (
          <Card key={review.id} className="space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <span className="font-bold text-sm">{review.clientName}</span>
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} size={10} className={cn(i < review.rating ? "fill-yellow-400 text-yellow-400" : "text-slate-200")} />
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditing(review)} className="text-slate-300 hover:text-[#e89a9a]"><Edit2 size={16} /></button>
                <button onClick={() => deleteDoc(doc(db, 'reviews', review.id))} className="text-slate-300 hover:text-rose-500"><Trash2 size={16} /></button>
              </div>
            </div>
            <p className="text-xs text-slate-500 italic">"{review.comment}"</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
