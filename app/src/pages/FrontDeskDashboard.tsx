import { useState, useEffect } from 'react';
import {
  listenForBookings,
  listenForRooms,
  updateBookingStatus,
  db,
  getRoomTypeOccupancy,
  listenForRoomCharges,
  addRoomCharge,
  clearRoomCharges,
  extendStayAndCharge
} from '@/services/firebase-services';
import { doc, updateDoc, collection, getDocs } from 'firebase/firestore';
import type { Booking, Room } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { AlertModal } from '@/components/ui/AlertModal';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import emailjs from '@emailjs/browser';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Search,
  LogIn,
  LogOut,
  CreditCard,
  Key,
  Loader2,
  BedDouble,
  Users,
  Eye,
  Receipt,
  DollarSign,
  Phone,
  Mail,
  Calendar,
  Clock,
  Repeat,
  CalendarPlus,
  Printer,
  CheckCircle,
  Coffee,
  Wrench,
  Plus,
  Send,
  Edit,
  XCircle,
  AlertCircle
} from 'lucide-react';
import { useCentralClock } from '@/components/ui/CentralizedClock';
import { usePaystackPayment } from 'react-paystack';

interface IncidentalCharge {
  id: string;
  description: string;
  amount: number;
  date: string;
}

interface GuestBilling {
  roomCharges: number;
  incidentalCharges: IncidentalCharge[];
  total: number;
}

type RoomStatus = 'available' | 'occupied' | 'dirty' | 'maintenance';

interface RoomWithStatus extends Room {
  roomStatus: RoomStatus;
}

