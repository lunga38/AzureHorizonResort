import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { listenForTours, createTourBooking, awardLoyaltyPoints, db } from '@/services/firebase-services';
import { collection, getDocs, query as fbQuery, where, orderBy, limit as fbLimit } from 'firebase/firestore';
import type { Tour, TourBooking, TourScheduleSlot, TourTicket } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertModal } from '@/components/ui/AlertModal';
import { usePaystackPayment } from 'react-paystack';
import {
  MapPin, Clock, ChevronRight, ChevronLeft,
  CheckCircle, Calendar, Ticket, AlertTriangle, Loader2, CreditCard, FileText,
  Star, MessageCircle, CalendarPlus, Share2, CloudSun
} from 'lucide-react';
import { generateICS } from '@/utils/calendar';
import { generatePDFFromHTML, getProfessionalPDFHTML } from '@/utils/pdfGenerator';
import { toast } from 'sonner';

interface TourReview {
  id: string;
  guestName: string;
  rating: number;
  comments: string;
  createdAt: string;
}

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
}

const AVATAR_COLORS = ['bg-blue-500','bg-emerald-500','bg-violet-500','bg-rose-500','bg-amber-500','bg-cyan-500','bg-indigo-500','bg-pink-500'];
function getAvatarColor(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function getInitials(name: string) { return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2); }

interface TourBookingProps {
  onBack: () => void;
}

type BookingStep = 'browse' | 'schedule' | 'tickets' | 'confirm' | 'success';

const TICKET_LABELS: Record<string, string> = {
  adult: 'Adult',
  child: 'Child (Under 12)',
  pensioner: 'Pensioner (60+)',
};

const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || 'pk_test_placeholder_key_please_replace';

