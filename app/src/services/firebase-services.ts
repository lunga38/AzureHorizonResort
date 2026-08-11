import { 
  signInWithEmailAndPassword, 
  signInAnonymously, 
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  type User as FirebaseUser 
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  addDoc, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  onSnapshot, 
  getDocs,
  getDoc,
  deleteDoc,
  runTransaction
} from 'firebase/firestore';
import { ref, push, set, onValue, off, update, get } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { createDeliveryReceipt } from './transaction-services';


// IMPORT from your local firebase config file
import { auth, db as dbInstance, rtdb as rtdbInstance, storage as storageInstance } from '../lib/firebase';
import type { RewardItem, RedemptionVoucher, LoyaltyLogEntry, ActivityPost } from '@/types';
import type { 
  Room, 
  Booking, 
  RoomServiceRequest, 
  RequestStatus,
  TableReservation, 
  FoodOrder, 
  ChatMessage,
  User as AppUser // Aliased to avoid conflict with Firebase User
} from '@/types';



// ==========================================
// EXPORTS FOR EXTERNAL USE
// ==========================================
export const db = dbInstance;
export const rtdb = rtdbInstance;
export const storage = storageInstance;

// ==========================================
// AUTHENTICATION SERVICES
// ==========================================

/**
 * Registers a new visitor account in Auth and Firestore
 */
export const registerUser = async (email: string, password: string, name: string) => {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    const uid = userCredential.user.uid;

    const userData: AppUser = {
      id: uid,
      uid: uid, // Store Firebase UID for auth linkage
      name,
      email: cleanEmail,
      role: 'guest',
      status: 'visitor', // Default status for new registrations
    };

    // Store in 'users' collection using email as key to match login logic
    await setDoc(doc(db, 'users', cleanEmail), userData);
    return { user: userData, error: null };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    return { user: null, error: message };
  }
};

export const loginUser = async (email: string, password: string) => {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
    const uid = userCredential.user.uid;

    const userDoc = await getDoc(doc(db, 'users', cleanEmail));
    
    if (userDoc.exists()) {
      return { user: { id: uid, ...userDoc.data() } as AppUser, error: null };
    } else {
      return { user: null, error: "Profile not found in system database." };
    }
  } catch (error: any) {
    let message = 'Login failed';
    if (error.code === 'auth/user-not-found') message = 'No account found with this email.';
    if (error.code === 'auth/wrong-password') message = 'Incorrect password.';
    if (error.code === 'auth/invalid-email') message = 'Invalid email format.';
    
    return { user: null, error: error.message || message };
  }
};

export const loginAsGuest = async (name: string, roomNumber?: string) => {
  try {
    const userCredential = await signInAnonymously(auth);
    const uid = userCredential.user.uid;

    const guestData: AppUser = {
      id: uid,
      uid: uid, // Store Firebase UID for auth linkage
      name: name,
      role: 'guest',
      status: 'visitor', 
      roomNumber: 'N/A',
    };

    if (roomNumber && roomNumber.trim() !== "") {
      const bookingsRef = collection(db, 'bookings');
      const q = query(
        bookingsRef, 
        where("guestName", "==", name),
        where("roomNumber", "==", roomNumber)
      );
      
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        guestData.status = 'resident';
        guestData.roomNumber = roomNumber;
      }
    }

    await setDoc(doc(db, 'guests', uid), guestData);
    return { user: guestData, error: null };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error during guest login';
    return { user: null, error: message };
  }
};

export const logoutUser = async () => {
  try {
    await signOut(auth);
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
};

export const listenForAuthChanges = (callback: (user: FirebaseUser | null) => void) => {
  return onAuthStateChanged(auth, (user) => {
    callback(user);
  });
};

// ==========================================
// ROOM SERVICES
// ==========================================

export const listenForRooms = (callback: (rooms: Room[]) => void) => {
  const q = collection(db, 'rooms');
  return onSnapshot(q, (snapshot) => {
    const rooms = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Room));
    callback(rooms);
  });
};

export const getAvailableRooms = async (): Promise<Room[]> => {
  const querySnapshot = await getDocs(collection(db, 'rooms'));
  const allRooms = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Room));
  return allRooms.filter(room => room.isAvailable);
};

// ==========================================
// BOOKING SERVICES
// ==========================================

// Helper: Get room type by room ID
export const getRoomTypeById = async (roomId: string): Promise<string | null> => {
  try {
    const roomDoc = await getDoc(doc(db, 'rooms', roomId));
    if (roomDoc.exists()) {
      return roomDoc.data().type || null;
    }
    return null;
  } catch (error) {
    console.error("Error fetching room type:", error);
    return null;
  }
};

// Helper: Count total physical rooms of a given type
export const countPhysicalRoomsOfType = async (_roomType: string): Promise<number> => {
  return 40; // 200 total rooms / 5 room types = 40 per type
};