export function FrontDeskDashboard() {
  const currentTime = useCentralClock();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [rooms, setRooms] = useState<RoomWithStatus[]>([]);
  const [roomTypeOccupancy, setRoomTypeOccupancy] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [emailReceiptBooking, setEmailReceiptBooking] = useState<Booking | null>(null); // NEW: Store booking for email
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showCheckOutModal, setShowCheckOutModal] = useState(false);
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [showGuestDetailsModal, setShowGuestDetailsModal] = useState(false);
  const [showRoomSwapModal, setShowRoomSwapModal] = useState(false);
  const [showExtendStayModal, setShowExtendStayModal] = useState(false);
  const [showRoomStatusModal, setShowRoomStatusModal] = useState(false);
  const [showEmailReceiptModal, setShowEmailReceiptModal] = useState(false);
  const [showEditBookingModal, setShowEditBookingModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  // EmailJS credentials
  const EMAILJS_SERVICE_ID = 'service_nibp5fo';
  const EMAILJS_TEMPLATE_ID = 'template_s94ikro';
  const EMAILJS_PUBLIC_KEY = 'Uay4hCI5I5cY4bWmJ';
  const [guestBilling, setGuestBilling] = useState<GuestBilling | null>(null);
  const [isLoadingBilling, setIsLoadingBilling] = useState(false);
  const [incidentalCharges, setIncidentalCharges] = useState<IncidentalCharge[]>([]);
  const [extendDays, setExtendDays] = useState(1);
  const [keysReturned, setKeysReturned] = useState(false);
  const [paymentCollected, setPaymentCollected] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [showEarlyCheckoutModal, setShowEarlyCheckoutModal] = useState(false);

  // Alert Modal state
  const [alertModal, setAlertModal] = useState({
    open: false,
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'info' | 'warning'
  });

  // Edit booking state
  const [editCheckIn, setEditCheckIn] = useState('');
  const [editCheckOut, setEditCheckOut] = useState('');

  // Payment state
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Initialize EmailJS when component mounts
  useEffect(() => {
    emailjs.init(EMAILJS_PUBLIC_KEY);
    console.log("EmailJS initialized");
  }, []);

  useEffect(() => {
    const unsubscribeBookings = listenForBookings((updatedBookings) => {
      setBookings(updatedBookings);
    });

    const unsubscribeRooms = listenForRooms((updatedRooms) => {
      const roomsWithStatus: RoomWithStatus[] = updatedRooms.map(room => ({
        ...room,
        roomStatus: room.isAvailable ? 'available' : 'occupied'
      }));
      setRooms(roomsWithStatus);
    });

    return () => {
      unsubscribeBookings();
      unsubscribeRooms();
    };
  }, []);

  // Listen for room charges for the selected booking
  useEffect(() => {
    if (!selectedBooking) {
      setIncidentalCharges([]);
      return;
    }
    const unsubscribe = listenForRoomCharges(selectedBooking.id, (charges) => {
      setIncidentalCharges(charges);
    });
    return () => unsubscribe();
  }, [selectedBooking]);

  // Fetch room type occupancy data
  useEffect(() => {
    const computeRoomTypeOccupancy = async () => {
      try {
        // Get all unique room types
        const roomsSnap = await getDocs(collection(db, 'rooms'));
        const roomTypes = new Set<string>();
        roomsSnap.forEach(doc => {
          const roomType = doc.data().type;
          if (roomType) roomTypes.add(roomType);
        });

        // Compute occupancy for each room type
        const occupancies: Record<string, number> = {};
        for (const roomType of roomTypes) {
          const occupancy = await getRoomTypeOccupancy(roomType);
          occupancies[roomType] = occupancy;
        }
        setRoomTypeOccupancy(occupancies);
      } catch (error) {
        console.error("Error computing room type occupancy:", error);
      }
    };

    computeRoomTypeOccupancy();

    // Update occupancy every 5 minutes
    const interval = setInterval(computeRoomTypeOccupancy, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const getTotalIncidentalCharges = () => {
    return incidentalCharges.reduce((total, charge) => total + (charge.amount || 0), 0);
  };

  const filteredBookings = bookings.filter(booking =>
    booking.guestName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    booking.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    booking.roomName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const todayCheckIns = bookings.filter(b =>
    b.status === 'confirmed' &&
    new Date(b.checkInDate).toDateString() === new Date().toDateString()
  );

  const todayCheckOuts = bookings.filter(b =>
    b.status === 'checked_in' &&
    new Date(b.checkOutDate).toDateString() === new Date().toDateString()
  );

  const getStatusBadge = (status: Booking['status']) => {
    const styles = {
      pending: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
      confirmed: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
      checked_in: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
      checked_out: 'bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-slate-300',
      cancelled: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
    };
    return (
      <Badge variant="secondary" className={styles[status]}>
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  const getRoomStatusIcon = (status: RoomStatus) => {
    switch (status) {
      case 'available': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'occupied': return <Users className="h-4 w-4 text-blue-500" />;
      case 'dirty': return <Coffee className="h-4 w-4 text-yellow-500" />;
      case 'maintenance': return <Wrench className="h-4 w-4 text-red-500" />;
      default: return <BedDouble className="h-4 w-4" />;
    }
  };

  const getRoomStatusColor = (status: RoomStatus) => {
    switch (status) {
      case 'available': return 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300';
      case 'occupied': return 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300';
      case 'dirty': return 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300';
      case 'maintenance': return 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-300';
      default: return 'bg-gray-100 dark:bg-slate-800';
    }
  };

  const handleCheckIn = async () => {
    if (!selectedBooking || !selectedRoomId) return;

    const checkInDateStr = selectedBooking.checkInDate.split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];

    if (checkInDateStr > todayStr) {
      setAlertModal({
        open: true,
        title: "Early Check-in Not Allowed",
        message: `Cannot check in guest before their booking date (${selectedBooking.checkInDate}). Please wait until the check-in date.`,
        type: "warning"
      });
      return;
    }

    const checkOutDateStr = selectedBooking.checkOutDate.split('T')[0];
    if (todayStr > checkOutDateStr) {
      setAlertModal({
        open: true,
        title: "Booking Expired",
        message: `This booking expired on ${selectedBooking.checkOutDate}. Please create a new booking.`,
        type: "error"
      });
      return;
    }

    if (selectedBooking.status === 'checked_in') {
      setAlertModal({
        open: true,
        title: "Already Checked In",
        message: `${selectedBooking.guestName} is already checked in to room ${selectedBooking.roomNumber}.`,
        type: "warning"
      });
      return;
    }

    setIsProcessing(true);
    try {
      await updateBookingStatus(selectedBooking.id, 'checked_in');

      const roomRef = doc(db, 'rooms', selectedRoomId);
      await updateDoc(roomRef, { isAvailable: false });

      setShowCheckInModal(false);
      setSelectedBooking(null);
      setSelectedRoomId('');

      setAlertModal({
        open: true,
        title: "Check-in Successful",
        message: `${selectedBooking.guestName} checked in successfully to room ${selectedRoomId}.`,
        type: "success"
      });
    } catch (error) {
      console.error("Check-in error:", error);
      setAlertModal({
        open: true,
        title: "Check-in Failed",
        message: "Failed to check in guest. Please try again.",
        type: "error"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || 'pk_test_placeholder_key_please_replace';

  const paymentAmount = (selectedBooking?.balanceDue !== undefined ? selectedBooking.balanceDue : ((selectedBooking?.totalAmount || 0) + getTotalIncidentalCharges())) * 100;
  const config = {
    reference: `checkout_${new Date().getTime()}`,
    email: selectedBooking?.guestName ? (selectedBooking.guestName.includes('@') ? selectedBooking.guestName : `${selectedBooking.guestName.replace(/\s/g, '').toLowerCase()}@example.com`) : 'guest@example.com',
    amount: paymentAmount > 0 ? paymentAmount : 100, // minimum 1 ZAR
    publicKey: PAYSTACK_PUBLIC_KEY,
    currency: 'ZAR',
  };

  const initializePayment = usePaystackPayment(config);

  const handlePaystackSuccess = async () => {
    document.body.style.pointerEvents = 'auto';
    setIsProcessingPayment(false);
    await completeCheckoutProcess();
  };

  const handlePaystackClose = () => {
    document.body.style.pointerEvents = 'auto';
    setIsProcessingPayment(false);
  };

  const handleCheckOut = () => {
    if (!selectedBooking) return;

    if (selectedBooking.status !== 'checked_in') {
      setAlertModal({
        open: true,
        title: "Not Checked In",
        message: `${selectedBooking.guestName} is not currently checked in.`,
        type: "warning"
      });
      return;
    }

    if (!keysReturned) {
      setAlertModal({
        open: true,
        title: "Keys Not Returned",
        message: "Please confirm that guest has returned room keys before checkout.",
        type: "warning"
      });
      return;
    }

    const balance = selectedBooking.balanceDue !== undefined ? selectedBooking.balanceDue : selectedBooking.totalAmount + getTotalIncidentalCharges();

    if (balance > 0) {
      setIsProcessingPayment(true);
      // Ensure Paystack iframe is clickable (Radix Dialog blocks pointer events by default)
      document.body.style.pointerEvents = 'auto';
      initializePayment({ onSuccess: handlePaystackSuccess, onClose: handlePaystackClose });
      return;
    }

    // Process checkout directly if balance is 0
    setIsProcessingPayment(true);
    completeCheckoutProcess();
  };

  const completeCheckoutProcess = async () => {
    if (!selectedBooking) return;

    if (selectedBooking.status !== 'checked_in') {
      setAlertModal({
        open: true,
        title: "Not Checked In",
        message: `${selectedBooking.guestName} is not currently checked in.`,
        type: "warning"
      });
      return;
    }

    if (!keysReturned) {
      setAlertModal({
        open: true,
        title: "Keys Not Returned",
        message: "Please confirm that guest has returned room keys before checkout.",
        type: "warning"
      });
      return;
    }

    setIsProcessing(true);
    try {
      await updateBookingStatus(selectedBooking.id, 'checked_out');

      const roomRef = doc(db, 'rooms', selectedBooking.roomNumber);
      await updateDoc(roomRef, { isAvailable: true });

      // Clear the balance and room charges to signify payment has been made via POS
      const bookingRef = doc(db, 'bookings', selectedBooking.id);
      await updateDoc(bookingRef, { balanceDue: 0 });
      await clearRoomCharges(selectedBooking.id);

      setShowCheckOutModal(false);

      // Store the booking data for email before clearing
      setEmailReceiptBooking(selectedBooking);
      setEmailAddress(selectedBooking.guestName.includes('@') ? selectedBooking.guestName : `${selectedBooking.guestName.replace(/\s/g, '').toLowerCase()}@example.com`);
      setShowEmailReceiptModal(true);

      // Clear the selected booking after opening email modal
      setSelectedBooking(null);
      setKeysReturned(false);
      setPaymentCollected(false);

      setAlertModal({
        open: true,
        title: "Check-out Successful",
        message: `${selectedBooking.guestName} has been checked out.`,
        type: "success"
      });
    } catch (error) {
      console.error("Check-out error:", error);
      setAlertModal({
        open: true,
        title: "Check-out Failed",
        message: "Failed to check out guest. Please try again.",
        type: "error"
      });
    } finally {
      setIsProcessing(false);
      setIsProcessingPayment(false);
    }
  };

  const handleSettleBill = async () => {
    if (!selectedBooking) return;
    setIsProcessing(true);
    try {
      const bookingRef = doc(db, 'bookings', selectedBooking.id);
      const paidTimestamp = new Date().toISOString();
      await updateDoc(bookingRef, { balanceDue: 0, paymentStatus: 'paid', lastPaidAt: paidTimestamp });

      setAlertModal({
        open: true,
        title: "Bill Settled",
        message: "The outstanding balance has been settled.",
        type: "success"
      });
      // Optionally refresh the modal data
      setSelectedBooking({ ...selectedBooking, balanceDue: 0, paymentStatus: 'paid', lastPaidAt: paidTimestamp });
    } catch (error) {
      console.error(error);
      setAlertModal({ open: true, title: "Error", message: "Could not settle the bill.", type: "error" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendEmailReceipt = async () => {
    console.log("=== EMAIL BUTTON CLICKED ===");
    console.log("Email address:", emailAddress);
    console.log("Email receipt booking:", emailReceiptBooking);

    if (!emailAddress) {
      alert("Please enter an email address.");
      return;
    }

    if (!emailReceiptBooking) {
      alert("No booking data available for receipt. Please try checking out again.");
      return;
    }

    setIsProcessing(true);

    try {
      console.log("Starting email send process...");

      const roomCharges = emailReceiptBooking.totalAmount;
      const tax = Math.round(roomCharges * 0.15);
      const nights = calculateNights(emailReceiptBooking.checkInDate, emailReceiptBooking.checkOutDate);

      const templateParams = {
        to_email: emailAddress,
        guest_name: emailReceiptBooking.guestName,
        booking_id: emailReceiptBooking.id,
        room_name: emailReceiptBooking.roomName,
        check_in: emailReceiptBooking.checkInDate,
        check_out: emailReceiptBooking.checkOutDate,
        nights: nights.toString(),
        room_charges: roomCharges.toFixed(2),
        tax: tax.toFixed(2),
        total: (roomCharges + tax).toFixed(2),
        incidental_charges: getTotalIncidentalCharges().toFixed(2),
        grand_total: (roomCharges + getTotalIncidentalCharges()).toFixed(2),
      };

      console.log("Template params:", templateParams);

      const response = await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        templateParams,
        EMAILJS_PUBLIC_KEY
      );

      console.log("EmailJS response:", response);

      if (response.status === 200) {
        setEmailSent(true);
        alert(`✅ Receipt sent successfully to ${emailAddress}!`);

        setTimeout(() => {
          setShowEmailReceiptModal(false);
          setEmailSent(false);
          setEmailAddress('');
          setEmailReceiptBooking(null); // Clear the email booking after sending
        }, 2000);
      } else {
        throw new Error(`Status: ${response.status}`);
      }
    } catch (error) {
      console.error("Email send failed:", error);
      alert(`❌ Failed to send receipt: ${error instanceof Error ? error.message : 'Unknown error'}. Check console for details.`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEarlyCheckout = async () => {
    if (!selectedBooking) return;

    if (!keysReturned) {
      alert("Please confirm room keys have been returned.");
      return;
    }

    setIsProcessing(true);
    try {
      const checkoutDate = new Date(selectedBooking.checkOutDate);
      const today = new Date();
      const remainingDays = Math.ceil((checkoutDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const refundAmount = (selectedBooking.totalAmount / 2) * (remainingDays / 1);

      await updateBookingStatus(selectedBooking.id, 'checked_out');

      const roomRef = doc(db, 'rooms', selectedBooking.roomNumber);
      await updateDoc(roomRef, { isAvailable: true });

      setShowEarlyCheckoutModal(false);
      alert(`Early checkout processed. Refund amount: R${refundAmount.toFixed(2)}`);
      setSelectedBooking(null);
      setKeysReturned(false);
    } catch (error) {
      console.error("Early checkout error:", error);
      alert("Failed to process early checkout.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRoomSwap = async () => {
    if (!selectedBooking || !selectedRoomId) return;
    setIsProcessing(true);
    try {
      const oldRoomRef = doc(db, 'rooms', selectedBooking.roomNumber);
      await updateDoc(oldRoomRef, { isAvailable: true });

      const newRoomRef = doc(db, 'rooms', selectedRoomId);
      await updateDoc(newRoomRef, { isAvailable: false });

      const bookingRef = doc(db, 'bookings', selectedBooking.id);
      await updateDoc(bookingRef, {
        roomId: selectedRoomId,
        roomNumber: selectedRoomId,
        roomName: rooms.find(r => r.id === selectedRoomId)?.name || selectedRoomId
      });

      alert(`Guest moved to room ${selectedRoomId}`);
      setShowRoomSwapModal(false);
      setSelectedRoomId('');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExtendStay = async () => {
    if (!selectedBooking) return;
    setIsProcessing(true);
    try {
      const result = await extendStayAndCharge(selectedBooking.id, extendDays);

      if (result.success) {
        setAlertModal({
          open: true,
          title: "Stay Extended",
          message: `Extended by ${extendDays} day(s). Additional cost: R ${result.additionalCost?.toFixed(2)}. New checkout: ${result.newCheckOutDate}`,
          type: "success"
        });
        setShowExtendStayModal(false);
        setExtendDays(1);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error("Extend stay error:", error);
      setAlertModal({
        open: true,
        title: "Extension Failed",
        message: "Failed to extend stay. Please check room availability or try again.",
        type: "error"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateBooking = async () => {
    if (!selectedBooking) return;
    if (!editCheckIn || !editCheckOut) {
      alert("Please enter both check-in and check-out dates.");
      return;
    }

    const newCheckIn = new Date(editCheckIn);
    const newCheckOut = new Date(editCheckOut);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (newCheckIn < today) {
      alert("Check-in date cannot be in the past.");
      return;
    }

    if (newCheckOut <= newCheckIn) {
      alert("Check-out date must be after check-in date.");
      return;
    }

    setIsProcessing(true);
    try {
      const bookingRef = doc(db, 'bookings', selectedBooking.id);
      await updateDoc(bookingRef, {
        checkInDate: editCheckIn,
        checkOutDate: editCheckOut
      });
      alert("Booking dates updated successfully!");
      setShowEditBookingModal(false);
      const snapshot = await getDocs(collection(db, 'bookings'));
      const updatedBookings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
      setBookings(updatedBookings);
    } catch (error) {
      console.error("Update booking error:", error);
      alert("Failed to update booking.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelBooking = async () => {
    if (!selectedBooking) return;

    if (selectedBooking.status === 'checked_in') {
      alert("Cannot cancel an active check-in. Please check out first.");
      return;
    }
    if (selectedBooking.status === 'checked_out') {
      alert("Cannot cancel a completed booking.");
      return;
    }
    if (selectedBooking.status === 'cancelled') {
      alert("This booking is already cancelled.");
      return;
    }

    if (confirm(`Are you sure you want to cancel the booking for ${selectedBooking.guestName}? This action cannot be undone.`)) {
      setIsProcessing(true);
      try {
        const bookingRef = doc(db, 'bookings', selectedBooking.id);
        await updateDoc(bookingRef, { status: 'cancelled' });
        alert("Booking cancelled successfully.");
        setShowEditBookingModal(false);
        const snapshot = await getDocs(collection(db, 'bookings'));
        const updatedBookings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
        setBookings(updatedBookings);
      } catch (error) {
        console.error("Cancel booking error:", error);
        alert("Failed to cancel booking.");
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handleDownloadInvoice = async () => {
    if (!selectedBooking) return;

    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'absolute';
    tempDiv.style.left = '-9999px';
    tempDiv.style.top = '-9999px';
    tempDiv.style.width = '800px';
    tempDiv.style.backgroundColor = 'white';
    tempDiv.style.padding = '40px';

    const invoiceHtml = `
      <div style="font-family: 'Georgia', 'Times New Roman', serif;">
        <div style="text-align: center; border-bottom: 2px solid #1e3a5f; padding-bottom: 20px; margin-bottom: 30px;">
          <div style="font-size: 28px; font-weight: bold; color: #1e3a5f;">AZURE HORIZON RESORT</div>
          <div style="font-size: 18px; margin-top: 10px; color: #c9a227;">FINAL INVOICE</div>
        </div>
        
        <div style="margin-bottom: 25px;">
          <div style="font-size: 14px; font-weight: bold; color: #1e3a5f; border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-bottom: 15px;">Guest Information</div>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
            <div><div style="font-size: 11px; color: #888;">Guest Name</div><div style="font-size: 14px; font-weight: 500;">${selectedBooking.guestName}</div></div>
            <div><div style="font-size: 11px; color: #888;">Room</div><div style="font-size: 14px; font-weight: 500;">${selectedBooking.roomName}</div></div>
            <div><div style="font-size: 11px; color: #888;">Check-in</div><div style="font-size: 14px; font-weight: 500;">${selectedBooking.checkInDate}</div></div>
            <div><div style="font-size: 11px; color: #888;">Check-out</div><div style="font-size: 14px; font-weight: 500;">${selectedBooking.checkOutDate}</div></div>
            <div><div style="font-size: 11px; color: #888;">Booking ID</div><div style="font-size: 14px; font-weight: 500;">${selectedBooking.id}</div></div>
            <div><div style="font-size: 11px; color: #888;">Keys Returned</div><div style="font-size: 14px; font-weight: 500;"><span style="display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 11px; background: ${selectedBooking.status === 'checked_out' ? '#4caf50' : '#f44336'}; color: white;">${selectedBooking.status === 'checked_out' ? 'YES' : 'NOT YET'}</span></div></div>
          </div>
        </div>

        <div style="margin-bottom: 25px;">
          <div style="font-size: 14px; font-weight: bold; color: #1e3a5f; border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-bottom: 15px;">Charges Summary</div>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #f5f5f5;">
                <th style="padding: 10px; text-align: left;">Description</th>
                <th style="padding: 10px; text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">Room Charges (${calculateNights(selectedBooking.checkInDate, selectedBooking.checkOutDate)} nights)</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">R ${selectedBooking.totalAmount}</td>
              </tr>
              ${incidentalCharges.map(charge => `
                <tr>
                  <td style="padding: 10px; border-bottom: 1px solid #eee;">${charge.description}</td>
                  <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">R ${charge.amount}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div style="text-align: right; margin-top: 20px;">
            <p>Subtotal: R ${selectedBooking.totalAmount}</p>
            <p>Incidental Charges: R ${getTotalIncidentalCharges()}</p>
            <p style="font-size: 18px; font-weight: bold; color: #1e3a5f;">TOTAL: R ${selectedBooking.totalAmount + getTotalIncidentalCharges()}</p>
          </div>
        </div>
        
        <div style="text-align: center; margin-top: 40px; font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 20px;">
          <p>Thank you for choosing Azure Horizon Resort. We hope to welcome you again!</p>
          <p>This is a system-generated invoice.</p>
        </div>
      </div>
    `;

    tempDiv.innerHTML = invoiceHtml;
    document.body.appendChild(tempDiv);

    try {
      const canvas = await html2canvas(tempDiv, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait'
      });

      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      pdf.save(`Invoice_${selectedBooking.guestName.replace(/\s/g, '_')}_${selectedBooking.id}.pdf`);
    } catch (error) {
      console.error('PDF generation failed:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      document.body.removeChild(tempDiv);
    }
  };

  const handleViewBilling = async (booking: Booking) => {
    setSelectedBooking(booking);
    setIsLoadingBilling(true);
    setShowBillingModal(true);

    setTimeout(() => {
      setGuestBilling({
        roomCharges: booking.totalAmount,
        incidentalCharges: incidentalCharges,
        total: booking.totalAmount + getTotalIncidentalCharges()
      });
      setIsLoadingBilling(false);
    }, 500);
  };

  const handleViewGuestDetails = (booking: Booking) => {
    setSelectedBooking(booking);
    setShowGuestDetailsModal(true);
  };

  const calculateNights = (checkIn: string, checkOut: string) => {
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <AlertModal
        open={alertModal.open}
        onClose={() => setAlertModal(prev => ({ ...prev, open: false }))}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />

      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-[#1e3a5f] dark:text-blue-400">Front Desk Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-400">Manage guest lifecycle and room inventory</p>
      </div>

      <div className="grid md:grid-cols-4 gap-4 mb-8">
        <Card className="dark:bg-slate-900 dark:border-slate-800"><CardContent className="p-6">
          <div className="flex justify-between items-center">
            <div><p className="text-sm text-gray-500 dark:text-gray-400">Today's Arrivals</p><p className="text-3xl font-bold dark:text-white">{todayCheckIns.length}</p></div>
            <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg"><LogIn className="text-blue-600 dark:text-blue-400" /></div>
          </div>
        </CardContent></Card>

        <Card className="dark:bg-slate-900 dark:border-slate-800"><CardContent className="p-6">
          <div className="flex justify-between items-center">
            <div><p className="text-sm text-gray-500 dark:text-gray-400">Today's Departures</p><p className="text-3xl font-bold dark:text-white">{todayCheckOuts.length}</p></div>
            <div className="bg-orange-100 dark:bg-orange-900/30 p-3 rounded-lg"><LogOut className="text-orange-600 dark:text-orange-400" /></div>
          </div>
        </CardContent></Card>

        <Card className="dark:bg-slate-900 dark:border-slate-800"><CardContent className="p-6">
          <div className="flex justify-between items-center">
            <div><p className="text-sm text-gray-500 dark:text-gray-400">Total Rooms</p><p className="text-3xl font-bold dark:text-white">200</p></div>
            <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-lg"><BedDouble className="text-green-600 dark:text-green-400" /></div>
          </div>
        </CardContent></Card>

        <Card className="dark:bg-slate-900 dark:border-slate-800"><CardContent className="p-6">
          <div className="flex justify-between items-center">
            <div><p className="text-sm text-gray-500 dark:text-gray-400">Available</p><p className="text-3xl font-bold dark:text-white">{200 - bookings.filter(b => b.status === 'checked_in').length}</p></div>
            <div className="bg-yellow-100 dark:bg-yellow-900/30 p-3 rounded-lg"><Key className="text-yellow-600 dark:text-yellow-400" /></div>
          </div>
        </CardContent></Card>
      </div>

      {/* Room Type Occupancy Status - Quick View for Front Desk */}
      {Object.keys(roomTypeOccupancy).length > 0 && (
        <Card className="mb-8 dark:bg-slate-900 dark:border-slate-800">
          <CardContent className="p-6">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Room Type Status</p>
            <div className="flex flex-wrap gap-4">
              {Object.entries(roomTypeOccupancy).map(([roomType, occupancy]) => {
                const getOccupancyColor = (occ: number) => {
                  if (occ >= 90) return 'bg-red-100 dark:bg-red-900/20 border-red-300 dark:border-red-700';
                  if (occ >= 70) return 'bg-yellow-100 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700';
                  if (occ >= 50) return 'bg-blue-100 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700';
                  return 'bg-green-100 dark:bg-green-900/20 border-green-300 dark:border-green-700';
                };

                const getOccupancyTextColor = (occ: number) => {
                  if (occ >= 90) return 'text-red-700 dark:text-red-300';
                  if (occ >= 70) return 'text-yellow-700 dark:text-yellow-300';
                  if (occ >= 50) return 'text-blue-700 dark:text-blue-300';
                  return 'text-green-700 dark:text-green-300';
                };

                const getProgressBarColor = (occ: number) => {
                  if (occ >= 90) return 'bg-red-500';
                  if (occ >= 70) return 'bg-yellow-500';
                  if (occ >= 50) return 'bg-blue-500';
                  return 'bg-green-500';
                };

                return (
                  <div key={roomType} className={`flex-1 min-w-[200px] p-3 border rounded-lg ${getOccupancyColor(occupancy)}`}>
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-xs font-semibold capitalize text-gray-700 dark:text-gray-300">{roomType.replace(/_/g, ' ')}</p>
                      <span className={`text-sm font-bold ${getOccupancyTextColor(occupancy)}`}>{occupancy}%</span>
                    </div>
                    <div className="w-full bg-gray-300 dark:bg-gray-600 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all duration-500 ${getProgressBarColor(occupancy)}`}
                        style={{ width: `${occupancy}%` }}
                      ></div>
                    </div>
                    {occupancy >= 80 && (
                      <p className="text-xs text-orange-600 dark:text-orange-400 mt-1 flex items-center gap-0.5">
                        <AlertCircle className="h-2.5 w-2.5" />
                        Busy
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-6 flex justify-between items-center">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            className="pl-10 dark:bg-slate-900 dark:border-slate-800 dark:text-white"
            placeholder="Search guest or booking ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button variant="outline" className="dark:bg-slate-900 dark:border-slate-800 dark:text-gray-300" onClick={() => setShowRoomStatusModal(true)}>
          <BedDouble className="mr-2 h-4 w-4" />
          View Room Status
        </Button>
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList>
          <TabsTrigger value="all">All Bookings</TabsTrigger>
          <TabsTrigger value="arrivals">Arrivals</TabsTrigger>
          <TabsTrigger value="inhouse">In-House</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <BookingsTable
            bookings={filteredBookings}
            onCheckIn={(b) => { setSelectedBooking(b); setShowCheckInModal(true); }}
            onCheckOut={(b) => { setSelectedBooking(b); setShowCheckOutModal(true); }}
            onViewBilling={handleViewBilling}
            onViewGuest={handleViewGuestDetails}
            onRoomSwap={(b) => { setSelectedBooking(b); setShowRoomSwapModal(true); }}
            onExtendStay={(b) => { setSelectedBooking(b); setShowExtendStayModal(true); }}
            onEarlyCheckout={(b) => { setSelectedBooking(b); setShowEarlyCheckoutModal(true); }}
            onDownloadInvoice={(b) => { setSelectedBooking(b); handleDownloadInvoice(); }}
            onEditBooking={(b) => {
              setSelectedBooking(b);
              setEditCheckIn(b.checkInDate);
              setEditCheckOut(b.checkOutDate);
              setShowEditBookingModal(true);
            }}
            onCancelBooking={(b) => { setSelectedBooking(b); handleCancelBooking(); }}
            getStatusBadge={getStatusBadge}
          />
        </TabsContent>

        <TabsContent value="arrivals" className="mt-4">
          <BookingsTable
            bookings={todayCheckIns}
            onCheckIn={(b) => { setSelectedBooking(b); setShowCheckInModal(true); }}
            onCheckOut={(b) => { setSelectedBooking(b); setShowCheckOutModal(true); }}
            onViewBilling={handleViewBilling}
            onViewGuest={handleViewGuestDetails}
            onRoomSwap={(b) => { setSelectedBooking(b); setShowRoomSwapModal(true); }}
            onExtendStay={(b) => { setSelectedBooking(b); setShowExtendStayModal(true); }}
            onEarlyCheckout={(b) => { setSelectedBooking(b); setShowEarlyCheckoutModal(true); }}
            onDownloadInvoice={(b) => { setSelectedBooking(b); handleDownloadInvoice(); }}
            onEditBooking={(b) => {
              setSelectedBooking(b);
              setEditCheckIn(b.checkInDate);
              setEditCheckOut(b.checkOutDate);
              setShowEditBookingModal(true);
            }}
            onCancelBooking={(b) => { setSelectedBooking(b); handleCancelBooking(); }}
            getStatusBadge={getStatusBadge}
          />
        </TabsContent>

        <TabsContent value="inhouse" className="mt-4">
          <BookingsTable
            bookings={bookings.filter(b => b.status === 'checked_in')}
            onCheckIn={(b) => { setSelectedBooking(b); setShowCheckInModal(true); }}
            onCheckOut={(b) => { setSelectedBooking(b); setShowCheckOutModal(true); }}
            onViewBilling={handleViewBilling}
            onViewGuest={handleViewGuestDetails}
            onRoomSwap={(b) => { setSelectedBooking(b); setShowRoomSwapModal(true); }}
            onExtendStay={(b) => { setSelectedBooking(b); setShowExtendStayModal(true); }}
            onEarlyCheckout={(b) => { setSelectedBooking(b); setShowEarlyCheckoutModal(true); }}
            onDownloadInvoice={(b) => { setSelectedBooking(b); handleDownloadInvoice(); }}
            onEditBooking={(b) => {
              setSelectedBooking(b);
              setEditCheckIn(b.checkInDate);
              setEditCheckOut(b.checkOutDate);
              setShowEditBookingModal(true);
            }}
            onCancelBooking={(b) => { setSelectedBooking(b); handleCancelBooking(); }}
            getStatusBadge={getStatusBadge}
          />
        </TabsContent>
      </Tabs>

      {/* Check-In Modal */}
      <Dialog open={showCheckInModal} onOpenChange={setShowCheckInModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Check In Guest</DialogTitle>
            <DialogDescription>Assign a room to {selectedBooking?.guestName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Label htmlFor="room-select">Select Room</Label>
            <select
              id="room-select"
              title="Select an available room"
              className="w-full p-2 border rounded-md dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
              value={selectedRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
            >
              <option value="">Available Rooms...</option>
              {rooms.filter(r => r.isAvailable && r.roomStatus === 'available').map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <Button className="w-full" onClick={handleCheckIn} disabled={!selectedRoomId || isProcessing}>
              {isProcessing ? <Loader2 className="animate-spin mr-2" /> : <LogIn className="mr-2 h-4 w-4" />}
              Complete Check-in
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Check-Out Modal */}
      <Dialog open={showCheckOutModal} onOpenChange={setShowCheckOutModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Guest Check-out</DialogTitle>
            <DialogDescription>Finalize bill for {selectedBooking?.guestName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-lg">
              <div className="flex justify-between mb-2">
                <span className="dark:text-slate-300">Room Charges</span>
                <span className="dark:text-slate-100">R {selectedBooking?.totalAmount}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="dark:text-slate-300">Incidental Charges</span>
                <span className="dark:text-slate-100">R {getTotalIncidentalCharges()}</span>
              </div>
              <div className="flex justify-between font-bold border-t dark:border-slate-600 pt-2">
                <span className="dark:text-slate-100">Total Outstanding Balance</span>
                <span className="text-orange-600">R {selectedBooking?.balanceDue !== undefined ? selectedBooking.balanceDue : (selectedBooking?.totalAmount || 0) + getTotalIncidentalCharges()}</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <Checkbox
                  id="keys-returned"
                  checked={keysReturned}
                  onCheckedChange={(checked) => setKeysReturned(checked as boolean)}
                />
                <Label htmlFor="keys-returned" className="text-sm font-normal cursor-pointer">
                  Confirm room keys have been returned by guest
                </Label>
              </div>

              {(selectedBooking?.balanceDue === undefined || selectedBooking.balanceDue > 0) && (
                <div className="flex items-center space-x-2 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                  <Checkbox
                    id="payment-collected"
                    checked={paymentCollected}
                    onCheckedChange={(checked) => setPaymentCollected(checked as boolean)}
                  />
                  <Label htmlFor="payment-collected" className="text-sm font-normal cursor-pointer text-orange-900 dark:text-orange-300">
                    Confirm payment of R {selectedBooking?.balanceDue !== undefined ? selectedBooking.balanceDue : (selectedBooking?.totalAmount || 0) + getTotalIncidentalCharges()} collected via POS Terminal
                  </Label>
                </div>
              )}
            </div>

            <Button
              className="w-full bg-orange-600 hover:bg-orange-700"
              onClick={handleCheckOut}
              disabled={isProcessing || isProcessingPayment || !keysReturned || ((selectedBooking?.balanceDue === undefined || selectedBooking.balanceDue > 0) && !paymentCollected)}
            >
              {(isProcessing || isProcessingPayment) ? <Loader2 className="animate-spin mr-2" /> : <CreditCard className="mr-2 h-4 w-4" />}
              Process Checkout
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Email Receipt Modal */}
      <Dialog open={showEmailReceiptModal} onOpenChange={(open) => {
        setShowEmailReceiptModal(open);
        if (!open) {
          // Clear email receipt data when modal closes
          setEmailReceiptBooking(null);
          setEmailAddress('');
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-600" />
              Send Receipt by Email
            </DialogTitle>
            <DialogDescription>
              A final receipt will be sent to the guest's email address
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  className="pl-10 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                  placeholder="guest@example.com"
                  value={emailAddress}
                  onChange={(e) => setEmailAddress(e.target.value)}
                />
              </div>
            </div>

            {emailSent ? (
              <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg text-center">
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400 mx-auto mb-2" />
                <p className="text-green-700 dark:text-green-300 font-semibold">Receipt Sent!</p>
                <p className="text-xs text-green-600 dark:text-green-400">The receipt has been sent to {emailAddress}</p>
              </div>
            ) : (
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowEmailReceiptModal(false)}>
                  Skip
                </Button>
                <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  onClick={() => {
                    console.log("Send button clicked directly");
                    handleSendEmailReceipt();
                  }}
                  disabled={isProcessing}
                >
                  {isProcessing ? <Loader2 className="animate-spin mr-2" /> : <Send className="mr-2 h-4 w-4" />}
                  Send Receipt
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Early Checkout Modal */}
      <Dialog open={showEarlyCheckoutModal} onOpenChange={setShowEarlyCheckoutModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Early Checkout</DialogTitle>
            <DialogDescription>Process early departure for {selectedBooking?.guestName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <p className="text-sm text-yellow-800 dark:text-yellow-300">Early checkout may incur a 50% refund on remaining nights.</p>
            </div>
            <div className="flex items-center space-x-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <Checkbox
                id="early-keys-returned"
                checked={keysReturned}
                onCheckedChange={(checked) => setKeysReturned(checked as boolean)}
              />
              <Label htmlFor="early-keys-returned" className="text-sm font-normal cursor-pointer">
                Confirm room keys have been returned
              </Label>
            </div>
            <Button className="w-full bg-red-600" onClick={handleEarlyCheckout} disabled={isProcessing || !keysReturned}>
              {isProcessing ? <Loader2 className="animate-spin mr-2" /> : <LogOut className="mr-2 h-4 w-4" />}
              Confirm Early Checkout
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Room Swap Modal */}
      <Dialog open={showRoomSwapModal} onOpenChange={setShowRoomSwapModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Swap Room</DialogTitle>
            <DialogDescription>Move {selectedBooking?.guestName} to a different room</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Label htmlFor="new-room">Select New Room</Label>
            <select
              id="new-room"
              title="Select a new room"
              className="w-full p-2 border rounded-md"
              value={selectedRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
            >
              <option value="">Select Room...</option>
              {rooms.filter(r => r.isAvailable && r.id !== selectedBooking?.roomNumber).map(r => (
                <option key={r.id} value={r.id}>{r.name} (Current: {r.roomStatus})</option>
              ))}
            </select>
            <Button className="w-full" onClick={handleRoomSwap} disabled={!selectedRoomId || isProcessing}>
              {isProcessing ? <Loader2 className="animate-spin mr-2" /> : <Repeat className="mr-2 h-4 w-4" />}
              Confirm Room Swap
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Extend Stay Modal */}
      <Dialog open={showExtendStayModal} onOpenChange={setShowExtendStayModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend Stay</DialogTitle>
            <DialogDescription>Add extra nights for {selectedBooking?.guestName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Label htmlFor="extend-days">Number of extra nights</Label>
            <Input
              id="extend-days"
              type="number"
              min={1}
              max={30}
              value={extendDays}
              onChange={(e) => setExtendDays(parseInt(e.target.value))}
            />
            <Button className="w-full" onClick={handleExtendStay} disabled={isProcessing}>
              {isProcessing ? <Loader2 className="animate-spin mr-2" /> : <CalendarPlus className="mr-2 h-4 w-4" />}
              Extend Stay
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Room Status Modal */}
      <Dialog open={showRoomStatusModal} onOpenChange={setShowRoomStatusModal}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Room Status Overview</DialogTitle>
            <DialogDescription>Current status of all rooms in the resort</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-3 max-h-96 overflow-y-auto">
            {rooms.map((room) => (
              <div key={room.id} className={`flex-1 min-w-[200px] p-3 rounded-lg border ${getRoomStatusColor(room.roomStatus)}`}>
                <div className="flex items-center justify-between">
                  <span className="font-bold">Room {room.id}</span>
                  {getRoomStatusIcon(room.roomStatus)}
                </div>
                <p className="text-xs mt-1">{room.name}</p>
                <p className="text-xs font-medium mt-1 capitalize">{room.roomStatus}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-4 justify-center mt-4 pt-4 border-t">
            <div className="flex items-center gap-1 text-xs"><CheckCircle className="h-3 w-3 text-green-500" /> Available</div>
            <div className="flex items-center gap-1 text-xs"><Users className="h-3 w-3 text-blue-500" /> Occupied</div>
            <div className="flex items-center gap-1 text-xs"><Coffee className="h-3 w-3 text-yellow-500" /> Dirty</div>
            <div className="flex items-center gap-1 text-xs"><Wrench className="h-3 w-3 text-red-500" /> Maintenance</div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Booking Modal */}
      <Dialog open={showEditBookingModal} onOpenChange={setShowEditBookingModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#1e3a5f]">
              <Edit className="h-5 w-5" />
              Edit Booking
            </DialogTitle>
            <DialogDescription>
              Modify booking dates for {selectedBooking?.guestName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Room</Label>
              <Input value={selectedBooking?.roomName} disabled className="bg-gray-50 dark:bg-slate-800 dark:text-slate-300" />
            </div>
            <div className="space-y-2">
              <Label>New Check-in Date</Label>
              <Input
                type="date"
                value={editCheckIn}
                onChange={(e) => setEditCheckIn(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            <div className="space-y-2">
              <Label>New Check-out Date</Label>
              <Input
                type="date"
                value={editCheckOut}
                onChange={(e) => setEditCheckOut(e.target.value)}
                min={editCheckIn || new Date().toISOString().split('T')[0]}
              />
            </div>
            <div className="flex gap-3 pt-4">
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleCancelBooking}
                disabled={isProcessing || selectedBooking?.status === 'checked_in' || selectedBooking?.status === 'checked_out'}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Cancel Booking
              </Button>
              <Button
                className="flex-1 bg-[#1e3a5f] hover:bg-[#2c5282]"
                onClick={handleUpdateBooking}
                disabled={isProcessing}
              >
                {isProcessing ? <Loader2 className="animate-spin mr-2" /> : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Guest Billing Modal */}
      <Dialog open={showBillingModal} onOpenChange={setShowBillingModal}>
        <DialogContent className="max-w-2xl bg-white rounded-xl shadow-2xl">
          <DialogHeader className="border-b border-gray-100 pb-4">
            <DialogTitle className="flex items-center gap-2 text-[#1e3a5f]">
              <div className="w-10 h-10 bg-[#1e3a5f]/10 rounded-xl flex items-center justify-center">
                <Receipt className="h-5 w-5 text-[#1e3a5f]" />
              </div>
              <div>
                <span className="text-xl font-serif">Guest Billing Summary</span>
                <p className="text-xs text-gray-400 font-normal mt-0.5">
                  {selectedBooking?.guestName} • Room {selectedBooking?.roomNumber}
                </p>
              </div>
            </DialogTitle>
          </DialogHeader>

          {selectedBooking?.status === 'checked_out' && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                ℹ️ This guest has already checked out. This bill is for reference only.
              </p>
            </div>
          )}

          {isLoadingBilling ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[#1e3a5f]" />
            </div>
          ) : guestBilling && (
            <div className="space-y-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="font-semibold dark:text-slate-100">Room Charges ({selectedBooking?.checkInDate} - {selectedBooking?.checkOutDate})</span>
                  <span className="text-xl font-bold text-[#1e3a5f] dark:text-blue-400">R {guestBilling.roomCharges}</span>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Incidental Charges
                  </div>
                  {selectedBooking?.status !== 'checked_out' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-[#c9a227] text-[#c9a227] hover:bg-[#c9a227]/10"
                      onClick={async () => {
                        const desc = prompt("Enter charge description:");
                        const amountStr = prompt("Enter amount:");
                        if (desc && amountStr && !isNaN(parseFloat(amountStr))) {
                          const amount = parseFloat(amountStr);
                          if (selectedBooking) {
                            setIsProcessing(true);
                            try {
                              await addRoomCharge(selectedBooking.id, selectedBooking.guestId, desc, amount);
                            } catch (e) {
                              console.error(e);
                              alert("Failed to add charge.");
                            } finally {
                              setIsProcessing(false);
                            }
                          }
                        } else if (desc || amountStr) {
                          alert("Please enter valid description and amount.");
                        }
                      }}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add Charge
                    </Button>
                  )}
                </h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {incidentalCharges.length === 0 ? (
                    <div className="text-center text-gray-400 py-4 text-sm">
                      No incidental charges added yet.
                    </div>
                  ) : (
                    incidentalCharges.map((charge) => {
                      const lastPaidAt = selectedBooking?.lastPaidAt;
                      const chargeTime = new Date(charge.date).getTime();
                      const isPaid = lastPaidAt && chargeTime <= new Date(lastPaidAt).getTime();
                      return (
                        <div key={charge.id} className={`flex justify-between items-center p-3 bg-gray-50 dark:bg-slate-800 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors ${isPaid ? 'opacity-70' : ''}`}>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-800 dark:text-slate-100">{charge.description}</p>
                              {isPaid ? (
                                <Badge className="bg-green-100 text-green-700 border-none text-[10px] px-1.5 py-0">Paid</Badge>
                              ) : (
                                <Badge className="bg-orange-100 text-orange-700 border-none text-[10px] px-1.5 py-0">Unpaid</Badge>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 dark:text-slate-500">{new Date(charge.date).toLocaleDateString()}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`font-semibold ${isPaid ? 'text-gray-400 line-through' : 'text-[#1e3a5f] dark:text-blue-400'}`}>R {charge.amount.toFixed(2)}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="border-t pt-4 mt-2">
                <div className="flex justify-between items-center text-lg font-bold">
                  <span className="dark:text-slate-100">Subtotal</span>
                  <span className="text-[#1e3a5f] dark:text-blue-400">R {(guestBilling.roomCharges || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-sm text-gray-600 dark:text-slate-400 mt-1">
                  <span>Incidental Charges</span>
                  <span>R {getTotalIncidentalCharges().toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-lg font-bold mt-2 pt-2 border-t border-dashed">
                  <span>Total Due</span>
                  <span className="text-2xl text-[#1e3a5f] font-bold">R {(selectedBooking?.balanceDue !== undefined ? selectedBooking.balanceDue : ((guestBilling.roomCharges || 0) + getTotalIncidentalCharges())).toFixed(2)}</span>
                </div>
              </div>

              {selectedBooking?.status !== 'checked_out' && (
                <div className="flex gap-3">
                  {(selectedBooking?.balanceDue === undefined || selectedBooking.balanceDue > 0) && (
                    <Button
                      className="flex-1 bg-amber-600 hover:bg-amber-700"
                      onClick={handleSettleBill}
                      disabled={isProcessing}
                    >
                      <DollarSign className="mr-2 h-4 w-4" />
                      Settle Bill via POS
                    </Button>
                  )}
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      setShowBillingModal(false);
                      setShowCheckOutModal(true);
                    }}
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    Proceed to Checkout
                  </Button>
                </div>
              )}

              {selectedBooking?.status === 'checked_out' && (
                <Button
                  className="w-full bg-gray-400 cursor-not-allowed"
                  disabled
                >
                  <Receipt className="mr-2 h-4 w-4" />
                  Checkout Completed
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Guest Details Modal */}
      <Dialog open={showGuestDetailsModal} onOpenChange={setShowGuestDetailsModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Smart Guest Profile</DialogTitle>
            <DialogDescription>Live analytics and guest information</DialogDescription>
          </DialogHeader>

          {selectedBooking && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-slate-800 rounded-lg">
                <div className="w-16 h-16 bg-[#1e3a5f] rounded-full flex items-center justify-center">
                  <Users className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold dark:text-slate-100">{selectedBooking.guestName}</h3>
                  <Badge>{selectedBooking.status}</Badge>
                </div>
              </div>

              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg space-y-2">
                <h4 className="font-semibold text-blue-900 dark:text-blue-300 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Azure AI Insights
                </h4>
                {(() => {
                  const checkIn = new Date(selectedBooking.checkInDate);
                  const checkOut = new Date(selectedBooking.checkOutDate);
                  if (selectedBooking.status === 'checked_in') {
                    const hoursRemaining = (checkOut.getTime() - currentTime.getTime()) / (1000 * 60 * 60);
                    if (hoursRemaining < 24 && hoursRemaining > 0) {
                      return <p className="text-sm text-blue-800 dark:text-blue-400">Guest is checking out soon ({Math.ceil(hoursRemaining)} hours remaining). Suggest an express checkout or luggage assistance.</p>;
                    } else if (hoursRemaining < 0) {
                      return <p className="text-sm text-red-600 dark:text-red-400 font-medium">Guest has overstayed checkout time. Please contact the room.</p>;
                    }
                    return <p className="text-sm text-blue-800 dark:text-blue-400">Guest is midway through their stay. Ideal time to recommend a spa treatment or restaurant booking.</p>;
                  } else if (selectedBooking.status === 'confirmed') {
                    const hoursToArrival = (checkIn.getTime() - currentTime.getTime()) / (1000 * 60 * 60);
                    if (hoursToArrival < 24) {
                      return <p className="text-sm text-blue-800 dark:text-blue-400">Guest arriving soon! Ensure room {selectedBooking.roomName} is prioritized by housekeeping.</p>;
                    }
                    return <p className="text-sm text-blue-800 dark:text-blue-400">Upcoming arrival. Send a welcome email with tour packages.</p>;
                  }
                  return <p className="text-sm text-blue-800 dark:text-blue-400">Past stay. Send a post-stay survey to improve guest experience.</p>;
                })()}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2 text-sm p-2 rounded bg-gray-50 dark:bg-slate-800">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-400">Check-in</p>
                    <span className="font-medium dark:text-slate-300">{formatDate(selectedBooking.checkInDate)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm p-2 rounded bg-gray-50 dark:bg-slate-800">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-400">Check-out</p>
                    <span className="font-medium dark:text-slate-300">{formatDate(selectedBooking.checkOutDate)}</span>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm text-gray-600 dark:text-slate-300">Room: <span className="font-semibold">{selectedBooking.roomName}</span></p>
                <p className="text-sm text-gray-600 dark:text-slate-300">Booking ID: <span className="font-mono text-xs">{selectedBooking.id}</span></p>
                {selectedBooking.specialRequests && (
                  <div className="mt-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-800 rounded text-sm text-yellow-800 dark:text-yellow-300">
                    <strong>Special Requests:</strong> {selectedBooking.specialRequests}
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-4 border-t">
                <Button variant="outline" className="flex-1">
                  <Phone className="mr-2 h-4 w-4" /> Call Room
                </Button>
                <Button variant="outline" className="flex-1">
                  <Mail className="mr-2 h-4 w-4" /> Send Message
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// BookingsTable Component
interface BookingsTableProps {
  bookings: Booking[];
  onCheckIn: (b: Booking) => void;
  onCheckOut: (b: Booking) => void;
  onViewBilling: (b: Booking) => void;
  onViewGuest: (b: Booking) => void;
  onRoomSwap: (b: Booking) => void;
  onExtendStay: (b: Booking) => void;
  onEarlyCheckout: (b: Booking) => void;
  onDownloadInvoice: (b: Booking) => void;
  onEditBooking: (b: Booking) => void;
  onCancelBooking: (b: Booking) => void;
  getStatusBadge: (s: Booking['status']) => React.ReactNode;
}

function BookingsTable({
  bookings,
  onCheckIn,
  onCheckOut,
  onViewBilling,
  onViewGuest,
  onRoomSwap,
  onExtendStay,
  onEarlyCheckout,
  onDownloadInvoice,
  onEditBooking,
  getStatusBadge
}: BookingsTableProps) {
  return (
    <Card><CardContent className="p-0 overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 dark:bg-slate-800 border-b dark:border-slate-700">
          <tr className="text-xs text-gray-500 dark:text-slate-400 uppercase tracking-wider">
            <th className="px-6 py-4 text-left font-medium"><div className="flex items-center gap-2"><Users className="h-4 w-4" />Guest</div></th>
            <th className="px-6 py-4 text-left font-medium">Status</th>
            <th className="px-6 py-4 text-left font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
          {bookings.map((booking) => (
            <tr key={booking.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/50 transition-colors">
              <td className="px-6 py-4">
                <div className="font-semibold text-gray-900 dark:text-slate-100">{booking.guestName}</div>
                <div className="text-xs text-gray-500 dark:text-slate-400">{booking.roomName}</div>
              </td>
              <td className="px-6 py-4">{getStatusBadge(booking.status)}</td>
              <td className="px-6 py-4">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => onViewGuest(booking)} title="View Guest Details">
                    <Eye className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onViewBilling(booking)} title="View Billing">
                    <Receipt className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onDownloadInvoice(booking)} title="Download Invoice">
                    <Printer className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onEditBooking(booking)} title="Edit Booking">
                    <Edit className="h-3 w-3" />
                  </Button>
                  {booking.status === 'checked_in' && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => onRoomSwap(booking)} title="Swap Room">
                        <Repeat className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onExtendStay(booking)} title="Extend Stay">
                        <CalendarPlus className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-600" onClick={() => onEarlyCheckout(booking)} title="Early Checkout">
                        <LogOut className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                  {booking.status === 'confirmed' && (
                    <Button size="sm" onClick={() => onCheckIn(booking)}>Check In</Button>
                  )}
                  {booking.status === 'checked_in' && (
                    <Button size="sm" variant="outline" onClick={() => onCheckOut(booking)}>Check Out</Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {bookings.length === 0 && <div className="p-8 text-center text-gray-400 dark:text-slate-500">No bookings matching your criteria.</div>}
    </CardContent></Card>
  );
}