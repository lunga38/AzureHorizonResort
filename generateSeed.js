const fs = require('fs');

const generateSeed = () => {
  const fileContent = `import { db, rtdb } from '../lib/firebase';
import { doc, setDoc, collection, addDoc } from 'firebase/firestore';
import { ref, set } from 'firebase/database';
import { seedTables } from './tableSeedData';

export const seedDatabase = async () => {
  try {
    alert("Starting database initialization...");

    // ==========================================
    // 1. STAFF ACCOUNTS (25)
    // ==========================================
    const staffList = [
      { id: 'bandile_maqeda', uid: 'bandile_maqeda', name: "Bandile Maqeda", role: "admin", email: "admin@azurehorizon.com", status: 'staff' },
      { id: 'sarah_jenkins', uid: 'sarah_jenkins', name: "Sarah Jenkins", role: "admin", email: "s.jenkins@azurehorizon.com", status: 'staff' },
      { id: 'pieter_uys', uid: 'pieter_uys', name: "Pieter-Dirk Uys", role: "admin", email: "p.uys@azurehorizon.com", status: 'staff' },
      { id: 'sibusiso_khoza', uid: 'sibusiso_khoza', name: "Chef Sibusiso Khoza", role: "chef", email: "s.khoza@azurehorizon.com", status: 'staff' },
      { id: 'marco_rossi', uid: 'marco_rossi', name: "Chef Marco Rossi", role: "chef", email: "m.rossi@azurehorizon.com", status: 'staff' },
      { id: 'oliver_tambo', uid: 'oliver_tambo', name: "Chef Oliver Tambo", role: "chef", email: "o.tambo@azurehorizon.com", status: 'staff' },
      { id: 'zuki_matola', uid: 'zuki_matola', name: "Chef Zuki Matola", role: "chef", email: "z.matola@azurehorizon.com", status: 'staff' },
      { id: 'gordon_ramsay', uid: 'gordon_ramsay', name: "Chef Gordon Ramsay", role: "chef", email: "g.ramsay@azurehorizon.com", status: 'staff' },
      { id: 'elena_meyer', uid: 'elena_meyer', name: "Elena Meyer", role: "front_desk", email: "e.meyer@azurehorizon.com", status: 'staff' },
      { id: 'lindiwe_buthelezi', uid: 'lindiwe_buthelezi', name: "Lindiwe Buthelezi", role: "front_desk", email: "l.buthelezi@azurehorizon.com", status: 'staff' },
      { id: 'anita_desai', uid: 'anita_desai', name: "Anita Desai", role: "front_desk", email: "a.desai@azurehorizon.com", status: 'staff' },
      { id: 'grace_kelly', uid: 'grace_kelly', name: "Grace Kelly", role: "front_desk", email: "g.kelly@azurehorizon.com", status: 'staff' },
      { id: 'musa_ndlovu', uid: 'musa_ndlovu', name: "Musa Ndlovu", role: "tour_guide", email: "m.ndlovu@azurehorizon.com", status: 'staff' },
      { id: 'david_attenborough', uid: 'david_attenborough', name: "David Attenborough", role: "tour_guide", email: "d.attenborough@azurehorizon.com", status: 'staff' },
      { id: 'lesego_tau', uid: 'lesego_tau', name: "Lesego Tau", role: "tour_guide", email: "l.tau@azurehorizon.com", status: 'staff' },
      { id: 'tanya_smith', uid: 'tanya_smith', name: "Tanya Smith", role: "tour_guide", email: "t.smith@azurehorizon.com", status: 'staff' },
      { id: 'johan_van_wyk', uid: 'johan_van_wyk', name: "Johan van Wyk", role: "spa", email: "j.vanwyk@azurehorizon.com", status: 'staff' },
      { id: 'nomsa_mkhize', uid: 'nomsa_mkhize', name: "Nomsa Mkhize", role: "spa", email: "n.mkhize@azurehorizon.com", status: 'staff' },
      { id: 'claire_foster', uid: 'claire_foster', name: "Claire Foster", role: "spa", email: "c.foster@azurehorizon.com", status: 'staff' },
      { id: 'kabelo_modise', uid: 'kabelo_modise', name: "Kabelo Modise", role: "spa", email: "k.modise@azurehorizon.com", status: 'staff' },
      { id: 'thabo_mbeki', uid: 'thabo_mbeki', name: "Thabo Mbeki", role: "maintenance", email: "t.mbeki@azurehorizon.com", status: 'staff' },
      { id: 'kevin_dupreez', uid: 'kevin_dupreez', name: "Kevin Du Preez", role: "maintenance", email: "k.dupreez@azurehorizon.com", status: 'staff' },
      { id: 'chris_evans', uid: 'chris_evans', name: "Chris Evans", role: "housekeeping", email: "c.evans@azurehorizon.com", status: 'staff' },
      { id: 'frikkie_louw', uid: 'frikkie_louw', name: "Frikkie Louw", role: "housekeeping", email: "f.louw@azurehorizon.com", status: 'staff' },
      { id: 'zanele_moyo', uid: 'zanele_moyo', name: "Zanele Moyo", role: "housekeeping", email: "z.moyo@azurehorizon.com", status: 'staff' },
    ];

    for (const staff of staffList) {
      await setDoc(doc(db, 'users', staff.email), staff);
    }
    console.log(\`✅ Added \${staffList.length} staff accounts\`);

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
    console.log(\`✅ Added \${guests.length} guest accounts\`);

    // ==========================================
    // 3. ROOMS (200 rooms programmatic)
    // ==========================================
    const rooms = [];
    const baseTypes = [
      { prefix: '1', type: 'ocean_view', name: 'Oceanic Executive Suite', price: 4200, capacity: 2, amenities: ['King Bed', 'Ocean View', 'WiFi', 'Mini Bar', 'Room Service', 'Private Balcony', 'Walk-in Shower'], images: ['/rooms/ocean-suite.png', '/rooms/ocean-suite-bedroom.jpg', '/rooms/ocean-suite-bathroom.jpg', '/rooms/ocean-suite-balcony.jpg'] },
      { prefix: '2', type: 'garden', name: 'Coral Garden Terrace', price: 2800, capacity: 2, amenities: ['Queen Bed', 'Garden View', 'WiFi', 'Patio', 'Outdoor Seating', 'Rain Shower'], images: ['/rooms/garden-terrace-bedroom.jpg', '/rooms/garden-terrace-patio.jpg', '/rooms/garden-terrace-garden.png'] },
      { prefix: '3', type: 'family', name: 'Heritage Suite', price: 6200, capacity: 4, amenities: ['King Bed', 'Living Room', 'Dining Area', 'WiFi', 'Fireplace', 'Antique Furnishings'], images: ['/rooms/heritage-suite.png', '/rooms/heritage-suite-living.jpg', '/rooms/heritage-suite-bedroom.jpg'] },
      { prefix: '4', type: 'villa', name: 'Family Villa', price: 6500, capacity: 6, amenities: ['Bunk Beds', 'Kitchenette', 'Play Area', 'Garden Access', 'Kids Club', 'Game Console', 'Crib Available'], images: ['/rooms/family-villa.png', '/rooms/family-villa-kids.png', '/rooms/family-villa-living.jpg', '/rooms/garden-terrace-bedroom.jpg'] },
      { prefix: '5', type: 'penthouse', name: 'Skyline Penthouse', price: 9500, capacity: 4, amenities: ['King Bed', 'Private Pool', 'Butler Service', 'Kitchen', '360° View', 'Dining Area', 'Home Theater'], images: ['/rooms/penthouse.png', '/rooms/penthouse-living.jpg', '/rooms/penthouse-pool.jpg', '/rooms/penthouse-view.jpg'] },
    ];
    
    for (let floor = 1; floor <= 5; floor++) {
      const typeData = baseTypes[floor - 1];
      for (let r = 1; r <= 40; r++) {
        const roomNum = \`\${typeData.prefix}\${r.toString().padStart(2, '0')}\`;
        rooms.push({
          id: roomNum,
          name: \`\${typeData.name} \${roomNum}\`,
          price: typeData.price,
          type: typeData.type,
          isAvailable: true,
          capacity: typeData.capacity,
          description: \`Spacious \${typeData.name} on floor \${floor}.\`,
          amenities: typeData.amenities,
          images: typeData.images
        });
      }
    }

    for (const room of rooms) {
      await setDoc(doc(db, 'rooms', room.id), room);
    }
    console.log(\`✅ Added \${rooms.length} rooms\`);

    // ==========================================
    // 4. BOOKINGS (30 generated)
    // ==========================================
    const today = new Date();
    const futureDate = (days) => new Date(today.getTime() + days * 86400000).toISOString().split('T')[0];
    const pastDate = (days) => new Date(today.getTime() - days * 86400000).toISOString().split('T')[0];

    const bookings = [
      { id: 'BK-1001', guestId: 'robert_harrison', guestName: 'Robert Harrison', status: 'checked_in', roomNumber: '101', roomName: 'Oceanic Executive Suite 101', checkInDate: pastDate(2), checkOutDate: futureDate(2), totalAmount: 16800, numberOfGuests: 2, paymentStatus: 'deposit_paid', depositPaid: 2520, balanceDue: 14280 },
      { id: 'BK-1002', guestId: 'zoe_katsaros', guestName: 'Zoe Katsaros', status: 'checked_in', roomNumber: '204', roomName: 'Coral Garden Terrace 204', checkInDate: pastDate(3), checkOutDate: futureDate(1), totalAmount: 11200, numberOfGuests: 2, paymentStatus: 'deposit_paid', depositPaid: 1680, balanceDue: 9520 },
      { id: 'BK-1003', guestId: 'amara_okafor', guestName: 'Amara Okafor', status: 'checked_in', roomNumber: '302', roomName: 'Heritage Suite 302', checkInDate: pastDate(1), checkOutDate: futureDate(5), totalAmount: 37200, numberOfGuests: 4, paymentStatus: 'paid', depositPaid: 5580, balanceDue: 0, lastPaidAt: new Date().toISOString() },
      { id: 'BK-1004', guestId: 'jacobus_van_der_merwe', guestName: 'Jacobus van der Merwe', status: 'checked_in', roomNumber: '410', roomName: 'Family Villa 410', checkInDate: pastDate(4), checkOutDate: futureDate(3), totalAmount: 45500, numberOfGuests: 6, paymentStatus: 'deposit_paid', depositPaid: 6825, balanceDue: 38675 },
      { id: 'BK-1005', guestId: 'sanjay_gupta', guestName: 'Sanjay Gupta', status: 'checked_in', roomNumber: '501', roomName: 'Skyline Penthouse 501', checkInDate: pastDate(1), checkOutDate: futureDate(7), totalAmount: 76000, numberOfGuests: 4, paymentStatus: 'paid', depositPaid: 11400, balanceDue: 0, lastPaidAt: new Date().toISOString() },
      
      { id: 'BK-1006', guestId: 'isabella_rossi', guestName: 'Isabella Rossi', status: 'checked_out', roomNumber: '105', roomName: 'Oceanic Executive Suite 105', checkInDate: pastDate(10), checkOutDate: pastDate(7), totalAmount: 12600, numberOfGuests: 2, paymentStatus: 'paid', depositPaid: 1890, balanceDue: 0, lastPaidAt: pastDate(7) },
      { id: 'BK-1012', guestId: 'linda_thompson', guestName: 'Linda Thompson', status: 'checked_out', roomNumber: '215', roomName: 'Coral Garden Terrace 215', checkInDate: pastDate(20), checkOutDate: pastDate(17), totalAmount: 8400, numberOfGuests: 2, paymentStatus: 'paid', depositPaid: 1260, balanceDue: 0, lastPaidAt: pastDate(17) },
      
      { id: 'BK-1008', guestId: 'sarah_johnson', guestName: 'Sarah Johnson', status: 'confirmed', roomNumber: '305', roomName: 'Heritage Suite 305', checkInDate: futureDate(3), checkOutDate: futureDate(6), totalAmount: 18600, numberOfGuests: 2, paymentStatus: 'deposit_paid', depositPaid: 2790, balanceDue: 15810 },
      { id: 'BK-1009', guestId: 'maria_garcia', guestName: 'Maria Garcia', status: 'confirmed', roomNumber: '208', roomName: 'Coral Garden Terrace 208', checkInDate: futureDate(5), checkOutDate: futureDate(9), totalAmount: 11200, numberOfGuests: 2, paymentStatus: 'pending', depositPaid: 0, balanceDue: 11200 },
      { id: 'BK-1010', guestId: 'david_wilson', guestName: 'David Wilson', status: 'confirmed', roomNumber: '505', roomName: 'Skyline Penthouse 505', checkInDate: futureDate(7), checkOutDate: futureDate(11), totalAmount: 38000, numberOfGuests: 3, paymentStatus: 'pending', depositPaid: 0, balanceDue: 38000 },
    ];

    for (const b of bookings) {
      await setDoc(doc(db, 'bookings', b.id), b);
      
      if (b.status === 'checked_in') {
        const roomRef = doc(db, 'rooms', b.roomNumber);
        await setDoc(roomRef, { isAvailable: false }, { merge: true });
      }
    }
    console.log(\`✅ Added \${bookings.length} bookings\`);

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
    console.log(\`✅ Added \${incidentals.length} incidental charges\`);

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
    console.log(\`✅ Added \${serviceRequests.length} service requests\`);

    // ==========================================
    // 6. RESTAURANT MENU (RTDB)
    // ==========================================
    const menuRef = ref(rtdb, 'menu');
    await set(menuRef, {
      appetizers: [
        { id: 'a1', name: 'Tuna Tartare', price: 145, description: 'Fresh Atlantic tuna with avocado, sesame, and citrus soy dressing.', dietary: ['gluten-free'], image: '/food/tuna-tartare.jpg' },
        { id: 'a2', name: 'Oysters Rockefeller', price: 180, description: 'Half dozen fresh oysters baked with spinach, herbs, and breadcrumbs.', dietary: ['contains shellfish'], image: '/food/oysters-rockefeller.jpg' },
      ],
      mains: [
        { id: 'm1', name: 'Wagyu Beef Steak', price: 450, description: '250g A5 Wagyu with truffle mash, asparagus, and red wine reduction.', dietary: ['gluten-free option'], image: '/food/wagyu-steak.jpg' },
        { id: 'm2', name: 'Grilled Lobster', price: 580, description: 'Whole lobster split and grilled with garlic herb butter.', dietary: ['contains shellfish'], image: '/food/grilled-lobster.jpg' },
        { id: 'm3', name: 'Wild Mushroom Risotto', price: 210, description: 'Creamy Arborio rice with porcini, shiitake, and truffle oil.', dietary: ['vegetarian'], image: '/food/mushroom-risotto.jpg' },
      ],
      desserts: [
        { id: 'de1', name: 'Chocolate Fondant', price: 95, description: 'Warm chocolate lava cake with vanilla bean ice cream.', dietary: ['vegetarian'], image: '/food/chocolate-lava-cake.jpg' },
      ],
      beverages: [
        { id: 'b1', name: 'Signature Cocktail', price: 120, description: 'Azure Horizon Special - gin, elderflower, prosecco, and edible flowers.', image: '/food/signature-cocktail.jpg' },
      ],
    });
    console.log(\`✅ Added restaurant menu\`);

    // ==========================================
    // 7. RESTAURANT TABLES
    // ==========================================
    await seedTables();

    // ==========================================
    // 8. SAMPLE TABLE RESERVATIONS
    // ==========================================
    const tableReservations = [
      { guestId: 'robert_harrison', guestName: 'Robert Harrison', date: futureDate(1), time: '19:00', partySize: 2, tableNumber: 5, tableType: 'medium', location: 'Window', status: 'confirmed', specialRequests: 'Anniversary celebration', createdAt: new Date().toISOString() },
    ];
    for (const r of tableReservations) {
      await addDoc(collection(db, 'table_reservations'), r);
    }
    console.log(\`✅ Added \${tableReservations.length} table reservations\`);

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
    console.log(\`✅ Added tours and spa bookings\`);

    // ==========================================
    // 10. REVIEWS
    // ==========================================
    const dummyReviews = [
      { guestId: 'guest_001', guestName: 'Thandi Mokoena', category: 'room', rating: 5, comments: 'The Ocean View Suite was absolutely breathtaking! Waking up to the sound of waves every morning made this the best holiday of my life.', createdAt: pastDate(2), helpful: 12 },
      { guestId: 'guest_005', guestName: 'Priya Naidoo', category: 'restaurant', rating: 5, comments: 'Chef Sibusiso\\'s seafood platter is out of this world! The fresh line fish with chakalaka butter sauce was a masterpiece.', createdAt: pastDate(1), helpful: 22 },
      { guestId: 'guest_010', guestName: 'Zanele Mthembu', category: 'tour', rating: 5, comments: 'The whale watching tour was a once-in-a-lifetime experience! Our guide was incredibly knowledgeable and we spotted a mother and calf.', createdAt: pastDate(1), helpful: 25 },
      { guestId: 'guest_014', guestName: 'Lerato Maseko', category: 'spa', rating: 5, comments: 'The hot stone massage was pure bliss. Therapist Nomsa has magic hands! The relaxation room with herbal tea afterwards was the perfect way to unwind.', createdAt: pastDate(2), helpful: 20 },
    ];
    for (const review of dummyReviews) {
      await addDoc(collection(db, 'reviews'), review);
    }
    console.log(\`✅ Added \${dummyReviews.length} guest reviews\`);

    alert("✅ System Initialized Successfully with 200 rooms and fresh demo data!");
  } catch (err) {
    console.error(err);
    alert("Seeding failed. Check console for details.");
  }
};
`;

  fs.writeFileSync('c:\\Users\\mphoj\\OneDrive\\Documents\\Fixed 2\\app\\src\\services\\seedData.ts', fileContent, 'utf-8');
};

generateSeed();