// Helper: Get occupancy percentage for a room type
export const getRoomTypeOccupancy = async (roomType: string): Promise<number> => {
  try {
    const totalRooms = await countPhysicalRoomsOfType(roomType);
    if (totalRooms === 0) return 0;
    
    const bookingsRef = collection(db, 'bookings');
    const q = query(
      bookingsRef,
      where('status', 'in', ['confirmed', 'checked_in'])
    );
    const snapshot = await getDocs(q);
    
    let occupiedCount = 0;
    // Normalize "now" to start of today for fair date comparison
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    for (const d of snapshot.docs) {
      const booking = d.data();
      // BUGFIX: Check both roomId and roomNumber since legacy bookings may only have roomNumber
      const roomRef = booking.roomId || booking.roomNumber;
      if (!roomRef) continue;
      
      const bookingRoomType = await getRoomTypeById(roomRef);
      const checkIn = new Date(booking.checkInDate);
      checkIn.setHours(0, 0, 0, 0);
      const checkOut = new Date(booking.checkOutDate);
      checkOut.setHours(23, 59, 59, 999);
      
      // Only count if room is this type and dates overlap with today
      if (bookingRoomType === roomType && checkIn <= now && checkOut > now) {
        occupiedCount++;
      }
    }
    
    return Math.round((occupiedCount / totalRooms) * 100);
  } catch (error) {
    console.error("Error calculating occupancy:", error);
    return 0;
  }
};

// Check if a room is available using SOFT ASSIGNMENTS (room type capacity)
// Instead of checking if the specific roomId is free, check if the room TYPE has capacity
export const checkRoomAvailability = async (roomId: string, checkInDate: string, checkOutDate: string): Promise<boolean> => {
  try {
    // 1. Get the room type
    const roomType = await getRoomTypeById(roomId);
    if (!roomType) {
      console.error("Room type not found for roomId:", roomId);
      return false;
    }

    // 2. Count total physical rooms of this type
    const totalPhysicalRooms = await countPhysicalRoomsOfType(roomType);
    if (totalPhysicalRooms === 0) {
      return false;
    }

    // 3. Count overlapping bookings for ANY room of this type during the requested dates
    const bookingsRef = collection(db, 'bookings');
    const q = query(
      bookingsRef,
      where('status', 'in', ['confirmed', 'checked_in'])
    );
    const allBookingsSnapshot = await getDocs(q);
    
    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);
    
    let overlappingBookingsCount = 0;
    for (const doc of allBookingsSnapshot.docs) {
      const booking = doc.data();
      
      // Only count bookings for rooms of the same type
      const bookingRoomType = await getRoomTypeById(booking.roomId);
      if (bookingRoomType !== roomType) {
        continue;
      }
      
      const existingCheckIn = new Date(booking.checkInDate);
      const existingCheckOut = new Date(booking.checkOutDate);
      
      // Check if date ranges overlap
      if (checkIn < existingCheckOut && checkOut > existingCheckIn) {
        overlappingBookingsCount++;
      }
    }
    
    // 4. Available if overlappingBookings < totalPhysicalRoomsOfType
    return overlappingBookingsCount < totalPhysicalRooms;
  } catch (error) {
    console.error("Error checking availability:", error);
    return true;
  }
};
export const listenForBookings = (callback: (bookings: Booking[]) => void) => {
  const q = collection(db, 'bookings');
  return onSnapshot(q, (snapshot) => {
    const bookings = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
    callback(bookings);
  });
};

export const listenForGuestBooking = (guestId: string, callback: (booking: Booking | null) => void) => {
  const q = query(collection(db, 'bookings'), where('guestId', '==', guestId), where('status', '!=', 'checked_out'));
  return onSnapshot(q, (snapshot) => {
    if (!snapshot.empty) {
      callback({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Booking);
    } else {
      callback(null);
    }
  });
};

export const updateBookingStatus = async (bookingId: string, status: Booking['status']) => {
  try {
    const bookingRef = doc(db, 'bookings', bookingId);
    await updateDoc(bookingRef, { status });
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Error' };
  }
};

// Extend a guest's stay
export const extendBooking = async (bookingId: string, newCheckOutDate: string, pricePerNight: number): Promise<{ success: boolean; booking?: Booking; error?: string }> => {
  try {
    const bookingRef = doc(db, 'bookings', bookingId);
    const bookingDoc = await getDoc(bookingRef);
    
    if (!bookingDoc.exists()) {
      return { success: false, error: 'Booking not found' };
    }
    
    const booking = bookingDoc.data() as Booking;
    
    // Check if the new checkout date is available
    const isAvailable = await checkRoomAvailability(booking.roomId, booking.checkInDate, newCheckOutDate);
    if (!isAvailable) {
      return { success: false, error: 'Room type is fully booked for those dates' };
    }
    
    // Calculate additional nights
    const originalCheckOut = new Date(booking.checkOutDate);
    const newCheckOut = new Date(newCheckOutDate);
    const additionalNights = Math.ceil((newCheckOut.getTime() - originalCheckOut.getTime()) / (1000 * 60 * 60 * 24));
    const additionalCost = additionalNights * pricePerNight;
    
    // Update booking
    const updatedTotalAmount = booking.totalAmount + additionalCost;
    const updatedBalanceDue = (booking.balanceDue ?? booking.totalAmount - (booking.depositPaid ?? 0)) + additionalCost;
    
    await updateDoc(bookingRef, {
      checkOutDate: newCheckOutDate,
      totalAmount: updatedTotalAmount,
      balanceDue: updatedBalanceDue
    });
    
    const updatedBooking: Booking = {
      ...booking,
      checkOutDate: newCheckOutDate,
      totalAmount: updatedTotalAmount,
      balanceDue: updatedBalanceDue
    };
    
    return { success: true, booking: updatedBooking };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Error extending booking' };
  }
};

// ==========================================
// ROOM SERVICE REQUESTS
// ==========================================

export const listenForServiceRequests = (callback: (requests: RoomServiceRequest[]) => void) => {
  const q = collection(db, 'service_requests');
  return onSnapshot(q, (snapshot) => {
    const requests = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as RoomServiceRequest));
    callback(requests);
  });
};

