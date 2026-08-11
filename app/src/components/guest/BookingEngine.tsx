import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getAvailableRooms, createBooking, checkRoomAvailability } from '@/services/firebase-services';
import { MOCK_ROOMS } from '@/services/mock-data';
import { PaymentPage } from '@/components/guest/PaymentPage';
import { AlertModal } from '@/components/ui/AlertModal';
import type { Room, User as CustomUser } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Calendar, 
  Users, 
  Check, 
  Star, 
  Wifi, 
  Coffee, 
  Waves,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CreditCard
} from 'lucide-react';

interface BookingEngineProps {
  onBack: () => void;
}

export function BookingEngine({ onBack }: BookingEngineProps) {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingStep, setBookingStep] = useState<'search' | 'select' | 'payment' | 'confirm'>('search');
  const [isLoading, setIsLoading] = useState(false);
  
  // Search form state
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState(2);
  const [specialRequests, setSpecialRequests] = useState('');
  const [confirmationNumber, setConfirmationNumber] = useState('');
  
  // Payment state
  const [depositAmount, setDepositAmount] = useState(0);
  
  // Alert Modal state
  const [alertModal, setAlertModal] = useState({
    open: false,
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'info' | 'warning'
  });

  const showValidationMessage = (title: string, description: string, isError: boolean = true) => {
    setAlertModal({
      open: true,
      title: title,
      message: description,
      type: isError ? 'error' : 'info'
    });
  };

  // Search logic with validation
  const handleSearch = async () => {
    if (!checkIn) {
      showValidationMessage("Missing Check-in Date", "Please select a check-in date to search for rooms.");
      return;
    }
    if (!checkOut) {
      showValidationMessage("Missing Check-out Date", "Please select a check-out date to search for rooms.");
      return;
    }
    
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (checkInDate < today) {
      showValidationMessage("Invalid Date", "Check-in date cannot be in the past.");
      return;
    }
    
    if (checkOutDate <= checkInDate) {
      showValidationMessage("Invalid Date Range", "Check-out date must be after check-in date.");
      return;
    }
    
    if (guests < 1 || guests > 10) {
      showValidationMessage("Invalid Guest Count", "Number of guests must be between 1 and 10.");
      return;
    }
    
    setIsLoading(true);
    try {
      const data = await getAvailableRooms();
      const availableRooms = data.filter(room => room.capacity >= guests);
      setRooms(availableRooms);
      
      if (availableRooms.length === 0) {
        showValidationMessage("No Rooms Available", `No rooms available for ${guests} guest(s) on your selected dates.`, false);
      }
      
      setBookingStep('select');
    } catch (error) {
      console.error("Search failed:", error);
      showValidationMessage("Search Failed", "Unable to search for rooms. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectRoom = (room: Room) => {
    setSelectedRoom(room);
    const totalWithTax = calculateTotal(room) * 1.15;
    const deposit = Math.round(totalWithTax * 0.15);
    setDepositAmount(deposit);
    setShowBookingModal(true);
  };

  const handlePaymentComplete = async (_paymentConfirmation: string, depositPaid: number) => {
    await handleConfirmBookingWithPayment(depositPaid);
  };

  const handleConfirmBookingWithPayment = async (depositPaid: number) => {
    if (!selectedRoom) return;
    
    setIsLoading(true);
    
    try {
      const u = user as CustomUser;
      const totalCost = Math.round(calculateTotal(selectedRoom) * 1.15);
      
      const isAvailable = await checkRoomAvailability(selectedRoom.id, checkIn, checkOut);
      if (!isAvailable) {
        showValidationMessage("Room Not Available", "This room has already been booked for your selected dates.");
        setShowBookingModal(false);
        setIsLoading(false);
        return;
      }
      
      const result = await createBooking({
        guestId: u?.id || 'guest-user',
        guestEmail: u?.email, 
        guestName: u?.name || 'Guest',
        roomId: selectedRoom.id,
        roomNumber: selectedRoom.id,
        roomName: selectedRoom.name,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        numberOfGuests: guests,
        specialRequests: specialRequests,
        totalAmount: totalCost,
        depositPaid: depositPaid,
        status: 'confirmed',
        paymentStatus: 'deposit_paid'
      });

      if (result.bookingId) {
        setConfirmationNumber(result.bookingId);
        setShowBookingModal(false);
        setBookingStep('confirm');
        // We don't need the alert modal here anymore since we have a dedicated confirmation screen
      }
    } catch (error) {
      console.error("Booking creation failed:", error);
      showValidationMessage("Booking Failed", "Unable to complete your booking. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const calculateNights = () => {
    if (!checkIn || !checkOut) return 0;
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  };

  const calculateTotal = (room?: Room) => {
    const targetRoom = room || selectedRoom;
    if (!targetRoom) return 0;
    return targetRoom.price * calculateNights();
  };

  const getAmenityIcon = (amenity: string) => {
    if (amenity.includes('WiFi')) return <Wifi className="h-4 w-4" />;
    if (amenity.includes('Pool')) return <Waves className="h-4 w-4" />;
    if (amenity.includes('Service')) return <Coffee className="h-4 w-4" />;
    return <Check className="h-4 w-4" />;
  };

  // Search Form View
  if (bookingStep === 'search') {
    return (
      <div className="max-w-4xl mx-auto">
        <AlertModal
          open={alertModal.open}
          onClose={() => setAlertModal(prev => ({ ...prev, open: false }))}
          title={alertModal.title}
          message={alertModal.message}
          type={alertModal.type}
        />
        <div className="mb-6">
          <h2 className="text-2xl font-serif font-bold text-[#1e3a5f]">Book Your Stay</h2>
          <p className="text-gray-600">Find your perfect accommodation</p>
        </div>

        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="grid md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="checkin">Check-in Date</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="checkin"
                    type="date"
                    className="pl-10"
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="checkout">Check-out Date</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="checkout"
                    type="date"
                    className="pl-10"
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                    min={checkIn || new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="guests">Guests</Label>
                <div className="relative">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="guests"
                    type="number"
                    min={1}
                    max={10}
                    className="pl-10"
                    value={guests}
                    onChange={(e) => setGuests(parseInt(e.target.value))}
                  />
                </div>
              </div>
              <div className="flex items-end">
                <Button
                  className="w-full bg-[#c9a227] hover:bg-[#b8941f] text-white"
                  onClick={handleSearch}
                  disabled={!checkIn || !checkOut || isLoading}
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search Rooms'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          {MOCK_ROOMS.slice(0, 2).map((room) => (
            <Card key={room.id} className="overflow-hidden">
              <div className="h-48 bg-gray-200 relative">
                <img
                  src={room.images[0]}
                  alt={room.name}
                  className="w-full h-full object-cover"
                  onError={(e) => (e.currentTarget.src = '/placeholder-room.jpg')}
                />
                <div className="absolute top-4 right-4">
                  <Badge className="bg-[#c9a227] text-white">
                    From R {room.price}/night
                  </Badge>
                </div>
              </div>
              <CardContent className="p-4">
                <h3 className="font-semibold text-lg">{room.name}</h3>
                <p className="text-sm text-gray-600 line-clamp-2">{room.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Room Selection View
  if (bookingStep === 'select') {
    const nights = calculateNights();
    const totalForRoom = (room: Room) => room.price * nights;
    const totalWithTaxForRoom = (room: Room) => Math.round(room.price * nights * 1.15);
    
    return (
      <div className="max-w-6xl mx-auto">
        <AlertModal
          open={alertModal.open}
          onClose={() => setAlertModal(prev => ({ ...prev, open: false }))}
          title={alertModal.title}
          message={alertModal.message}
          type={alertModal.type}
        />
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-serif font-bold text-[#1e3a5f]">Available Rooms</h2>
            <p className="text-gray-600">
              {nights} nights • {guests} guests • {checkIn} to {checkOut}
            </p>
          </div>
          <Button variant="outline" onClick={() => setBookingStep('search')}>
            <ChevronLeft className="mr-2 h-4 w-4" />
            Modify Search
          </Button>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {rooms.map((room) => (
            <Card key={room.id} className="overflow-hidden hover:shadow-lg transition-shadow">
              <div className="h-56 bg-gray-200 relative">
                <img
                  src={room.images[0]}
                  alt={room.name}
                  className="w-full h-full object-cover"
                  onError={(e) => (e.currentTarget.src = '/placeholder-room.jpg')}
                />
                <div className="absolute top-4 right-4">
                  <Badge className="bg-[#1e3a5f] text-white">
                    R {room.price}/night
                  </Badge>
                </div>
              </div>
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-xl font-semibold">{room.name}</h3>
                    <p className="text-sm text-gray-500">Up to {room.capacity} guests</p>
                  </div>
                  <div className="flex items-center text-[#c9a227]">
                    <Star className="h-4 w-4 fill-current" />
                    <span className="ml-1 text-sm font-medium">4.9</span>
                  </div>
                </div>
                
                <p className="text-gray-600 mb-4">{room.description}</p>
                
                <div className="flex flex-wrap gap-2 mb-4">
                  {room.amenities.slice(0, 4).map((amenity) => (
                    <Badge key={amenity} variant="secondary" className="text-xs">
                      {getAmenityIcon(amenity)}
                      <span className="ml-1">{amenity}</span>
                    </Badge>
                  ))}
                  {room.amenities.length > 4 && (
                    <Badge variant="secondary" className="text-xs">
                      +{room.amenities.length - 4} more
                    </Badge>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t">
                  <div>
                    <p className="text-2xl font-bold text-[#1e3a5f]">
                      R {totalForRoom(room)}
                    </p>
                    <p className="text-sm text-gray-500">for {nights} nights</p>
                    <p className="text-xs text-gray-400">Total with tax: R {totalWithTaxForRoom(room)}</p>
                  </div>
                  <Button
                    className="bg-[#c9a227] hover:bg-[#b8941f] text-white"
                    onClick={() => handleSelectRoom(room)}
                  >
                    Select Room
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Booking Modal */}
        <Dialog open={showBookingModal} onOpenChange={setShowBookingModal}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Complete Your Booking</DialogTitle>
              <DialogDescription>
                {selectedRoom?.name} • {calculateNights()} nights
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex justify-between mb-2 text-sm">
                  <span className="text-gray-600">Room Rate</span>
                  <span>R {selectedRoom?.price} x {calculateNights()} nights</span>
                </div>
                <div className="flex justify-between mb-2 text-sm">
                  <span className="text-gray-600">Taxes & Fees (15%)</span>
                  <span>R {Math.round(calculateTotal() * 0.15)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-semibold text-lg">
                  <span>Total</span>
                  <span className="text-[#1e3a5f]">R {Math.round(calculateTotal() * 1.15)}</span>
                </div>
                <div className="mt-2 pt-2 border-t border-dashed">
                  <div className="flex justify-between text-sm text-amber-600">
                    <span>Deposit Required (15%)</span>
                    <span className="font-bold">R {depositAmount}</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">Remaining balance due at check-in</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="requests">Special Requests (Optional)</Label>
                <textarea
                  id="requests"
                  className="w-full min-h-[80px] p-3 border rounded-md text-sm outline-none focus:ring-1 focus:ring-[#c9a227]"
                  placeholder="Any special requests for your stay..."
                  value={specialRequests}
                  onChange={(e) => setSpecialRequests(e.target.value)}
                />
              </div>

              <Button
                className="w-full bg-[#c9a227] hover:bg-[#b8941f] text-white"
                onClick={() => {
                  setShowBookingModal(false);
                  setBookingStep('payment');
                }}
                disabled={isLoading}
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Proceed to Payment (15% Deposit)
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Payment View
  if (bookingStep === 'payment') {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <div className="mb-6 flex items-center gap-4">
          <Button variant="ghost" onClick={() => setBookingStep('select')}>
            <ChevronLeft className="h-4 w-4 mr-2" /> Back to Selection
          </Button>
          <h2 className="text-2xl font-serif font-bold text-[#1e3a5f]">Secure Payment</h2>
        </div>
        
        <Card className="border-none shadow-xl overflow-hidden">
          <CardContent className="p-8">
            <PaymentPage
              bookingDetails={{
                roomName: selectedRoom?.name || '',
                checkIn: checkIn,
                checkOut: checkOut,
                guests: guests,
                roomRate: selectedRoom?.price || 0,
                nights: calculateNights(),
                subtotal: calculateTotal(),
                tax: Math.round(calculateTotal() * 0.15),
                total: Math.round(calculateTotal() * 1.15),
                depositAmount: depositAmount,
                balanceDue: Math.round(calculateTotal() * 1.15) - depositAmount,
              }}
              onPaymentComplete={handlePaymentComplete}
              onCancel={() => setBookingStep('select')}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Confirmation View
  if (bookingStep === 'confirm') {
    const totalWithTax = Math.round(calculateTotal() * 1.15);
    const balanceDue = totalWithTax - depositAmount;
    
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <AlertModal
          open={alertModal.open}
          onClose={() => setAlertModal(prev => ({ ...prev, open: false }))}
          title={alertModal.title}
          message={alertModal.message}
          type={alertModal.type}
        />
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Check className="h-10 w-10 text-green-600" />
        </div>
        <h2 className="text-3xl font-serif font-bold text-[#1e3a5f] mb-4">
          Booking Confirmed!
        </h2>
        <p className="text-gray-600 mb-8">
          Thank you for choosing Fixed Funding Resort. Your reservation has been confirmed.
        </p>
        
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Booking Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-gray-600">Confirmation Number</span>
              <span className="font-mono font-semibold">{confirmationNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Room</span>
              <span className="font-semibold">{selectedRoom?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Check-in</span>
              <div className="text-right">
                <div className="font-semibold">{checkIn}</div>
                <div className="text-xs text-gray-500">From 15:00</div>
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Check-out</span>
              <div className="text-right">
                <div className="font-semibold">{checkOut}</div>
                <div className="text-xs text-gray-500">By 11:00</div>
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Guests</span>
              <span className="font-semibold">{guests}</span>
            </div>
            {specialRequests && (
              <div className="flex justify-between">
                <span className="text-gray-600">Special Requests</span>
                <span className="font-semibold text-sm">{specialRequests}</span>
              </div>
            )}
            <div className="border-t pt-4">
              <div className="flex justify-between text-sm">
                <span>Total Amount:</span>
                <span className="font-semibold">R {totalWithTax}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span>Deposit Paid:</span>
                <span className="font-semibold text-green-600">R {depositAmount}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span>Balance Due at Check-in:</span>
                <span className="font-semibold">R {balanceDue}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-4 justify-center">
          <Button variant="outline" onClick={onBack}>
            Return to Dashboard
          </Button>
          <Button 
            className="bg-[#c9a227] hover:bg-[#b8941f] text-white"
            onClick={() => {
              setBookingStep('search');
              setCheckIn('');
              setCheckOut('');
              setSelectedRoom(null);
              setSpecialRequests('');
            }}
          >
            Book Another Room
          </Button>
        </div>
      </div>
    );
  }

  return null;
}