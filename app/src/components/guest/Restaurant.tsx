import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { rtdb, db } from '@/services/firebase-services';
import { ref, onValue, push, set } from 'firebase/database';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { DigitalReceipt } from '@/components/DigitalReceipt';
import { OrderConfirmation } from '@/components/ui/OrderConfirmation';
import { TableConfirmation } from '@/components/ui/TableConfirmation';
import { AlertModal } from '@/components/ui/AlertModal';
import { RestaurantPaymentModal } from '@/components/guest/RestaurantPaymentModal';
import { generatePDFFromHTML, getProfessionalPDFHTML } from '../../utils/pdfGenerator';
import { findAvailableTables, getTableTypeLabel } from '@/services/tableSeedData';
import type { RestaurantTable } from '@/services/tableSeedData';
import { toast } from 'sonner';

import { 
  Card, 
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';
import { 
  ShoppingCart, 
  Plus, 
  Minus, 
  Trash2, 
  Loader2,
  CheckCircle2,
  ChevronLeft,
  Calendar,
  Clock,
  Users,
  UtensilsCrossed,
  Home,
  Download
} from 'lucide-react';
import type { User as CustomUser } from '@/types';

interface MenuItem {
  id: string;
  name: string;
  price: number;
  description: string;
  category: string;
  image?: string;
}

interface RestaurantProps {
  onBack: () => void;
  activeBooking?: import('@/types').Booking | null;
}

interface OrderSummary {
  id: string;
  items: MenuItem[];
  totalAmount: number;
  createdAt: { seconds: number; nanoseconds: number };
  status?: string;
}

interface TableReservation {
  id: string;
  guestId: string;
  guestName: string;
  date: string;
  time: string;
  partySize: number;
  specialRequests?: string;
  status: 'confirmed' | 'cancelled' | 'completed';
  tableId?: string;
  tableNumber?: number;
  tableType?: string;
  location?: string;
  createdAt: string;
}

interface BillItem {
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
}

interface BillData {
  guestName: string;
  guestId: string;
  orderType: string;
  tableNumber?: number;
  tableType?: string;
  items: BillItem[];
  subtotal: number;
  tax: number;
  total: number;
  orderDate: string;
  reservationId?: string;
}

interface OrderConfirmationData {
  id: string;
  orderId: string;
  guestName: string;
  items: (MenuItem & { quantity: number })[];
  subtotal: number;
  tax: number;
  totalAmount: number;
  createdAt: Date;
}

type AuthUserBridge = CustomUser & { uid?: string };

const getDietaryTags = (name: string, description: string): string[] => {
  const text = (name + ' ' + description).toLowerCase();
  const tags: string[] = [];
  if (text.includes('vegan') || text.includes('plant-based')) tags.push('vegan');
  if (text.includes('vegetarian') || text.includes('cheese') || tags.includes('vegan')) tags.push('vegetarian');
  if (text.includes('gluten-free') || text.includes('gf')) tags.push('gluten-free');
  if (text.includes('halal') || text.includes('chicken') || text.includes('lamb')) tags.push('halal');
  return [...new Set(tags)];
};

export function Restaurant({ onBack, activeBooking }: RestaurantProps) {
  const { user } = useAuth();
  const [menu, setMenu] = useState<{ [key: string]: MenuItem[] }>({});
  const [cart, setCart] = useState<(MenuItem & { quantity: number })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCart, setShowCart] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dietaryFilter, setDietaryFilter] = useState<string>('all');
  const [showOrderSuccess, setShowOrderSuccess] = useState(false);
  const [lastOrder, setLastOrder] = useState<OrderSummary | null>(null);
  
  // Order Confirmation state
  const [showOrderConfirmation, setShowOrderConfirmation] = useState(false);
  const [orderConfirmationData, setOrderConfirmationData] = useState<OrderConfirmationData | null>(null);
  
  // Alert Modal state
  const [alertModal, setAlertModal] = useState({
    open: false,
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'info' | 'warning'
  });
  
  // Table booking state
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway' | 'room_delivery'>('dine_in');
  const [showTableBooking, setShowTableBooking] = useState(false);
  const [showTableConfirmation, setShowTableConfirmation] = useState(false);
  const [tableConfirmationData, setTableConfirmationData] = useState<{
  reservationId: string;
  guestName: string;
  date: string;
  time: string;
  partySize: number;
  tableNumber: number;
  tableType: string;
  location: string;
  specialRequests?: string;
  createdAt: Date;
} | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [pendingOrderTotal, setPendingOrderTotal] = useState(0);
  const [tableReservation, setTableReservation] = useState({
    date: '',
    time: '',
    partySize: 2,
    specialRequests: ''
  });
  const [isBookingTable, setIsBookingTable] = useState(false);
  const [hasActiveReservation, setHasActiveReservation] = useState(false);
  const [activeReservation, setActiveReservation] = useState<TableReservation | null>(null);
  const [showBillModal, setShowBillModal] = useState(false);
  const [currentBill, setCurrentBill] = useState<BillData | null>(null);

  const currentUser = user as AuthUserBridge;
  const isResident = currentUser?.status === 'resident';

  // Load menu
  useEffect(() => {
    const menuRef = ref(rtdb, 'menu');
    const unsubscribe = onValue(menuRef, (snapshot) => {
      if (snapshot.exists()) {
        setMenu(snapshot.val());
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Load existing reservation from database
  useEffect(() => {
    const loadExistingReservation = async () => {
      const currentUserId = currentUser?.id || currentUser?.uid;
      if (!currentUserId || currentUserId === 'unknown') return;
      
      try {
        const today = new Date().toISOString().split('T')[0];
        const reservationsRef = collection(db, 'table_reservations');
        const q = query(
          reservationsRef, 
          where('guestId', '==', currentUserId),
          where('status', '==', 'confirmed'),
          where('date', '>=', today)
        );
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
          const reservations = snapshot.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data(),
            createdAt: doc.data().createdAt || new Date().toISOString()
          }));
          const latestReservation = reservations.sort((a, b) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )[0];
          
          setHasActiveReservation(true);
          setActiveReservation(latestReservation as TableReservation);
        }
      } catch (error) {
        console.error("Error loading existing reservation:", error);
      }
    };
    
    loadExistingReservation();
  }, [currentUser]);

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
    toast.success(`${item.name} added to basket`, {
      description: `R ${item.price} added to your total.`,
    });
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(i => i.id !== id));
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.id === id) {
        const newQty = Math.max(1, i.quantity + delta);
        return { ...i, quantity: newQty };
      }
      return i;
    }));
  };

  const getCartTotal = () => cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  // Check if user already has a reservation for this time
  const checkExistingReservation = async (date: string, time: string): Promise<boolean> => {
    const currentUserId = currentUser?.id || currentUser?.uid || 'unknown';
    if (currentUserId === 'unknown') return false;
    
    try {
      const reservationsRef = collection(db, 'table_reservations');
      const q = query(
        reservationsRef,
        where('guestId', '==', currentUserId),
        where('date', '==', date),
        where('time', '==', time),
        where('status', '==', 'confirmed')
      );
      const snapshot = await getDocs(q);
      return !snapshot.empty;
    } catch (error) {
      console.error("Error checking existing reservation:", error);
      return false;
    }
  };

  const handleBookTable = async () => {
    if (!tableReservation.date || !tableReservation.time) {
      setAlertModal({
        open: true,
        title: "Missing Information",
        message: "Please select both date and time for your reservation.",
        type: "error"
      });
      return;
    }

    const selectedDate = new Date(tableReservation.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (selectedDate < today) {
      setAlertModal({
        open: true,
        title: "Invalid Date",
        message: "Cannot book a table for a past date. Please select a future date.",
        type: "error"
      });
      return;
    }

    const timeHour = parseInt(tableReservation.time.split(':')[0]);
    if (timeHour < 17 || timeHour > 22) {
      setAlertModal({
        open: true,
        title: "Invalid Time",
        message: "Restaurant operating hours are 5:00 PM to 10:00 PM. Please select a time within these hours.",
        type: "error"
      });
      return;
    }

    const hasExisting = await checkExistingReservation(tableReservation.date, tableReservation.time);
    if (hasExisting) {
      setAlertModal({
        open: true,
        title: "Duplicate Reservation",
        message: `You already have a reservation on ${tableReservation.date} at ${tableReservation.time}. Please choose a different time.`,
        type: "error"
      });
      return;
    }

    if (tableReservation.partySize < 1 || tableReservation.partySize > 20) {
      setAlertModal({
        open: true,
        title: "Invalid Party Size",
        message: "Party size must be between 1 and 20 guests.",
        type: "error"
      });
      return;
    }

    setIsBookingTable(true);
    try {
      const currentUserId = currentUser?.id || currentUser?.uid || 'unknown';
      
      const availableTables: RestaurantTable[] = await findAvailableTables(
        tableReservation.partySize, 
        tableReservation.date, 
        tableReservation.time
      );
      
      if (availableTables.length === 0) {
        setAlertModal({
          open: true,
          title: "No Tables Available",
          message: `No tables available for ${tableReservation.partySize} guests on ${tableReservation.date} at ${tableReservation.time}. Please try a different time.`,
          type: "warning"
        });
        setIsBookingTable(false);
        return;
      }
      
      const selectedTable = availableTables[0];
      
      const newReservation = {
        guestId: currentUserId,
        guestName: currentUser?.name || 'Guest',
        date: tableReservation.date,
        time: tableReservation.time,
        partySize: tableReservation.partySize,
        specialRequests: tableReservation.specialRequests,
        status: 'confirmed' as const,
        tableId: selectedTable.id,
        tableNumber: selectedTable.number,
        tableType: selectedTable.type,
        location: selectedTable.location,
        createdAt: new Date().toISOString()
      };
      
      const docRef = await addDoc(collection(db, 'table_reservations'), newReservation);
      
      setTableConfirmationData({
        reservationId: docRef.id,
        guestName: currentUser?.name || 'Guest',
        date: tableReservation.date,
        time: tableReservation.time,
        partySize: tableReservation.partySize,
        tableNumber: selectedTable.number,
        tableType: selectedTable.type,
        location: selectedTable.location,
        specialRequests: tableReservation.specialRequests,
        createdAt: new Date()
      });
      
      setHasActiveReservation(true);
      setActiveReservation({ 
        id: docRef.id, 
        ...newReservation,
        tableNumber: selectedTable.number,
        tableType: selectedTable.type
      } as TableReservation);
      
      setShowTableBooking(false);
      setShowTableConfirmation(true);
      
    } catch (error) {
      console.error("Table booking error:", error);
      setAlertModal({
        open: true,
        title: "Booking Failed",
        message: "Failed to book table. Please try again.",
        type: "error"
      });
    } finally {
      setIsBookingTable(false);
    }
  };

  const generateBill = () => {
    const total = getCartTotal();
    const tax = total * 0.1;
    const grandTotal = total + tax;
    
    const billData: BillData = {
      guestName: currentUser?.name || 'Guest',
      guestId: currentUser?.id || currentUser?.uid || 'unknown',
      orderType: orderType,
      tableNumber: activeReservation?.tableNumber,
      tableType: activeReservation?.tableType,
      items: cart.map(item => ({ 
        name: item.name, 
        quantity: item.quantity, 
        price: item.price, 
        subtotal: item.price * item.quantity 
      })),
      subtotal: total,
      tax: tax,
      total: grandTotal,
      orderDate: new Date().toISOString(),
      reservationId: activeReservation?.id
    };
    
    setCurrentBill(billData);
    setShowBillModal(true);
  };


const downloadBillAsPDF = async () => {
  if (!currentBill) return;
  
  const details = [
    { label: 'Guest Name', value: currentBill.guestName },
    { label: 'Order Type', value: currentBill.orderType.toUpperCase() },
    ...(currentBill.tableNumber ? [{ label: 'Table', value: `${currentBill.tableNumber} (${getTableTypeLabel(currentBill.tableType || 'standard')})` }] : []),
    { label: 'Date', value: new Date(currentBill.orderDate).toLocaleString() }
  ];
  
  const html = getProfessionalPDFHTML({
    title: 'RESTAURANT BILL',
    guestName: currentBill.guestName,
    details: details,
    items: currentBill.items,
    subtotal: currentBill.subtotal,
    tax: currentBill.tax,
    total: currentBill.total,
    footer: 'Thank you for dining with us! Please see your server for payment.'
  });
  
  await generatePDFFromHTML(html, `Restaurant_Bill_${currentBill.guestName.replace(/\s/g, '_')}.pdf`);
};

  const submitOrder = async () => {
    setIsSubmitting(true);
    
    try {
      const u = currentUser;
      const subtotal = getCartTotal();
      const tax = subtotal * 0.1;
      const totalWithTax = parseFloat((subtotal * 1.1).toFixed(2));
      const currentUserId = u?.id || u?.uid || 'unknown';

      const liveOrderRef = push(ref(rtdb, 'orders'));
      await set(liveOrderRef, {
        guestId: currentUserId,
        guestName: u?.name || 'Guest',
        roomNumber: u?.roomNumber || (orderType === 'room_delivery' ? 'N/A' : null),
        tableNumber: activeReservation?.tableNumber || null,
        tableType: activeReservation?.tableType || null,
        items: cart.map(item => ({ name: item.name, quantity: item.quantity, price: item.price })),
        orderType: orderType,
        status: 'pending',
        totalAmount: totalWithTax,
        timestamp: Date.now()
      });

      const confirmationRef = await addDoc(collection(db, "order_confirmations"), {
        guestId: currentUserId,
        guestName: u?.name || 'Guest',
        orderId: liveOrderRef.key,
        orderType: orderType,
        items: cart.map(item => ({ name: item.name, quantity: item.quantity, price: item.price })),
        subtotal: subtotal,
        tax: tax,
        totalAmount: totalWithTax,
        status: 'confirmed',
        estimatedWaitTime: 30,
        createdAt: new Date().toISOString()
      });

      setOrderConfirmationData({
        id: confirmationRef.id,
        orderId: liveOrderRef.key || 'unknown',
        guestName: u?.name || 'Guest',
        items: [...cart],
        subtotal: subtotal,
        tax: tax,
        totalAmount: totalWithTax,
        createdAt: new Date()
      });

      setLastOrder({ 
        id: liveOrderRef.key || 'unknown', 
        items: [...cart], 
        totalAmount: totalWithTax,
        createdAt: { 
          seconds: Math.floor(Date.now() / 1000),
          nanoseconds: 0 
        },
        status: orderType === 'dine_in' ? 'table_service' : 'charged_to_room'
      });
      
      setCart([]);
      setShowCart(false);
      setShowOrderConfirmation(true);
      
      if (orderType === 'dine_in') {
        setTimeout(() => {
          generateBill();
        }, 2000);
      }
    } catch (err) {
      console.error(err);
      setAlertModal({
        open: true,
        title: "Order Failed",
        message: "Ordering system encountered an error. Please try again.",
        type: "error"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePlaceOrder = async () => {
    if (cart.length === 0 || !user) return;
    
    if (orderType === 'dine_in' && !hasActiveReservation) {
      setShowTableBooking(true);
      return;
    }
    
    // For dine-in and takeaway, show payment modal first
    if (orderType === 'dine_in' || orderType === 'takeaway') {
      const totalWithTax = parseFloat((getCartTotal() * 1.1).toFixed(2));
      setPendingOrderTotal(totalWithTax);
      setShowPaymentModal(true);
      return;
    }
    
    // Room delivery continues as before (charge to room)
    await submitOrder();
  };

  const handlePaymentSuccess = () => {
    setShowPaymentModal(false);
    submitOrder();
  };

  const getMinDate = () => new Date().toISOString().split('T')[0];
  const getAvailableTimeSlots = () => ['17:00', '18:00', '19:00', '20:00', '21:00', '22:00'];

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#1e3a5f] mb-4" />
        <p className="text-gray-500 italic">Loading menu...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <AlertModal
        open={alertModal.open}
        onClose={() => setAlertModal(prev => ({ ...prev, open: false }))}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />
      
      {showPaymentModal && (
        <RestaurantPaymentModal 
          open={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={handlePaymentSuccess}
          amount={pendingOrderTotal}
          orderType={orderType}
          bookingId={activeBooking?.id}
        />
      )}
      
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-serif font-bold text-[#1e3a5f] dark:text-blue-400">Dining Room</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Premium Resort Cuisine</p>
          </div>
        </div>
        <Button 
          variant="outline" 
          className="relative border-[#1e3a5f] text-[#1e3a5f] dark:border-blue-400 dark:text-blue-400 dark:hover:bg-slate-800"
          onClick={() => setShowCart(true)}
        >
          <ShoppingCart className="h-4 w-4 mr-2" />
          View Cart
          {cart.length > 0 && (
            <Badge className="absolute -top-2 -right-2 bg-[#c9a227] text-white">
              {cart.reduce((a, b) => a + b.quantity, 0)}
            </Badge>
          )}
        </Button>
      </div>

      {/* Order Type Selection */}
      <div className="flex gap-4 p-4 bg-gray-50 dark:bg-slate-900 rounded-lg">
        <Button
          variant={orderType === 'dine_in' ? 'default' : 'outline'}
          className={orderType === 'dine_in' ? 'bg-[#1e3a5f] dark:bg-blue-600' : 'dark:text-gray-200 dark:border-slate-700'}
          onClick={() => setOrderType('dine_in')}
        >
          <UtensilsCrossed className="h-4 w-4 mr-2" />
          Dine In
        </Button>
        <Button
          variant={orderType === 'takeaway' ? 'default' : 'outline'}
          className={orderType === 'takeaway' ? 'bg-[#1e3a5f] dark:bg-blue-600' : 'dark:text-gray-200 dark:border-slate-700'}
          onClick={() => setOrderType('takeaway')}
        >
          <ShoppingCart className="h-4 w-4 mr-2" />
          Takeaway
        </Button>
        {isResident && (
          <Button
            variant={orderType === 'room_delivery' ? 'default' : 'outline'}
            className={orderType === 'room_delivery' ? 'bg-[#1e3a5f] dark:bg-blue-600' : 'dark:text-gray-200 dark:border-slate-700'}
            onClick={() => setOrderType('room_delivery')}
          >
            <Home className="h-4 w-4 mr-2" />
            Room Delivery
          </Button>
        )}
      </div>

      {/* Book a Table Button */}
      {orderType === 'dine_in' && !hasActiveReservation && (
        <Button 
          variant="outline" 
          className="w-full border-[#c9a227] text-[#c9a227] hover:bg-[#c9a227]/10"
          onClick={() => setShowTableBooking(true)}
        >
          <Calendar className="h-4 w-4 mr-2" />
          Book a Table First
        </Button>
      )}

      {/* Active Reservation Display */}
      {hasActiveReservation && activeReservation && (
        <Card className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                <div>
                  <p className="text-sm font-semibold text-green-800 dark:text-green-300">Table Reserved</p>
                  <p className="text-xs text-green-600 dark:text-green-400/80">
                    Table {activeReservation.tableNumber} ({activeReservation.tableType ? getTableTypeLabel(activeReservation.tableType) : 'Standard'}) • {activeReservation.date} at {activeReservation.time} • {activeReservation.partySize} guests
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="text-green-600" onClick={() => setShowTableBooking(true)}>
                Modify
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {/* Dietary Filters */}
      <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
        {['all', 'vegan', 'vegetarian', 'gluten-free', 'halal'].map(filter => (
          <Badge 
            key={filter} 
            className={`px-4 py-1.5 cursor-pointer capitalize text-sm whitespace-nowrap ${
              dietaryFilter === filter 
                ? 'bg-[#1e3a5f] text-white hover:bg-[#163058]' 
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:bg-slate-800 dark:text-gray-300 dark:border-slate-700'
            }`}
            onClick={() => setDietaryFilter(filter)}
            variant={dietaryFilter === filter ? 'default' : 'outline'}
          >
            {filter}
          </Badge>
        ))}
      </div>

      {/* Menu Display */}
      {Object.entries(menu).map(([category, items]) => {
        const filteredItems = items.filter(item => {
          if (dietaryFilter === 'all') return true;
          const tags = getDietaryTags(item.name, item.description);
          return tags.includes(dietaryFilter);
        });

        if (filteredItems.length === 0) return null;

        return (
          <div key={category} className="space-y-4">
            <h3 className="text-lg font-bold capitalize text-[#1e3a5f] dark:text-blue-400 border-b dark:border-slate-800 pb-2">{category}</h3>
            <div className="grid md:grid-cols-2 gap-4">
              {filteredItems.map((item) => {
                const tags = getDietaryTags(item.name, item.description);
                return (
                  <Card key={item.id} className="border-none shadow-sm ring-1 ring-gray-100 dark:ring-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                    {item.image && (
                      <div className="h-32 overflow-hidden relative">
                        <img src={item.image} alt={item.name} className="w-full h-full object-cover" onError={(e) => (e.currentTarget.src = '/food-placeholder.jpg')} />
                      </div>
                    )}
                    <CardContent className="p-4 flex justify-between items-center bg-white dark:bg-slate-900">
                      <div className="space-y-1 flex-1 pr-4">
                        <div className="flex items-start justify-between">
                          <h4 className="font-bold text-gray-900 dark:text-white">{item.name}</h4>
                        </div>
                        {tags.length > 0 && (
                          <div className="flex gap-1 flex-wrap mb-1">
                            {tags.map(t => (
                              <span key={t} className="text-[10px] px-1.5 py-0.5 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-sm uppercase tracking-wider font-semibold">
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{item.description}</p>
                        <p className="font-bold text-[#c9a227] dark:text-yellow-500">R {item.price}</p>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => addToCart(item)} className="dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Table Booking Modal */}
      <Dialog open={showTableBooking} onOpenChange={setShowTableBooking}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>Reserve a Table</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input type="date" className="pl-10" min={getMinDate()} value={tableReservation.date} onChange={(e) => setTableReservation(prev => ({ ...prev, date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Time</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <select 
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 pl-10" 
                  title="Select dining time"
                  value={tableReservation.time} 
                  onChange={(e) => setTableReservation(prev => ({ ...prev, time: e.target.value }))}
                >
                  <option value="">Select time</option>
                  {getAvailableTimeSlots().map(slot => <option key={slot} value={slot}>{slot}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Party Size</Label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input type="number" min={1} max={20} className="pl-10" value={tableReservation.partySize} onChange={(e) => setTableReservation(prev => ({ ...prev, partySize: parseInt(e.target.value) || 1 }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Special Requests</Label>
              <textarea className="w-full min-h-[80px] p-3 border rounded-md" placeholder="Dietary restrictions, celebration notes, etc." value={tableReservation.specialRequests} onChange={(e) => setTableReservation(prev => ({ ...prev, specialRequests: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full bg-[#1e3a5f]" onClick={handleBookTable} disabled={isBookingTable}>
              {isBookingTable ? <Loader2 className="animate-spin" /> : "Confirm Reservation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Table Confirmation Modal */}
      <Dialog open={showTableConfirmation} onOpenChange={setShowTableConfirmation}>
        <DialogContent className="max-w-md bg-transparent border-none shadow-none p-0">
          {tableConfirmationData && (
            <TableConfirmation
              reservationId={tableConfirmationData.reservationId}
              guestName={tableConfirmationData.guestName}
              date={tableConfirmationData.date}
              time={tableConfirmationData.time}
              partySize={tableConfirmationData.partySize}
              tableNumber={tableConfirmationData.tableNumber}
              tableType={tableConfirmationData.tableType}
              location={tableConfirmationData.location}
              specialRequests={tableConfirmationData.specialRequests}
              createdAt={tableConfirmationData.createdAt}
            />
          )}
          <Button 
            className="w-full bg-[#1e3a5f] text-white mt-4" 
            onClick={() => setShowTableConfirmation(false)}
          >
            Close
          </Button>
        </DialogContent>
      </Dialog>

      {/* Cart Dialog */}
      <Dialog open={showCart} onOpenChange={setShowCart}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>Order Summary</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {cart.length === 0 ? (
              <p className="text-center text-gray-400 py-8">Your cart is empty.</p>
            ) : (
              cart.map((item) => (
                <div key={item.id} className="flex justify-between items-center">
                  <div><p className="font-bold text-sm">{item.name}</p><p className="text-xs text-gray-500">R {item.price * item.quantity}</p></div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center border rounded-md">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => updateQuantity(item.id, -1)}><Minus className="h-3 w-3" /></Button>
                      <span className="text-xs w-4 text-center">{item.quantity}</span>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => updateQuantity(item.id, 1)}><Plus className="h-3 w-3" /></Button>
                    </div>
                    <Button variant="ghost" size="icon" className="text-red-500" onClick={() => removeFromCart(item.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))
            )}
            {cart.length > 0 && (
              <div className="pt-4 border-t">
                <div className="flex justify-between font-bold text-lg text-[#1e3a5f]">
                  <span>Total (Inc. Fee)</span>
                  <span>R {(getCartTotal() * 1.1).toFixed(2)}</span>
                </div>
                <p className="text-xs text-gray-400 mt-2 text-center">
                  {orderType === 'dine_in' && !hasActiveReservation && "Table reservation required"}
                  {orderType === 'room_delivery' && "Delivery to your room within 45 minutes"}
                  {orderType === 'takeaway' && "Ready for pickup at the restaurant counter"}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button className="w-full bg-[#1e3a5f]" disabled={cart.length === 0 || isSubmitting || (orderType === 'dine_in' && !hasActiveReservation)} onClick={handlePlaceOrder}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : "Place Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Confirmation Modal */}
      <Dialog open={showOrderConfirmation} onOpenChange={setShowOrderConfirmation}>
        <DialogContent className="max-w-md bg-transparent border-none shadow-none p-0">
          {orderConfirmationData && (
            <OrderConfirmation
              orderId={orderConfirmationData.orderId}
              guestName={orderConfirmationData.guestName}
              items={orderConfirmationData.items}
              subtotal={orderConfirmationData.subtotal}
              tax={orderConfirmationData.tax}
              totalAmount={orderConfirmationData.totalAmount}
              estimatedWaitTime={30}
              createdAt={orderConfirmationData.createdAt}
            />
          )}
          <Button 
            className="w-full bg-[#1e3a5f] text-white mt-4" 
            onClick={() => setShowOrderConfirmation(false)}
          >
            Close
          </Button>
        </DialogContent>
      </Dialog>

      {/* Order Success Modal */}
      <Dialog open={showOrderSuccess} onOpenChange={setShowOrderSuccess}>
        <DialogContent className="max-w-md bg-transparent border-none shadow-none p-0">
          <div className="space-y-4">
            <div className="bg-green-600 text-white p-4 rounded-t-xl text-center flex items-center justify-center gap-2 font-bold">
              <CheckCircle2 className="h-5 w-5" /> Order Placed
            </div>
            {lastOrder && <DigitalReceipt data={lastOrder} />}
            <Button className="w-full bg-[#1e3a5f] text-white" onClick={() => setShowOrderSuccess(false)}>Continue</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Restaurant Bill Modal */}
      <Dialog open={showBillModal} onOpenChange={setShowBillModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UtensilsCrossed className="h-5 w-5 text-[#c9a227]" />
              Restaurant Bill
            </DialogTitle>
          </DialogHeader>
          {currentBill && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p><strong>Guest:</strong> {currentBill.guestName}</p>
                <p><strong>Order Type:</strong> {currentBill.orderType.toUpperCase()}</p>
                {currentBill.tableNumber && (
                  <p><strong>Table:</strong> {currentBill.tableNumber} ({currentBill.tableType ? getTableTypeLabel(currentBill.tableType) : 'Standard'})</p>
                )}
                <p><strong>Date:</strong> {new Date(currentBill.orderDate).toLocaleString()}</p>
              </div>
              <div className="space-y-2">
                {currentBill.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span>{item.quantity}x {item.name}</span>
                    <span>R {item.subtotal}</span>
                  </div>
                ))}
              </div>
              <div className="border-t pt-2">
                <div className="flex justify-between"><span>Subtotal:</span><span>R {currentBill.subtotal}</span></div>
                <div className="flex justify-between"><span>Tax (10%):</span><span>R {currentBill.tax}</span></div>
                <div className="flex justify-between font-bold text-lg"><span>TOTAL:</span><span>R {currentBill.total}</span></div>
              </div>
              <Button className="w-full bg-green-600" onClick={downloadBillAsPDF}>
                <Download className="mr-2 h-4 w-4" /> Download Bill as PDF
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}