export const updateServiceRequestStatus = async (requestId: string, status: RequestStatus) => {
  try {
    const requestRef = doc(db, 'service_requests', requestId);
    await updateDoc(requestRef, { 
      status,
      completedAt: status === 'completed' ? new Date().toISOString() : null
    });
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error updating service request';
    return { success: false, error: message };
  }
};



// ==========================================
// RESTAURANT & KITCHEN (RTDB)
// ==========================================

export const listenForOrders = (callback: (orders: FoodOrder[]) => void) => {
  const ordersRef = ref(rtdb, 'orders');
  console.log("Setting up orders listener at path: orders");
  
  onValue(ordersRef, (snapshot) => {
    const data = snapshot.val();
    console.log("Orders snapshot received:", data);
    if (data) {
      const ordersArray = Object.keys(data).map(key => ({ id: key, ...data[key] }));
      console.log("Processed orders:", ordersArray.length);
      callback(ordersArray as FoodOrder[]);
    } else {
      console.log("No orders found in database");
      callback([]);
    }
  });
  return () => off(ordersRef);
};

export const createOrder = async (order: Omit<FoodOrder, 'id' | 'createdAt'>) => {
  try {
    const newOrderRef = push(ref(rtdb, 'orders'));
    const orderData = { ...order, createdAt: new Date().toISOString(), id: newOrderRef.key };
    await set(newOrderRef, orderData);
    return { orderId: newOrderRef.key };
  } catch (error: unknown) {
    return { orderId: null, error: error instanceof Error ? error.message : 'Error' };
  }
};

export const claimOrder = async (orderId: string, chefId: string) => {
  try {
    if (!chefId) {
      console.error("No chef ID provided");
      return { success: false, error: "No chef ID provided" };
    }
    
    console.log(`Claiming order ${orderId} for chef ${chefId}`);
    const orderRef = ref(rtdb, `orders/${orderId}`);
    
    // Use update with proper object
    await update(orderRef, { 
      status: 'preparing', 
      assignedTo: chefId,
      claimedAt: Date.now()
    });
    
    console.log(`Order ${orderId} claimed successfully`);
    return { success: true };
  } catch (error: unknown) {
    console.error("Claim order error:", error);
    return { success: false, error: error instanceof Error ? error.message : 'Error' };
  }
};

export const markOrderReady = async (orderId: string) => {
  try {
    await update(ref(rtdb, `orders/${orderId}`), { 
      status: 'ready',
      assignedTo: null  // ← ADD THIS LINE to clear the chef assignment
    });
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Error' };
  }
};

// For waitstaff - pick up ready order for delivery
export const pickupOrder = async (orderId: string, staffId: string) => {
  try {
    await update(ref(rtdb, `orders/${orderId}`), { 
      status: 'picked_up',  // ← Different from 'preparing'
      assignedTo: staffId,
      pickedUpAt: Date.now()
    });
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Error' };
  }
};

export const deliverOrder = async (orderId: string) => {
  try {
    // Get order details first
    const orderRef = ref(rtdb, `orders/${orderId}`);
    const orderSnapshot = await get(orderRef);
    const orderData = orderSnapshot.val();
    
    // Update order status
    await update(ref(rtdb, `orders/${orderId}`), { 
      status: 'delivered',
      completedAt: new Date().toISOString()
    });
    
    // Create delivery receipt in Firestore
    if (orderData) {
      await createDeliveryReceipt(
        orderId,
        orderData.guestId || 'unknown',
        orderData.guestName || 'Guest',
        orderData.items || [],
        orderData.totalAmount || 0
      );
    }
    
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error delivering order';
    return { success: false, error: message };
  }
};
// ==========================================
// CHAT & STORAGE
// ==========================================

export const listenForChatMessages = (guestId: string, callback: (messages: ChatMessage[]) => void) => {
  const chatRef = ref(rtdb, `chats/${guestId}`);
  onValue(chatRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      const messages = Object.keys(data).map(key => ({ id: key, ...data[key] }));
      callback(messages as ChatMessage[]);
    } else {
      callback([]);
    }
  });
  return () => off(chatRef);
};

