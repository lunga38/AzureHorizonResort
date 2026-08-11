import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { db, awardLoyaltyPoints } from '@/services/firebase-services';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertModal } from '@/components/ui/AlertModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  Clock, CheckCircle, 
  ChevronRight, CreditCard, CalendarPlus, Star, HelpCircle, Loader2, FileText
} from 'lucide-react';
import { generateICS } from '@/utils/calendar';
import { toast } from 'sonner';
import { usePaystackPayment } from 'react-paystack';
import type { User as AppUser } from '@/types';

type AuthUserBridge = AppUser & { uid?: string };

interface SpaBookingProps {
  onBack: () => void;
  activeBooking?: import('@/types').Booking | null;
}

const SPA_TREATMENTS = [
  {
    id: 'spa-1',
    name: 'Deep Tissue Massage',
    description: 'A therapeutic massage focused on releasing muscle tension and knots. Ideal for recovery and deep relaxation.',
    duration: '60 min',
    price: 850,
    image: 'https://images.unsplash.com/photo-1600334129128-685c5582fd35?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'spa-2',
    name: 'Hot Stone Therapy',
    description: 'Smooth, heated stones are placed on specific parts of your body to promote relaxation and help open up the energy pathways.',
    duration: '90 min',
    price: 1100,
    image: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'spa-3',
    name: 'Rejuvenating Facial',
    description: 'A customized facial treatment designed to cleanse, exfoliate, and nourish your skin, promoting a clear, well-hydrated complexion.',
    duration: '45 min',
    price: 650,
    image: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'spa-4',
    name: 'Couples Retreat',
    description: 'Enjoy a simultaneous relaxing Swedish massage in our tranquil couples suite, complete with complimentary champagne.',
    duration: '90 min',
    price: 1800,
    image: 'https://images.unsplash.com/photo-1519823551278-64ac92734fb1?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
  }
];

const THERAPISTS = [
  { id: 'any', name: 'No Preference', rating: null, reviews: null },
  { id: 't1', name: 'Sarah Jenkins', specialty: 'Massage Specialist', rating: 4.9, reviews: 124 },
  { id: 't2', name: 'Michael Chen', specialty: 'Deep Tissue Expert', rating: 4.8, reviews: 89 },
  { id: 't3', name: 'Elena Rodriguez', specialty: 'Aesthetician', rating: 4.9, reviews: 156 }
];

