import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { listenForGuestBooking, checkInGuest } from '@/services/firebase-services';
import { BookingEngine } from '@/components/guest/BookingEngine';
import { RoomService } from '@/components/guest/RoomService';
import { Restaurant } from '@/components/guest/Restaurant';
import { GuestExperience } from '@/components/guest/GuestExperience';
import { BillingView } from '@/components/guest/BillingView';
import { MyReservations } from '@/components/guest/MyReservations';
import { MyOrders } from '@/components/guest/MyOrders';
import { MyTableReservations } from '@/components/guest/MyTableReservations';
import { RoomGallery } from '@/components/guest/RoomGallery';
import { TourBooking } from '@/components/guest/TourBooking';
import { Feedback } from '@/components/guest/Feedback';
import { SpaBooking } from '@/components/guest/SpaBooking';
import { ActivityBoard } from '@/components/guest/ActivityBoard';
import { LoyaltyCard } from '@/components/guest/LoyaltyCard';
import { QRCodeBadge } from '@/components/guest/QRCodeBadge';
import { SmartConcierge } from '@/components/guest/SmartConcierge';
import { DigitalKey } from '@/components/guest/DigitalKey';
import { WeatherWidget } from '@/components/guest/WeatherWidget';
import { MySchedule } from '@/components/guest/MySchedule';
import { AlertModal } from '@/components/ui/AlertModal';
import { MyEventBookings } from '@/components/guest/MyEventBookings'; // <-- New import
import type { Booking, User as AppUser } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Calendar, 
  Home, 
  UtensilsCrossed, 
  MessageSquare, 
  User,
  Clock,
  MapPin,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Lock,
  ShieldCheck,
  Info,
  ClipboardList,
  Package,
  BedDouble,
  Compass,
  Star,
  Sparkles,
  Trophy,
  Heart,
  Briefcase // <-- Added Briefcase import
} from 'lucide-react';

// Added 'my-events' to the end of this TypeScript definition!
type GuestView = 'overview' | 'booking' | 'room-service' | 'restaurant' | 'experience' | 'billing' | 'reservations' | 'my-orders' | 'my-tables' | 'room-gallery' | 'tours' | 'feedback' | 'spa' | 'activity-board' | 'loyalty' | 'digital-key' | 'my-events';

type AuthUserBridge = AppUser & { uid?: string };

