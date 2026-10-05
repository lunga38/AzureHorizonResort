import { db, rtdb } from '../lib/firebase';
import { doc, setDoc, collection, addDoc, getDoc, getDocs, deleteDoc, query, where } from 'firebase/firestore';
import { ref, set } from 'firebase/database';
import { seedTables } from './tableSeedData';

// ==========================================
// ONLINE IMAGE LIBRARY (Unsplash CDN)
// Stored in Firestore/RTDB so both web AND the
// mobile app can render them from anywhere.
// ==========================================
const u = (id: string, w = 1200) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`;

const IMG = {
  oceanSuite: [u('photo-1582719478250-c89cae4dc85b'), u('photo-1566073771259-6a8506099945'), u('photo-1584132967334-10e028bd69f7'), u('photo-1512918728675-ed5a9ecdebfd')],
  gardenSuite: [u('photo-1611892440504-42a792e24d32'), u('photo-1560185893-a55cbc8c57e8'), u('photo-1578683010236-d716f9a3f461')],
  heritageSuite: [u('photo-1590490360182-c33d57733427'), u('photo-1505693416388-ac5ce068fe85'), u('photo-1519710164239-da123dc03ef4')],
  familyVilla: [u('photo-1584622650111-993a426fbf0a'), u('photo-1493809842364-78817add7ffb'), u('photo-1598928506311-c55ded91a20c')],
  penthouse: [u('photo-1512917774080-9991f1c4c750'), u('photo-1520333789090-1afc82db536a'), u('photo-1545324418-cc1a3fa10c00'), u('photo-1600607687939-ce8a6c25118c')],
  ballroom: u('photo-1519167758481-83f550bb49b3'),
  estate: u('photo-1600585154340-be6161a56a0c'),
  vineyard: u('photo-1528823872057-9c018a7a7553'),
  beachPavilion: u('photo-1507525428034-b723cf961d3e'),
  gardenTerrace: u('photo-1416879595882-3373a0480b5b'),
  foodTartare: u('photo-1546069901-ba9599a7e63c'),
  foodOysters: u('photo-1559742811-822873691df8'),
  foodSteak: u('photo-1546964124-0cce460f38ef'),
  foodLobster: u('photo-1615141982883-c7ad0e69fd62'),
  foodRisotto: u('photo-1476124369491-e7addf5db371'),
  foodCake: u('photo-1606313564200-e75d5e30476c'),
  foodCocktail: u('photo-1546171753-97d7676e4602'),
  foodWine: u('photo-1510812431401-41d2bd2722f3'),
};

// Local date helpers (matches web EventBooking's getLocalISODate)
const localISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayStr = localISODate(new Date());
const dayStr = (offset: number) => localISODate(new Date(Date.now() + offset * 86400000));
const isoFor = (day: string, time = '10:00') => `${day}T${time}:00.000Z`;

// QR signing — MUST match the mobile app (firebase-services.ts):
// hex SHA-256 of (secret + JSON.stringify(payload)) with payload key order:
// invitationId, eventId, inviteeEmail, inviteeName, hostId, status, issuedAt
const QR_SIGNING_SECRET = "azure-horizon-demo-signing-secret-2026";
const sha256Hex = async (text: string): Promise<string> => {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
};

export const seedDatabase = async (opts: { silent?: boolean } = {}) => {
  const notify = (msg: string) => {
    if (!opts.silent) alert(msg);
    console.log(msg);
  };
  try {
    notify("Starting database initialization...");

    // ==========================================
    // 0. CLEAN SLATE — remove ALL previously seeded
    // (now stale) event-related data so the fresh
    // seed below always reflects TODAY's dates.
    // ==========================================
    const wipeCollection = async (name: string) => {
      try {
        const snap = await getDocs(collection(db, name));
        for (const d of snap.docs) await deleteDoc(d.ref);
      } catch (err) {
        console.warn(`Wipe ${name} skipped:`, err);
      }
    };
    await Promise.all([
      wipeCollection('event_bookings'),
      wipeCollection('event_invitations'),
      wipeCollection('attendee_checkins'),
      wipeCollection('event_inspections'),
      wipeCollection('damage_records'),
      wipeCollection('refund_requests'),
      wipeCollection('live_complaints'),
      wipeCollection('event_feedback'),
      wipeCollection('invoices'),
    ]);
    try {
      const eventReviews = await getDocs(query(collection(db, 'reviews'), where('category', '==', 'event')));
      for (const r of eventReviews.docs) await deleteDoc(r.ref);
    } catch (err) {
      console.warn('Wipe event reviews skipped:', err);
    }
    console.log("🧹 Wiped stale event data for a fresh seed");

    // ==========================================
    // 1. STAFF ACCOUNTS — owned by the mobile seeder.
    // scripts/seed-demo-data.js upserts users for the 8 demo actors
    // (uid + email-keyed docs). This web seed no longer writes staff
    // profiles, so it can never clobber the canonical roster. (Option A.)
    // ==========================================

    // ==========================================
    // 2. GUEST ACCOUNTS (20)
    // ==========================================
    const guests = [
      { id: 'robert_harrison', uid: 'robert_harrison', name: "Robert Harrison", role: "guest", email: "guest1@example.com", status: 'guest' },
      { id: 'zoe_katsaros', uid: 'zoe_katsaros', name: "Zoe Katsaros", role: "guest", email: "guest2@example.com", status: 'guest' },
      { id: 'amara_okafor', uid: 'amara_okafor', name: "Amara Okafor", role: "guest", email: "guest3@example.com", status: 'guest' },
      { id: 'jacobus_van_der_merwe', uid: 'jacobus_van_der_merwe', name: "Jacobus van der Merwe", role: "guest", email: "guest4@example.com", status: 'guest' },
      { id: 'sanjay_gupta', uid: 'sanjay_gupta', name: "Sanjay Gupta", role: "guest", email: "guest5@example.com", status: 'guest' },
      { id: 'isabella_rossi', uid: 'isabella_rossi', name: "Isabella Rossi", role: "guest", email: "guest6@example.com", status: 'guest' },
      { id: 'emily_blunt', uid: 'emily_blunt', name: "Emily Blunt", role: "guest", email: "guest7@example.com", status: 'guest' },
      { id: 'sarah_johnson', uid: 'sarah_johnson', name: "Sarah Johnson", role: "guest", email: "guest8@example.com", status: 'guest' },
      { id: 'maria_garcia', uid: 'maria_garcia', name: "Maria Garcia", role: "guest", email: "guest9@example.com", status: 'guest' },
      { id: 'david_wilson', uid: 'david_wilson', name: "David Wilson", role: "guest", email: "guest10@example.com", status: 'guest' },
      { id: 'ahmed_khan', uid: 'ahmed_khan', name: "Ahmed Khan", role: "guest", email: "guest11@example.com", status: 'guest' },
      { id: 'linda_thompson', uid: 'linda_thompson', name: "Linda Thompson", role: "guest", email: "guest12@example.com", status: 'guest' },
      { id: 'michael_chen', uid: 'michael_chen', name: "Michael Chen", role: "guest", email: "guest13@example.com", status: 'guest' },
      { id: 'thomas_shelby', uid: 'thomas_shelby', name: "Thomas Shelby", role: "guest", email: "guest14@example.com", status: 'guest' },
      { id: 'james_brown', uid: 'james_brown', name: "James Brown", role: "guest", email: "guest15@example.com", status: 'guest' },
      { id: 'lucy_liu', uid: 'lucy_liu', name: "Lucy Liu", role: "guest", email: "guest16@example.com", status: 'guest' },
      { id: 'william_shakespeare', uid: 'william_shakespeare', name: "William Shakespeare", role: "guest", email: "guest17@example.com", status: 'guest' },
      { id: 'elon_musk', uid: 'elon_musk', name: "Elon Musk", role: "guest", email: "guest18@example.com", status: 'guest' },
      { id: 'oprah_winfrey', uid: 'oprah_winfrey', name: "Oprah Winfrey", role: "guest", email: "guest19@example.com", status: 'guest' },
      { id: 'nelson_mandela', uid: 'nelson_mandela', name: "Nelson Mandela", role: "guest", email: "guest20@example.com", status: 'guest' },
    ];

    for (const g of guests) {
      await setDoc(doc(db, 'users', g.email), g);
    }
    console.log(`✅ Added ${guests.length} guest accounts`);

    // ==========================================
    // 3. ROOMS (200 rooms programmatic, online images)
    // ==========================================
    const rooms = [];
    const baseTypes = [
      { prefix: '1', type: 'ocean_view', name: 'Oceanic Executive Suite', price: 4200, capacity: 2, amenities: ['King Bed', 'Ocean View', 'WiFi', 'Mini Bar', 'Room Service', 'Private Balcony', 'Walk-in Shower'], images: IMG.oceanSuite },
      { prefix: '2', type: 'garden', name: 'Coral Garden Terrace', price: 2800, capacity: 2, amenities: ['Queen Bed', 'Garden View', 'WiFi', 'Patio', 'Outdoor Seating', 'Rain Shower'], images: IMG.gardenSuite },
      { prefix: '3', type: 'family', name: 'Heritage Suite', price: 6200, capacity: 4, amenities: ['King Bed', 'Living Room', 'Dining Area', 'WiFi', 'Fireplace', 'Antique Furnishings'], images: IMG.heritageSuite },
      { prefix: '4', type: 'villa', name: 'Family Villa', price: 6500, capacity: 6, amenities: ['Bunk Beds', 'Kitchenette', 'Play Area', 'Garden Access', 'Kids Club', 'Game Console', 'Crib Available'], images: IMG.familyVilla },
      { prefix: '5', type: 'penthouse', name: 'Skyline Penthouse', price: 9500, capacity: 4, amenities: ['King Bed', 'Private Pool', 'Butler Service', 'Kitchen', '360° View', 'Dining Area', 'Home Theater'], images: IMG.penthouse },
    ];

    for (let floor = 1; floor <= 5; floor++) {
      const typeData = baseTypes[floor - 1];
      for (let r = 1; r <= 40; r++) {
        const roomNum = `${typeData.prefix}${r.toString().padStart(2, '0')}`;
        rooms.push({
          id: roomNum,
          name: `${typeData.name} ${roomNum}`,
          price: typeData.price,
          type: typeData.type,
          isAvailable: true,
          capacity: typeData.capacity,
          description: `Spacious ${typeData.name} on floor ${floor}.`,
          amenities: typeData.amenities,
          images: typeData.images
        });
      }
    }

    for (const room of rooms) {
      await setDoc(doc(db, 'rooms', room.id), room);
    }
    console.log(`✅ Added ${rooms.length} rooms`);

    // ==========================================
    // 4. BOOKINGS (12 generated)
    // ==========================================
    const futureDate = (days: number) => dayStr(days);
    const pastDate = (days: number) => dayStr(-days);

    const bookings = [
      { id: 'BK-1001', guestId: 'robert_harrison', guestName: 'Robert Harrison', status: 'checked_in', roomNumber: '101', roomName: 'Oceanic Executive Suite 101', checkInDate: pastDate(2), checkOutDate: futureDate(2), totalAmount: 16800, numberOfGuests: 2, paymentStatus: 'deposit_paid', depositPaid: 2520, balanceDue: 14280 },
      { id: 'BK-1002', guestId: 'zoe_katsaros', guestName: 'Zoe Katsaros', status: 'checked_in', roomNumber: '204', roomName: 'Coral Garden Terrace 204', checkInDate: pastDate(3), checkOutDate: futureDate(1), totalAmount: 11200, numberOfGuests: 2, paymentStatus: 'deposit_paid', depositPaid: 1680, balanceDue: 9520 },
      { id: 'BK-1003', guestId: 'amara_okafor', guestName: 'Amara Okafor', status: 'checked_in', roomNumber: '302', roomName: 'Heritage Suite 302', checkInDate: pastDate(1), checkOutDate: futureDate(5), totalAmount: 37200, numberOfGuests: 4, paymentStatus: 'paid', depositPaid: 5580, balanceDue: 0, lastPaidAt: new Date().toISOString() },
      { id: 'BK-1004', guestId: 'jacobus_van_der_merwe', guestName: 'Jacobus van der Merwe', status: 'checked_in', roomNumber: '410', roomName: 'Family Villa 410', checkInDate: pastDate(4), checkOutDate: futureDate(3), totalAmount: 45500, numberOfGuests: 6, paymentStatus: 'deposit_paid', depositPaid: 6825, balanceDue: 38675 },
      { id: 'BK-1005', guestId: 'sanjay_gupta', guestName: 'Sanjay Gupta', status: 'checked_in', roomNumber: '501', roomName: 'Skyline Penthouse 501', checkInDate: pastDate(1), checkOutDate: futureDate(7), totalAmount: 76000, numberOfGuests: 4, paymentStatus: 'paid', depositPaid: 11400, balanceDue: 0, lastPaidAt: new Date().toISOString() },
      { id: 'BK-1015', guestId: 'emily_blunt', guestName: 'Emily Blunt', status: 'checked_in', roomNumber: '109', roomName: 'Oceanic Executive Suite 109', checkInDate: pastDate(1), checkOutDate: futureDate(4), totalAmount: 21000, numberOfGuests: 2, paymentStatus: 'paid', depositPaid: 3150, balanceDue: 0, lastPaidAt: new Date().toISOString() },

      { id: 'BK-1006', guestId: 'isabella_rossi', guestName: 'Isabella Rossi', status: 'checked_out', roomNumber: '105', roomName: 'Oceanic Executive Suite 105', checkInDate: pastDate(10), checkOutDate: pastDate(7), totalAmount: 12600, numberOfGuests: 2, paymentStatus: 'paid', depositPaid: 1890, balanceDue: 0, lastPaidAt: pastDate(7) },
      { id: 'BK-1012', guestId: 'linda_thompson', guestName: 'Linda Thompson', status: 'checked_out', roomNumber: '215', roomName: 'Coral Garden Terrace 215', checkInDate: pastDate(20), checkOutDate: pastDate(17), totalAmount: 8400, numberOfGuests: 2, paymentStatus: 'paid', depositPaid: 1260, balanceDue: 0, lastPaidAt: pastDate(17) },

      { id: 'BK-1008', guestId: 'sarah_johnson', guestName: 'Sarah Johnson', status: 'confirmed', roomNumber: '305', roomName: 'Heritage Suite 305', checkInDate: futureDate(3), checkOutDate: futureDate(6), totalAmount: 18600, numberOfGuests: 2, paymentStatus: 'deposit_paid', depositPaid: 2790, balanceDue: 15810 },
      { id: 'BK-1009', guestId: 'maria_garcia', guestName: 'Maria Garcia', status: 'confirmed', roomNumber: '208', roomName: 'Coral Garden Terrace 208', checkInDate: futureDate(5), checkOutDate: futureDate(9), totalAmount: 11200, numberOfGuests: 2, paymentStatus: 'pending', depositPaid: 0, balanceDue: 11200 },
      { id: 'BK-1010', guestId: 'david_wilson', guestName: 'David Wilson', status: 'confirmed', roomNumber: '505', roomName: 'Skyline Penthouse 505', checkInDate: futureDate(7), checkOutDate: futureDate(11), totalAmount: 38000, numberOfGuests: 3, paymentStatus: 'pending', depositPaid: 0, balanceDue: 38000 },
      { id: 'BK-1016', guestId: 'lucy_liu', guestName: 'Lucy Liu', status: 'confirmed', roomNumber: '218', roomName: 'Coral Garden Terrace 218', checkInDate: futureDate(2), checkOutDate: futureDate(5), totalAmount: 8400, numberOfGuests: 2, paymentStatus: 'deposit_paid', depositPaid: 1260, balanceDue: 7140 },
    ];

    for (const b of bookings) {
      await setDoc(doc(db, 'bookings', b.id), b);

      if (b.status === 'checked_in') {
        const roomRef = doc(db, 'rooms', b.roomNumber);
        await setDoc(roomRef, { isAvailable: false }, { merge: true });
      }
    }
    console.log(`✅ Added ${bookings.length} bookings`);

    // ==========================================
    // 4.1 INCIDENTAL CHARGES FOR CHECKED IN
    // ==========================================
    const incidentals = [
      { bookingId: 'BK-1001', guestId: 'robert_harrison', description: 'Spa: Hot Stone Therapy', amount: 1100, date: new Date().toISOString() },
      { bookingId: 'BK-1001', guestId: 'robert_harrison', description: 'Tour: Coastal Whale Watching', amount: 450, date: new Date().toISOString() },
      { bookingId: 'BK-1002', guestId: 'zoe_katsaros', description: 'Room Service: Breakfast', amount: 350, date: new Date().toISOString() },
      { bookingId: 'BK-1004', guestId: 'jacobus_van_der_merwe', description: 'Mini Bar Restock', amount: 1200, date: new Date().toISOString() },
      { bookingId: 'BK-1005', guestId: 'sanjay_gupta', description: 'Private Dining Experience', amount: 4500, date: pastDate(1) },
    ];
    for (const inc of incidentals) {
      await addDoc(collection(db, 'incidental_charges'), inc);
    }
    console.log(`✅ Added ${incidentals.length} incidental charges`);

    // ==========================================
    // 5. SERVICE REQUESTS
    // ==========================================
    const serviceRequests = [
      { id: 'M-01', type: 'maintenance', description: 'AC unit making humming noise in 101', status: 'in_progress', assignedTo: 'Thabo Mbeki', guestName: 'Robert Harrison', roomNumber: '101', createdAt: new Date().toISOString(), priority: 'high' },
      { id: 'M-02', type: 'maintenance', description: 'Leaking tap in bathroom 204', status: 'completed', assignedTo: 'Kevin Du Preez', guestName: 'Zoe Katsaros', roomNumber: '204', createdAt: new Date(Date.now() - 2 * 86400000).toISOString(), priority: 'medium' },
      { id: 'M-03', type: 'housekeeping', description: 'Extra towels and robes requested for 302', status: 'completed', assignedTo: 'Chris Evans', guestName: 'Amara Okafor', roomNumber: '302', createdAt: new Date(Date.now() - 1 * 86400000).toISOString(), priority: 'low' },
      { id: 'M-05', type: 'housekeeping', description: 'Daily turn-down service required for VIP guest', status: 'in_progress', assignedTo: 'Frikkie Louw', guestName: 'Sanjay Gupta', roomNumber: '501', createdAt: new Date().toISOString(), priority: 'high' },
    ];

    for (const req of serviceRequests) {
      await setDoc(doc(db, 'service_requests', req.id), req);
    }
    console.log(`✅ Added ${serviceRequests.length} service requests`);

    // ==========================================
    // 6. RESTAURANT MENU (RTDB, online images)
    // ==========================================
    const menuRef = ref(rtdb, 'menu');
    await set(menuRef, {
      appetizers: [
        { id: 'a1', name: 'Tuna Tartare', price: 145, description: 'Fresh Atlantic tuna with avocado, sesame, and citrus soy dressing.', dietary: ['gluten-free'], image: IMG.foodTartare },
        { id: 'a2', name: 'Oysters Rockefeller', price: 180, description: 'Half dozen fresh oysters baked with spinach, herbs, and breadcrumbs.', dietary: ['contains shellfish'], image: IMG.foodOysters },
      ],
      mains: [
        { id: 'm1', name: 'Wagyu Beef Steak', price: 450, description: '250g A5 Wagyu with truffle mash, asparagus, and red wine reduction.', dietary: ['gluten-free option'], image: IMG.foodSteak },
        { id: 'm2', name: 'Grilled Lobster', price: 580, description: 'Whole lobster split and grilled with garlic herb butter.', dietary: ['contains shellfish'], image: IMG.foodLobster },
        { id: 'm3', name: 'Wild Mushroom Risotto', price: 210, description: 'Creamy Arborio rice with porcini, shiitake, and truffle oil.', dietary: ['vegetarian'], image: IMG.foodRisotto },
      ],
      desserts: [
        { id: 'de1', name: 'Chocolate Fondant', price: 95, description: 'Warm chocolate lava cake with vanilla bean ice cream.', dietary: ['vegetarian'], image: IMG.foodCake },
      ],
      beverages: [
        { id: 'b1', name: 'Signature Cocktail', price: 120, description: 'Azure Horizon Special - gin, elderflower, prosecco, and edible flowers.', image: IMG.foodCocktail },
        { id: 'b2', name: 'Vineyard Reserve Merlot', price: 340, description: 'Single-estate merlot from the Cape Winelands, served by the bottle.', dietary: ['contains alcohol'], image: IMG.foodWine },
      ],
    });
    console.log(`✅ Added restaurant menu`);

    // ==========================================
    // 7. RESTAURANT TABLES
    // ==========================================
    await seedTables();

    // ==========================================
    // 8. SAMPLE TABLE RESERVATIONS
    // ==========================================
    const tableReservations = [
      { guestId: 'robert_harrison', guestName: 'Robert Harrison', date: futureDate(1), time: '19:00', partySize: 2, tableNumber: 5, tableType: 'medium', location: 'Window', status: 'confirmed', specialRequests: 'Anniversary celebration', createdAt: new Date().toISOString() },
      { guestId: 'amara_okafor', guestName: 'Amara Okafor', date: futureDate(2), time: '18:30', partySize: 4, tableNumber: 12, tableType: 'large', location: 'Terrace', status: 'confirmed', specialRequests: 'High chair for toddler', createdAt: new Date().toISOString() },
    ];
    for (const r of tableReservations) {
      await addDoc(collection(db, 'table_reservations'), r);
    }
    console.log(`✅ Added ${tableReservations.length} table reservations`);

    // ==========================================
    // 9. TOURS AND SPA
    // ==========================================
    const spaBookings = [
      {
        id: 'SPA-001',
        guestId: 'robert_harrison', guestName: 'Robert Harrison', treatmentId: 'TREAT-01', treatmentName: 'Hot Stone Massage',
        therapistId: 'nomsa_mkhize', date: futureDate(1), time: '10:00', price: 1100,
        bookingReference: 'SPA-001', status: 'confirmed', paymentMethod: 'room_charge', createdAt: new Date().toISOString()
      }
    ];
    for (const sb of spaBookings) {
      await setDoc(doc(db, 'spa_bookings', sb.id), sb);
    }

    const tourBookings = [
      {
        id: 'TB-001',
        tourId: 'TOUR-001', tourName: 'Coastal Whale Watching',
        guestId: 'robert_harrison', guestName: 'Robert Harrison', date: futureDate(1), time: '08:00',
        tickets: [{ type: 'adult', quantity: 2, priceEach: 350 }],
        totalAmount: 700, status: 'confirmed', bookingReference: 'TB-001', paymentMethod: 'paystack', createdAt: new Date().toISOString()
      }
    ];
    for (const tb of tourBookings) {
      await setDoc(doc(db, 'tour_bookings', tb.id), tb);
    }
    console.log(`✅ Added tours and spa bookings`);

    // ==========================================
    // 10. REVIEWS
    // ==========================================
    const dummyReviews = [
      { guestId: 'guest_001', guestName: 'Thandi Mokoena', category: 'room', rating: 5, comments: 'The Ocean View Suite was absolutely breathtaking! Waking up to the sound of waves every morning made this the best holiday of my life.', createdAt: pastDate(2), helpful: 12 },
      { guestId: 'guest_005', guestName: 'Priya Naidoo', category: 'restaurant', rating: 5, comments: 'Chef Sibusiso\'s seafood platter is out of this world! The fresh line fish with chakalaka butter sauce was a masterpiece.', createdAt: pastDate(1), helpful: 22 },
      { guestId: 'guest_010', guestName: 'Zanele Mthembu', category: 'tour', rating: 5, comments: 'The whale watching tour was a once-in-a-lifetime experience! Our guide was incredibly knowledgeable and we spotted a mother and calf.', createdAt: pastDate(1), helpful: 25 },
      { guestId: 'guest_014', guestName: 'Lerato Maseko', category: 'spa', rating: 5, comments: 'The hot stone massage was pure bliss. Therapist Nomsa has magic hands! The relaxation room with herbal tea afterwards was the perfect way to unwind.', createdAt: pastDate(2), helpful: 20 },
      { guestId: 'robert_harrison', guestName: 'Robert Harrison', category: 'event', rating: 5, comments: 'Our corporate gala at the Grand Ocean Ballroom was flawless. The AV setup, catering and coordination were world class.', createdAt: pastDate(3), helpful: 31 },
    ];
    for (const review of dummyReviews) {
      await addDoc(collection(db, 'reviews'), review);
    }
    console.log(`✅ Added ${dummyReviews.length} guest reviews`);

    // ==========================================
    // 11. FRESH EVENT BOOKINGS (online venue images)
    // Matches EventBooking.tsx shape + statuses the
    // mobile staff app's check-in / inspection filters accept.
    // ==========================================
    const venues = [
      { id: 'v-grand-ballroom', name: 'The Grand Ocean Ballroom', maxCapacity: 400, pricePerDay: 25000, image: IMG.ballroom },
      { id: 'v-ashanti-estate', name: 'Ashanti Estate', maxCapacity: 300, pricePerDay: 32000, image: IMG.estate },
      { id: 'v-klein-vineyards', name: 'Klein Parys Vineyards', maxCapacity: 120, pricePerDay: 18000, image: IMG.vineyard },
      { id: 'v-beach-pavilion', name: 'Sunset Beach Pavilion', maxCapacity: 150, pricePerDay: 15000, image: IMG.beachPavilion },
      { id: 'v-garden-terrace', name: 'Botanical Garden Terrace', maxCapacity: 80, pricePerDay: 9000, image: IMG.gardenTerrace },
    ];

    const eventBookings = [
      {
        id: 'EV-1001',
        guestId: 'robert_harrison', guestName: 'Robert Harrison',
        venueId: 'v-grand-ballroom', venueName: 'The Grand Ocean Ballroom', venueMaxCapacity: 400,
        eventDate: isoFor(todayStr, '18:00'), date: todayStr, eventDateStr: todayStr,
        bookedDates: [todayStr], expectedAttendance: 85,
        eventType: 'Gala Dinner', bookingType: 'hourly', startTime: '18:00', duration: 5,
        totalAmount: 125000, depositRequired: 62500, termsAccepted: true,
        status: 'paid', imageUrl: IMG.ballroom,
        preInspectionStatus: 'completed', inspectionStatus: 'passed',
        createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
      },
      {
        id: 'EV-1002',
        guestId: 'amara_okafor', guestName: 'Amara Okafor',
        venueId: 'v-beach-pavilion', venueName: 'Sunset Beach Pavilion', venueMaxCapacity: 150,
        eventDate: isoFor(todayStr, '14:00'), date: todayStr, eventDateStr: todayStr,
        bookedDates: [todayStr], expectedAttendance: 60,
        eventType: 'Beach Party', bookingType: 'hourly', startTime: '14:00', duration: 6,
        totalAmount: 90000, depositRequired: 45000, termsAccepted: true,
        status: 'confirmed', imageUrl: IMG.beachPavilion,
        createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      },
      {
        id: 'EV-1003',
        guestId: 'sarah_johnson', guestName: 'Sarah Johnson',
        venueId: 'v-ashanti-estate', venueName: 'Ashanti Estate', venueMaxCapacity: 300,
        eventDate: isoFor(dayStr(2), '11:00'), date: dayStr(2), eventDateStr: dayStr(2),
        bookedDates: [dayStr(2)], expectedAttendance: 150,
        eventType: 'Wedding', bookingType: 'daily',
        totalAmount: 128000, depositRequired: 64000, termsAccepted: true,
        status: 'deposit_paid', imageUrl: IMG.estate,
        createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
      },
      {
        id: 'EV-1004',
        guestId: 'zoe_katsaros', guestName: 'Zoe Katsaros',
        venueId: 'v-klein-vineyards', venueName: 'Klein Parys Vineyards', venueMaxCapacity: 120,
        eventDate: isoFor(dayStr(5), '16:00'), date: dayStr(5), eventDateStr: dayStr(5),
        bookedDates: [dayStr(5)], expectedAttendance: 70,
        eventType: 'Wine & Cheese Evening', bookingType: 'hourly', startTime: '16:00', duration: 4,
        totalAmount: 72000, depositRequired: 36000, termsAccepted: true,
        status: 'confirmed', imageUrl: IMG.vineyard,
        createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      },
      {
        id: 'EV-1005',
        guestId: 'jacobus_van_der_merwe', guestName: 'Jacobus van der Merwe',
        venueId: 'v-garden-terrace', venueName: 'Botanical Garden Terrace', venueMaxCapacity: 80,
        eventDate: isoFor(dayStr(9), '13:00'), date: dayStr(9), eventDateStr: dayStr(9),
        bookedDates: [dayStr(9)], expectedAttendance: 45,
        eventType: 'Garden Party', bookingType: 'hourly', startTime: '13:00', duration: 5,
        totalAmount: 45000, depositRequired: 22500, termsAccepted: true,
        status: 'pending_payment', imageUrl: IMG.gardenTerrace,
        createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      },
      {
        id: 'EV-1006',
        guestId: 'sanjay_gupta', guestName: 'Sanjay Gupta',
        venueId: 'v-grand-ballroom', venueName: 'The Grand Ocean Ballroom', venueMaxCapacity: 400,
        eventDate: isoFor(dayStr(-2), '19:00'), date: dayStr(-2), eventDateStr: dayStr(-2),
        bookedDates: [dayStr(-2)], expectedAttendance: 200,
        eventType: 'Corporate Conference', bookingType: 'daily',
        totalAmount: 175000, depositRequired: 87500, termsAccepted: true,
        status: 'paid', imageUrl: IMG.ballroom,
        preInspectionStatus: 'completed', inspectionStatus: 'passed', postInspectionStatus: 'completed', damageRecorded: true,
        createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
      },
      {
        id: 'EV-1007',
        guestId: 'thembi_nkosi', guestName: 'Thembi Nkosi',
        venueId: 'v-garden-terrace', venueName: 'Botanical Garden Terrace', venueMaxCapacity: 80,
        eventDate: isoFor(dayStr(1), '10:00'), date: dayStr(1), eventDateStr: dayStr(1),
        bookedDates: [dayStr(1)], expectedAttendance: 40,
        eventType: 'Charity Breakfast', bookingType: 'hourly', startTime: '10:00', duration: 3,
        totalAmount: 36000, depositRequired: 18000, termsAccepted: true,
        status: 'confirmed', imageUrl: IMG.gardenTerrace,
        createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
      },
      {
        id: 'EV-1008',
        guestId: 'ndidi_emecheta', guestName: 'Ndidi Emecheta',
        venueId: 'v-beach-pavilion', venueName: 'Sunset Beach Pavilion', venueMaxCapacity: 150,
        eventDate: isoFor(dayStr(-1), '17:00'), date: dayStr(-1), eventDateStr: dayStr(-1),
        bookedDates: [dayStr(-1)], expectedAttendance: 55,
        eventType: 'Sunset Cocktail Reception', bookingType: 'hourly', startTime: '17:00', duration: 4,
        totalAmount: 60000, depositRequired: 30000, termsAccepted: true,
        status: 'paid', imageUrl: IMG.beachPavilion,
        preInspectionStatus: 'completed', inspectionStatus: 'passed', postInspectionStatus: 'completed',
        createdAt: new Date(Date.now() - 6 * 86400000).toISOString(),
      },
      {
        id: 'EV-1009',
        guestId: 'marta_costa', guestName: 'Marta Costa',
        venueId: 'v-ashanti-estate', venueName: 'Ashanti Estate', venueMaxCapacity: 300,
        eventDate: isoFor(dayStr(-2), '12:00'), date: dayStr(-2), eventDateStr: dayStr(-2),
        bookedDates: [dayStr(-2)], expectedAttendance: 120,
        eventType: 'Birthday Celebration', bookingType: 'daily',
        totalAmount: 96000, depositRequired: 48000, termsAccepted: true,
        status: 'paid', imageUrl: IMG.estate,
        preInspectionStatus: 'completed', inspectionStatus: 'passed', postInspectionStatus: 'completed', damageRecorded: true, damagePenaltyTotal: 18500, damageInspectionId: 'INSP-DMG-EV1009',
        createdAt: new Date(Date.now() - 9 * 86400000).toISOString(),
      },
    ];

    for (const ev of eventBookings) {
      await setDoc(doc(db, 'event_bookings', ev.id), ev);
    }
    console.log(`✅ Added ${eventBookings.length} event bookings`);

    // ==========================================
    // 12. EVENT INVITATIONS + QR CODES
    // QR payloads are signed exactly like the mobile
    // app does, so seeded QRs scan successfully.
    // ==========================================
    interface InviteSeed { id: string; eventId: string; inviteeEmail: string; inviteeName: string; status: string; checkedInAt?: string }

    const inviteSeeds: InviteSeed[] = [
      // EV-1001 (today — Gala Dinner)
      { id: 'INV-1001', eventId: 'EV-1001', inviteeEmail: 'n.ngema@example.com', inviteeName: 'Naledi Ngema', status: 'accepted' },
      { id: 'INV-1002', eventId: 'EV-1001', inviteeEmail: 'p.pillay@example.com', inviteeName: 'Priya Pillay', status: 'accepted' },
      { id: 'INV-1003', eventId: 'EV-1001', inviteeEmail: 't.brown@example.com', inviteeName: 'Trevor Brown', status: 'accepted' },
      { id: 'INV-1004', eventId: 'EV-1001', inviteeEmail: 'k.mokoena@example.com', inviteeName: 'Kabelo Mokoena', status: 'checked_in', checkedInAt: isoFor(todayStr, '17:05') },
      { id: 'INV-1005', eventId: 'EV-1001', inviteeEmail: 's.leclerc@example.com', inviteeName: 'Sibongile Leclerc', status: 'declined' },
      // EV-1002 (today — Beach Party)
      { id: 'INV-1006', eventId: 'EV-1002', inviteeEmail: 'j.vos@example.com', inviteeName: 'Janine Vos', status: 'accepted' },
      { id: 'INV-1007', eventId: 'EV-1002', inviteeEmail: 'a.dube@example.com', inviteeName: 'Ayanda Dube', status: 'accepted' },
      { id: 'INV-1008', eventId: 'EV-1002', inviteeEmail: 'm.kruger@example.com', inviteeName: 'Marike Kruger', status: 'checked_in', checkedInAt: isoFor(todayStr, '13:30') },
      // EV-1003 (upcoming — Wedding)
      { id: 'INV-1009', eventId: 'EV-1003', inviteeEmail: 'b.mthembu@example.com', inviteeName: 'Bongani Mthembu', status: 'accepted' },
      { id: 'INV-1010', eventId: 'EV-1003', inviteeEmail: 'l.petersen@example.com', inviteeName: 'Lerato Petersen', status: 'accepted' },
      { id: 'INV-1011', eventId: 'EV-1003', inviteeEmail: 's.anand@example.com', inviteeName: 'Suresh Anand', status: 'accepted' },
      // EV-1004 (upcoming — Wine evening)
      { id: 'INV-1012', eventId: 'EV-1004', inviteeEmail: 'h.venter@example.com', inviteeName: 'Helena Venter', status: 'accepted' },
      { id: 'INV-1013', eventId: 'EV-1004', inviteeEmail: 'd.okafor@example.com', inviteeName: 'Dike Okafor', status: 'accepted' },
      // EV-1001 (today — more checked-in attendees for UC27 demo)
      { id: 'INV-1014', eventId: 'EV-1001', inviteeEmail: 's.hlambisa@example.com', inviteeName: 'Sifundo Hlambisa', status: 'checked_in', checkedInAt: isoFor(todayStr, '17:10') },
      { id: 'INV-1015', eventId: 'EV-1001', inviteeEmail: 'b.maqeda@example.com', inviteeName: 'Bandile Maqeda', status: 'checked_in', checkedInAt: isoFor(todayStr, '17:12') },
      { id: 'INV-1016', eventId: 'EV-1001', inviteeEmail: 'l.gwala@example.com', inviteeName: 'Lunga Bradley Gwala', status: 'checked_in', checkedInAt: isoFor(todayStr, '17:15') },
      { id: 'INV-1017', eventId: 'EV-1001', inviteeEmail: 'm.dlamini@example.com', inviteeName: 'Mpho Dlamini', status: 'accepted' },
      { id: 'INV-1018', eventId: 'EV-1001', inviteeEmail: 'f.mdlalose@example.com', inviteeName: 'Fanelesibonge Mdlalose', status: 'accepted' },
      { id: 'INV-1019', eventId: 'EV-1001', inviteeEmail: 's.mwandla@example.com', inviteeName: 'Sinakhokonke Mwandla', status: 'accepted' },
      // EV-1002 (today — more sent invitations)
      { id: 'INV-1020', eventId: 'EV-1002', inviteeEmail: 'm.mabanga@example.com', inviteeName: 'Melusi Mabanga', status: 'checked_in', checkedInAt: isoFor(todayStr, '13:45') },
      { id: 'INV-1021', eventId: 'EV-1002', inviteeEmail: 'i.olatunji@example.com', inviteeName: 'Isaac Toluwanimi Olatunji', status: 'accepted' },
      { id: 'INV-1022', eventId: 'EV-1002', inviteeEmail: 's.bande@example.com', inviteeName: 'Simphiwe Owethu Bande', status: 'accepted' },
      { id: 'INV-1023', eventId: 'EV-1002', inviteeEmail: 'a.nzama@example.com', inviteeName: 'Asanda S. Nzama', status: 'accepted' },
    ];

    for (const inv of inviteSeeds) {
      const issuedAt = Date.now() - 4 * 86400000;
      const hostId = eventBookings.find(e => e.id === inv.eventId)?.guestId || 'robert_harrison';
      const payload = {
        invitationId: inv.id,
        eventId: inv.eventId,
        inviteeEmail: inv.inviteeEmail,
        inviteeName: inv.inviteeName,
        hostId,
        status: inv.status,
        issuedAt,
      };
      const sig = await sha256Hex(QR_SIGNING_SECRET + JSON.stringify(payload));
      const qrCode = JSON.stringify({ ...payload, sig });
      const inviteDoc: Record<string, unknown> = {
        eventId: inv.eventId,
        inviteeEmail: inv.inviteeEmail,
        inviteeName: inv.inviteeName,
        hostId,
        status: inv.status,
        issuedAt,
        qrCode,
        createdAt: new Date(issuedAt).toISOString(),
      };
      if (inv.checkedInAt) {
        inviteDoc.checkedInAt = inv.checkedInAt;
        inviteDoc.checkedInBy = 'sipho_dlamini';
        inviteDoc.method = 'qr_scan';
      }
      await setDoc(doc(db, 'event_invitations', inv.id), inviteDoc);

      if (inv.status === 'checked_in') {
        await addDoc(collection(db, 'attendee_checkins'), {
          eventId: inv.eventId,
          invitationId: inv.id,
          attendeeId: inv.id,
          inviteeEmail: inv.inviteeEmail,
          inviteeName: inv.inviteeName,
          checkedInAt: inv.checkedInAt,
          checkedInBy: 'sipho_dlamini',
          method: 'qr_scan',
        });
      }
    }
    console.log(`✅ Added ${inviteSeeds.length} event invitations with signed QR codes`);

    // ==========================================
    // 13. DEMO DAMAGE RECORDS (online photo evidence)
    // Uses item.photo + top-level photos so the mobile
    // Damage Resolution screen renders proof images.
    // ==========================================
    const demoDamage = [
      {
        id: 'DMG-1001',
        eventId: 'EV-1006',
        bookingRef: 'EV-1006',
        guestId: 'sanjay_gupta',
        guestEmail: 'guest5@example.com',
        venueId: 'v-grand-ballroom',
        venueName: 'The Grand Ocean Ballroom',
        eventDate: isoFor(dayStr(-2), '19:00'),
        expectedAttendance: 200,
        inspectorId: 'sipho_dlamini',
        inspectorName: 'Sipho Dlamini',
        inspectorEmail: 's.dlamini@azurehorizon.com',
        assignedTechnicianId: 'kevin_dupreez',
        updatedByEmail: 's.dlamini@azurehorizon.com',
        items: [
          {
            item: 'Crystal Chandeliers',
            assetName: 'Crystal Chandeliers',
            category: 'Decor & Fixtures',
            condition: 'damaged',
            description: 'One crystal pendant knocked loose and a glass finial cracked during the gala.',
            estimatedCost: 1450,
            photo: u('photo-1519710164239-da123dc03ef4'),
            photoName: 'chandelier-damage.jpg',
          },
          {
            item: 'AV Projector & Screen',
            assetName: 'AV Projector & Screen',
            category: 'AV & Electrical',
            condition: 'damaged',
            description: 'Projector lens scratched; screen has a 10cm tear on the lower left corner.',
            estimatedCost: 3200,
            photo: u('photo-1504384308090-c894fdcc538d'),
            photoName: 'projector-screen-tear.jpg',
          },
        ],
        generalNotes: 'Light damage only. Guest has agreed to cover repair costs.',
        totalCost: 4650,
        status: 'in_repair',
        inspectionId: 'INSP-2026-08-12-001',
        damageFlagged: true,
        assignedTechnicianName: 'Kevin Du Preez',
        startedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
        createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
        updatedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
        photos: [u('photo-1519710164239-da123dc03ef4'), u('photo-1504384308090-c894fdcc538d')],
      },
      {
        id: 'DMG-1002',
        eventId: 'EV-1002',
        bookingRef: 'EV-1002',
        guestId: 'amara_okafor',
        guestEmail: 'guest3@example.com',
        venueId: 'v-beach-pavilion',
        venueName: 'Sunset Beach Pavilion',
        eventDate: isoFor(todayStr, '14:00'),
        expectedAttendance: 60,
        inspectorId: 'lerato_molefe',
        inspectorName: 'Lerato Molefe',
        inspectorEmail: 'l.molefe@azurehorizon.com',
        assignedTechnicianId: '',
        updatedByEmail: 'l.molefe@azurehorizon.com',
        items: [
          {
            item: 'Wooden Decking',
            assetName: 'Wooden Decking',
            category: 'Grounds & Outdoor',
            condition: 'damaged',
            description: 'Two deck planks charred by a tipped tiki torch near the bar area.',
            estimatedCost: 950,
            photo: u('photo-1486915309851-b0cc1f8a0084'),
            photoName: 'decking-burn.jpg',
          },
        ],
        generalNotes: 'Pending guest response.',
        totalCost: 950,
        status: 'recorded',
        inspectionId: 'INSP-2026-08-14-002',
        damageFlagged: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        photos: [u('photo-1486915309851-b0cc1f8a0084')],
      },
    ];

    for (const dmg of demoDamage) {
      await setDoc(doc(db, 'damage_records', dmg.id), dmg);
    }
    console.log(`✅ Added ${demoDamage.length} demo damage records with photo evidence`);

    // ==========================================
    // 14. EVENT INSPECTIONS (pre + post history)
    // Matches the mobile createEventInspection shape
    // so event-ops / post-inspection history renders.
    // ==========================================
    const demoInspections = [
      {
        id: 'INSP-PRE-EV1001',
        eventId: 'EV-1001',
        type: 'pre_event',
        inspectorId: 'sipho_dlamini',
        inspectorName: 'Sipho Dlamini',
        checklistItems: [
          { item: 'Room layout matches floor plan', status: 'passed' },
          { item: 'Seating count matches guest list', status: 'passed' },
          { item: 'Lighting system fully operational', status: 'passed' },
          { item: 'AV equipment tested & working', status: 'passed' },
          { item: 'Microphones tested', status: 'passed' },
          { item: 'Projector/screen aligned & calibrated', status: 'passed' },
          { item: 'Climate control set to correct temperature', status: 'passed' },
          { item: 'Emergency exits clear & signage visible', status: 'passed' },
          { item: 'Catering tables positioned correctly', status: 'passed' },
          { item: 'Decorations match client brief', status: 'passed' },
          { item: 'Flooring clean & free of hazards', status: 'passed' },
          { item: 'Registration desk set up', status: 'passed' },
        ],
        overallStatus: 'approved',
        completedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
        createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
      {
        id: 'INSP-PRE-EV1007',
        eventId: 'EV-1007',
        type: 'pre_event',
        inspectorId: 'sipho_dlamini',
        inspectorName: 'Sipho Dlamini',
        checklistItems: [
          { item: 'Room layout matches floor plan', status: 'passed' },
          { item: 'Seating count matches guest list', status: 'passed' },
          { item: 'Lighting system fully operational', status: 'passed' },
          { item: 'AV equipment tested & working', status: 'passed' },
          { item: 'Microphones tested', status: 'needs_attention', notes: 'Spare microphone battery low' },
          { item: 'Projector/screen aligned & calibrated', status: 'passed' },
          { item: 'Climate control set to correct temperature', status: 'passed' },
          { item: 'Emergency exits clear & signage visible', status: 'passed' },
          { item: 'Catering tables positioned correctly', status: 'passed' },
          { item: 'Decorations match client brief', status: 'passed' },
          { item: 'Flooring clean & free of hazards', status: 'passed' },
          { item: 'Registration desk set up', status: 'passed' },
        ],
        overallStatus: 'needs_attention',
        completedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
        createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
      {
        id: 'INSP-POST-EV1006',
        eventId: 'EV-1006',
        type: 'post_event',
        inspectorId: 'sipho_dlamini',
        inspectorName: 'Sipho Dlamini',
        checklistItems: [
          { item: 'Venue left in clean condition', status: 'passed' },
          { item: 'Furniture returned to standard layout', status: 'passed' },
          { item: 'AV equipment accounted for', status: 'passed' },
          { item: 'Regulatory checklists completed', status: 'passed' },
          { item: 'Damage flagged & documented', status: 'passed' },
        ],
        overallStatus: 'approved',
        completedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
        createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
      {
        id: 'INSP-POST-EV1008',
        eventId: 'EV-1008',
        type: 'post_event',
        inspectorId: 'lerato_molefe',
        inspectorName: 'Lerato Molefe',
        checklistItems: [
          { item: 'Venue left in clean condition', status: 'passed' },
          { item: 'Furniture returned to standard layout', status: 'passed' },
          { item: 'AV equipment accounted for', status: 'passed' },
          { item: 'Regulatory checklists completed', status: 'passed' },
          { item: 'Damage flagged & documented', status: 'na' },
        ],
        overallStatus: 'approved',
        completedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
        createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
      {
        id: 'INSP-POST-EV1009',
        eventId: 'EV-1009',
        type: 'post_event',
        inspectorId: 'sipho_dlamini',
        inspectorName: 'Sipho Dlamini',
        checklistItems: [
          { item: 'Venue left in clean condition', status: 'failed' },
          { item: 'Furniture returned to standard layout', status: 'passed' },
          { item: 'AV equipment accounted for', status: 'passed' },
          { item: 'Regulatory checklists completed', status: 'failed' },
          { item: 'Damage flagged & documented', status: 'failed' },
        ],
        overallStatus: 'needs_attention',
        completedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
        createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
    ];
    for (const insp of demoInspections) {
      await setDoc(doc(db, 'event_inspections', insp.id), insp);
    }
    console.log(`✅ Added ${demoInspections.length} event inspection records`);

    // ==========================================
    // 15. EXTRA DAMAGE RECORD (EV-1009, resolved-style)
    // ==========================================
    await setDoc(doc(db, 'damage_records', 'DMG-1003'), {
      id: 'DMG-1003',
      eventId: 'EV-1009',
      bookingRef: 'EV-1009',
      guestId: 'marta_costa',
      guestEmail: 'guest7@example.com',
      venueId: 'v-ashanti-estate',
      venueName: 'Ashanti Estate',
      eventDate: isoFor(dayStr(-2), '12:00'),
      expectedAttendance: 120,
      inspectorId: 'sipho_dlamini',
      inspectorName: 'Sipho Dlamini',
      inspectorEmail: 's.dlamini@azurehorizon.com',
      assignedTechnicianId: 'kevin_dupreez',
      updatedByEmail: 's.dlamini@azurehorizon.com',
      items: [
        {
          item: 'Outdoor Patio Umbrellas',
          assetName: 'Outdoor Patio Umbrellas',
          category: 'Grounds & Outdoor',
          condition: 'damaged',
          description: 'Two umbrellas torn and one pole bent during a windy reception.',
          estimatedCost: 8500,
          photo: u('photo-1504384308090-c894fdcc538d'),
          photoName: 'umbrella-damage.jpg',
        },
        {
          item: 'Garden Pathway Lighting',
          assetName: 'Garden Pathway Lighting',
          category: 'Grounds & Outdoor',
          condition: 'damaged',
          description: 'Three pathway light casings cracked from heavy foot traffic.',
          estimatedCost: 10000,
          photo: u('photo-1519710164239-da123dc03ef4'),
          photoName: 'path-lighting-damage.jpg',
        },
      ],
      generalNotes: 'Guest accepted liability. Repairs scheduled with maintenance.',
      totalCost: 18500,
      status: 'resolved',
      inspectionId: 'INSP-POST-EV1009',
      damageFlagged: true,
      assignedTechnicianName: 'Kevin Du Preez',
      startedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      resolvedAt: new Date(Date.now() - 0.25 * 86400000).toISOString(),
      repairNotes: 'Replaced both damaged umbrellas with reinforced units and re-cast three pathway light casings. All repairs tested and signed off.',
      actualRepairCost: 17850,
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 0.25 * 86400000).toISOString(),
      photos: [u('photo-1504384308090-c894fdcc538d'), u('photo-1519710164239-da123dc03ef4')],
    });

    // ==========================================
    // 15b. INVOICED DEMO DAMAGE CLAIM + OFFICIAL INVOICE (EV-1008)
    // Shows the end state: maintenance resolved → admin ruled →
    // invoice issued to the guest (visible in their billing portal).
    // ==========================================
    const dmg1004 = {
      id: 'DMG-1004',
      eventId: 'EV-1008',
      bookingRef: 'EV-1008',
      guestId: 'ndidi_emecheta',
      guestEmail: 'ndidi.emecheta@example.com',
      venueId: 'v-beach-pavilion',
      venueName: 'Sunset Beach Pavilion',
      eventDate: isoFor(dayStr(-1), '17:00'),
      expectedAttendance: 55,
      inspectorId: 'lerato_molefe',
      inspectorName: 'Lerato Molefe',
      inspectorEmail: 'l.molefe@azurehorizon.com',
      assignedTechnicianId: 'thabo_mbeki',
      assignedTechnicianName: 'Thabo Mbeki',
      updatedByEmail: 'l.molefe@azurehorizon.com',
      items: [
        {
          item: 'Weatherproof Table Umbrellas',
          assetName: 'Weatherproof Table Umbrellas',
          category: 'Grounds & Outdoor',
          condition: 'damaged',
          description: 'One market umbrella arm snapped and tabletop scratched during the cocktail reception.',
          estimatedCost: 4200,
          photo: u('photo-1486915309851-b0cc1f8a0084'),
          photoName: 'table-umbrella-damage.jpg',
        },
      ],
      generalNotes: 'Claim fully reviewed. Guest liability confirmed by admin.',
      totalCost: 4200,
      status: 'invoiced',
      decision: 'APPROVED_FULL_CHARGE',
      finalAssessedAmount: 4200,
      resolutionReason: 'Photo evidence confirms structural damage; full repair cost charged to the guest account.',
      invoiceNumber: 'INV-DMG-EV1008-0001',
      inspectionId: 'INSP-POST-EV1008',
      damageFlagged: true,
      startedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      resolvedAt: new Date(Date.now() - 0.5 * 86400000).toISOString(),
      repairNotes: 'Replaced umbrella arm and re-sanded the tabletop; sealed with marine-grade varnish.',
      actualRepairCost: 4200,
      invoicedAt: new Date(Date.now() - 0.25 * 86400000).toISOString(),
      createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 0.25 * 86400000).toISOString(),
      photos: [u('photo-1486915309851-b0cc1f8a0084')],
    };
    await setDoc(doc(db, 'damage_records', dmg1004.id), dmg1004);

    await setDoc(doc(db, 'invoices', 'INV-DMG-EV1008-0001'), {
      id: 'INV-DMG-EV1008-0001',
      invoiceNumber: 'INV-DMG-EV1008-0001',
      type: 'damage',
      recordId: 'DMG-1004',
      guestId: 'ndidi_emecheta',
      guestEmail: 'ndidi.emecheta@example.com',
      guestName: 'Ndidi Emecheta',
      amount: 4200,
      subtotal: 4200,
      tax: 0,
      lineItems: [
        { name: 'Weatherproof Table Umbrellas', quantity: 1, price: 4200, subtotal: 4200 },
      ],
      sentAt: new Date(Date.now() - 0.25 * 86400000).toISOString(),
      emailStatus: 'sent',
      createdAt: new Date(Date.now() - 0.25 * 86400000).toISOString(),
    });
    console.log(`✅ Added ${demoDamage.length + 1} demo damage records incl. seeded invoice flow`);

    // ==========================================
    // 16. REFUND REQUESTS (admin queue)
    // ==========================================
    const demoRefunds = [
      {
        id: 'REF-1001',
        eventId: 'EV-1002',
        bookingRef: 'EV-1002',
        guestId: 'amara_okafor',
        guestName: 'Amara Okafor',
        guestEmail: 'guest3@example.com',
        reason: 'Shoreline forecast predicts heavy rain; hosting the beach party is not feasible.',
        requestedAmount: 45000,
        totalPaidAmount: 90000,
        status: 'pending',
        proofImages: [u('photo-1507525428034-b723cf961d3e')],
        createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
      {
        id: 'REF-1002',
        eventId: 'EV-1005',
        bookingRef: 'EV-1005',
        guestId: 'jacobus_van_der_merwe',
        guestName: 'Jacobus van der Merwe',
        guestEmail: 'guest6@example.com',
        reason: 'Asked for full refund after finding a cheaper venue. No deposit paid yet.',
        requestedAmount: 22500,
        totalPaidAmount: 0,
        status: 'declined',
        proofImages: [],
        createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
        reviewedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      },
    ];
    for (const rf of demoRefunds) {
      await setDoc(doc(db, 'refund_requests', rf.id), rf);
    }
    console.log(`✅ Added ${demoRefunds.length} refund requests`);

    // ==========================================
    // 17. LIVE COMPLAINTS (guest relations feed)
    // ==========================================
    const demoComplaints = [
      {
        eventId: 'EV-1001',
        guestId: 'guest_001',
        guestName: 'Thandi Mokoena',
        category: 'noise',
        location: 'Grand Ocean Ballroom',
        description: 'Volume of the live band is too loud near the entrance where I was seated.',
        urgency: 'medium',
        photos: [],
        status: 'open',
        createdAt: new Date(Date.now() - 5 * 3600000).toISOString(),
      },
      {
        eventId: 'EV-1001',
        guestId: 'guest_005',
        guestName: 'Priya Naidoo',
        category: 'service',
        location: 'Grand Ocean Ballroom',
        description: 'Cocktail service was slow during the first hour of the reception.',
        urgency: 'low',
        photos: [],
        status: 'open',
        createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
      },
      {
        eventId: 'EV-1006',
        guestId: 'guest_003',
        guestName: 'Lerato Maseko',
        category: 'facility',
        location: 'Grand Ocean Ballroom',
        description: 'One of the breakout rooms had a flickering light; noted it at the front desk.',
        urgency: 'medium',
        photos: [],
        status: 'resolved',
        createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
        updatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      },
    ];
    for (const comp of demoComplaints) {
      await addDoc(collection(db, 'live_complaints'), comp);
    }
    console.log(`✅ Added ${demoComplaints.length} live complaints`);

    // ==========================================
    // 18. EVENT FEEDBACK (UC32 — past event)
    // Mirrors mobile submitEventFeedback (+ its
    // mirrored 'reviews' entry so Leave Review shows it).
    // ==========================================
    await addDoc(collection(db, 'event_feedback'), {
      eventId: 'EV-1006',
      guestId: 'sanjay_gupta',
      guestName: 'Sanjay Gupta',
      ratings: { venue: 5, catering: 4, staff: 5, setup: 4 },
      comments: 'Excellent conference venue, well organised. Catering could do with more vegetarian variety.',
      submittedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    });
    await addDoc(collection(db, 'reviews'), {
      guestId: 'sanjay_gupta',
      guestName: 'Sanjay Gupta',
      category: 'event',
      rating: 5,
      comments: 'Excellent conference venue, well organised. Catering could do with more vegetarian variety.',
      eventId: 'EV-1006',
      helpful: 8,
      createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    });

    // ==========================================
    // 19. MOBILE DATASET PORT — my-mobile-app/scripts/seed-demo-data.js
    // (seedSet azure-demo-v2). Mirrors the mobile demo: same stable doc ids,
    // payloads and Africa/Johannesburg date rules — but UPSERT-ONLY. The
    // mobile Admin-SDK script owns users / worksites / settings / notifications
    // and full-refresh deletes; this web seed never deletes, so it cannot
    // destroy data only the mobile side produces. (Option A + B.)
    // Actor uids are read from the users/{email} docs the mobile script wrote.
    // ==========================================
    {
      const stripUndefined = (v: unknown): unknown => {
        if (v === null || typeof v !== 'object') return v;
        if (Array.isArray(v)) return v.map(stripUndefined);
        const out: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
          if (val !== undefined) out[k] = stripUndefined(val);
        }
        return out;
      };

      // JHB (UTC+02:00 year-round): calendar math on date strings, wall-time
      // stamps as `${date}T${hhmm}:00+02:00` — matches the mobile script's
      // local-time helpers regardless of the browser timezone.
      const jhbToday = () =>
        new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const jAddDays = (s: string, n: number) => {
        const d = new Date(`${s}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + n);
        return d.toISOString().slice(0, 10);
      };
      const jMonday = () => {
        const d = new Date(`${jhbToday()}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
        return d.toISOString().slice(0, 10);
      };
      const jAt = (dateStr: string, hhmm: string) => new Date(`${dateStr}T${hhmm}:00+02:00`).toISOString();
      const nowIso = () => new Date().toISOString();
      const TODAY = jhbToday();
      const WEEK = jMonday();
      const NEXT_WEEK = jAddDays(WEEK, 7);
      const WEEK_AFTER = jAddDays(WEEK, 14);
      const WEEK_3 = jAddDays(WEEK, 21);

      // Demo accounts from VITE_DEMO_ACCOUNTS (same JSON as the mobile
      // EXPO_PUBLIC_DEMO_ACCOUNTS; passwords are never used by the seed).
      let accts: Array<{ label?: unknown; email?: unknown }> = [];
      try {
        const raw = import.meta.env.VITE_DEMO_ACCOUNTS as string | undefined;
        if (raw) {
          let parsed: unknown = JSON.parse(raw);
          if (typeof parsed === 'string') parsed = JSON.parse(parsed);
          if (!Array.isArray(parsed)) {
            const bag = parsed as { accounts?: unknown; demoAccounts?: unknown };
            parsed = bag?.accounts ?? bag?.demoAccounts ?? [];
          }
          if (Array.isArray(parsed)) accts = parsed as Array<{ label?: unknown; email?: unknown }>;
        }
      } catch { accts = []; }

      type SeedActor = { uid: string; email: string; displayName: string; employeeId?: string; npoId?: string };
      const actors: Record<string, SeedActor> = {};
      for (const a of accts) {
        const label = String(a?.label ?? '');
        const email = String(a?.email ?? '').trim().toLowerCase();
        if (!label || !email) continue;
        try {
          const snap = await getDoc(doc(db, 'users', email));
          if (!snap.exists()) continue;
          const d = snap.data();
          if (!d.uid || !d.role) continue;
          actors[label] = {
            uid: String(d.uid), email, displayName: String(d.displayName ?? label),
            ...(d.employeeId ? { employeeId: String(d.employeeId) } : {}),
            ...(d.npoId ? { npoId: String(d.npoId) } : {}),
          };
        } catch { /* profile unreadable — actor skipped */ }
      }

      const required = ['Kitchen Mgr', 'NPO Rep', 'Staff A', 'Staff B'];
      const missing = required.filter((r) => !actors[r]);
      if (!accts.length) {
        console.warn('⏩ Mobile dataset port skipped: VITE_DEMO_ACCOUNTS is not configured');
      } else if (missing.length) {
        console.warn('⏩ Mobile dataset port skipped: demo actor profiles missing — run my-mobile-app scripts/seed-demo-data.js first', missing);
      } else {
        const ops: Array<{ col: string; id: string; data: Record<string, unknown> }> = [];
        const put = (col: string, id: string, data: Record<string, unknown>) => ops.push({ col, id, data });

        const rep = actors['NPO Rep'];
        const adminU = actors['Admin'];
        const mgr = actors['Kitchen Mgr'];
        const courier = actors['Courier'];
        const stA = actors['Staff A'], stB = actors['Staff B'];
        const kSt = actors['Kitchen Staff'], hSt = actors['Hotel Staff'];
        const NPO_ID_BY_REP = 'npo-dbn-haven';
        const facility = (id: string, name: string, address: string, capacity: number, contact: string) =>
          ({ id, name, address, capacity, contact, active: true });

        // ---- npo_partners (4, stable ids) --------------------------------
        put('npo_partners', 'npo-dbn-haven', {
          npoId: 'npo-dbn-haven', organisationName: 'Durban Haven Trust',
          registrationNumber: 'NPO-145-820', pboNumber: 'PBO-930051477',
          contactName: rep?.displayName ?? 'Thandeka Naidoo', email: rep?.email ?? 'npo.rep@azurehorizon.demo',
          phone: '+27 31 555 0142', serviceAreas: ['eThekwini Central', 'Berea', 'Glenwood'],
          beneficiaryCapacity: 620, transportType: 'Refrigerated van', refrigerationAvailable: true,
          complianceDocuments: [
            { url: 'https://firebasestorage.googleapis.com/v0/b/hotel-management-system-c3526.firebasestorage.app/o/npo-docs%2Fdbn-haven-npo-certificate.pdf', fileName: 'dbn-haven-npo-certificate.pdf', mimeType: 'application/pdf', size: 182400, uploadedAt: nowIso(), uploadedBy: rep?.uid ?? 'seed' },
            { url: 'https://firebasestorage.googleapis.com/v0/b/hotel-management-system-c3526.firebasestorage.app/o/npo-docs%2Fdbn-haven-pbo.pdf', fileName: 'dbn-haven-pbo.pdf', mimeType: 'application/pdf', size: 96400, uploadedAt: nowIso(), uploadedBy: rep?.uid ?? 'seed' },
          ],
          facilities: [
            facility('fac-haven-central', 'Durban Haven Community Kitchen', '112 Julius Nyerere St, Durban Central', 350, '+27 31 555 0143'),
            facility('fac-haven-chatsworth', 'Chatsworth Care Centre', '45 Arena Park Dr, Chatsworth', 180, '+27 31 555 0144'),
          ],
          verificationStatus: 'approved', verifiedBy: adminU?.uid ?? 'seed', verifiedAt: nowIso(),
          seedSet: 'azure-demo-v2', createdAt: nowIso(), updatedAt: nowIso(),
        });
        put('npo_partners', 'npo-phoenix-foodbank', {
          npoId: 'npo-phoenix-foodbank', organisationName: 'Phoenix Community Foodbank',
          registrationNumber: 'NPO-092-337', pboNumber: 'PBO-930012088',
          contactName: 'Pravin Reddy', email: 'operations@phoenixfoodbank.co.za', phone: '+27 31 507 2210',
          serviceAreas: ['Phoenix', 'Verulam', 'Tongaat'], beneficiaryCapacity: 940,
          transportType: '1-ton truck', refrigerationAvailable: true,
          complianceDocuments: [
            { url: 'https://firebasestorage.googleapis.com/v0/b/hotel-management-system-c3526.firebasestorage.app/o/npo-docs%2Fphoenix-npo-certificate.pdf', fileName: 'phoenix-npo-certificate.pdf', mimeType: 'application/pdf', size: 154800, uploadedAt: nowIso(), uploadedBy: 'seed' },
          ],
          facilities: [facility('fac-phoenix-hub', 'Phoenix Foodbank Hub', '18 Parthenon St, Phoenix', 600, '+27 31 507 2211')],
          verificationStatus: 'approved', verifiedBy: adminU?.uid ?? 'seed', verifiedAt: nowIso(),
          seedSet: 'azure-demo-v2', createdAt: nowIso(), updatedAt: nowIso(),
        });
        put('npo_partners', 'npo-umlazi-feeding', {
          npoId: 'npo-umlazi-feeding', organisationName: 'Umlazi Feeding Scheme',
          registrationNumber: 'NPO-118-664',
          contactName: 'Sinenhlanhla Ngcobo', email: 'admin@umlazifeeds.org.za', phone: '+27 31 906 7781',
          serviceAreas: ['Umlazi', 'KwaMashu', 'Inanda'], beneficiaryCapacity: 480,
          transportType: 'Bakkie', refrigerationAvailable: false,
          complianceDocuments: [
            { url: 'https://firebasestorage.googleapis.com/v0/b/hotel-management-system-c3526.firebasestorage.app/o/npo-docs%2Fumlazi-npo-certificate.pdf', fileName: 'umlazi-npo-certificate.pdf', mimeType: 'application/pdf', size: 132200, uploadedAt: nowIso(), uploadedBy: 'seed' },
          ],
          facilities: [facility('fac-umlazi-hall', 'Umlazi Community Hall', 'Sibusiso Mdakane Rd, Umlazi', 300, '+27 31 906 7782')],
          verificationStatus: 'approved', verifiedBy: adminU?.uid ?? 'seed', verifiedAt: nowIso(),
          seedSet: 'azure-demo-v2', createdAt: nowIso(), updatedAt: nowIso(),
        });
        put('npo_partners', 'npo-pinetown-outreach', {
          npoId: 'npo-pinetown-outreach', organisationName: 'Pinetown Outreach Network',
          registrationNumber: 'NPO-201-905',
          contactName: 'Megan Pillay', email: 'hello@pinetownoutreach.org.za', phone: '+27 31 701 3344',
          serviceAreas: ['Pinetown', 'Westville', 'New Germany'], beneficiaryCapacity: 260,
          transportType: 'Own vehicle', refrigerationAvailable: false,
          complianceDocuments: [], facilities: [],
          verificationStatus: 'under_review', seedSet: 'azure-demo-v2', createdAt: nowIso(), updatedAt: nowIso(),
        });

        // ---- staff_availability ------------------------------------------
        const monFri = (s: string, e: string) =>
          ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((day) => ({ day, startTime: s, endTime: e }));
        const putAvail = (staff: SeedActor | undefined, weekStart: string, slots: Array<{ day: string; startTime: string; endTime: string }>, unavailable: string[] = []) => {
          if (!staff) return;
          put('staff_availability', `avail-${staff.employeeId}-${weekStart}`, {
            staffId: staff.uid, staffName: staff.displayName, weekStart,
            availability: slots, unavailableDates: unavailable, seedSet: 'azure-demo-v2', updatedAt: nowIso(),
          });
        };
        if (stA) { putAvail(stA, WEEK, monFri('07:00', '18:00')); putAvail(stA, NEXT_WEEK, monFri('07:00', '18:00')); }
        if (stB) {
          const tueThu = [
            { day: 'Tuesday', startTime: '07:00', endTime: '18:00' },
            { day: 'Thursday', startTime: '07:00', endTime: '18:00' },
          ];
          putAvail(stB, WEEK, tueThu); putAvail(stB, NEXT_WEEK, tueThu);
        }
        if (kSt) { putAvail(kSt, WEEK, monFri('08:00', '20:00')); putAvail(kSt, NEXT_WEEK, monFri('08:00', '20:00')); }

        // ---- leave_requests ------------------------------------------------
        const putLeave = (id: string, staff: SeedActor | undefined, leaveType: string, startDate: string, endDate: string, status: string, extra: Record<string, unknown> = {}) => {
          if (!staff) return;
          put('leave_requests', id, {
            staffId: staff.uid, staffName: staff.displayName, leaveType, startDate, endDate,
            supportingDocuments: [], status, submittedAt: nowIso(), seedSet: 'azure-demo-v2', ...extra,
          });
        };
        putLeave('leave-1001', stA, 'Annual leave', jAddDays(WEEK_AFTER, 0), jAddDays(WEEK_AFTER, 1), 'approved',
          mgr ? { reviewedBy: mgr.uid, reviewedAt: nowIso() } : {});
        putLeave('leave-1002', stB, 'Family responsibility', jAddDays(WEEK_AFTER, 3), jAddDays(WEEK_AFTER, 4), 'pending');
        putLeave('leave-1003', kSt, 'Annual leave', jAddDays(NEXT_WEEK, 2), jAddDays(NEXT_WEEK, 2), 'pending');
        putLeave('leave-1004', hSt, 'Sick leave', jAddDays(NEXT_WEEK, 0), jAddDays(NEXT_WEEK, 1), 'rejected',
          mgr ? { reviewedBy: mgr.uid, reviewedAt: nowIso(), rejectionReason: 'Coverage already committed for those dates.' } : {});
        putLeave('leave-1005', courier, 'Annual leave', jAddDays(WEEK_3, 0), jAddDays(WEEK_3, 4), 'approved',
          adminU ? { reviewedBy: adminU.uid, reviewedAt: nowIso() } : {});

        // ---- shift_rosters -------------------------------------------------
        const mkShift = (shiftId: string, staff: SeedActor, date: string, startTime: string, endTime: string, role: string, requiredSkill: string) =>
          ({ shiftId, staffId: staff.uid, staffName: staff.displayName, date, startTime, endTime, role, requiredSkill });
        const putRoster = (id: string, weekStart: string, department: string, shifts: unknown[], published: boolean) => {
          put('shift_rosters', id, {
            rosterId: `RS-${weekStart}-${department}`.replace(/\s+/g, '').toUpperCase(),
            weekStart, department, shifts,
            validationStatus: published ? 'published' : 'validated',
            validationWarnings: [], published,
            publishedAt: published ? nowIso() : undefined,
            publishedBy: published ? mgr?.uid : undefined,
            seedSet: 'azure-demo-v2', createdAt: nowIso(), updatedAt: nowIso(),
          });
        };
        const dW = (n: number) => jAddDays(WEEK, n);
        if (stA || hSt) {
          const shifts: unknown[] = [];
          if (stA) [0, 1, 2, 3, 4].forEach((n) => shifts.push(mkShift(`sh-fo-${n}`, stA, dW(n), '08:00', '16:00', 'Front Desk Officer', 'check-in')));
          if (hSt) {
            shifts.push(mkShift('sh-hk-0', hSt, dW(0), '12:00', '20:00', 'Housekeeping Supervisor', 'supervision'));
            shifts.push(mkShift('sh-hk-2', hSt, dW(2), '12:00', '20:00', 'Housekeeping Supervisor', 'supervision'));
            shifts.push(mkShift('sh-hk-4', hSt, dW(4), '12:00', '20:00', 'Housekeeping Supervisor', 'supervision'));
          }
          putRoster('roster-front-office', WEEK, 'Front Office', shifts, true);
        }
        if (stB) putRoster('roster-facilities', WEEK, 'Facilities', [
          mkShift('sh-fac-1', stB, dW(1), '09:00', '17:00', 'Maintenance Technician', 'repair'),
          mkShift('sh-fac-3', stB, dW(3), '09:00', '17:00', 'Maintenance Technician', 'repair'),
        ], true);

        // #11 — the part-time technician is rostered exactly to their 24h
        // contracted ceiling; a 4th shift must be flagged, not silently allowed.
        if (stB) putRoster('roster-facilities-today', TODAY, 'Facilities', [
          mkShift('sh-fac-today', stB, TODAY, '08:00', '16:00', 'Maintenance Technician', 'repair'),
        ], true);
        // #19 — shifts TODAY so clock-in is demonstrably available on mobile.
        if (stA) putRoster('roster-front-office-today', TODAY, 'Front Office', [
          mkShift('sh-fo-today', stA, TODAY, '08:00', '16:00', 'Front Desk Officer', 'check-in'),
        ], true);
        if (kSt) putRoster('roster-fnb-today', TODAY, 'Food & Beverage', [
          mkShift('sh-fnb-today', kSt, TODAY, '10:00', '18:00', 'Commis Chef', 'food_prep'),
        ], true);
        // #11 — casual housekeeper next week at 20h, matching contract.
        if (hSt) putRoster('roster-housekeeping-next', NEXT_WEEK, 'Housekeeping', [
          mkShift('sh-hk-n0', hSt, jAddDays(NEXT_WEEK, 1), '12:00', '20:00', 'Housekeeping Attendant', 'housekeeping'),
          mkShift('sh-hk-n2', hSt, jAddDays(NEXT_WEEK, 3), '12:00', '20:00', 'Housekeeping Attendant', 'housekeeping'),
        ], false);
        if (kSt) putRoster('roster-fnb', WEEK, 'Food & Beverage',
          [0, 1, 2, 3, 4].map((n) => mkShift(`sh-fnb-${n}`, kSt, dW(n), '10:00', '18:00', 'Commis Chef', 'food_prep')), true);
        if (stA) putRoster('roster-front-office-next', NEXT_WEEK, 'Front Office',
          [0, 1, 2, 3].map((n) => mkShift(`sh-fo-n-${n}`, stA, jAddDays(NEXT_WEEK, n), '08:00', '16:00', 'Front Desk Officer', 'check-in')), false);

        // ---- open_shifts ---------------------------------------------------
        // requestedCount/assignees drive the requested-vs-filled board. Every
        // seeded date is future-relative to TODAY so nothing is born elapsed.
        const putOs = (id: string, department: string, date: string, startTime: string, endTime: string, role: string, requiredSkill: string, urgency: string, status: string, extra: Record<string, unknown> = {}) => {
          const [sh, sm] = startTime.split(':').map(Number);
          const [eh, em] = endTime.split(':').map(Number);
          const requestedCount = Math.max(1, Number(extra.requestedCount) || 1);
          // eslint-disable-next-line @typescript-eslint/no-unused-vars -- drop the raw input after normalising it
          const { requestedCount: _ignored, ...rest } = extra;
          put('open_shifts', id, {
            shiftId: `OS-${id.toUpperCase()}`, rosterId: null, department, date, startTime, endTime, role,
            requiredSkill, hours: Math.round((((eh * 60 + em) - (sh * 60 + sm)) / 60) * 10) / 10,
            urgency, status, requestedCount, assignees: [], seedSet: 'azure-demo-v2', createdAt: nowIso(),
            createdBy: mgr?.uid ?? 'seed', ...rest,
          });
        };
        putOs('os-2001', 'Front Office', jAddDays(TODAY, 1), '14:00', '22:00', 'Front Desk Officer', 'check-in', 'urgent', 'open', { requestedCount: 2 });
        putOs('os-2002', 'Food & Beverage', jAddDays(TODAY, 2), '10:00', '18:00', 'Commis Chef', 'food_prep', 'normal', 'open', { requestedCount: 3 });
        putOs('os-2003', 'Facilities', jAddDays(TODAY, 1), '07:00', '15:00', 'Maintenance Technician', 'repair', 'critical', 'open', { requestedCount: 2 });
        putOs('os-2004', 'Housekeeping', jAddDays(TODAY, 2), '08:00', '16:00', 'Housekeeping Supervisor', 'supervision', 'normal', 'open');
        putOs('os-2005', 'Front Office', jAddDays(TODAY, 1), '06:00', '14:00', 'Front Desk Officer', 'check-in', 'normal', 'open');
        putOs('os-2006', 'Food & Beverage', jAddDays(TODAY, 2), '12:00', '20:00', 'Commis Chef', 'food_safety', 'urgent', 'filled',
          stB ? { claimedBy: stB.uid, claimedAt: nowIso(), assignees: [stB.uid] } : {});
        putOs('os-2007', 'Front Office', jAddDays(TODAY, 3), '16:00', '22:00', 'Front Desk Officer', 'check-in', 'critical', 'open', { requestedCount: 3 });

        // ---- shift_swaps ---------------------------------------------------
        if (stA && hSt) put('shift_swaps', 'swap-3001', {
          requesterStaffId: stA.uid, requesterShiftId: 'sh-fo-2', targetStaffId: hSt.uid, targetShiftId: 'sh-hk-2',
          rosterId: 'roster-front-office', status: 'pending_peer', seedSet: 'azure-demo-v2', createdAt: nowIso(), updatedAt: nowIso(),
        });
        if (hSt && stA) put('shift_swaps', 'swap-3002', {
          requesterStaffId: hSt.uid, requesterShiftId: 'sh-hk-0', targetStaffId: stA.uid, targetShiftId: 'sh-fo-0',
          rosterId: 'roster-front-office', status: 'pending_manager', seedSet: 'azure-demo-v2', createdAt: nowIso(), updatedAt: nowIso(),
        });

        // ---- donation_batches + donation_checkins --------------------------
        // Collection passes are signed byte-identically to the mobile script:
        // sha256hex(VITE_QR_SIGNING_SECRET + JSON.stringify(payload)).
        const qrSecret = (import.meta.env.VITE_QR_SIGNING_SECRET as string | undefined) || '';
        const signPass = async (payload: Record<string, unknown>) =>
          qrSecret ? await sha256Hex(qrSecret + JSON.stringify(payload)) : 'unsigned-seed-pass';
        const checklist = () => ({
          coreTemperatureVerified: true, packagingIntegrityVerified: true,
          allergenLabelsVerified: true, safePreparationWindowVerified: true,
        });
        const photo = (name: string) => ({
          url: `https://firebasestorage.googleapis.com/v0/b/hotel-management-system-c3526.firebasestorage.app/o/donation-safety%2F${name}.jpg`,
          fileName: `${name}.jpg`, mimeType: 'image/jpeg', size: 245000,
          uploadedAt: nowIso(), uploadedBy: mgr?.uid ?? 'seed',
        });
        const B = (id: string, batchId: string, itemName: string, mealCategory: string, portions: number, kg: number, allergens: string[], prepared: string, expiry: string, status: string, extra: Record<string, unknown> = {}) =>
          put('donation_batches', id, {
            batchId, itemName, mealCategory, portionCount: portions, estimatedWeightKg: kg, allergens,
            preparedAt: prepared, expiryAt: expiry, safetyChecklist: checklist(), safetyPhotoUrl: photo(batchId.toLowerCase()).url,
            photoMeta: photo(batchId.toLowerCase()), status, qrConsumed: false,
            createdBy: mgr?.uid ?? 'seed', seedSet: 'azure-demo-v2', createdAt: nowIso(), updatedAt: nowIso(), ...extra,
          });

        // 1 — awaiting allocation (logged today, expires tomorrow)
        B('batch-don-001', 'DON-2026-001', 'Chicken a la King', 'Cooked mains', 120, 42.5, ['milk', 'gluten'],
          jAt(TODAY, '09:15'), jAt(jAddDays(TODAY, 1), '09:15'), 'safety_verified_unassigned');
        // 2 — allocated, awaiting NPO claim
        B('batch-don-002', 'DON-2026-002', 'Vegetable Lasagne', 'Cooked mains', 90, 34.0, ['milk', 'gluten'],
          jAt(TODAY, '08:40'), jAt(jAddDays(TODAY, 1), '08:40'), 'allocated_awaiting_claim',
          { allocatedNpoId: NPO_ID_BY_REP, allocatedAt: nowIso(), allocatedBy: mgr?.uid ?? 'seed' });
        B('batch-don-003', 'DON-2026-003', 'Beef Stew & Rice', 'Cooked mains', 150, 58.2, [],
          jAt(TODAY, '07:55'), jAt(jAddDays(TODAY, 1), '07:55'), 'allocated_awaiting_claim',
          { allocatedNpoId: 'npo-phoenix-foodbank', allocatedAt: nowIso(), allocatedBy: mgr?.uid ?? 'seed' });
        // 3 — claimed, ready to schedule
        B('batch-don-004', 'DON-2026-004', 'Sandwich Platters', 'Ready to eat', 200, 26.0, ['gluten', 'egg'],
          jAt(TODAY, '06:30'), jAt(TODAY, '18:30'), 'claimed_ready_for_scheduling',
          {
            allocatedNpoId: NPO_ID_BY_REP, allocatedAt: nowIso(), allocatedBy: mgr?.uid ?? 'seed',
            claimedBy: rep?.uid ?? 'seed', claimedAt: nowIso(),
            receivingFacility: 'Durban Haven Community Kitchen', distributionTermsAccepted: true,
          });
        // 4 — collection scheduled (future window) with a valid signed pass
        {
          const pickupDate = jAddDays(TODAY, 2);
          const windowStart = jAt(pickupDate, '09:00');
          const windowEnd = jAt(pickupDate, '11:00');
          const nonce = 'seednonce0005';
          const payload = {
            type: 'DONATION_COLLECTION', batchId: 'DON-2026-005', batchDocId: 'batch-don-005', npoId: NPO_ID_BY_REP,
            collectionWindowStart: windowStart, collectionWindowEnd: windowEnd, loadingBay: 'Loading Bay B', issuedAt: Date.now(), nonce,
          };
          const sig = await signPass(payload);
          B('batch-don-005', 'DON-2026-005', 'Fruit & Yoghurt Cups', 'Cold desserts', 180, 22.4, ['milk'],
            jAt(TODAY, '07:10'), jAt(jAddDays(TODAY, 2), '07:10'), 'collection_scheduled', {
              allocatedNpoId: NPO_ID_BY_REP, allocatedAt: nowIso(), allocatedBy: mgr?.uid ?? 'seed',
              claimedBy: rep?.uid ?? 'seed', claimedAt: nowIso(), receivingFacility: 'Durban Haven Community Kitchen',
              distributionTermsAccepted: true, pickupDate, pickupWindowStart: windowStart, pickupWindowEnd: windowEnd,
              loadingBay: 'Loading Bay B', courierName: courier?.displayName ?? 'Bongani Cele',
              collectionQr: JSON.stringify({ ...payload, sig }), collectionNonce: nonce,
            });
        }
        // 5–7 — collected (historical) with matching checkins
        const collected: Array<[string, string, string, string, number, number, string[], number, string, string]> = [
          ['batch-don-006', 'DON-2026-006', 'Roast Chicken Portions', 'Cooked mains', 110, 38.0, [], -3, NPO_ID_BY_REP, 'Durban Haven Community Kitchen'],
          ['batch-don-007', 'DON-2026-007', 'Curry & Rice', 'Cooked mains', 140, 46.5, [], -6, 'npo-phoenix-foodbank', 'Phoenix Foodbank Hub'],
          ['batch-don-008', 'DON-2026-008', 'Assorted Pastries', 'Bakery', 260, 31.2, ['gluten', 'egg'], -9, 'npo-umlazi-feeding', 'Umlazi Community Hall'],
        ];
        for (const [id, batchId, item, cat, portions, kg, allergens, offset, npoId, facilityName] of collected) {
          const prepDate = jAddDays(TODAY, offset);
          const pickDate = jAddDays(TODAY, offset + 1);
          const winStart = jAt(pickDate, '09:00');
          const winEnd = jAt(pickDate, '11:00');
          const nonce = `seednonce${batchId.slice(-3)}`;
          const payload = {
            type: 'DONATION_COLLECTION', batchId, batchDocId: id, npoId,
            collectionWindowStart: winStart, collectionWindowEnd: winEnd, loadingBay: 'Loading Bay A', issuedAt: Date.now(), nonce,
          };
          const sig = await signPass(payload);
          B(id, batchId, item, cat, portions, kg, allergens, jAt(prepDate, '08:00'), jAt(jAddDays(prepDate, 1), '08:00'), 'collected_completed', {
            allocatedNpoId: npoId, allocatedAt: jAt(prepDate, '08:30'), allocatedBy: mgr?.uid ?? 'seed',
            claimedBy: npoId === NPO_ID_BY_REP && rep ? rep.uid : 'seed', claimedAt: jAt(prepDate, '09:00'),
            receivingFacility: facilityName, distributionTermsAccepted: true,
            pickupDate: pickDate, pickupWindowStart: winStart, pickupWindowEnd: winEnd, loadingBay: 'Loading Bay A',
            courierName: courier?.displayName ?? 'Bongani Cele',
            collectionQr: JSON.stringify({ ...payload, sig }), collectionNonce: nonce, qrConsumed: true,
            collectedAt: jAt(pickDate, '10:12'), verifiedBy: courier?.uid ?? 'seed',
          });
          put('donation_checkins', `${id}_${nonce}`, {
            batchId, npoId, courierName: courier?.displayName ?? 'Bongani Cele',
            courierId: courier?.uid, method: 'donation_scan',
            collectionWindow: `${winStart} → ${winEnd}`, loadingBay: 'Loading Bay A',
            sealVerified: true, signature: courier?.displayName ?? 'Bongani Cele',
            collectedAt: jAt(pickDate, '10:12'), verifiedBy: courier?.uid ?? 'seed',
            wasOffline: false, idempotencyKey: `${id}:${nonce}`, seedSet: 'azure-demo-v2',
          });
        }
        // 8 — cancelled
        B('batch-don-009', 'DON-2026-009', 'Fish Curry', 'Cooked mains', 70, 27.8, ['fish'],
          jAt(jAddDays(TODAY, -1), '12:00'), jAt(TODAY, '12:00'), 'cancelled', {
            lastDecision: { performedBy: mgr?.uid ?? 'seed', performedAt: nowIso(), action: 'donation_cancelled', reason: 'Cold-chain break detected on inspection.' },
          });

        // ---- attendance_exceptions -----------------------------------------
        const putExc = (id: string, staff: SeedActor | undefined, date: string, startTime: string, endTime: string, exceptionType: string, reviewStatus: string, rosterId: string, shiftId: string, extra: Record<string, unknown> = {}) => {
          if (!staff) return;
          put('attendance_exceptions', id, {
            staffId: staff.uid, staffName: staff.displayName, shiftId, rosterId,
            clockInAt: jAt(date, startTime), clockOutAt: jAt(date, endTime), hoursWorked: 7.5, scheduledHours: 8,
            exceptionType, reviewStatus, seedSet: 'azure-demo-v2', createdAt: nowIso(), ...extra,
          });
        };
        putExc('exc-4001', stA, jAddDays(WEEK, 2), '08:22', '16:00', 'late_arrival', 'exception_review', 'roster-front-office', 'sh-fo-2');
        putExc('exc-4002', stB, jAddDays(WEEK, 1), '09:12', '15:30', 'early_departure', 'exception_review', 'roster-facilities', 'sh-fac-1');
        putExc('exc-4003', hSt, jAddDays(WEEK, 0), '12:00', '20:00', 'outside_geofence', 'verified', 'roster-front-office', 'sh-hk-0',
          mgr ? {
            adjustedBy: mgr.uid, adjustedAt: nowIso(), adjustmentReason: 'GPS drift confirmed — punch accepted on site.',
            originalValue: JSON.stringify({ reviewStatus: 'exception_review' }), newValue: JSON.stringify({ reviewStatus: 'verified' }),
          } : {});

        // ---- commit: upsert-only, no deletes -------------------------------
        for (const op of ops) {
          await setDoc(doc(db, op.col, op.id), stripUndefined(op.data) as Parameters<typeof setDoc>[1], { merge: true });
        }
        console.log(`✅ Ported mobile azure-demo-v2 dataset: ${ops.length} docs (stable ids, upsert-only, no deletes)`);
      }
    }

    // (section 20 donation batches replaced by the mobile port above)

    // (section 21 workforce seed replaced by the mobile port above — punch_records
    //  are intentionally NOT seeded: the old docs referenced fake staff ids)

    await setDoc(doc(db, 'meta', 'seedMarker'), {
      lastSeedDate: todayStr,
      lastSeedAt: new Date().toISOString(),
    });

    notify("✅ System Initialized Successfully with 200 rooms, 9 fresh events, signed QR invitations and online images!");
  } catch (err) {
    console.error(err);
    notify("Seeding failed. Check console for details.");
  }
};