export function SpaBooking({ onBack, activeBooking }: SpaBookingProps) {
  const { user } = useAuth();
  const currentUser = user as AuthUserBridge;
  
  const [step, setStep] = useState<'browse' | 'schedule' | 'success'>('browse');
  const [selectedTreatment, setSelectedTreatment] = useState<typeof SPA_TREATMENTS[0] | null>(null);
  const [selectedTherapist, setSelectedTherapist] = useState(THERAPISTS[0].id);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [bookedTimes, setBookedTimes] = useState<string[]>([]);
  const [isLoadingTimes, setIsLoadingTimes] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingRef, setBookingRef] = useState('');
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [quizStep, setQuizStep] = useState(0);
  
  const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || 'pk_test_placeholder_key_please_replace';
  
  const isResident = currentUser?.status === 'resident';

  const [alert, setAlert] = useState({ open: false, title: '', message: '', type: 'info' as 'success' | 'error' | 'warning' });

  useEffect(() => {
    if (!selectedDate || !selectedTherapist) return;
    
    const fetchBookedTimes = async () => {
      setIsLoadingTimes(true);
      try {
        const q = query(
          collection(db, 'spa_bookings'),
          where('date', '==', selectedDate),
          where('therapistId', '==', selectedTherapist),
          where('status', 'in', ['confirmed', 'checked_in'])
        );
        const snapshot = await getDocs(q);
        const times = snapshot.docs.map(doc => doc.data().time as string);
        setBookedTimes(times);
      } catch (error) {
        console.error('Error fetching booked times:', error);
      } finally {
        setIsLoadingTimes(false);
      }
    };
    
    fetchBookedTimes();
  }, [selectedDate, selectedTherapist]);

  // Generate available times based on date and exclude booked times
  const getAvailableTimes = () => {
    const allTimes = ['09:00', '10:30', '13:00', '14:30', '16:00', '17:30'];
    return allTimes.filter(time => !bookedTimes.includes(time));
  };

  const handleSelectTreatment = (treatment: typeof SPA_TREATMENTS[0]) => {
    setSelectedTreatment(treatment);
    // Auto-select tomorrow as default
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setSelectedDate(tomorrow.toISOString().split('T')[0]);
    setStep('schedule');
    setIsQuizOpen(false);
    toast.info(`Selected ${treatment.name}`, { description: 'Please choose a date and time.' });
  };

  const processBooking = async (paymentMethod: 'paystack' | 'room_charge') => {
    setIsSubmitting(true);
    try {
      const ref = `SPA-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      const bookingData = {
        guestId: currentUser?.id || currentUser?.uid || 'anonymous',
        guestName: currentUser?.name || 'Anonymous Guest',
        treatmentId: selectedTreatment!.id,
        treatmentName: selectedTreatment!.name,
        therapistId: selectedTherapist,
        date: selectedDate,
        time: selectedTime,
        price: selectedTreatment!.price,
        bookingReference: ref,
        status: 'confirmed',
        paymentMethod,
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, 'spa_bookings'), bookingData);
      
      // Award loyalty points (1 point per R10 spent)
      const pts = Math.floor(selectedTreatment!.price / 10);
      if (pts > 0) {
        awardLoyaltyPoints(
          currentUser?.id || currentUser?.uid || '',
          currentUser?.email || '',
          pts,
          `Spa: ${selectedTreatment!.name}`
        );
      }

      setBookingRef(ref);
      setStep('success');
    } catch (error) {
      console.error('Error booking spa:', error);
      setAlert({ open: true, title: 'Booking Failed', message: 'There was an error securing your appointment.', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChargeToRoom = async () => {
    if (!selectedTreatment || !selectedDate || !selectedTime) return;
    
    if (!activeBooking) {
      setAlert({
        open: true,
        title: "Error",
        message: "No active room booking found to charge to.",
        type: "error"
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      const guestId = currentUser?.id || currentUser?.uid || '';
      
      // Save spa booking officially
      const bookingData = {
        guestId,
        guestName: currentUser?.name || 'Guest',
        treatmentId: selectedTreatment.id,
        treatmentName: selectedTreatment.name,
        therapistId: selectedTherapist,
        date: selectedDate,
        time: selectedTime,
        status: 'confirmed',
        price: selectedTreatment.price,
        createdAt: new Date().toISOString()
      };
      
      const docRef = await addDoc(collection(db, 'spa_bookings'), bookingData);
      
      // CHARGE TO ROOM BILL
      const { addRoomCharge } = await import('@/services/firebase-services');
      await addRoomCharge(
        activeBooking.id, 
        guestId, 
        `Spa: ${selectedTreatment.name} (${selectedDate} at ${selectedTime})`, 
        selectedTreatment.price
      );
      
      // Award loyalty points
      const pts = Math.floor(selectedTreatment.price / 10);
      if (pts > 0) {
        awardLoyaltyPoints(guestId, currentUser?.email || '', pts, `Spa Booking: ${selectedTreatment.name}`);
      }
      
      setBookingRef(docRef.id);
      setStep('success');
    } catch (error) {
      console.error('Error booking spa:', error);
      setAlert({
        open: true,
        title: "Booking Failed",
        message: "We couldn't process your booking. Please try again or contact the front desk.",
        type: "error"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const paystackConfig = {
    reference: `SPA-${new Date().getTime()}`,
    email: currentUser?.email || 'guest@azurehorizon.com',
    amount: (selectedTreatment?.price || 0) * 100, // in cents
    publicKey: PAYSTACK_PUBLIC_KEY,
    currency: 'ZAR',
  };

  const initializePayment = usePaystackPayment(paystackConfig);

  const handlePayWithCard = () => {
    if (!selectedDate || !selectedTime) {
      setAlert({ open: true, title: 'Incomplete', message: 'Please select a date and time.', type: 'warning' });
      return;
    }
    
    if (PAYSTACK_PUBLIC_KEY.includes('placeholder')) {
      setAlert({
        open: true,
        title: 'Payment Gateway Offline',
        message: 'The Paystack payment gateway is not configured for this environment. Please set VITE_PAYSTACK_PUBLIC_KEY.',
        type: 'warning'
      });
      return;
    }

    initializePayment({
      onSuccess: () => processBooking('paystack'),
      onClose: () => toast.error('Payment cancelled')
    });
  };


  if (step === 'success') {
    return (
      <div className="max-w-lg mx-auto text-center space-y-6 py-8 animate-in fade-in duration-500">
        <div className="w-20 h-20 rounded-full bg-purple-100 flex items-center justify-center mx-auto">
          <CheckCircle className="h-10 w-10 text-purple-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Appointment Confirmed!</h2>
          <p className="text-gray-500 mt-1">We look forward to pampering you.</p>
        </div>

        <Card className="border-none shadow-lg text-left">
          <CardContent className="p-6 space-y-4">
            <div className="bg-[#1e3a5f] text-white rounded-lg p-4 text-center">
              <p className="text-xs uppercase tracking-widest text-white/70 mb-1">Booking Reference</p>
              <p className="text-3xl font-mono font-bold tracking-widest">{bookingRef}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 text-sm">
              <div className="col-span-2">
                <p className="text-gray-400 text-xs">Treatment</p>
                <p className="font-semibold text-gray-800">{selectedTreatment?.name}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Date</p>
                <p className="font-semibold text-gray-800">{new Date(selectedDate).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Time</p>
                <p className="font-semibold text-gray-800">{selectedTime}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button 
            className="flex-1 bg-white text-[#1e3a5f] border-2 border-[#1e3a5f] hover:bg-blue-50" 
            onClick={() => {
              if (!selectedTreatment || !selectedDate || !selectedTime) return;
              const start = new Date(`${selectedDate}T${selectedTime}`);
              const durationInMinutes = parseInt(selectedTreatment.duration.split(' ')[0]);
              const end = new Date(start.getTime() + durationInMinutes * 60000);
              generateICS({
                title: `Spa Appointment: ${selectedTreatment.name}`,
                description: `Booking Reference: ${bookingRef}\nDuration: ${selectedTreatment.duration}`,
                location: 'Azure Spa, Level 2, Azure Horizon Resort',
                startDate: start,
                endDate: end
              });
            }}
          >
            <CalendarPlus className="mr-2 h-4 w-4" /> Add to Calendar
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

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <button onClick={onBack} className="hover:text-[#1e3a5f] transition-colors">Dashboard</button>
        <ChevronRight className="h-4 w-4" />
        <button onClick={() => setStep('browse')} className={step === 'browse' ? 'text-[#1e3a5f] font-medium' : 'hover:text-[#1e3a5f]'}>
          Spa Services
        </button>
        {step === 'schedule' && (
          <><ChevronRight className="h-4 w-4" /><span className="text-[#1e3a5f] font-medium">Schedule</span></>
        )}
      </div>

      {step === 'browse' && (
        <>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-serif font-bold text-[#1e3a5f]">Spa & Wellness</h1>
              <p className="text-gray-500 mt-1">Rejuvenate your body and mind with our signature treatments.</p>
            </div>
            <Button 
              onClick={() => { setIsQuizOpen(true); setQuizStep(0); }} 
              className="bg-purple-100 hover:bg-purple-200 text-purple-700 border-none shadow-sm"
            >
              <HelpCircle className="h-4 w-4 mr-2" /> Help Me Choose
            </Button>
          </div>

          <Dialog open={isQuizOpen} onOpenChange={setIsQuizOpen}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Treatment Recommender</DialogTitle>
                <DialogDescription>Let us find the perfect treatment for you.</DialogDescription>
              </DialogHeader>
              <div className="py-4">
                {quizStep === 0 && (
                  <div className="space-y-4 animate-in fade-in">
                    <p className="text-center font-medium text-gray-800">What is your primary goal today?</p>
                    <div className="grid grid-cols-1 gap-2">
                      <Button variant="outline" onClick={() => setQuizStep(1)} className="justify-start">Reduce Muscle Tension</Button>
                      <Button variant="outline" onClick={() => handleSelectTreatment(SPA_TREATMENTS.find(t => t.id === 'spa-1')!)} className="justify-start">Pure Relaxation & De-stress</Button>
                      <Button variant="outline" onClick={() => handleSelectTreatment(SPA_TREATMENTS.find(t => t.id === 'spa-3')!)} className="justify-start">Skin Rejuvenation</Button>
                      <Button variant="outline" onClick={() => handleSelectTreatment(SPA_TREATMENTS.find(t => t.id === 'spa-4')!)} className="justify-start">Couples Experience</Button>
                    </div>
                  </div>
                )}
                {quizStep === 1 && (
                  <div className="space-y-4 animate-in fade-in">
                    <p className="text-center font-medium text-gray-800">Do you prefer a firmer pressure?</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" onClick={() => handleSelectTreatment(SPA_TREATMENTS.find(t => t.id === 'spa-2')!)}>Yes, deep tissue</Button>
                      <Button variant="outline" onClick={() => handleSelectTreatment(SPA_TREATMENTS.find(t => t.id === 'spa-1')!)}>No, keep it gentle</Button>
                    </div>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {SPA_TREATMENTS.map(treatment => (
              <Card key={treatment.id} className="group cursor-pointer hover:shadow-xl transition-all duration-300 border-none shadow-md overflow-hidden flex flex-col" onClick={() => handleSelectTreatment(treatment)}>
                <div 
                  className="h-48 relative overflow-hidden"
                  style={{ backgroundImage: `url(${treatment.image})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                >
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
                </div>
                <CardContent className="p-5 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg text-gray-900 leading-tight">{treatment.name}</h3>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-medium text-gray-500 mb-3">
                    <span className="flex items-center"><Clock className="h-3 w-3 mr-1" /> {treatment.duration}</span>
                    <span className="text-[#1e3a5f] font-bold">R {treatment.price}</span>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-3 mb-4 flex-1">{treatment.description}</p>
                  <Button variant="outline" className="w-full border-purple-200 text-purple-700 hover:bg-purple-50">
                    Select Treatment
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {step === 'schedule' && selectedTreatment && (
        <div className="max-w-3xl mx-auto">
          <Card className="border-none shadow-lg overflow-hidden">
            <div className="md:flex">
              <div 
                className="md:w-1/3 h-48 md:h-auto relative"
                style={{ backgroundImage: `url(${selectedTreatment.image})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-6">
                  <div className="text-white">
                    <Badge className="bg-purple-500 hover:bg-purple-600 border-none mb-2">{selectedTreatment.duration}</Badge>
                    <h3 className="font-bold text-xl">{selectedTreatment.name}</h3>
                    <p className="text-white/80 font-medium">R {selectedTreatment.price}</p>
                  </div>
                </div>
              </div>
              <div className="md:w-2/3 p-8 space-y-6">
                
                {/* Therapist */}
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">1. Select Therapist (Optional)</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {THERAPISTS.map(t => (
                      <div 
                        key={t.id}
                        className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          selectedTherapist === t.id 
                            ? 'border-[#1e3a5f] bg-blue-50/50 dark:bg-blue-900/20' 
                            : 'border-gray-100 hover:border-gray-200 dark:border-slate-800 dark:hover:border-slate-700'
                        }`}
                        onClick={() => setSelectedTherapist(t.id)}
                      >
                        <p className="font-medium text-sm text-gray-900 dark:text-white">{t.name}</p>
                        {t.specialty && (
                          <div className="flex items-center justify-between mt-1">
                            <p className="text-xs text-gray-500">{t.specialty}</p>
                            {t.rating && (
                              <div className="flex items-center text-xs">
                                <Star className="h-3 w-3 text-amber-400 fill-amber-400 mr-1" />
                                <span className="font-medium text-gray-700 dark:text-gray-300">{t.rating}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Date */}
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">2. Select Date</h4>
                  <input 
                    type="date" 
                    className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                    value={selectedDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => {
                      setSelectedDate(e.target.value);
                      setSelectedTime(''); // Reset time when date changes
                    }}
                  />
                </div>

                {/* Time */}
                {selectedDate && (
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      3. Select Time
                      {isLoadingTimes && <Loader2 className="h-3 w-3 animate-spin text-[#1e3a5f]" />}
                    </h4>
                    {getAvailableTimes().length === 0 ? (
                      <p className="text-sm text-red-500 bg-red-50 p-3 rounded-lg border border-red-100">
                        No available slots for this date and therapist. Please select another date or therapist.
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                        {getAvailableTimes().map(time => (
                          <button
                            key={time}
                            onClick={() => setSelectedTime(time)}
                            className={`py-2 rounded-lg border text-sm text-center transition-colors ${
                              selectedTime === time
                                ? 'border-purple-500 bg-purple-50 text-purple-700 font-medium' 
                                : 'border-gray-200 hover:border-purple-200'
                            }`}
                          >
                            {time}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {isResident ? (
                  <div className="flex gap-3 mt-4">
                    <Button 
                      className="flex-1 bg-white hover:bg-gray-50 text-[#1e3a5f] border-2 border-[#1e3a5f] h-12 text-lg" 
                      disabled={!selectedDate || !selectedTime || isSubmitting}
                      onClick={handleChargeToRoom}
                    >
                      {isSubmitting ? <Loader2 className="animate-spin mr-2 h-5 w-5" /> : <FileText className="mr-2 h-5 w-5" />}
                      Charge to Room
                    </Button>
                    <Button 
                      className="flex-1 bg-[#1e3a5f] hover:bg-[#163058] text-white h-12 text-lg" 
                      disabled={!selectedDate || !selectedTime || isSubmitting}
                      onClick={handlePayWithCard}
                    >
                      {isSubmitting ? <Loader2 className="animate-spin mr-2 h-5 w-5" /> : <CreditCard className="mr-2 h-5 w-5" />}
                      Pay by Card
                    </Button>
                  </div>
                ) : (
                  <Button 
                    className="w-full bg-[#1e3a5f] hover:bg-[#163058] h-12 text-lg mt-4" 
                    disabled={!selectedDate || !selectedTime || isSubmitting}
                    onClick={handlePayWithCard}
                  >
                    {isSubmitting ? <Loader2 className="animate-spin mr-2 h-5 w-5" /> : <CreditCard className="mr-2 h-5 w-5" />}
                    Pay Now
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