export const sendChatMessage = async (message: Omit<ChatMessage, 'id' | 'timestamp'>, targetChatId?: string) => {
  try {
    const chatId = targetChatId || (message.senderRole === 'guest' ? message.senderId : 'concierge');
    const newMsgRef = push(ref(rtdb, `chats/${chatId}`));
    await set(newMsgRef, { ...message, timestamp: new Date().toISOString() });
    return { messageId: newMsgRef.key };
  } catch (error: unknown) {
    return { messageId: null, error: error instanceof Error ? error.message : 'Error' };
  }
};

export const uploadImage = async (file: File, path: string) => {
  try {
    const fRef = storageRef(storage, path);
    await uploadBytes(fRef, file);
    const url = await getDownloadURL(fRef);
    return { url, error: null };
  } catch (error: unknown) {
    return { url: null, error: error instanceof Error ? error.message : 'Error' };
  }
};

export const createTableReservation = async (reservation: Omit<TableReservation, 'id'>) => {
  try {
    await addDoc(collection(db, 'table_reservations'), reservation);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Error' };
  }
};

// Add this to your src/services/firebase-services.ts

export const createBooking = async (bookingData: Omit<Booking, 'id' | 'createdAt'> & { depositPaid?: number }) => {
  try {
    const bookingsRef = collection(db, 'bookings');
    const newDoc = doc(bookingsRef);
    const id = newDoc.id;
    
    const finalBooking = {
      ...bookingData,
      id,
      depositPaid: bookingData.depositPaid || 0,
      createdAt: new Date().toISOString()
    };

    await setDoc(newDoc, finalBooking);
    
    // Update user status to 'resident' if guestEmail is provided
    if (bookingData.guestEmail) {
      const userRef = doc(db, 'users', bookingData.guestEmail);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists()) {
        await updateDoc(userRef, {
          status: 'resident',
          roomNumber: bookingData.roomNumber
        });
        console.log(`Updated user ${bookingData.guestEmail} to resident status`);
      } else {
        console.log("User not found with email:", bookingData.guestEmail);
      }
    }

    return { success: true, bookingId: id };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown booking error occurred';
    console.error("Booking Error:", errorMessage);
    return { success: false, error: errorMessage };
  }
};
/**
 * Creates a new room service or maintenance request in Firestore
 */
export const createServiceRequest = async (requestData: Omit<RoomServiceRequest, 'id' | 'createdAt'>) => {
  try {
    const requestsRef = collection(db, 'service_requests');
    const newDoc = doc(requestsRef);
    const id = newDoc.id;

    // Create the final request object without imageUrl if it's undefined
    const finalRequest: Partial<RoomServiceRequest> & { id: string; createdAt: string; status: string } = {
      ...requestData,
      id,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    
    // Only add imageUrl if it exists (don't send null)
    if (requestData.imageUrl) {
      finalRequest.imageUrl = requestData.imageUrl;
    }

    await setDoc(newDoc, finalRequest);
    return { success: true, requestId: id };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to submit service request';
    console.error("Service Request Error:", errorMessage);
    return { success: false, error: errorMessage };
  }
};

export const checkInGuest = async (bookingId: string, roomNumber: string, guestEmail: string) => {
  try {
    // 1. Update the Booking
    await updateDoc(doc(db, 'bookings', bookingId), { status: 'checked_in' });

    // 2. Update the User (The "Resident" unlock)
    await updateDoc(doc(db, 'users', guestEmail), { 
      status: 'resident', 
      roomNumber: roomNumber 
    });

    // 3. Update the Physical Room
    await updateDoc(doc(db, 'rooms', roomNumber), { isAvailable: false });

    return { success: true };
  } catch (error: unknown) {
    console.error("Check-in error:", error);
    return { success: false };
  }
};

// ==========================================
// TOUR SERVICES (UC14, UC15, UC17)
// ==========================================

import type { Tour, TourBooking } from '@/types';

export const listenForTours = (callback: (tours: Tour[]) => void) => {
  const q = collection(db, 'tours');
  return onSnapshot(q, (snapshot) => {
    const tours = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Tour));
    callback(tours);
  });
};

export const createTour = async (tourData: Omit<Tour, 'id' | 'createdAt'>) => {
  try {
    const toursRef = collection(db, 'tours');
    const newDoc = doc(toursRef);
    const id = newDoc.id;
    const finalTour = { ...tourData, id, createdAt: new Date().toISOString() };
    await setDoc(newDoc, finalTour);
    return { success: true, tourId: id };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Error' };
  }
};

export const updateTour = async (tourId: string, data: Partial<Tour>) => {
  try {
    await updateDoc(doc(db, 'tours', tourId), data as Record<string, unknown>);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Error' };
  }
};