export function GuestPortal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState<GuestView>('overview');
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const currentUser = user as AuthUserBridge;
  const currentUserId = currentUser?.id || currentUser?.uid;

  const isResident = currentUser?.status === 'resident';
  const isElevatedGuest = currentUser?.status === 'visitor' || currentUser?.status === 'resident';

  const [bookingAlert, setBookingAlert] = useState({
    open: false,
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'info' | 'warning'
  });

  useEffect(() => {
    if (!currentUserId) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    
    const unsubscribe = listenForGuestBooking(currentUserId, (booking) => {
      if (isMounted) {
        setActiveBooking(booking);
        setIsLoading(false);
      }
    });

    const timeoutId = setTimeout(() => {
      if (isMounted) {
        setIsLoading(false);
      }
    }, 3000);

    return () => {
      isMounted = false;
      unsubscribe();
      clearTimeout(timeoutId);
    };
  }, [currentUserId]);

  const handleSelfCheckIn = async () => {
    if (!activeBooking || !currentUser?.email) return;
    setIsLoading(true);
    try {
      const result = await checkInGuest(activeBooking.id, activeBooking.roomNumber, currentUser.email);
      if (result.success) {
        setBookingAlert({ open: true, title: 'Check-In Successful!', message: 'Welcome to Azure Horizon! Your room and features are now unlocked.', type: 'success' });
        setTimeout(() => window.location.reload(), 2000);
      } else {
        setBookingAlert({ open: true, title: 'Check-In Failed', message: (result as any).error || 'Please visit the front desk.', type: 'error' });
      }
    } catch (e) {
      setBookingAlert({ open: true, title: 'Check-In Error', message: 'An unexpected error occurred.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const today = new Date().toISOString().split('T')[0];
  const canSelfCheckIn = currentUser?.status === 'visitor' && 
                         activeBooking && 
                         activeBooking.status === 'confirmed' && 
                         (activeBooking.paymentStatus === 'paid' || activeBooking.paymentStatus === 'deposit_paid') && 
                         activeBooking.checkInDate <= today;

  const handleActionClick = (viewId: string) => {
    if (viewId === 'venue-booking') {
      navigate('/event-booking');
      return;
    }

    if (viewId === 'booking') {
      const isRegisteredUser = currentUser?.email && currentUser.email !== '';
      
      if (!isRegisteredUser && !isResident) {
        setBookingAlert({
          open: true,
          title: "🔒 Registration Required",
          message: "Room booking is only available for registered members.\n\nPlease click 'Create Member Account' on the login page to register, then log in to book your stay.",
          type: "warning"
        });
        return;
      }
    }
    
    if (viewId === 'room-service' || viewId === 'experience' || viewId === 'billing' || viewId === 'activity-board') {
      if (!isResident) {
        setBookingAlert({
          open: true,
          title: "⛔ Access Restricted",
          message: "This feature is exclusively for guests currently checked into a room.\n\nPlease check in at the front desk to access room service, concierge, and billing.",
          type: "warning"
        });
        return;
      }
    }
    setCurrentView(viewId as GuestView);
  };

  const renderView = () => {
    switch (currentView) {
      case 'booking': return <BookingEngine onBack={() => setCurrentView('overview')} />;
      case 'room-service': return <RoomService onBack={() => setCurrentView('overview')} />;
      case 'restaurant': return <Restaurant onBack={() => setCurrentView('overview')} activeBooking={activeBooking} />;
      case 'experience': return <GuestExperience onBack={() => setCurrentView('overview')} />;
      case 'billing': return <BillingView onBack={() => setCurrentView('overview')} />;
      case 'reservations': return <MyReservations onBack={() => setCurrentView('overview')} />;
      case 'my-orders': return <MyOrders onBack={() => setCurrentView('overview')} />;
      case 'my-tables': return <MyTableReservations onBack={() => setCurrentView('overview')} />;
      case 'room-gallery': return <RoomGallery onBack={() => setCurrentView('overview')} />;
      case 'tours': return <TourBooking onBack={() => setCurrentView('overview')} />;
      case 'feedback': return <Feedback onBack={() => setCurrentView('overview')} />;
      case 'spa': return <SpaBooking onBack={() => setCurrentView('overview')} activeBooking={activeBooking} />;
      case 'activity-board': return <ActivityBoard onBack={() => setCurrentView('overview')} />;
      case 'loyalty': return <LoyaltyCard onBack={() => setCurrentView('overview')} />;
      case 'digital-key': return <DigitalKey roomNumber={currentUser?.roomNumber || activeBooking?.roomNumber || ''} guestName={currentUser?.name || ''} />;
      
      // FIXED SYNTAX HERE:
      case 'my-events': return <MyEventBookings onBack={() => setCurrentView('overview')} />;
      
      default: return null;
    }
  };

  if (currentView !== 'overview') {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-500 text-gray-900 dark:text-gray-100">
        <Button
          variant="ghost"
          onClick={() => setCurrentView('overview')}
          className="mb-4 text-[#1e3a5f] dark:text-blue-400 hover:bg-[#1e3a5f]/5 dark:hover:bg-blue-400/10"
        >
          <ChevronLeft className="mr-2 h-4 w-4" /> Back to Dashboard
        </Button>
        {renderView()}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <AlertModal
        open={bookingAlert.open}
        onClose={() => setBookingAlert(prev => ({ ...prev, open: false }))}
        title={bookingAlert.title}
        message={bookingAlert.message}
        type={bookingAlert.type}
      />

      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-[#1e3a5f] dark:text-white">
            Welcome, {currentUser?.name || 'Guest'}!
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1 italic">Azure Horizon Resort Management Portal</p>
        </div>
        <div className="flex items-center gap-2">
          {isResident ? (
            <Badge className="bg-green-600 text-white border-none px-3 py-1 flex items-center gap-1 shadow-sm">
              <ShieldCheck className="h-3 w-3" /> Verified Resident
            </Badge>
          ) : isElevatedGuest ? (
            <Badge className="bg-[#1e3a5f] text-white border-none px-3 py-1 flex items-center gap-1 shadow-sm">
              <User className="h-3 w-3" /> Registered Member
            </Badge>
          ) : (
            <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 px-3 py-1 flex items-center gap-1">
              <Info className="h-3 w-3" /> Visitor Mode
            </Badge>
          )}
        </div>
      </div>

      <WeatherWidget />

      <MySchedule user={currentUser as any} />

      <div className="mb-8">
        <SmartConcierge 
          user={currentUser as any} 
          activeBooking={activeBooking} 
          onViewAction={handleActionClick} 
        />
      </div>

      {isLoading ? (
        <Card className="mb-8 border-none shadow-sm bg-gray-50">
          <CardContent className="p-12 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[#1e3a5f]" />
          </CardContent>
        </Card>
      ) : activeBooking ? (
        <Card className="mb-8 bg-gradient-to-r from-[#1e3a5f] to-[#2c5282] text-white border-0 shadow-xl overflow-hidden relative">
          <CardContent className="p-6 relative z-10">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Badge className="bg-[#c9a227] text-white border-none">Active Reservation</Badge>
                  <span className="text-white/80 text-sm font-medium">
                    Room {currentUser?.roomNumber || activeBooking.roomNumber}
                  </span>
                </div>
                <h2 className="text-2xl font-semibold">{activeBooking.roomName}</h2>
                <div className="flex flex-wrap gap-4 mt-4 text-sm text-white/80">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-[#c9a227]" />
                    <span>{activeBooking.checkInDate} — {activeBooking.checkOutDate}</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {canSelfCheckIn && (
                  <Button 
                    className="bg-emerald-500 text-white hover:bg-emerald-600 border-none shadow-md"
                    onClick={handleSelfCheckIn}
                  >
                    Complete Self Check-In
                  </Button>
                )}
                <Button 
                  variant="secondary" 
                  className="bg-white/10 text-white hover:bg-white/20 border-white/20 backdrop-blur-sm"
                  onClick={() => setCurrentView('reservations')}
                >
                  Manage Booking
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="mb-8 border-dashed border-2 border-gray-200 bg-gray-50/50">
          <CardContent className="p-8 text-center">
            <p className="text-gray-500 mb-4">
              {currentUser?.status === 'visitor' 
                ? "You are logged in as a visitor. Ready to book your retreat?" 
                : "You are currently browsing. Sign up to book a room!"}
            </p>
            <Button className="bg-[#1e3a5f]" onClick={() => handleActionClick('booking')}>
              View Available Suites
            </Button>
          </CardContent>
        </Card>
      )}

      {isResident && activeBooking && (
        <div className="mb-8">
          <QRCodeBadge />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {[
          { id: 'booking', title: 'Suites & Villas', sub: activeBooking ? 'View Stay' : 'Book a Room', icon: Calendar, color: 'text-[#1e3a5f]', bg: 'bg-[#1e3a5f]/10', image: '/room-ocean-view.jpg', locked: false },
          { id: 'venue-booking', title: 'Event Venues', sub: 'Reserve Event Spaces', icon: Calendar, color: 'text-indigo-600', bg: 'bg-indigo-50', image: '/resort-exterior.jpg', locked: false },
          
          // Added the My Events Card here
          { id: 'my-events', title: 'My Event Bookings', sub: 'Venues & Catering', icon: Briefcase, color: 'text-blue-600', bg: 'bg-blue-50', image: '/gallery-sunset.jpg', locked: false },
          
          { id: 'room-gallery', title: 'Room Gallery', sub: 'View All Rooms', icon: BedDouble, color: 'text-rose-600', bg: 'bg-rose-50', image: '/room-penthouse.jpg', locked: false },
          { id: 'reservations', title: 'My Reservations', sub: 'View & Cancel Bookings', icon: Calendar, color: 'text-purple-600', bg: 'bg-purple-50', image: '/lobby-interior.jpg', locked: false },
          { id: 'my-orders', title: 'My Orders', sub: 'Track & Download', icon: Package, color: 'text-indigo-600', bg: 'bg-indigo-50', image: '/food/chocolate-lava-cake.jpg', locked: false },
          { id: 'my-tables', title: 'My Tables', sub: 'View Reservations', icon: Calendar, color: 'text-teal-600', bg: 'bg-teal-50', image: '/food/signature-cocktail.jpg', locked: false },
          { id: 'tours', title: 'Tours & Excursions', sub: 'Book Adventures', icon: Compass, color: 'text-amber-600', bg: 'bg-amber-50', image: '/gallery-sunset.jpg', locked: false },
          { id: 'spa', title: 'Spa Services', sub: 'Book Treatments', icon: Sparkles, color: 'text-fuchsia-600', bg: 'bg-fuchsia-50', image: '/amenity-spa.jpg', locked: false },
          { id: 'room-service', title: 'Room Service', sub: 'Housekeeping & Repairs', icon: Home, color: 'text-[#e07a5f]', bg: 'bg-[#e07a5f]/10', image: '/room-garden.jpg', locked: !isResident },
          { id: 'restaurant', title: 'Restaurant', sub: 'Dine-in & Takeaway', icon: UtensilsCrossed, color: 'text-[#4a7c9b]', bg: 'bg-[#4a7c9b]/10', image: '/amenity-dining.jpg', locked: false },
          { id: 'experience', title: 'Guest Concierge', sub: 'Live Chat Support', icon: MessageSquare, color: 'text-[#c9a227]', bg: 'bg-[#c9a227]/10', image: '/contact-image.jpg', locked: !isResident },
          { id: 'billing', title: 'My Bill', sub: 'Slips & Balance', icon: ClipboardList, color: 'text-green-600', bg: 'bg-green-50', image: '/resort-exterior.jpg', locked: !isResident },
          { id: 'activity-board', title: 'Activity Board', sub: 'Connect with Guests', icon: Heart, color: 'text-pink-600', bg: 'bg-pink-50', image: '/gallery-sunset.jpg', locked: !isResident },
          { id: 'loyalty', title: 'Loyalty & Rewards', sub: 'Points & Perks', icon: Trophy, color: 'text-amber-600', bg: 'bg-amber-50', image: '/amenity-pool.jpg', locked: false },
          { id: 'feedback', title: 'Leave Review', sub: 'Rate Your Experience', icon: Star, color: 'text-yellow-500', bg: 'bg-yellow-50', image: '/hero-bg.jpg', locked: false }
        ].map((item) => (
          <Card 
            key={item.id}
            className={`group cursor-pointer hover:shadow-xl transition-all duration-300 border-none shadow-sm ring-1 ring-gray-100 dark:ring-slate-800 bg-white dark:bg-slate-900 relative overflow-hidden flex flex-col ${item.locked ? 'opacity-70 grayscale-[0.5]' : ''}`}
            onClick={() => handleActionClick(item.id)}
          >
            <div 
              className="h-32 w-full relative"
              style={{ backgroundImage: `url(${item.image})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
            >
              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
              {item.locked && (
                <div className="absolute inset-0 bg-white/40 dark:bg-slate-950/60 flex items-center justify-center backdrop-blur-[2px] z-10">
                  <Lock className="h-8 w-8 text-[#1e3a5f] dark:text-slate-400" />
                </div>
              )}
            </div>
            <CardContent className="p-6 flex-1 flex flex-col bg-white dark:bg-slate-900">
              <div className={`w-10 h-10 rounded-xl mb-3 flex items-center justify-center -mt-10 relative z-20 shadow-md ${item.bg} dark:brightness-75`}>
                <item.icon className={`h-5 w-5 ${item.color}`} />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-1 leading-tight">{item.title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium flex-1">{item.sub}</p>
              
              <div className="mt-4 flex items-center text-sm font-semibold text-[#1e3a5f] dark:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                {item.locked ? 'Unlock at Check-in' : 'Access Portal'} <ChevronRight className="ml-1 h-4 w-4" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-6 mt-12">
        <Card className="border-none shadow-sm bg-white dark:bg-slate-900">
          <CardContent className="p-6">
            <MapPin className="h-6 w-6 text-[#1e3a5f] dark:text-blue-400 mb-4" />
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Resort Location</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400">123 Paradise Drive, Coastal Bay</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white dark:bg-slate-900">
          <CardContent className="p-6">
            <Clock className="h-6 w-6 text-[#1e3a5f] dark:text-blue-400 mb-4" />
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Check-in / Out</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400">In: 3:00 PM | Out: 11:00 AM</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white dark:bg-slate-900">
          <CardContent className="p-6">
            <UtensilsCrossed className="h-6 w-6 text-[#1e3a5f] dark:text-blue-400 mb-4" />
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Public Dining</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400">Open to visitors: 08:00 — 22:00</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}