import { useState, useEffect } from 'react';
import { listenForTours, listenForAllTourBookings, checkInForTour, updateTourBookingStatus } from '@/services/firebase-services';
import type { Tour, TourBooking } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { AlertModal } from '@/components/ui/AlertModal';
import { useCentralClock } from '@/components/ui/CentralizedClock';
import {
  Compass, Clock, CheckCircle, XCircle, Loader2, Users,
  DollarSign, CalendarDays, Ticket,
  Sparkles, TrendingUp, ChevronDown, ChevronUp, Sun, CloudRain,
  CloudSun, Cloud
} from 'lucide-react';

const TICKET_LABELS: Record<string, string> = { adult: 'Adult', child: 'Child', pensioner: 'Pensioner' };

interface WeatherDay { date: string; tempMax: number; tempMin: number; code: number; }

function getWeatherIcon(code: number) {
  if (code <= 1) return <Sun className="h-5 w-5 text-amber-400" />;
  if (code <= 3) return <CloudSun className="h-5 w-5 text-blue-400" />;
  if (code <= 48) return <Cloud className="h-5 w-5 text-gray-400" />;
  return <CloudRain className="h-5 w-5 text-blue-500" />;
}

export function TourGuideDashboard() {
  const { user } = useAuth();
  const currentTime = useCentralClock();
  const [tours, setTours] = useState<Tour[]>([]);
  const [allBookings, setAllBookings] = useState<TourBooking[]>([]);
  const [searchRef, setSearchRef] = useState('');
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherDay[]>([]);
  const [activeTab, setActiveTab] = useState<'today' | 'upcoming' | 'analytics'>('today');
  const [alert, setAlert] = useState({ open: false, title: '', message: '', type: 'info' as 'success' | 'error' | 'info' | 'warning' });

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    const u1 = listenForTours(setTours);
    const u2 = listenForAllTourBookings(setAllBookings);
    return () => { u1(); u2(); };
  }, []);

  // Fetch weather
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const pos = await new Promise<GeolocationPosition>((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 }));
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto&forecast_days=5`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.daily) {
          const days: WeatherDay[] = data.daily.time.map((d: string, i: number) => ({
            date: d, tempMax: data.daily.temperature_2m_max[i], tempMin: data.daily.temperature_2m_min[i], code: data.daily.weathercode[i]
          }));
          setWeather(days);
        }
      } catch { /* fallback: no weather */ }
    };
    fetchWeather();
  }, []);

  // Build sessions
  const sessions = tours.flatMap(tour =>
    (tour.schedules || []).filter(slot => slot.date >= today).map(slot => ({
      key: `${tour.id}__${slot.date}__${slot.time}`, tour, slot,
      bookings: allBookings.filter(b => b.tourId === tour.id && b.date === slot.date && b.time === slot.time),
    }))
  ).sort((a, b) => a.slot.date.localeCompare(b.slot.date) || a.slot.time.localeCompare(b.slot.time));

  const todaySessions = sessions.filter(s => s.slot.date === today);
  const upcomingSessions = sessions.filter(s => s.slot.date > today);
  const todayGuests = todaySessions.reduce((s, sess) => 
    s + sess.bookings.reduce((guestSum, b) => 
      guestSum + (b.tickets ? b.tickets.reduce((tkSum, tk) => tkSum + tk.quantity, 0) : 1), 
    0), 
  0);
  const todayRevenue = todaySessions.reduce((s, sess) => s + sess.bookings.reduce((r, b) => r + b.totalAmount, 0), 0);
  const checkedInToday = todaySessions.reduce((s, sess) => 
    s + sess.bookings
      .filter(b => b.status === 'checked_in' || b.status === 'completed' as any)
      .reduce((guestSum, b) => guestSum + (b.tickets ? b.tickets.reduce((tkSum, tk) => tkSum + tk.quantity, 0) : 1), 0), 
  0);

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-ZA', { weekday: 'short', month: 'short', day: 'numeric' });

  const handleCheckIn = async (bookingId: string) => {
    setCheckingIn(bookingId);
    const result = await checkInForTour(bookingId);
    setCheckingIn(null);
    setAlert(result.success
      ? { open: true, title: '✅ Checked In', message: 'Guest checked in successfully.', type: 'success' }
      : { open: true, title: 'Failed', message: result.error || 'Error.', type: 'error' });
  };

  const handleUpdateStatus = async (bookingId: string, status: 'completed' | 'no_show') => {
    setCheckingIn(bookingId);
    const result = await updateTourBookingStatus(bookingId, status);
    setCheckingIn(null);
    setAlert(result.success
      ? { open: true, title: status === 'completed' ? '✅ Completed' : '⚠️ No-Show', message: 'Status updated.', type: 'success' }
      : { open: true, title: 'Failed', message: result.error || 'Error.', type: 'error' });
  };

  const handleSearchCheckIn = () => {
    const ref = searchRef.trim().toUpperCase();
    if (!ref) return;
    const found = allBookings.find(b => b.bookingReference.toUpperCase() === ref || b.id.toUpperCase() === ref);
    if (!found) { setAlert({ open: true, title: 'Not Found', message: `No booking with ref "${searchRef}".`, type: 'warning' }); return; }
    if (found.status === 'checked_in') { setAlert({ open: true, title: 'Already Checked In', message: `${found.guestName} is already checked in.`, type: 'info' }); return; }
    handleCheckIn(found.id);
    setSearchRef('');
  };

  const renderSession = (sess: typeof sessions[0]) => {
    const expanded = expandedSession === sess.key;
    const totalGuests = sess.bookings.reduce((s, b) => s + b.tickets.reduce((t, tk) => t + tk.quantity, 0), 0);
    const checkedIn = sess.bookings.filter(b => b.status === 'checked_in').length;
    const weatherDay = weather.find(w => w.date === sess.slot.date);

    return (
      <Card key={sess.key} className="dark:bg-slate-900 dark:border-slate-800 transition-all hover:shadow-md">
        <CardContent className="p-0">
          <button className="w-full p-4 flex items-center justify-between text-left" onClick={() => setExpandedSession(expanded ? null : sess.key)}>
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                <Compass className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-[#1e3a5f] dark:text-blue-300 truncate">{sess.tour.name}</h3>
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                  <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{formatDate(sess.slot.date)}</span>
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{sess.slot.time}</span>
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{totalGuests} guests</span>
                  {weatherDay && <span className="flex items-center gap-1">{getWeatherIcon(weatherDay.code)} {weatherDay.tempMax}°</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {checkedIn > 0 && <Badge className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 text-[10px]">{checkedIn}/{sess.bookings.length} in</Badge>}
              {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
            </div>
          </button>
          {expanded && (
            <div className="px-4 pb-4 border-t dark:border-slate-800 pt-3 space-y-2 animate-in slide-in-from-top-2 duration-200">
              {sess.bookings.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-slate-500 py-2">No bookings yet for this session.</p>
              ) : sess.bookings.map(b => (
                <div key={b.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
                  <div>
                    <p className="font-medium text-sm dark:text-slate-200">{b.guestName}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      {b.tickets.map(t => `${t.quantity}× ${TICKET_LABELS[t.type] || t.type}`).join(', ')} · R{b.totalAmount} · {b.bookingReference}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {b.status === 'confirmed' && (
                      <>
                        <Button size="sm" onClick={() => handleCheckIn(b.id)} disabled={checkingIn === b.id} className="bg-green-500 hover:bg-green-600 text-white text-xs">
                          {checkingIn === b.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3 mr-1" />} Check In
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleUpdateStatus(b.id, 'no_show')} disabled={checkingIn === b.id} className="text-red-600 border-red-200 text-xs">
                          <XCircle className="h-3 w-3 mr-1" /> No Show
                        </Button>
                      </>
                    )}
                    {b.status === 'checked_in' && (
                      <Button size="sm" onClick={() => handleUpdateStatus(b.id, 'completed')} disabled={checkingIn === b.id} className="bg-blue-500 hover:bg-blue-600 text-white text-xs">
                        {checkingIn === b.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3 mr-1" />} Complete
                      </Button>
                    )}
                    {b.status === 'checked_in' && <Badge className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 text-[10px]">Checked In</Badge>}
                    {(b.status === 'completed' as any) && <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-[10px]">Completed</Badge>}
                    {b.status === 'no_show' && <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 text-[10px]">No Show</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      <AlertModal open={alert.open} onClose={() => setAlert(p => ({ ...p, open: false }))} title={alert.title} message={alert.message} type={alert.type} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-lg">
            <Compass className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-serif font-bold text-[#1e3a5f] dark:text-blue-400">Tour Guide Console</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              Welcome, {user?.name || 'Guide'} · {currentTime.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative">
            <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="Scan booking ref..." value={searchRef} onChange={e => setSearchRef(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearchCheckIn()}
              className="pl-9 w-52 dark:bg-slate-800 dark:border-slate-700 dark:text-white" />
          </div>
          <Button onClick={handleSearchCheckIn} className="bg-green-500 hover:bg-green-600 text-white" size="sm">
            <CheckCircle className="h-4 w-4 mr-1" /> Quick Check-In
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-amber-500 to-orange-600 text-white border-none shadow-lg">
          <CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-amber-200 text-xs font-medium uppercase tracking-wider">Today's Tours</p><p className="text-3xl font-bold mt-1">{todaySessions.length}</p></div><CalendarDays className="h-8 w-8 text-amber-300" /></div></CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500 to-emerald-700 text-white border-none shadow-lg">
          <CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-green-200 text-xs font-medium uppercase tracking-wider">Guests Today</p><p className="text-3xl font-bold mt-1">{todayGuests}</p></div><Users className="h-8 w-8 text-green-300" /></div></CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500 to-indigo-700 text-white border-none shadow-lg">
          <CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-blue-200 text-xs font-medium uppercase tracking-wider">Checked In</p><p className="text-3xl font-bold mt-1">{checkedInToday}</p></div><CheckCircle className="h-8 w-8 text-blue-300" /></div></CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500 to-pink-600 text-white border-none shadow-lg">
          <CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-purple-200 text-xs font-medium uppercase tracking-wider">Today's Revenue</p><p className="text-3xl font-bold mt-1">R{todayRevenue.toLocaleString()}</p></div><DollarSign className="h-8 w-8 text-purple-300" /></div></CardContent>
        </Card>
      </div>

      {/* Weather Strip */}
      {weather.length > 0 && (
        <Card className="dark:bg-slate-900 dark:border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sun className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-semibold text-[#1e3a5f] dark:text-blue-300">Excursion Weather Forecast</span>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-1">
              {weather.map(w => (
                <div key={w.date} className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg min-w-[80px] ${w.date === today ? 'bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-300 dark:ring-amber-700' : 'bg-gray-50 dark:bg-slate-800'}`}>
                  <span className="text-[10px] font-medium text-gray-500 dark:text-slate-400">{new Date(w.date).toLocaleDateString('en-ZA', { weekday: 'short' })}</span>
                  {getWeatherIcon(w.code)}
                  <span className="text-xs font-bold dark:text-slate-200">{w.tempMax}°</span>
                  <span className="text-[10px] text-gray-400 dark:text-slate-500">{w.tempMin}°</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <nav className="flex gap-1 bg-gray-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
        {([
          { id: 'today' as const, label: "Today's Tours", icon: CalendarDays, count: todaySessions.length },
          { id: 'upcoming' as const, label: 'Upcoming', icon: Clock, count: upcomingSessions.length },
          { id: 'analytics' as const, label: 'Insights', icon: Sparkles, count: 0 },
        ]).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-white dark:bg-slate-700 text-[#1e3a5f] dark:text-slate-100 shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-800'}`}>
            <tab.icon className="h-4 w-4" /> {tab.label}
            {tab.count > 0 && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' : 'bg-gray-200 text-gray-600 dark:bg-slate-600 dark:text-slate-300'}`}>{tab.count}</span>}
          </button>
        ))}
      </nav>

      {/* Content */}
      {activeTab === 'analytics' ? (
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="dark:bg-slate-900 dark:border-slate-800">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2 dark:text-slate-100"><TrendingUp className="h-5 w-5 text-amber-500" /> Tour Popularity</CardTitle></CardHeader>
            <CardContent>
              {(() => {
                const tourMap: Record<string, number> = {};
                allBookings.forEach(b => { tourMap[b.tourName] = (tourMap[b.tourName] || 0) + 1; });
                const entries = Object.entries(tourMap).sort((a, b) => b[1] - a[1]);
                if (!entries.length) return <p className="text-gray-500 dark:text-slate-400 text-sm">No data yet.</p>;
                const max = entries[0][1];
                return <div className="space-y-3">{entries.map(([name, count]) => (
                  <div key={name}><div className="flex justify-between text-sm mb-1"><span className="font-medium dark:text-slate-200 truncate max-w-[65%]">{name}</span><span className="text-gray-500 dark:text-slate-400">{count} bookings</span></div>
                  <div className="h-2 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full" style={{ width: `${(count/max)*100}%` }} /></div></div>
                ))}</div>;
              })()}
            </CardContent>
          </Card>
          <Card className="dark:bg-slate-900 dark:border-slate-800">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2 dark:text-slate-100"><Sparkles className="h-5 w-5 text-purple-500" /> Smart Insights</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {todaySessions.length > 0 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-800">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">📋 Today's Schedule</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{todaySessions.length} tour{todaySessions.length !== 1 ? 's' : ''} with {todayGuests} guest{todayGuests !== 1 ? 's' : ''} total.</p>
                </div>
              )}
              {weather.length > 0 && weather[0].code > 50 && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-800">
                  <p className="text-sm font-medium text-red-800 dark:text-red-300">🌧️ Weather Alert</p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">Rain is expected today. Consider indoor tour alternatives or provide rain gear.</p>
                </div>
              )}
              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-800">
                <p className="text-sm font-medium text-green-800 dark:text-green-300">💰 Revenue</p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">Today: R{todayRevenue.toLocaleString()} · Total bookings: {allBookings.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-3">
          {(activeTab === 'today' ? todaySessions : upcomingSessions).length === 0 ? (
            <Card className="dark:bg-slate-900 dark:border-slate-800">
              <CardContent className="p-12 text-center">
                <Compass className="h-12 w-12 text-gray-300 dark:text-slate-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-500 dark:text-slate-400">{activeTab === 'today' ? 'No tours scheduled for today' : 'No upcoming tours'}</h3>
                <p className="text-sm text-gray-400 dark:text-slate-500 mt-1">Tours will appear here when guests make bookings.</p>
              </CardContent>
            </Card>
          ) : (activeTab === 'today' ? todaySessions : upcomingSessions).map(renderSession)}
        </div>
      )}
    </div>
  );
}