export const createTourBooking = async (booking: Omit<TourBooking, 'id' | 'createdAt'>) => {
  try {
    const ref = collection(db, 'tour_bookings');
    const newDoc = doc(ref);
    const id = newDoc.id;
    const finalBooking = { ...booking, id, createdAt: new Date().toISOString() };
    await setDoc(newDoc, finalBooking);

    // Increment bookedCount on the matching schedule slot
    const tourRef = doc(db, 'tours', booking.tourId);
    const tourSnap = await getDoc(tourRef);
    if (tourSnap.exists()) {
      const tourData = tourSnap.data() as Tour;
      const totalTickets = booking.tickets.reduce((sum, t) => sum + t.quantity, 0);
      const updatedSchedules = tourData.schedules.map(slot => {
        if (slot.date === booking.date && slot.time === booking.time) {
          return { ...slot, bookedCount: (slot.bookedCount || 0) + totalTickets };
        }
        return slot;
      });
      await updateDoc(tourRef, { schedules: updatedSchedules });
    }

    return { success: true, bookingId: id };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Error' };
  }
};

export const listenForGuestTourBookings = (guestId: string, callback: (bookings: TourBooking[]) => void) => {
  const q = query(collection(db, 'tour_bookings'), where('guestId', '==', guestId));
  return onSnapshot(q, (snapshot) => {
    const bookings = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TourBooking));
    callback(bookings);
  });
};

export const listenForTourBookingsBySession = (
  tourId: string,
  date: string,
  time: string,
  callback: (bookings: TourBooking[]) => void
) => {
  const q = query(
    collection(db, 'tour_bookings'),
    where('tourId', '==', tourId),
    where('date', '==', date),
    where('time', '==', time)
  );
  return onSnapshot(q, (snapshot) => {
    const bookings = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TourBooking));
    callback(bookings);
  });
};

export const listenForAllTourBookings = (callback: (bookings: TourBooking[]) => void) => {
  const q = collection(db, 'tour_bookings');
  return onSnapshot(q, (snapshot) => {
    const bookings = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TourBooking));
    callback(bookings);
  });
};

export const checkInForTour = async (bookingId: string) => {
  try {
    await updateDoc(doc(db, 'tour_bookings', bookingId), {
      status: 'checked_in',
      checkedInAt: new Date().toISOString()
    });
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Error' };
  }
};

export const updateTourBookingStatus = async (bookingId: string, status: 'confirmed' | 'checked_in' | 'completed' | 'no_show' | 'cancelled') => {
  try {
    const bookingRef = doc(db, 'tour_bookings', bookingId);
    await updateDoc(bookingRef, { status });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

// ==========================================
// ACTIVITY BOARD (Social Feature)
// ==========================================

export const listenForActivityPosts = (callback: (posts: ActivityPost[]) => void) => {
  const q = collection(db, 'activity_posts');
  return onSnapshot(q, (snapshot) => {
    const posts = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ActivityPost));
    posts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    callback(posts);
  });
};

export const createActivityPost = async (post: Omit<ActivityPost, 'id' | 'createdAt' | 'likes'>) => {
  try {
    await addDoc(collection(db, 'activity_posts'), {
      ...post,
      likes: 0,
      createdAt: new Date().toISOString(),
    });
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Error' };
  }
};

export const likeActivityPost = async (postId: string, guestId: string) => {
  try {
    const postRef = doc(db, 'activity_posts', postId);
    const snap = await getDoc(postRef);
    
    if (snap.exists()) {
      const postData = snap.data();
      const likedBy = postData.likedBy || [];
      
      // Check if user already liked this post
      if (likedBy.includes(guestId)) {
        return { success: false, error: 'You already liked this post' };
      }
      
      // Add user to likedBy array and increment likes
      await updateDoc(postRef, {
        likes: (postData.likes || 0) + 1,
        likedBy: [...likedBy, guestId]
      });
    }
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Error' };
  }
};

// ==========================================
// CONSOLIDATED BILLING QUERIES
// ==========================================

export const fetchAllGuestCharges = async (guestId: string) => {
  try {
    // 1. Fetch Room bookings, but ONLY keep the most recent/active one
    const bookingsQ = query(collection(db, 'bookings'), where('guestId', '==', guestId));
    const bookingsSnap = await getDocs(bookingsQ);
    const allBookings = bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    
    // Sort bookings to find the active or most recent one
    allBookings.sort((a, b) => new Date(b.checkInDate).getTime() - new Date(a.checkInDate).getTime());
    const recentBooking = allBookings.length > 0 ? allBookings[0] : null;
    const bookings = recentBooking ? [recentBooking] : [];

    // Filter timestamp function
    const isWithinBooking = (itemTimeStr: string | number | undefined) => {
      if (!recentBooking || !itemTimeStr) return true; // fallback
      const itemTime = new Date(itemTimeStr).getTime();
      const checkIn = new Date(recentBooking.checkInDate).getTime() - (24 * 60 * 60 * 1000); // 1 day padding
      return itemTime >= checkIn;
    };

    // 2. Receipts (restaurant deliveries)
    const receiptsQ = query(collection(db, 'receipts'), where('guestId', '==', guestId));
    const receiptsSnap = await getDocs(receiptsQ);
    const receipts = receiptsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter(r => 
      isWithinBooking(r.createdAt?.seconds ? r.createdAt.seconds * 1000 : r.createdAt)
    );

    // 3. Spa bookings
    const spaQ = query(collection(db, 'spa_bookings'), where('guestId', '==', guestId));
    const spaSnap = await getDocs(spaQ);
    const spaBookings = spaSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter(s => 
      isWithinBooking(s.createdAt)
    );

    // 4. Tour bookings
    const tourQ = query(collection(db, 'tour_bookings'), where('guestId', '==', guestId));
    const tourSnap = await getDocs(tourQ);
    const tourBookings = tourSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)).filter(t => 
      isWithinBooking(t.createdAt)
    );

    return { bookings, receipts, spaBookings, tourBookings };
  } catch (error) {
    console.error('Error fetching guest charges:', error);
    return { bookings: [], receipts: [], spaBookings: [], tourBookings: [] };
  }
};