export function TourBooking({ onBack }: TourBookingProps) {
  const { user } = useAuth();
  const [tours, setTours] = useState<Tour[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [step, setStep] = useState<BookingStep>('browse');
  const [selectedTour, setSelectedTour] = useState<Tour | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TourScheduleSlot | null>(null);
  const [tickets, setTickets] = useState<Record<string, number>>({ adult: 1, child: 0, pensioner: 0 });
  const [indemnityAgreed, setIndemnityAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<TourBooking | null>(null);
  const [alert, setAlert] = useState({ open: false, title: '', message: '', type: 'info' as 'success' | 'error' | 'info' | 'warning' });
  const [tourReviews, setTourReviews] = useState<TourReview[]>([]);
  const [activeBooking, setActiveBooking] = useState<any>(null);

  useEffect(() => {
    const unsub = listenForTours((data) => {
      setTours(data.filter(t => t.isActive));
      setIsLoading(false);
    });

    // Fetch tour reviews
    const fetchReviews = async () => {
      try {
        const q = fbQuery(collection(db, 'reviews'), where('category', '==', 'tour'), orderBy('createdAt', 'desc'), fbLimit(10));
        const snap = await getDocs(q);
        setTourReviews(snap.docs.map(d => ({ id: d.id, ...d.data() } as TourReview)));
      } catch (e) { console.error('Error fetching tour reviews:', e); }
    };
    fetchReviews();

    const fetchActiveBooking = async () => {
      const u = user as any;
      if (u?.id || u?.uid) {
        const uid = u.id || u.uid;
        try {
          const bq = fbQuery(collection(db, 'bookings'), where('guestId', '==', uid), where('status', 'in', ['confirmed', 'checked_in']));
          const snap = await getDocs(bq);
          if (!snap.empty) setActiveBooking({ id: snap.docs[0].id, ...snap.docs[0].data() });
        } catch(e) { console.error(e); }
      }
    };
    fetchActiveBooking();

    return unsub;
  }, [user]);

  const tourAvgRating = tourReviews.length > 0
    ? (tourReviews.reduce((s, r) => s + r.rating, 0) / tourReviews.length).toFixed(1)
    : null;

  const totalTickets = Object.values(tickets).reduce((a, b) => a + b, 0);

  const getTotal = () => {
    if (!selectedTour) return 0;
    return (
      (tickets.adult * selectedTour.pricing.adult) +
      (tickets.child * selectedTour.pricing.child) +
      (tickets.pensioner * selectedTour.pricing.pensioner)
    );
  };

  const availableSlots = selectedTour?.schedules.filter(
    s => s.capacity - s.bookedCount > 0
  ) ?? [];

  const handleSelectTour = (tour: Tour) => {
    setSelectedTour(tour);
    setSelectedSlot(null);
    setTickets({ adult: 1, child: 0, pensioner: 0 });
    setIndemnityAgreed(false);
    setStep('schedule');
  };

  const handleSelectSlot = (slot: TourScheduleSlot) => {
    setSelectedSlot(slot);
    setStep('tickets');
  };

  // --- Paystack Integration ---
  const config = {
    reference: `TB-${new Date().getTime().toString()}`,
    email: user?.email || 'guest@azurehorizon.com',
    amount: Math.round(getTotal() * 100),
    publicKey: PAYSTACK_PUBLIC_KEY,
    currency: 'ZAR',
  };

  const initializePayment = usePaystackPayment(config);

  const handlePaystackSuccess = async () => {
    if (!user || !selectedTour || !selectedSlot) return;

    setIsSubmitting(true);
    const ticketItems: TourTicket[] = (['adult', 'child', 'pensioner'] as const)
      .filter(type => tickets[type] > 0)
      .map(type => ({
        type,
        quantity: tickets[type],
        priceEach: selectedTour.pricing[type],
      }));

    const bookingRef = `TB-${Date.now().toString(36).toUpperCase()}`;
    const bookingPayload = {
      tourId: selectedTour.id,
      tourName: selectedTour.name,
      guestId: (user as { id?: string; uid?: string }).id || (user as { id?: string; uid?: string }).uid || '',
      guestName: user.name,
      date: selectedSlot.date,
      time: selectedSlot.time,
      tickets: ticketItems,
      totalAmount: getTotal(),
      status: 'confirmed' as const,
      bookingReference: bookingRef,
    };

    const result = await createTourBooking(bookingPayload);
    setIsSubmitting(false);

    if (result.success) {
      // Award loyalty points (1 point per R10 spent)
      const pts = Math.floor(getTotal() / 10);
      if (pts > 0) {
        const guestId = (user as { id?: string; uid?: string }).id || (user as { id?: string; uid?: string }).uid || '';
        const guestEmail = (user as { email?: string }).email || '';
        awardLoyaltyPoints(guestId, guestEmail, pts, `Tour: ${selectedTour!.name}`);
      }
      setConfirmedBooking({ ...bookingPayload, id: result.bookingId!, createdAt: new Date().toISOString() });
      setStep('success');
    } else {
      setAlert({ open: true, title: 'Booking Failed', message: result.error || 'An error occurred. Please try again.', type: 'error' });
    }
  };

  const handlePaystackClose = () => {
    setIsSubmitting(false);
    console.log('Payment modal closed');
  };

  const initiateBooking = () => {
    if (totalTickets === 0) {
      setAlert({ open: true, title: 'No Tickets', message: 'Please select at least 1 ticket.', type: 'warning' });
      return;
    }
    if (!indemnityAgreed) {
      setAlert({ open: true, title: 'Indemnity Required', message: 'Please agree to the terms and indemnity waiver before confirming.', type: 'warning' });
      return;
    }
    
    if (PAYSTACK_PUBLIC_KEY.includes('placeholder')) {
      window.alert("Please configure your VITE_PAYSTACK_PUBLIC_KEY in the .env file to test actual payments.");
    }
    
    setIsSubmitting(true);
    initializePayment({ onSuccess: handlePaystackSuccess, onClose: handlePaystackClose });
  };

  const handleChargeToRoom = async () => {
    if (totalTickets === 0) {
      setAlert({ open: true, title: 'No Tickets', message: 'Please select at least 1 ticket.', type: 'warning' });
      return;
    }
    if (!indemnityAgreed) {
      setAlert({ open: true, title: 'Indemnity Required', message: 'Please agree to the terms and indemnity waiver before confirming.', type: 'warning' });
      return;
    }
    if (!activeBooking) {
      setAlert({ open: true, title: 'Error', message: 'No active room booking found to charge to.', type: 'error' });
      return;
    }
    
    setIsSubmitting(true);
    try {
      const guestId = (user as any)?.id || (user as any)?.uid || '';
      const totalAmount = getTotal();
      
      // Save tour booking officially
      const ticketItems: TourTicket[] = (['adult', 'child', 'pensioner'] as const)
        .filter(type => tickets[type] > 0)
        .map(type => ({
          type,
          quantity: tickets[type],
          priceEach: selectedTour!.pricing[type],
        }));

      const bookingRef = `TB-${Date.now().toString(36).toUpperCase()}`;
      const bookingPayload = {
        tourId: selectedTour!.id,
        tourName: selectedTour!.name,
        guestId,
        guestName: user?.name || 'Guest',
        date: selectedSlot!.date,
        time: selectedSlot!.time,
        tickets: ticketItems,
        totalAmount,
        status: 'confirmed' as const,
        bookingReference: bookingRef,
        paymentMethod: 'room_charge',
      };

      const result = await createTourBooking(bookingPayload);
      
      if (result.success) {
        // CHARGE TO ROOM BILL
        const { addRoomCharge } = await import('@/services/firebase-services');
        await addRoomCharge(
          activeBooking.id, 
          guestId, 
          `Tour: ${selectedTour!.name} (${selectedSlot!.date})`, 
          totalAmount
        );
        
        // Award loyalty points
        const pts = Math.floor(totalAmount / 10);
        if (pts > 0) {
          awardLoyaltyPoints(guestId, user?.email || '', pts, `Tour Booking: ${selectedTour!.name}`);
        }
        
        setConfirmedBooking({ ...bookingPayload, id: result.bookingId!, createdAt: new Date().toISOString() });
        setStep('success');
      } else {
        setAlert({ open: true, title: 'Booking Failed', message: result.error || 'Failed to book tour.', type: 'error' });
      }
    } catch (e) {
      console.error(e);
      setAlert({ open: true, title: 'Error', message: 'An unexpected error occurred.', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };
  // ----------------------------

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-[#1e3a5f]" />
      </div>
    );
  }

  // ── SUCCESS SCREEN ──
  if (step === 'success' && confirmedBooking) {
    return (
      <div className="max-w-lg mx-auto text-center space-y-6 py-8 animate-in fade-in duration-500">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <CheckCircle className="h-10 w-10 text-green-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Booking Confirmed!</h2>
          <p className="text-gray-500 mt-1">Your excursion has been reserved successfully.</p>
        </div>

        <Card className="border-none shadow-lg text-left">
          <CardContent className="p-6 space-y-4">
            <div className="bg-[#1e3a5f] text-white rounded-lg p-4 text-center">
              <p className="text-xs uppercase tracking-widest text-white/70 mb-1">Booking Reference</p>
              <p className="text-3xl font-mono font-bold tracking-widest">{confirmedBooking.bookingReference}</p>
              <p className="text-xs text-white/60 mt-2">Present this reference at the tour meeting point</p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 text-sm">
              <div>
                <p className="text-gray-400 text-xs">Tour</p>
                <p className="font-semibold text-gray-800">{confirmedBooking.tourName}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Date</p>
                <p className="font-semibold text-gray-800">{formatDate(confirmedBooking.date)}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Time</p>
                <p className="font-semibold text-gray-800">{confirmedBooking.time}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Tickets</p>
                <p className="font-semibold text-gray-800">{confirmedBooking.tickets.map(t => `${t.quantity}x ${TICKET_LABELS[t.type]}`).join(', ')}</p>
              </div>
              <div className="col-span-2 border-t pt-3">
                <p className="text-gray-400 text-xs">Total Paid</p>
                <p className="text-xl font-bold text-[#1e3a5f]">R {confirmedBooking.totalAmount.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button 
            className="flex-1 bg-white text-[#1e3a5f] border-2 border-[#1e3a5f] hover:bg-blue-50" 
            onClick={() => {
              if (!confirmedBooking) return;
              const start = new Date(`${confirmedBooking.date}T${confirmedBooking.time}`);
              const end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // Rough estimate of 2 hours
              generateICS({
                title: `Tour: ${confirmedBooking.tourName}`,
                description: `Booking Reference: ${confirmedBooking.bookingReference}\nTickets: ${confirmedBooking.tickets.map(t => `${t.quantity}x ${TICKET_LABELS[t.type]}`).join(', ')}`,
                location: 'Azure Horizon Resort',
                startDate: start,
                endDate: end
              });
            }}
          >
            <CalendarPlus className="mr-2 h-4 w-4" /> Add to Calendar
          </Button>
          <Button 
            className="flex-1 bg-white text-green-700 border-2 border-green-700 hover:bg-green-50"
            onClick={async () => {
              if (!confirmedBooking) return;
              const details = [
                { label: 'Booking Reference', value: confirmedBooking.bookingReference },
                { label: 'Guest Name', value: confirmedBooking.guestName },
                { label: 'Tour', value: confirmedBooking.tourName },
                { label: 'Date', value: formatDate(confirmedBooking.date) },
                { label: 'Time', value: confirmedBooking.time },
                { label: 'Tickets', value: confirmedBooking.tickets.map(t => `${t.quantity}x ${TICKET_LABELS[t.type]}`).join(', ') }
              ];
              const html = getProfessionalPDFHTML({
                title: 'EXCURSION RECEIPT',
                guestName: confirmedBooking.guestName,
                details: details,
                total: confirmedBooking.totalAmount,
                footer: 'Thank you for booking with Azure Horizon Resort. Please arrive 15 minutes before departure.'
              });
              await generatePDFFromHTML(html, `Tour_Receipt_${confirmedBooking.bookingReference}.pdf`);
            }}
          >
            <FileText className="mr-2 h-4 w-4" /> Download Receipt
          </Button>
          <Button className="flex-1 bg-[#1e3a5f] hover:bg-[#163058]" onClick={onBack}>
            Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <AlertModal open={alert.open} onClose={() => setAlert(p => ({ ...p, open: false }))} title={alert.title} message={alert.message} type={alert.type} />

      {/* Header with breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <button onClick={onBack} className="hover:text-[#1e3a5f] transition-colors">Dashboard</button>
        <ChevronRight className="h-4 w-4" />
        <button onClick={() => step !== 'browse' && setStep('browse')} className={step !== 'browse' ? 'hover:text-[#1e3a5f] cursor-pointer transition-colors' : 'text-[#1e3a5f] font-medium'}>
          Tours & Excursions
        </button>
        {step === 'schedule' && selectedTour && (
          <><ChevronRight className="h-4 w-4" /><span className="text-[#1e3a5f] font-medium">{selectedTour.name}</span></>
        )}
        {(step === 'tickets' || step === 'confirm') && (
          <><ChevronRight className="h-4 w-4" /><span className="text-[#1e3a5f] font-medium">Select Tickets</span></>
        )}
      </div>

      {/* ── BROWSE TOURS ── */}
      {step === 'browse' && (
        <>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
            <div>
              <h1 className="text-3xl font-serif font-bold text-[#1e3a5f] dark:text-white">Tours & Excursions</h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">Discover unforgettable experiences curated by Azure Horizon</p>
            </div>
            {tourAvgRating && (
              <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 px-4 py-2 rounded-full">
                <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                <span className="font-bold text-gray-900 dark:text-white">{tourAvgRating}</span>
                <span className="text-sm text-gray-500 dark:text-gray-400">({tourReviews.length} tour reviews)</span>
              </div>
            )}
          </div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
            {tours.map(tour => {
              const totalAvailable = tour.schedules.reduce((sum, s) => sum + Math.max(0, s.capacity - s.bookedCount), 0);
              return (
                <Card key={tour.id} className="group cursor-pointer hover:shadow-xl transition-all duration-300 border-none shadow-md overflow-hidden bg-white dark:bg-slate-900" onClick={() => handleSelectTour(tour)}>
                  <div 
                    className="h-44 relative overflow-hidden"
                    style={{
                      backgroundImage: tour.images && tour.images.length > 0 ? `url(${tour.images[0]})` : 'none',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      backgroundColor: tour.images && tour.images.length > 0 ? 'transparent' : '#1e3a5f'
                    }}
                  >
                    {(!tour.images || tour.images.length === 0) && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-20">
                        <Ticket className="h-32 w-32 text-white" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors" />
                    <div className="absolute bottom-3 left-3 right-3">
                      <Badge className="bg-[#c9a227] text-white border-none text-xs">{tour.duration}</Badge>
                    </div>
                  </div>
                  <CardContent className="p-5">
                    <h3 className="font-bold text-gray-900 dark:text-white text-lg group-hover:text-[#1e3a5f] dark:group-hover:text-blue-400 transition-colors">{tour.name}</h3>
                    <div className="flex items-start gap-1.5 mt-2 text-xs text-gray-400 dark:text-gray-500">
                      <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span className="line-clamp-1">{tour.locations}</span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-3 line-clamp-2">{tour.description}</p>

                    {/* Inline star rating */}
                    {tourAvgRating && (
                      <div className="flex items-center gap-1.5 mt-3">
                        {[1,2,3,4,5].map(s => (
                          <Star key={s} className={`h-3.5 w-3.5 ${s <= Math.round(Number(tourAvgRating)) ? 'fill-amber-400 text-amber-400' : 'text-gray-200 dark:text-slate-600'}`} />
                        ))}
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">{tourAvgRating} ({tourReviews.length})</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between mt-4 pt-4 border-t dark:border-slate-700">
                      <div>
                        <p className="text-xs text-gray-400 dark:text-gray-500">From</p>
                        <p className="font-bold text-[#1e3a5f] dark:text-blue-400 text-lg">R {Math.min(tour.pricing.adult, tour.pricing.child, tour.pricing.pensioner).toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-400 dark:text-gray-500">{totalAvailable} slots available</p>
                        <div className="flex items-center gap-1 text-emerald-600 text-xs mt-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                          Available
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* ───── Traveller Reviews Section ───── */}
          {tourReviews.length > 0 && (
            <div className="mt-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <MessageCircle className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-serif font-bold text-[#1e3a5f] dark:text-white">Traveller Reviews</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Hear from guests who explored with us</p>
                </div>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                {tourReviews.slice(0, 6).map(review => (
                  <Card key={review.id} className="border-none shadow-sm bg-white dark:bg-slate-900 hover:shadow-md transition-shadow">
                    <CardContent className="p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`w-9 h-9 rounded-full ${getAvatarColor(review.guestName)} flex items-center justify-center text-white text-xs font-bold`}>
                          {getInitials(review.guestName)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{review.guestName}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">{timeAgo(review.createdAt)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 mb-2">
                        {[1,2,3,4,5].map(s => (
                          <Star key={s} className={`h-4 w-4 ${s <= review.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200 dark:text-slate-600'}`} />
                        ))}
                      </div>
                      {review.comments && (
                        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed line-clamp-3">"{review.comments}"</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── SELECT SCHEDULE ── */}
      {step === 'schedule' && selectedTour && (
        <div className="max-w-2xl space-y-6">
          <Button variant="ghost" onClick={() => setStep('browse')} className="text-[#1e3a5f]">
            <ChevronLeft className="h-4 w-4 mr-1" /> Back to Tours
          </Button>
          <Card className="border-none shadow-md">
            <CardHeader className="pb-3 flex flex-row items-start justify-between">
              <div>
                <CardTitle className="text-xl">{selectedTour.name}</CardTitle>
                <div className="flex flex-wrap gap-4 text-sm text-gray-500 mt-2">
                  <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> {selectedTour.duration}</span>
                  <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {selectedTour.locations}</span>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="text-[#1e3a5f] border-[#1e3a5f] hover:bg-blue-50"
                onClick={() => {
                  navigator.clipboard.writeText(`Check out this tour at Azure Horizon: ${selectedTour.name} - ${selectedTour.duration}`);
                  toast.success('Tour info copied to clipboard!');
                }}
              >
                <Share2 className="h-4 w-4 mr-2" /> Share
              </Button>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 text-sm mb-6">{selectedTour.description}</p>
              
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg mb-6 flex items-center gap-3 border border-blue-100 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-300">
                <CloudSun className="h-5 w-5 text-blue-500 shrink-0" />
                <p><strong>Weather Tip:</strong> Coastal conditions expected. Don't forget sunscreen and comfortable walking shoes.</p>
              </div>

              <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-[#1e3a5f]" /> Available Sessions
              </h3>
              <div className="space-y-3">
                {availableSlots.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
                    <p>No available sessions at this time.</p>
                  </div>
                ) : (
                  availableSlots.map((slot, i) => {
                    const spotsLeft = slot.capacity - slot.bookedCount;
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:border-[#1e3a5f] hover:bg-[#1e3a5f]/5 cursor-pointer transition-all group"
                        onClick={() => handleSelectSlot(slot)}
                      >
                        <div>
                          <p className="font-semibold text-gray-900">{formatDate(slot.date)}</p>
                          <p className="text-sm text-gray-500 mt-0.5">{slot.time} departure</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <Badge variant={spotsLeft <= 3 ? 'destructive' : 'secondary'} className="text-xs">
                              {spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'} left
                            </Badge>
                          </div>
                          <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-[#1e3a5f] transition-colors" />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm font-semibold text-gray-700 mb-2">Pricing</p>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  {(['adult', 'child', 'pensioner'] as const).map(type => (
                    <div key={type} className="text-center">
                      <p className="text-gray-400 text-xs">{TICKET_LABELS[type]}</p>
                      <p className="font-bold text-[#1e3a5f]">R {selectedTour.pricing[type]}</p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── SELECT TICKETS & CONFIRM ── */}
      {(step === 'tickets' || step === 'confirm') && selectedTour && selectedSlot && (
        <div className="max-w-2xl space-y-6">
          <Button variant="ghost" onClick={() => setStep('schedule')} className="text-[#1e3a5f]">
            <ChevronLeft className="h-4 w-4 mr-1" /> Back to Schedule
          </Button>

          <Card className="border-none shadow-md">
            <CardHeader>
              <CardTitle className="text-xl">Select Tickets</CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                {selectedTour.name} — {formatDate(selectedSlot.date)} at {selectedSlot.time}
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Ticket selectors */}
              {(['adult', 'child', 'pensioner'] as const).map(type => (
                <div key={type} className="flex items-center justify-between py-3 border-b last:border-b-0">
                  <div>
                    <p className="font-medium text-gray-800">{TICKET_LABELS[type]}</p>
                    <p className="text-sm text-[#1e3a5f] font-semibold">R {selectedTour.pricing[type]}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setTickets(p => ({ ...p, [type]: Math.max(0, p[type] - 1) }))}
                      className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:border-[#1e3a5f] hover:text-[#1e3a5f] transition-colors font-bold text-lg leading-none"
                    >
                      −
                    </button>
                    <span className="w-8 text-center font-bold text-gray-900">{tickets[type]}</span>
                    <button
                      onClick={() => {
                        const spotsLeft = selectedSlot.capacity - selectedSlot.bookedCount;
                        if (totalTickets < spotsLeft) setTickets(p => ({ ...p, [type]: p[type] + 1 }));
                      }}
                      className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:border-[#1e3a5f] hover:text-[#1e3a5f] transition-colors font-bold text-lg leading-none"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}

              {/* Total */}
              <div className="flex items-center justify-between bg-[#1e3a5f]/5 rounded-lg p-4">
                <p className="font-semibold text-gray-800">Total ({totalTickets} ticket{totalTickets !== 1 ? 's' : ''})</p>
                <p className="text-xl font-bold text-[#1e3a5f]">R {getTotal().toLocaleString()}</p>
              </div>

              {/* Indemnity */}
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <input
                    id="indemnity-check"
                    type="checkbox"
                    checked={indemnityAgreed}
                    onChange={e => setIndemnityAgreed(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 accent-[#1e3a5f] cursor-pointer"
                  />
                  <label htmlFor="indemnity-check" className="text-sm text-amber-800 cursor-pointer">
                    <span className="font-semibold">Indemnity & Terms Agreement</span>
                    <br />
                    I acknowledge that participation in this excursion involves inherent risks. I voluntarily assume all risks and release Azure Horizon Resort from any liability for injury, loss, or damages. I confirm all guests meet any age/health requirements for this activity.
                  </label>
                </div>
              </div>

              <div className="space-y-3">
                <Button
                  className="w-full bg-green-600 hover:bg-green-700 h-12 text-base"
                  onClick={initiateBooking}
                  disabled={isSubmitting || totalTickets === 0 || !indemnityAgreed}
                >
                  {isSubmitting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Waiting for Payment...</>
                  ) : (
                    <><CreditCard className="mr-2 h-4 w-4" /> Pay R {getTotal().toLocaleString()} Securely</>
                  )}
                </Button>
                
                {(user as any)?.status === 'resident' && (
                  <>
                    <div className="relative py-2">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-gray-200" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-white px-2 text-gray-500">Or</span>
                      </div>
                    </div>
                    <Button 
                      variant="outline"
                      className="w-full border-[#1e3a5f] text-[#1e3a5f] hover:bg-blue-50 h-12 text-base font-medium"
                      onClick={handleChargeToRoom}
                      disabled={isSubmitting || totalTickets === 0 || !indemnityAgreed}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Charge to Room Bill
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
