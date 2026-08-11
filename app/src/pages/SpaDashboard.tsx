import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/services/firebase-services';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { AlertModal } from '@/components/ui/AlertModal';
import { useCentralClock } from '@/components/ui/CentralizedClock';
import {
  Flower2,
  Search,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  DollarSign,
  CalendarDays,
  User,
  PlayCircle,
  Sparkles,
  TrendingUp,
  Activity,
  Timer
} from 'lucide-react';

interface SpaAppointment {
  id: string;
  guestId: string;
  guestName: string;
  treatmentId: string;
  treatmentName: string;
  therapistId: string;
  date: string;
  time: string;
  price: number;
  bookingReference: string;
  status: 'confirmed' | 'checked_in' | 'in_progress' | 'completed' | 'no_show' | 'cancelled';
  paymentMethod: string;
  createdAt: string;
  notes?: string;
}

type TabId = 'today' | 'upcoming' | 'history' | 'analytics';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  confirmed: { label: 'Confirmed', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', icon: Clock },
  checked_in: { label: 'Checked In', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', icon: User },
  in_progress: { label: 'In Progress', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300', icon: PlayCircle },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', icon: CheckCircle },
  no_show: { label: 'No Show', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', icon: XCircle },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400', icon: XCircle },
};

const THERAPIST_NAMES: Record<string, string> = {
  any: 'Any Available',
  t1: 'Sarah Jenkins',
  t2: 'Michael Chen',
  t3: 'Elena Rodriguez',
};

export function SpaDashboard() {
  const { user } = useAuth();
  const currentTime = useCentralClock();
  const [appointments, setAppointments] = useState<SpaAppointment[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [alert, setAlert] = useState({ open: false, title: '', message: '', type: 'info' as 'success' | 'error' | 'info' | 'warning' });

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'spa_bookings'), (snapshot) => {
      const data = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as SpaAppointment[];
      // Sort by date and time
      data.sort((a, b) => {
        const dc = a.date.localeCompare(b.date);
        if (dc !== 0) return dc;
        return a.time.localeCompare(b.time);
      });
      setAppointments(data);
    });
    return () => unsub();
  }, []);

  const handleStatusUpdate = async (appointmentId: string, newStatus: SpaAppointment['status']) => {
    setUpdatingId(appointmentId);
    try {
      await updateDoc(doc(db, 'spa_bookings', appointmentId), { status: newStatus });
      setAlert({
        open: true,
        title: newStatus === 'completed' ? '✅ Treatment Completed' : newStatus === 'in_progress' ? '🟣 Treatment Started' : newStatus === 'no_show' ? '⚠️ Marked No-Show' : '✅ Status Updated',
        message: `Appointment status updated to "${STATUS_CONFIG[newStatus]?.label || newStatus}".`,
        type: newStatus === 'no_show' ? 'warning' : 'success'
      });
    } catch (error) {
      console.error('Error updating spa status:', error);
      setAlert({ open: true, title: 'Update Failed', message: 'Could not update appointment status.', type: 'error' });
    } finally {
      setUpdatingId(null);
    }
  };

  // Filter logic
  const todayAppointments = appointments.filter(a => a.date === today && !['completed', 'no_show', 'cancelled'].includes(a.status));
  const upcomingAppointments = appointments.filter(a => a.date > today && !['completed', 'no_show', 'cancelled'].includes(a.status));
  const historyAppointments = appointments.filter(a => ['completed', 'no_show', 'cancelled'].includes(a.status) || a.date < today);

  const filterBySearch = (list: SpaAppointment[]) => {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(a =>
      a.guestName.toLowerCase().includes(q) ||
      a.treatmentName.toLowerCase().includes(q) ||
      a.bookingReference.toLowerCase().includes(q)
    );
  };

  // Analytics
  const todayRevenue = appointments.filter(a => a.date === today && a.status !== 'cancelled').reduce((s, a) => s + a.price, 0);
  const todayCompleted = appointments.filter(a => a.date === today && a.status === 'completed').length;
  const todayTotal = appointments.filter(a => a.date === today).length;
  const weekRevenue = appointments.filter(a => {
    const d = new Date(a.date);
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    return d >= weekAgo && d <= now && a.status !== 'cancelled';
  }).reduce((s, a) => s + a.price, 0);

  const formatTime12 = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${period}`;
  };

  const isImminent = (appt: SpaAppointment) => {
    if (appt.date !== today) return false;
    const [h, m] = appt.time.split(':').map(Number);
    const apptTime = new Date();
    apptTime.setHours(h, m, 0, 0);
    const diff = apptTime.getTime() - currentTime.getTime();
    return diff > 0 && diff < 30 * 60 * 1000; // Within 30 minutes
  };

  const getActionButtons = (appt: SpaAppointment) => {
    const loading = updatingId === appt.id;
    switch (appt.status) {
      case 'confirmed':
        return (
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={() => handleStatusUpdate(appt.id, 'checked_in')} disabled={loading}
              className="bg-amber-500 hover:bg-amber-600 text-white text-xs">
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <User className="h-3 w-3 mr-1" />} Check In
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleStatusUpdate(appt.id, 'no_show')} disabled={loading}
              className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20 text-xs">
              <XCircle className="h-3 w-3 mr-1" /> No Show
            </Button>
          </div>
        );
      case 'checked_in':
        return (
          <Button size="sm" onClick={() => handleStatusUpdate(appt.id, 'in_progress')} disabled={loading}
            className="bg-purple-500 hover:bg-purple-600 text-white text-xs">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3 mr-1" />} Start Treatment
          </Button>
        );
      case 'in_progress':
        return (
          <Button size="sm" onClick={() => handleStatusUpdate(appt.id, 'completed')} disabled={loading}
            className="bg-green-500 hover:bg-green-600 text-white text-xs">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3 mr-1" />} Complete
          </Button>
        );
      default:
        return null;
    }
  };

  const renderAppointmentCard = (appt: SpaAppointment) => {
    const statusCfg = STATUS_CONFIG[appt.status] || STATUS_CONFIG.confirmed;
    const StatusIcon = statusCfg.icon;
    const imminent = isImminent(appt);

    return (
      <Card
        key={appt.id}
        className={`transition-all hover:shadow-md dark:bg-slate-900 dark:border-slate-800 ${imminent ? 'ring-2 ring-amber-400 dark:ring-amber-500 shadow-amber-100 dark:shadow-amber-900/20' : ''} ${appt.status === 'in_progress' ? 'border-l-4 border-l-purple-500' : ''}`}
      >
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="font-semibold text-[#1e3a5f] dark:text-blue-300 truncate">{appt.treatmentName}</h3>
                <Badge className={`${statusCfg.color} text-[10px] font-medium`}>
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {statusCfg.label}
                </Badge>
                {imminent && (
                  <Badge className="bg-amber-500 text-white text-[10px] animate-pulse">
                    <Timer className="h-3 w-3 mr-1" /> Starting Soon
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-slate-400 mt-2">
                <span className="flex items-center gap-1"><User className="h-3 w-3" /> {appt.guestName}</span>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatTime12(appt.time)}</span>
                <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {new Date(appt.date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</span>
                <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> R{appt.price.toLocaleString()}</span>
              </div>
              <p className="text-[11px] text-gray-400 dark:text-slate-500 mt-1">
                Therapist: {THERAPIST_NAMES[appt.therapistId] || appt.therapistId} · Ref: {appt.bookingReference}
              </p>
            </div>
            <div className="flex-shrink-0">
              {getActionButtons(appt)}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const tabs: { id: TabId; label: string; icon: React.ElementType; count: number }[] = [
    { id: 'today', label: "Today's Schedule", icon: CalendarDays, count: todayAppointments.length },
    { id: 'upcoming', label: 'Upcoming', icon: Clock, count: upcomingAppointments.length },
    { id: 'history', label: 'History', icon: CheckCircle, count: historyAppointments.length },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp, count: 0 },
  ];

  const getCurrentList = () => {
    switch (activeTab) {
      case 'today': return filterBySearch(todayAppointments);
      case 'upcoming': return filterBySearch(upcomingAppointments);
      case 'history': return filterBySearch(historyAppointments);
      default: return [];
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      <AlertModal open={alert.open} onClose={() => setAlert(prev => ({ ...prev, open: false }))} title={alert.title} message={alert.message} type={alert.type} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white shadow-lg">
            <Flower2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-serif font-bold text-[#1e3a5f] dark:text-blue-400">Spa & Wellness Center</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              Welcome, {user?.name || 'Therapist'} · {currentTime.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search guests, treatments, refs..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
          />
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-purple-500 to-purple-700 text-white border-none shadow-lg">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-200 text-xs font-medium uppercase tracking-wider">Today's Appointments</p>
                <p className="text-3xl font-bold mt-1">{todayTotal}</p>
              </div>
              <CalendarDays className="h-8 w-8 text-purple-300" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500 to-emerald-700 text-white border-none shadow-lg">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-200 text-xs font-medium uppercase tracking-wider">Completed Today</p>
                <p className="text-3xl font-bold mt-1">{todayCompleted}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-300" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500 to-orange-600 text-white border-none shadow-lg">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-amber-200 text-xs font-medium uppercase tracking-wider">Today's Revenue</p>
                <p className="text-3xl font-bold mt-1">R{todayRevenue.toLocaleString()}</p>
              </div>
              <DollarSign className="h-8 w-8 text-amber-300" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500 to-indigo-700 text-white border-none shadow-lg">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-200 text-xs font-medium uppercase tracking-wider">Weekly Revenue</p>
                <p className="text-3xl font-bold mt-1">R{weekRevenue.toLocaleString()}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-300" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <nav className="flex gap-1 bg-gray-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white dark:bg-slate-700 text-[#1e3a5f] dark:text-slate-100 shadow-sm'
                : 'text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
            {tab.count > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                activeTab === tab.id ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' : 'bg-gray-200 text-gray-600 dark:bg-slate-600 dark:text-slate-300'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Content */}
      {activeTab === 'analytics' ? (
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="dark:bg-slate-900 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 dark:text-slate-100">
                <Activity className="h-5 w-5 text-purple-500" /> Treatment Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const treatmentMap: Record<string, { count: number; revenue: number }> = {};
                appointments.forEach(a => {
                  if (!treatmentMap[a.treatmentName]) treatmentMap[a.treatmentName] = { count: 0, revenue: 0 };
                  treatmentMap[a.treatmentName].count++;
                  treatmentMap[a.treatmentName].revenue += a.price;
                });
                const entries = Object.entries(treatmentMap).sort((a, b) => b[1].count - a[1].count);
                if (entries.length === 0) return <p className="text-gray-500 dark:text-slate-400 text-sm">No data available yet.</p>;
                const maxCount = Math.max(...entries.map(e => e[1].count));
                return (
                  <div className="space-y-3">
                    {entries.map(([name, data]) => (
                      <div key={name}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium dark:text-slate-200 truncate max-w-[60%]">{name}</span>
                          <span className="text-gray-500 dark:text-slate-400">{data.count} bookings · R{data.revenue.toLocaleString()}</span>
                        </div>
                        <div className="h-2 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all" style={{ width: `${(data.count / maxCount) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          <Card className="dark:bg-slate-900 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 dark:text-slate-100">
                <Sparkles className="h-5 w-5 text-amber-500" /> AI Insights
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {todayTotal > 0 && (
                <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800">
                  <p className="text-sm font-medium text-purple-800 dark:text-purple-300">📅 Today's Load</p>
                  <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                    You have {todayTotal} appointment{todayTotal !== 1 ? 's' : ''} scheduled today.
                    {todayAppointments.filter(a => a.status === 'confirmed').length > 0 &&
                      ` ${todayAppointments.filter(a => a.status === 'confirmed').length} still need to be checked in.`}
                  </p>
                </div>
              )}
              {appointments.filter(a => a.status === 'in_progress').length > 0 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-800">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">🟣 Active Treatments</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    {appointments.filter(a => a.status === 'in_progress').length} treatment{appointments.filter(a => a.status === 'in_progress').length !== 1 ? 's are' : ' is'} currently in progress.
                  </p>
                </div>
              )}
              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-800">
                <p className="text-sm font-medium text-green-800 dark:text-green-300">💰 Revenue Summary</p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  Today: R{todayRevenue.toLocaleString()} · This Week: R{weekRevenue.toLocaleString()}
                </p>
              </div>
              {(() => {
                const mostPopular = Object.entries(
                  appointments.reduce((acc, a) => {
                    acc[a.treatmentName] = (acc[a.treatmentName] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>)
                ).sort((a, b) => b[1] - a[1])[0];
                if (!mostPopular) return null;
                return (
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-300">⭐ Most Popular</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      "{mostPopular[0]}" is your most booked treatment with {mostPopular[1]} bookings.
                    </p>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-3">
          {getCurrentList().length === 0 ? (
            <Card className="dark:bg-slate-900 dark:border-slate-800">
              <CardContent className="p-12 text-center">
                <Flower2 className="h-12 w-12 text-gray-300 dark:text-slate-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-500 dark:text-slate-400">
                  {activeTab === 'today' ? "No appointments scheduled for today" :
                   activeTab === 'upcoming' ? "No upcoming appointments" :
                   "No history to display"}
                </h3>
                <p className="text-sm text-gray-400 dark:text-slate-500 mt-1">
                  {searchQuery ? "Try a different search term." : "Appointments will appear here when guests book spa treatments."}
                </p>
              </CardContent>
            </Card>
          ) : (
            getCurrentList().map(renderAppointmentCard)
          )}
        </div>
      )}
    </div>
  );
}