// ==========================================
// INCIDENTAL CHARGES SERVICES
// ==========================================

export const addRoomCharge = async (bookingId: string, guestId: string, description: string, amount: number) => {
  try {
    const chargeData = {
      bookingId,
      guestId,
      description,
      amount,
      date: new Date().toISOString()
    };
    const docRef = await addDoc(collection(db, 'incidental_charges'), chargeData);
    
    // Also increment the total balanceDue and totalAmount on the booking itself
    const bookingRef = doc(db, 'bookings', bookingId);
    const bookingDoc = await getDoc(bookingRef);
    if (bookingDoc.exists()) {
      const data = bookingDoc.data();
      const currentTotal = data.totalAmount || 0;
      const currentBalance = data.balanceDue !== undefined ? data.balanceDue : currentTotal;
      await updateDoc(bookingRef, {
        totalAmount: currentTotal + amount,
        balanceDue: currentBalance + amount
      });
    }

    return { success: true, id: docRef.id };
  } catch (error: unknown) {
    console.error("Error adding room charge:", error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

export const listenForRoomCharges = (bookingId: string, callback: (charges: any[]) => void) => {
  if (!bookingId) {
    callback([]);
    return () => {};
  }
  const q = query(collection(db, 'incidental_charges'), where('bookingId', '==', bookingId));
  return onSnapshot(q, (snapshot) => {
    const charges = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    callback(charges);
  });
};

export const clearRoomCharges = async (bookingId: string) => {
  try {
    const q = query(collection(db, 'incidental_charges'), where('bookingId', '==', bookingId));
    const snapshot = await getDocs(q);
    const deletePromises = snapshot.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletePromises);
    return { success: true };
  } catch (error: unknown) {
    console.error("Error clearing room charges:", error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

// ==========================================
// ADVANCED BOOKING ACTIONS
// ==========================================

export const extendStayAndCharge = async (bookingId: string, additionalNights: number) => {
  try {
    const bookingRef = doc(db, 'bookings', bookingId);
    const bookingDoc = await getDoc(bookingRef);
    
    if (!bookingDoc.exists()) {
      return { success: false, error: 'Booking not found' };
    }
    
    const data = bookingDoc.data();
    
    // Fetch room to calculate extra cost
    const roomDoc = await getDoc(doc(db, 'rooms', data.roomId || data.roomNumber));
    let roomPrice = 0;
    if (roomDoc.exists()) {
      roomPrice = roomDoc.data().price || 0;
    }
    
    const additionalCost = roomPrice * additionalNights;
    const newCheckOutDate = new Date(data.checkOutDate);
    newCheckOutDate.setDate(newCheckOutDate.getDate() + additionalNights);
    
    const currentTotal = data.totalAmount || 0;
    const currentBalance = data.balanceDue !== undefined ? data.balanceDue : currentTotal;
    
    await updateDoc(bookingRef, {
      checkOutDate: newCheckOutDate.toISOString().split('T')[0],
      totalAmount: currentTotal + additionalCost,
      balanceDue: currentBalance + additionalCost
    });
    
    // Also record it as a room charge for clarity in the billing summary
    await addDoc(collection(db, 'incidental_charges'), {
      bookingId,
      guestId: data.guestId,
      description: `Extended Stay (${additionalNights} nights)`,
      amount: additionalCost,
      date: new Date().toISOString()
    });
    
    return { 
      success: true, 
      newCheckOutDate: newCheckOutDate.toISOString().split('T')[0],
      additionalCost
    };
  } catch (error: unknown) {
    console.error("Error extending stay:", error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
    
};

export const fetchBlockedSlotsWithBuffer = async (venueId: string, dateString: string) => {
  try {
    const bookingsRef = collection(db, 'event_bookings');
    
    const q = query(
      bookingsRef, 
      where('venueId', '==', venueId)
    );
    
    const snapshot = await getDocs(q);
    const blocked: string[] = [];
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      
      const isBookedOnDate = data.date === dateString || (data.bookedDates && data.bookedDates.includes(dateString));
      
      if (isBookedOnDate) {
        if (data.bookingType === 'hourly' && data.startTime && data.duration) {
          const startHour = parseInt(data.startTime.split(':')[0], 10);
          const endHour = startHour + data.duration;
          
          // STRICT MATCHING: Only blocks the exact hours paid for
          for (let i = startHour; i < endHour; i++) {
            if (i <= 21) {
              blocked.push(`${i}:00`);
            }
          }
        } else if (data.bookingType === 'daily') {
           for(let i = 8; i <= 21; i++) {
             blocked.push(`${i}:00`);
           }
        }
      }
    });
    
    return blocked;
  } catch (error) {
    console.error("Error fetching blocked slots:", error);
    return []; 
  }
};

// --- INITIAL REWARDS SEED DATA ---
// ==========================================
// LOYALTY POINTS SYSTEM
// ==========================================

const DEFAULT_REWARDS: RewardItem[] = [
  {
    id: 'reward-1',
    title: 'Complimentary Dessert',
    pts: 100,
    description: 'Enjoy a artisan gourmet dessert at our fine dining restaurant.',
    category: 'Food & Beverage',
    minTier: 'Bronze',
    tierRank: 1,
    validityDays: 30,
    terms: 'Valid for single use. Non-refundable.',
    howToRedeem: 'Present this code to your waiter during dining.',
    isActive: true,
  },
  {
    id: 'reward-2',
    title: 'Late Checkout (2 PM)',
    pts: 250,
    description: 'Extend your stay with a complimentary late check-out up to 2:00 PM.',
    category: 'Room Perks',
    minTier: 'Silver',
    tierRank: 2,
    validityDays: 30,
    terms: 'Subject to room availability upon request.',
    howToRedeem: 'Inform the front desk upon check-in with your voucher code.',
    isActive: true,
  },
  {
    id: 'reward-3',
    title: 'Free Spa Treatment (30 Min)',
    pts: 500,
    description: 'Relax with a 30-minute foot or head massage at Azure Spa.',
    category: 'Spa & Wellness',
    minTier: 'Gold',
    tierRank: 3,
    validityDays: 60,
    terms: 'Advanced reservation required.',
    howToRedeem: 'Present voucher at the spa reception prior to treatment.',
    isActive: true,
  },
  {
    id: 'reward-4',
    title: 'Executive Suite Upgrade',
    pts: 1500,
    description: 'Upgrade your room reservation to our luxury ocean-view Executive Suite.',
    category: 'Room Perks',
    minTier: 'Platinum',
    tierRank: 4,
    validityDays: 90,
    terms: 'Valid for up to 2 nights consecutive stay.',
    howToRedeem: 'Contact reservations prior to arrival to confirm availability.',
    isActive: true,
  }
];

export async function seedInitialRewards(): Promise<void> {
  try {
    const rewardsRef = collection(db, 'loyalty_rewards');
    const snapshot = await getDocs(rewardsRef);
    if (snapshot.empty) {
      for (const item of DEFAULT_REWARDS) {
        await setDoc(doc(db, 'loyalty_rewards', item.id), item);
      }
    }
  } catch (error) {
    console.error('Error seeding initial rewards:', error);
  }
}

export function calculateLoyaltyTier(points: number): 'bronze' | 'silver' | 'gold' | 'platinum' {
  if (points >= 5000) return 'platinum';
  if (points >= 1500) return 'gold';
  if (points >= 500) return 'silver';
  return 'bronze';
}

export async function fetchRewardsFromDB(): Promise<RewardItem[]> {
  try {
    const rewardsRef = collection(db, 'loyalty_rewards');
    const snapshot = await getDocs(rewardsRef);
    if (snapshot.empty) {
      return DEFAULT_REWARDS;
    }
    return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as RewardItem));
  } catch (error) {
    console.error('Error fetching rewards:', error);
    return DEFAULT_REWARDS;
  }
}

export function listenForUserVouchers(
  guestId: string, 
  callback: (vouchers: RedemptionVoucher[]) => void
) {
  if (!guestId) {
    callback([]);
    return () => {};
  }
  try {
    const q = query(
      collection(db, 'loyalty_vouchers'), 
      where('guestId', '==', guestId)
    );
    return onSnapshot(
      q, 
      (snapshot) => {
        const data = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as RedemptionVoucher));
        data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        callback(data);
      },
      (error) => {
        console.warn('listenForUserVouchers Firestore error:', error);
        callback([]);
      }
    );
  } catch (err) {
    console.warn('Failed to subscribe to user vouchers:', err);
    callback([]);
    return () => {};
  }
}

export function listenForLoyaltyLog(
  guestId: string, 
  callback: (logs: LoyaltyLogEntry[]) => void
) {
  if (!guestId) {
    callback([]);
    return () => {};
  }
  try {
    const q = query(
      collection(db, 'loyalty_log'), 
      where('guestId', '==', guestId)
    );
    return onSnapshot(
      q, 
      (snapshot) => {
        const data = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as LoyaltyLogEntry));
        data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        callback(data);
      },
      (error) => {
        console.warn('listenForLoyaltyLog Firestore error:', error);
        callback([]);
      }
    );
  } catch (err) {
    console.warn('Failed to subscribe to loyalty logs:', err);
    callback([]);
    return () => {};
  }
}

