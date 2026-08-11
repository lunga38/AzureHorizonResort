import { useState, useEffect } from 'react';
import { listenForTours, listenForAllTourBookings, checkInForTour, updateTourBookingStatus } from '@/services/firebase-services';
import type { Tour, TourBooking } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { AlertModal } from '@/components/ui/AlertModal';
import {
  Search, CheckCircle, Clock, Users, MapPin,
  UserCheck, ChevronDown, ChevronUp, Loader2, Ticket, AlertTriangle
} from 'lucide-react';

const TICKET_LABELS: Record<string, string> = {
  adult: 'Adult',
  child: 'Child',
  pensioner: 'Pensioner',
};

export function TourCheckIn() {
  const [tours, setTours] = useState<Tour[]>([]);
  const [allBookings, setAllBookings] = useState<TourBooking[]>([]);
  const [searchRef, setSearchRef] = useState('');
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [alert, setAlert] = useState({ open: false, title: '', message: '', type: 'info' as 'success' | 'error' | 'info' | 'warning' });

  useEffect(() => {
    const unsub1 = listenForTours(setTours);
    const unsub2 = listenForAllTourBookings(setAllBookings);
    return () => { unsub1(); unsub2(); };
  }, []);

  const today = new Date().toISOString().split('T')[0];

  // Build sessions: each unique tourId + date + time combo
  const sessions = tours.flatMap(tour =>
    tour.schedules
      .filter(slot => slot.date >= today)
      .map(slot => ({
        key: `${tour.id}__${slot.date}__${slot.time}`,
        tour,
        slot,
        bookings: allBookings.filter(
          b => b.tourId === tour.id && b.date === slot.date && b.time === slot.time
        ),
      }))
  ).sort((a, b) => {
    const dateCompare = a.slot.date.localeCompare(b.slot.date);
    if (dateCompare !== 0) return dateCompare;
    return a.slot.time.localeCompare(b.slot.time);
  });

  const todaySessions = sessions.filter(s => s.slot.date === today);
  const upcomingSessions = sessions.filter(s => s.slot.date > today);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-ZA', { weekday: 'short', month: 'short', day: 'numeric' });

  const handleCheckIn = async (bookingId: string) => {
    setCheckingIn(bookingId);
    const result = await checkInForTour(bookingId);
    setCheckingIn(null);

    if (result.success) {
      setAlert({ open: true, title: '✅ Checked In', message: 'Guest has been successfully checked in for the tour.', type: 'success' });
    } else {
      setAlert({ open: true, title: 'Check-In Failed', message: result.error || 'An error occurred.', type: 'error' });
    }
  };

  const handleUpdateStatus = async (bookingId: string, status: 'completed' | 'no_show') => {
    setCheckingIn(bookingId);
    const result = await updateTourBookingStatus(bookingId, status);
    setCheckingIn(null);

    if (result.success) {
      setAlert({ 
        open: true, 
        title: status === 'completed' ? '✅ Tour Completed' : '⚠️ Marked as No-Show', 
        message: status === 'completed' ? 'Guest has been marked as completed.' : 'Guest has been recorded as a no-show.', 
        type: 'success' 
      });
    } else {
      setAlert({ open: true, title: 'Update Failed', message: result.error || 'An error occurred.', type: 'error' });
    }
  };

  // Quick search by booking reference
  const handleSearchCheckIn = () => {
    const ref = searchRef.trim().toUpperCase();
    if (!ref) return;
    const found = allBookings.find(b => b.bookingReference.toUpperCase() === ref || b.id.toUpperCase() === ref);
    if (!found) {
      setAlert({ open: true, title: 'Not Found', message: `No booking found with reference "${searchRef}".`, type: 'warning' });
      return;
    }
    if (found.status === 'checked_in') {
      setAlert({ open: true, title: 'Already Checked In', message: `${found.guestName} is already checked in for ${found.tourName}.`, type: 'info' });
      return;
    }
    if (found.status === 'cancelled') {
      setAlert({ open: true, title: 'Booking Cancelled', message: `This booking was cancelled and cannot be checked in.`, type: 'error' });
      return;
    }
    handleCheckIn(found.id);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'checked_in':
        return <Badge className="bg-emerald-100 text-emerald-700 border-none text-xs"><CheckCircle className="h-3 w-3 mr-1" />Checked In</Badge>;
      case 'confirmed':
        return <Badge className="bg-blue-100 text-blue-700 border-none text-xs"><Clock className="h-3 w-3 mr-1" />Confirmed</Badge>;
      case 'no_show':
        return <Badge className="bg-red-100 text-red-700 border-none text-xs"><AlertTriangle className="h-3 w-3 mr-1" />No Show</Badge>;
      case 'cancelled':
        return <Badge className="bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 border-none text-xs">Cancelled</Badge>;
      case 'completed':
        return <Badge className="bg-purple-100 text-purple-700 border-none text-xs"><CheckCircle className="h-3 w-3 mr-1" />Completed</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">{status}</Badge>;
    }
  };

  const renderSessionCard = (session: typeof sessions[0], showDate: boolean) => {
    const isExpanded = expandedSession === session.key;
    const confirmedCount = session.bookings.filter(b => b.status === 'confirmed').length;
    const checkedInCount = session.bookings.filter(b => b.status === 'checked_in').length;
    const totalGuests = session.bookings.reduce((sum, b) => sum + b.tickets.reduce((s, t) => s + t.quantity, 0), 0);

    return (
      <Card key={session.key} className="border-none shadow-sm hover:shadow-md transition-shadow">
        <CardContent className="p-0">
          <button
            className="w-full p-5 flex items-center justify-between text-left hover:bg-gray-50/50 dark:hover:bg-slate-800/50 transition-colors"
            onClick={() => setExpandedSession(isExpanded ? null : session.key)}
          >
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-[#1e3a5f]/10 flex items-center justify-center shrink-0">
                <Ticket className="h-6 w-6 text-[#1e3a5f] dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-gray-900 dark:text-slate-100">{session.tour.name}</h3>
                <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-500 dark:text-slate-400">
                  {showDate && <span className="font-medium text-[#1e3a5f] dark:text-blue-400">{formatDate(session.slot.date)}</span>}
                  <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{session.slot.time}</span>
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{totalGuests} guests</span>
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /><span className="truncate max-w-[150px]">{session.tour.locations.split('→')[0]?.trim()}</span></span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-3">
              <div className="text-right text-xs space-y-1">
                <div className="flex items-center gap-1 text-emerald-600 font-medium">{checkedInCount} checked in</div>
                <div className="flex items-center gap-1 text-blue-600">{confirmedCount} pending</div>
              </div>
              {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
            </div>
          </button>

          {isExpanded && (
            <div className="border-t px-5 pb-5 animate-in fade-in duration-200">
              <div className="pt-4 mb-3">
                <p className="text-sm font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wide">Passenger Manifest</p>
              </div>

              {session.bookings.length === 0 ? (
                <div className="text-center py-8 text-gray-400 dark:text-slate-500">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No bookings for this session yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {session.bookings.map(booking => (
                    <div
                      key={booking.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        booking.status === 'checked_in' ? 'bg-emerald-50/50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                          booking.status === 'checked_in' ? 'bg-emerald-500' : 'bg-[#1e3a5f]'
                        }`}>
                          {booking.guestName.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-800 dark:text-slate-100 text-sm">{booking.guestName}</p>
                          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
                            <span className="font-mono">{booking.bookingReference}</span>
                            <span>•</span>
                            <span>{booking.tickets.map(t => `${t.quantity}× ${TICKET_LABELS[t.type]}`).join(', ')}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {getStatusBadge(booking.status)}
                        {booking.status === 'confirmed' && (
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs"
                            onClick={() => handleCheckIn(booking.id)}
                            disabled={checkingIn === booking.id}
                          >
                            {checkingIn === booking.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <><UserCheck className="h-3 w-3 mr-1" />Check In</>
                            )}
                          </Button>
                        )}
                        {booking.status === 'checked_in' && (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              className="bg-purple-600 hover:bg-purple-700 text-white h-8 text-xs"
                              onClick={() => handleUpdateStatus(booking.id, 'completed')}
                              disabled={checkingIn === booking.id}
                            >
                              {checkingIn === booking.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Complete'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200 h-8 text-xs"
                              onClick={() => handleUpdateStatus(booking.id, 'no_show')}
                              disabled={checkingIn === booking.id}
                            >
                              {checkingIn === booking.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'No Show'}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <AlertModal open={alert.open} onClose={() => setAlert(p => ({ ...p, open: false }))} title={alert.title} message={alert.message} type={alert.type} />

      <div>
        <h2 className="text-2xl font-bold text-gray-800 dark:text-slate-100">Tour Check-In</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">Verify bookings and check guests in for their excursions</p>
      </div>

      {/* Quick scan / reference search */}
      <Card className="border-none shadow-sm bg-gradient-to-r from-[#1e3a5f] to-[#2c5282] text-white">
        <CardContent className="p-5">
          <p className="text-sm font-medium text-white/80 mb-3">Quick Check-In by Booking Reference</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={searchRef}
                onChange={e => setSearchRef(e.target.value)}
                placeholder="Enter booking reference (e.g. TB-001)"
                className="pl-9 bg-white text-gray-900 border-none h-10"
                onKeyDown={e => e.key === 'Enter' && handleSearchCheckIn()}
              />
            </div>
            <Button onClick={handleSearchCheckIn} className="bg-[#c9a227] hover:bg-[#b8941f] text-white h-10 px-6">
              <UserCheck className="h-4 w-4 mr-2" /> Check In
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Today's Sessions */}
      <div>
        <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 mb-3 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500" /> Today's Sessions
        </h3>
        {todaySessions.length === 0 ? (
          <Card className="border-dashed border-2 border-gray-200 dark:border-slate-700">
            <CardContent className="py-12 text-center text-gray-400 dark:text-slate-500">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="font-medium">No tour sessions scheduled for today</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {todaySessions.map(s => renderSessionCard(s, false))}
          </div>
        )}
      </div>

      {/* Upcoming Sessions */}
      {upcomingSessions.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 mb-3 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500" /> Upcoming Sessions
          </h3>
          <div className="space-y-3">
            {upcomingSessions.map(s => renderSessionCard(s, true))}
          </div>
        </div>
      )}
    </div>
  );
}
