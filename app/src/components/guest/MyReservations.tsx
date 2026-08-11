import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { fetchAllGuestCharges, db, extendBooking } from '@/services/firebase-services';
import type { Booking, User as AppUser, Room } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { generatePDFFromHTML, getProfessionalPDFHTML } from '../../utils/pdfGenerator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Calendar, 
  ChevronLeft, 
  Loader2, 
  XCircle, 
  AlertCircle,
  CheckCircle,
  Clock,
  Home,
  Download,
  CalendarPlus
} from 'lucide-react';

interface MyReservationsProps {
  onBack: () => void;
}

type AuthUserBridge = AppUser & { uid?: string };

export function MyReservations({ onBack }: MyReservationsProps) {
  const { user } = useAuth();
  const [reservations, setReservations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<Booking | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedDetails, setSelectedDetails] = useState<Booking | null>(null);
  const [showExtendStayModal, setShowExtendStayModal] = useState(false);
  const [extendStayError, setExtendStayError] = useState<string | null>(null);
  const [extendStaySuccess, setExtendStaySuccess] = useState<string | null>(null);
  const [newCheckOutDate, setNewCheckOutDate] = useState<string>('');

  const currentUser = user as AuthUserBridge;
  const currentUserId = currentUser?.id || currentUser?.uid;

  useEffect(() => {
    const fetchReservations = async () => {
      if (!currentUserId) {
        setIsLoading(false);
        return;
      }

      try {
        const charges = await fetchAllGuestCharges(currentUserId);
        
        const mappedBookings = charges.bookings.map((b: any) => ({ ...b, resType: 'room' }));
        
        const mappedSpa = charges.spaBookings.map((s: any) => ({
          id: s.id,
          resType: 'spa',
          guestName: s.guestName,
          checkInDate: s.date + 'T' + s.time,
          checkOutDate: s.date + 'T' + s.time,
          roomName: 'Spa: ' + s.treatmentName,
          roomNumber: 'Spa',
          numberOfGuests: 1,
          status: s.status,
          totalAmount: s.price,
          createdAt: s.createdAt || s.date
        }));

        const mappedTour = charges.tourBookings.map((t: any) => ({
          id: t.id,
          resType: 'tour',
          guestName: t.guestName,
          checkInDate: t.date + 'T' + t.time,
          checkOutDate: t.date + 'T' + t.time,
          roomName: 'Tour: ' + t.tourName,
          roomNumber: 'Tour',
          numberOfGuests: t.tickets ? t.tickets.reduce((sum: number, tk: any) => sum + tk.quantity, 0) : 1,
          status: t.status,
          totalAmount: t.totalAmount,
          createdAt: t.createdAt || t.date
        }));

        const allReservations = [...mappedBookings, ...mappedSpa, ...mappedTour];
        allReservations.sort((a, b) => new Date(a.checkInDate).getTime() - new Date(b.checkInDate).getTime());
        setReservations(allReservations);
      } catch (error) {
        console.error("Error fetching reservations:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchReservations();
  }, [currentUserId]);

  const handleCancelReservation = async () => {
    if (!selectedReservation) return;
    setIsProcessing(true);
    
    try {
      const bookingRef = doc(db, 'bookings', selectedReservation.id);
      await updateDoc(bookingRef, { status: 'cancelled' });
      
      setReservations(prev => prev.map(b => 
        b.id === selectedReservation.id ? { ...b, status: 'cancelled' } : b
      ));
      
      setShowCancelModal(false);
      setSelectedReservation(null);
    } catch (error) {
      console.error("Cancel failed:", error);
      alert("Failed to cancel reservation. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExtendStay = async () => {
    if (!selectedReservation || !newCheckOutDate) return;
    
    setExtendStayError(null);
    setExtendStaySuccess(null);
    setIsProcessing(true);
    
    try {
      // Get the room to find the price per night
      const roomDoc = await getDocs(query(
        collection(db, 'rooms'),
        where('id', '==', selectedReservation.roomId)
      ));
      
      if (roomDoc.empty) {
        setExtendStayError('Room information not found.');
        setIsProcessing(false);
        return;
      }
      
      const roomData = roomDoc.docs[0].data() as Room;
      const pricePerNight = roomData.price;
      
      // Call the extendBooking function
      const result = await extendBooking(selectedReservation.id, newCheckOutDate, pricePerNight);
      
      if (result.success && result.booking) {
        setExtendStaySuccess('Your stay has been extended successfully!');
        
        // Update local state
        setReservations(prev => prev.map(b => 
          b.id === selectedReservation.id ? result.booking! : b
        ));
        
        // Reset form after a short delay
        setTimeout(() => {
          setShowExtendStayModal(false);
          setNewCheckOutDate('');
          setSelectedReservation(null);
        }, 2000);
      } else {
        setExtendStayError(result.error || 'Failed to extend stay. Please try again.');
      }
    } catch (error) {
      console.error("Extend stay failed:", error);
      setExtendStayError('An error occurred. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const openExtendStayModal = (reservation: Booking) => {
    setSelectedReservation(reservation);
    setNewCheckOutDate('');
    setExtendStayError(null);
    setExtendStaySuccess(null);
    setShowExtendStayModal(true);
  };

  const downloadReservationPDF = async (booking: Booking) => {
    const nights = calculateNights(booking.checkInDate, booking.checkOutDate);
    
    const details = [
      { label: 'Booking ID', value: booking.id },
      { label: 'Status', value: `<span class="status-badge status-${booking.status}">${booking.status.toUpperCase()}</span>` },
      { label: 'Guest Name', value: booking.guestName },
      { label: 'Room', value: booking.roomName },
      { label: 'Room Number', value: booking.roomNumber },
      { label: 'Number of Guests', value: booking.numberOfGuests.toString() },
      { label: 'Check-in Date', value: `${formatDate(booking.checkInDate)} (from 15:00)` },
      { label: 'Check-out Date', value: `${formatDate(booking.checkOutDate)} (by 11:00)` },
      { label: 'Number of Nights', value: `${nights} nights` }
    ];
    
    const html = getProfessionalPDFHTML({
      title: 'RESERVATION INVOICE',
      guestName: booking.guestName,
      details: details,
      total: booking.totalAmount,
      footer: 'Thank you for choosing Azure Horizon Resort. We look forward to welcoming you!'
    });
    
    await generatePDFFromHTML(html, `Reservation_Invoice_${booking.id}.pdf`);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <Badge className="bg-blue-100 text-blue-800 border-none">Confirmed</Badge>;
      case 'checked_in':
        return <Badge className="bg-green-100 text-green-800 border-none">Checked In</Badge>;
      case 'checked_out':
        return <Badge className="bg-gray-100 text-gray-800 border-none">Completed</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-800 border-none">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <Clock className="h-4 w-4 text-blue-500" />;
      case 'checked_in':
        return <Home className="h-4 w-4 text-green-500" />;
      case 'checked_out':
        return <CheckCircle className="h-4 w-4 text-gray-500" />;
      case 'cancelled':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { 
      weekday: 'short', 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const calculateNights = (checkIn: string, checkOut: string) => {
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const isUpcoming = (checkInDate: string) => {
    const checkIn = new Date(checkInDate);
    // Set to start of day for proper comparison
    checkIn.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Upcoming if check-in is today or later
    return checkIn >= today;
  };

  const upcomingReservations = reservations.filter(b => 
    b.status === 'confirmed' && isUpcoming(b.checkInDate)
  );
  
  const pastReservations = reservations.filter(b => 
    b.status === 'checked_out' || (b.status === 'confirmed' && !isUpcoming(b.checkInDate))
  );
  
  const activeReservations = reservations.filter(b => 
    b.status === 'checked_in'
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#1e3a5f] mb-4" />
        <p className="text-gray-500 italic">Loading your reservations...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
      <Button
        variant="ghost"
        onClick={onBack}
        className="mb-4 text-[#1e3a5f] hover:bg-[#1e3a5f]/5"
      >
        <ChevronLeft className="mr-2 h-4 w-4" /> Back to Dashboard
      </Button>

      <div className="mb-6">
        <h2 className="text-2xl font-serif font-bold text-[#1e3a5f]">My Reservations</h2>
        <p className="text-gray-600 text-sm">View and manage your upcoming stays</p>
      </div>

      {reservations.length === 0 ? (
        <Card className="border-dashed border-2 border-gray-200 bg-gray-50/50">
          <CardContent className="p-12 text-center">
            <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">You don't have any reservations yet.</p>
            <Button className="bg-[#1e3a5f]" onClick={onBack}>
              Book Your First Stay
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="upcoming" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upcoming" className="flex gap-2">
              <Clock className="h-4 w-4" /> Upcoming ({upcomingReservations.length})
            </TabsTrigger>
            <TabsTrigger value="active" className="flex gap-2">
              <Home className="h-4 w-4" /> Active ({activeReservations.length})
            </TabsTrigger>
            <TabsTrigger value="past" className="flex gap-2">
              <CheckCircle className="h-4 w-4" /> Past ({pastReservations.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="mt-4 space-y-4">
            {upcomingReservations.length === 0 ? (
              <Card className="bg-gray-50">
                <CardContent className="p-8 text-center text-gray-400">
                  <p>No upcoming reservations.</p>
                </CardContent>
              </Card>
            ) : (
              upcomingReservations.map((reservation) => (
                <ReservationCard
                  key={reservation.id}
                  reservation={reservation}
                  getStatusBadge={getStatusBadge}
                  getStatusIcon={getStatusIcon}
                  formatDate={formatDate}
                  calculateNights={calculateNights}
                  onCancel={() => {
                    setSelectedReservation(reservation);
                    setShowCancelModal(true);
                  }}
                  onExtend={() => openExtendStayModal(reservation)}
                  onDownload={() => downloadReservationPDF(reservation)}
                  onViewDetails={() => {
                    setSelectedDetails(reservation);
                    setShowDetailsModal(true);
                  }}
                  showActions={true}
                />
              ))
            )
            }
          </TabsContent>

          <TabsContent value="active" className="mt-4 space-y-4">
            {activeReservations.length === 0 ? (
              <Card className="bg-gray-50">
                <CardContent className="p-8 text-center text-gray-400">
                  <p>No active stays.</p>
                </CardContent>
              </Card>
            ) : (
              activeReservations.map((reservation) => (
                <ReservationCard
                  key={reservation.id}
                  reservation={reservation}
                  getStatusBadge={getStatusBadge}
                  getStatusIcon={getStatusIcon}
                  formatDate={formatDate}
                  calculateNights={calculateNights}
                  onExtend={() => openExtendStayModal(reservation)}
                  onDownload={() => downloadReservationPDF(reservation)}
                  onViewDetails={() => {
                    setSelectedDetails(reservation);
                    setShowDetailsModal(true);
                  }}
                  showActions={true}
                />
              ))
            )
            }
          </TabsContent>

          <TabsContent value="past" className="mt-4 space-y-4">
            {pastReservations.length === 0 ? (
              <Card className="bg-gray-50">
                <CardContent className="p-8 text-center text-gray-400">
                  <p>No past reservations.</p>
                </CardContent>
              </Card>
            ) : (
              pastReservations.map((reservation) => (
                <ReservationCard
                  key={reservation.id}
                  reservation={reservation}
                  getStatusBadge={getStatusBadge}
                  getStatusIcon={getStatusIcon}
                  formatDate={formatDate}
                  calculateNights={calculateNights}
                  onDownload={() => downloadReservationPDF(reservation)}
                  onViewDetails={() => {
                    setSelectedDetails(reservation);
                    setShowDetailsModal(true);
                  }}
                  showActions={false}
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Cancel Confirmation Modal */}
      <Dialog open={showCancelModal} onOpenChange={setShowCancelModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Cancel Reservation
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel your reservation for {selectedReservation?.roomName}?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-100">
              <p className="text-xs text-yellow-800">
                Cancellation policy: Free cancellation up to 48 hours before check-in.
              </p>
            </div>
            <div className="flex gap-3 pt-4">
              <Button variant="outline" className="flex-1" onClick={() => setShowCancelModal(false)}>
                Keep Reservation
              </Button>
              <Button variant="destructive" className="flex-1" onClick={handleCancelReservation} disabled={isProcessing}>
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes, Cancel"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reservation Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-[#1e3a5f]" />
              Reservation Details
            </DialogTitle>
            <DialogDescription>
              Complete information for your stay at Azure Horizon Resort
            </DialogDescription>
          </DialogHeader>
          {selectedDetails && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-[#1e3a5f] to-[#2c5282] text-white p-4 rounded-lg">
                <p className="text-sm opacity-80">Booking ID</p>
                <p className="font-mono text-sm">{selectedDetails.id}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Room</p>
                  <p className="font-semibold">{selectedDetails.roomName}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Room Number</p>
                  <p className="font-semibold">{selectedDetails.roomNumber}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Check-in</p>
                  <p className="font-semibold">{formatDate(selectedDetails.checkInDate)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">From 15:00</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Check-out</p>
                  <p className="font-semibold">{formatDate(selectedDetails.checkOutDate)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">By 11:00</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Nights</p>
                  <p className="font-semibold">{calculateNights(selectedDetails.checkInDate, selectedDetails.checkOutDate)} nights</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Guests</p>
                  <p className="font-semibold">{selectedDetails.numberOfGuests}</p>
                </div>
              </div>

              <div className="border-t pt-3">
                <div className="flex justify-between">
                  <p className="text-xs text-gray-500">Total Amount</p>
                  <p className="font-bold text-[#1e3a5f]">R {selectedDetails.totalAmount}</p>
                </div>
              </div>

              {selectedDetails.specialRequests && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">Special Requests</p>
                  <p className="text-sm italic">{selectedDetails.specialRequests}</p>
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <Button variant="outline" className="flex-1" onClick={() => setShowDetailsModal(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Extend Stay Modal */}
      <Dialog open={showExtendStayModal} onOpenChange={setShowExtendStayModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#1e3a5f]">
              <CalendarPlus className="h-5 w-5" />
              Extend Your Stay
            </DialogTitle>
            <DialogDescription>
              Add extra nights to your reservation for {selectedReservation?.roomName}
            </DialogDescription>
          </DialogHeader>
          
          {selectedReservation && (
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600">Current Check-out:</span>
                  <span className="font-semibold">{formatDate(selectedReservation.checkOutDate)}</span>
                </div>
              </div>

              <div>
                <Label htmlFor="new-checkout" className="text-sm">New Check-out Date</Label>
                <Input
                  id="new-checkout"
                  type="date"
                  value={newCheckOutDate}
                  onChange={(e) => setNewCheckOutDate(e.target.value)}
                  className="mt-2"
                  disabled={isProcessing}
                />
                <p className="text-xs text-gray-500 mt-1">Must be after {formatDate(selectedReservation.checkOutDate)}</p>
              </div>

              {extendStayError && (
                <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-sm text-red-700">{extendStayError}</p>
                </div>
              )}

              {extendStaySuccess && (
                <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-sm text-green-700">{extendStaySuccess}</p>
                </div>
              )}

              {newCheckOutDate && selectedReservation && (
                <div className="bg-gray-50 p-3 rounded-lg text-sm">
                  <div className="flex justify-between mb-1">
                    <span className="text-gray-600">Additional Nights:</span>
                    <span className="font-semibold">{Math.ceil((new Date(newCheckOutDate).getTime() - new Date(selectedReservation.checkOutDate).getTime()) / (1000 * 60 * 60 * 24))} night(s)</span>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <Button 
                  variant="outline" 
                  className="flex-1" 
                  onClick={() => setShowExtendStayModal(false)}
                  disabled={isProcessing}
                >
                  Cancel
                </Button>
                <Button 
                  className="flex-1 bg-[#1e3a5f]" 
                  onClick={handleExtendStay}
                  disabled={isProcessing || !newCheckOutDate}
                >
                  {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Request Extension"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Sub-component for individual reservation cards
interface ReservationCardProps {
  reservation: any;
  getStatusBadge: (status: string) => React.ReactNode;
  getStatusIcon: (status: string) => React.ReactNode;
  formatDate: (date: string) => string;
  calculateNights: (checkIn: string, checkOut: string) => number;
  onCancel?: () => void;
  onExtend?: () => void;
  onDownload?: () => void;
  onViewDetails: () => void;
  showActions: boolean;
}

function ReservationCard({ 
  reservation, 
  getStatusBadge, 
  getStatusIcon, 
  formatDate, 
  calculateNights,
  onCancel,
  onExtend,
  onDownload,
  onViewDetails,
  showActions
}: ReservationCardProps) {
  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow border-l-4 border-l-[#1e3a5f]">
      <CardContent className="p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              {getStatusIcon(reservation.status)}
              {getStatusBadge(reservation.status)}
            </div>
            <h3 className="font-bold text-lg text-gray-900">{reservation.roomName}</h3>
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>{formatDate(reservation.checkInDate)} (15:00) → {formatDate(reservation.checkOutDate)} (11:00)</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>{calculateNights(reservation.checkInDate, reservation.checkOutDate)} nights</span>
              </div>
            </div>
            <p className="text-sm font-semibold text-[#1e3a5f] mt-2">
              R {reservation.totalAmount}
            </p>
          </div>
          
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onViewDetails}>
              View Details
            </Button>
            {onDownload && (
              <Button size="sm" variant="outline" onClick={onDownload} title="Download PDF Invoice">
                <Download className="h-3 w-3" />
              </Button>
            )}
            {showActions && onExtend && reservation.resType === 'room' && (reservation.status === 'confirmed' || reservation.status === 'checked_in') && (
              <Button size="sm" variant="outline" onClick={onExtend} className="text-blue-600 hover:bg-blue-50">
                <CalendarPlus className="h-3 w-3 mr-1" />
                Extend
              </Button>
            )}
            {showActions && onCancel && (
              <Button size="sm" variant="destructive" onClick={onCancel}>
                <XCircle className="h-3 w-3 mr-1" />
                Cancel
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}