export async function awardLoyaltyPoints(
  guestId: string,
  guestEmail: string,
  points: number,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  if (!guestId || points <= 0) {
    return { success: true };
  }
  
  const cleanEmail = guestEmail.trim().toLowerCase();
  
  // Safely check for the user via UID first, then fallback to Email
  const userRefUid = doc(db, 'users', guestId);
  const userRefEmail = doc(db, 'users', cleanEmail);
  const logRef = doc(collection(db, 'loyalty_log'));
  
  try {
    // 1. TRANSACTION: Only used for strict math and point adjustment
    await runTransaction(db, async (transaction) => {
      let userSnap = await transaction.get(userRefUid);
      let activeRef = userRefUid;
      
      if (!userSnap.exists()) {
        userSnap = await transaction.get(userRefEmail);
        activeRef = userRefEmail;
        if (!userSnap.exists()) {
          throw new Error('User profile not found.');
        }
      }
      
      const userData = userSnap.data() as AppUser & { loyaltyPoints?: number; loyaltyTier?: string };
      const currentPoints = userData.loyaltyPoints || 0;
      const newPoints = currentPoints + points;
      const newTier = calculateLoyaltyTier(newPoints);
      
      transaction.update(activeRef, {
        loyaltyPoints: newPoints,
        loyaltyTier: newTier,
      });
    });

    // 2. STANDARD WRITE: Done OUTSIDE the transaction to prevent Listener Cache crashes
    const logEntry: LoyaltyLogEntry = {
      id: logRef.id,
      guestId,
      points,
      reason,
      createdAt: new Date().toISOString(),
    };
    await setDoc(logRef, logEntry);

    return { success: true };
  } catch (error) {
    console.error('Failed to award loyalty points:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function generateVoucherCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'AZ-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Mock Email function to prevent crashes without EmailJS credits
const sendVoucherEmail = (data: any) => {
  console.log("Mock EmailJS triggered for voucher:", data.voucherCode);
};

export async function redeemRewardTransaction(
  userEmail: string,
  guestId: string,
  reward: RewardItem,
  userName: string = 'Valued Guest'
): Promise<{ newPoints: number; voucher: RedemptionVoucher }> {
  const cleanEmail = userEmail.trim().toLowerCase();
  
  const userRefUid = doc(db, 'users', guestId);
  const userRefEmail = doc(db, 'users', cleanEmail);
  
  const voucherRef = doc(collection(db, 'loyalty_vouchers'));
  const logRef = doc(collection(db, 'loyalty_log'));
  
  const createdVoucherCode = generateVoucherCode();
  const now = new Date();
  const expires = new Date();
  expires.setDate(expires.getDate() + (reward.validityDays || 30));
  
  let newPoints = 0;

  // 1. TRANSACTION: Only used for strict point deduction math
  await runTransaction(db, async (transaction) => {
    let userSnap = await transaction.get(userRefUid);
    let activeRef = userRefUid;
    
    if (!userSnap.exists()) {
      userSnap = await transaction.get(userRefEmail);
      activeRef = userRefEmail;
      if (!userSnap.exists()) {
        throw new Error('User profile record not found.');
      }
    }

    const userData = userSnap.data() as AppUser;
    const currentPoints = userData.loyaltyPoints || 0;
    
    if (currentPoints < reward.pts) {
      throw new Error(`Insufficient points. You need ${reward.pts} points, but only have ${currentPoints}.`);
    }
    
    newPoints = currentPoints - reward.pts;
    const newTier = calculateLoyaltyTier(newPoints);
    
    transaction.update(activeRef, {
      loyaltyPoints: newPoints,
      loyaltyTier: newTier,
    });
  });
  
  // 2. STANDARD WRITES: Done OUTSIDE the transaction to prevent Listener Cache crashes
  const createdVoucher: RedemptionVoucher = {
    id: voucherRef.id,
    guestId,
    userEmail: cleanEmail,
    rewardId: String(reward.id),
    rewardTitle: reward.title,
    ptsSpent: reward.pts, // Group member forgot this! Added so receipt math works!
    voucherCode: createdVoucherCode,
    status: 'active',
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };
  
  const logEntry: LoyaltyLogEntry = {
    id: logRef.id,
    guestId,
    points: -reward.pts,
    reason: `Redeemed: ${reward.title}`,
    createdAt: now.toISOString(),
  };

  // Push writes directly to standard queue
  await setDoc(voucherRef, createdVoucher);
  await setDoc(logRef, logEntry);
  
  sendVoucherEmail({
    userName,
    userEmail: cleanEmail,
    rewardTitle: reward.title,
    voucherCode: createdVoucherCode,
    ptsSpent: reward.pts,
    remainingPoints: newPoints,
    expiresAt: expires.toISOString(),
  });

  return { newPoints, voucher: createdVoucher };
}