// Auto-run on web landing page: only re-seeds when the
// seed marker is stale (i.e. a different day), keeping the
// demo data permanently in sync with "today". Silent by default.
//
// NOT currently wired to any page — deliberate. Live Firestore rules
// (probed 2026-10-04) deny most re-seed writes for every role:
//  - signed out: everything is denied (previous landing-page trigger
//    always failed; the event-domain wipes ran only if an admin session
//    overlapped, and then the recreates were denied → data loss);
//  - admin: spa/tour/leave/donation/npo/swap/exception updates and any
//    edit to open-status open_shifts are all denied (even no-ops), so a
//    run aborts midway. Event invitations/feedback must not be wiped
//    either (wipes succeed as admin, recreates do not).
// Demo freshness is owned by my-mobile-app scripts/seed-demo-data.js
// (client SDK + rules-compatible). Re-enable this only alongside a
// rules change that permits each write the seed performs.
export const autoSeedIfNeeded = async (opts: { silent?: boolean } = {}) => {
  try {
    const marker = await getDoc(doc(db, 'meta', 'seedMarker'));
    const lastSeedDate = marker.exists() ? (marker.data()?.lastSeedDate || '') : '';
    if (lastSeedDate === todayStr) {
      console.log('📅 Seed data already fresh for', todayStr);
      return;
    }
    await seedDatabase({ silent: true });
  } catch (err) {
    console.error('autoSeedIfNeeded failed:', err);
  }
};
