import { db, rtdb } from './firebase-services';
import { 
  doc, 
  writeBatch, 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  where, 
  getDocs,
} from 'firebase/firestore';
import { ref, push, set } from 'firebase/database';

// Define specific interfaces to replace 'any'
interface BookingData {
  id?: string;
  guestId: string;
  roomNumber: string;
  roomName: string;
  status: 'confirmed' | 'checked_in' | 'checked_out';
  paymentStatus: string;
  cardLastFour: string;
  checkInDate: string;
  checkOutDate: string;
  totalOwed: number;
}

interface RoomInfo {
  id: string;
  name: string;
  pricePerNight: number;
  checkIn: string;
  checkOut: string;
}

interface CardInfo {
  cardNumber: string;
  expiry: string;
  cvv: string;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  quantity?: number;
}

interface GuestProfile {
  id?: string;
  uid?: string;
  name: string;
  roomNumber: string;
}

/**
 * USE CASE: Booking a room with card verification (Add-to-bill)
 */
export const verifyAndBookRoom = async (
  guestId: string, 
  room: RoomInfo, 
  cardDetails: CardInfo
) => {
  const batch = writeBatch(db);
  const bookingId = `BK-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

  try {
    const bookingRef = doc(db, "bookings", bookingId);
    const newBooking: BookingData = {
      guestId,
      roomNumber: room.id,
      roomName: room.name,
      status: 'confirmed',
      paymentStatus: 'card_verified',
      cardLastFour: cardDetails.cardNumber.slice(-4),
      checkInDate: room.checkIn,
      checkOutDate: room.checkOut,
      totalOwed: room.pricePerNight
    };

    batch.set(bookingRef, {
      ...newBooking,
      createdAt: serverTimestamp(),
    });

    const roomRef = doc(db, 'rooms', room.id);
    batch.update(roomRef, { isAvailable: false });

    await batch.commit();
    return { success: true, bookingId };
  } catch (error) {
    console.error("Booking Error:", error);
    throw new Error("Could not verify card. Please try again.");
  }
};

/**
 * USE CASE: Placing a Restaurant Order
 */
/**
 * USE CASE: Placing a Restaurant Order
 * Creates an ORDER CONFIRMATION immediately, and later a DELIVERY RECEIPT
 */
export const placeRestaurantOrder = async (
  guest: GuestProfile, 
  cart: MenuItem[]
) => {
  const total = cart.reduce((sum: number, item: MenuItem) => sum + item.price, 0);
  const totalWithTax = parseFloat((total * 1.1).toFixed(2));
  
  try {
    // 1. Live Kitchen Order (RTDB)
    const liveOrderRef = push(ref(rtdb, 'orders'));
    await set(liveOrderRef, {
      guestName: guest.name,
      roomNumber: guest.roomNumber,
      items: cart,
      status: 'pending',
      totalAmount: totalWithTax,
      timestamp: Date.now()
    });

    // 2. ORDER CONFIRMATION SLIP (Immediate proof of order)
    const confirmationRef = await addDoc(collection(db, "order_confirmations"), {
      guestId: guest.id || guest.uid,
      orderId: liveOrderRef.key,
      items: cart,
      subtotal: total,
      tax: total * 0.1,
      totalAmount: totalWithTax,
      status: 'confirmed',
      type: 'order_confirmation',
      createdAt: serverTimestamp(),
      estimatedWaitTime: 30, // minutes
    });

    // 3. Return both IDs
    return { 
      success: true, 
      orderId: liveOrderRef.key,
      confirmationId: confirmationRef.id 
    };
  } catch (error) {
    console.error("Order Error:", error);
    throw new Error("Failed to send order to the kitchen.");
  }
};

/**
 * NEW: Create Delivery Receipt when order is delivered
 */
export const createDeliveryReceipt = async (
  orderId: string,
  guestId: string,
  guestName: string,
  items: MenuItem[],
  totalAmount: number
) => {
  try {
    const receiptRef = await addDoc(collection(db, "receipts"), {
      guestId: guestId,
      orderId: orderId,
      guestName: guestName,
      items: items,
      totalAmount: totalAmount,
      status: 'delivered',
      type: 'delivery_receipt',
      deliveredAt: serverTimestamp(),
      createdAt: serverTimestamp()
    });
    return { success: true, receiptId: receiptRef.id };
  } catch (error) {
    console.error("Delivery receipt error:", error);
    return { success: false, error: error };
  }
};

/**
 * USE CASE: Fetching Guest Order History
 */
export const getGuestReceipts = async (guestId: string) => {
  const q = query(
    collection(db, "receipts"), 
    where("guestId", "==", guestId)
  );
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};