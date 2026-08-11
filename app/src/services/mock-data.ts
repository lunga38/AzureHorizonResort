import type { 
  Room, 
  Booking, 
  MenuItem, 
  FoodOrder, 
  RoomServiceRequest,
  ChatMessage,
  GuideSection 
} from '@/types';

// ==========================================
// MOCK ROOMS
// ==========================================

export const MOCK_ROOMS: Room[] = [
  {
    id: 'room-001',
    name: 'Deluxe Ocean View',
    type: 'ocean_view',
    price: 350,
    capacity: 2,
    description: 'Wake up to breathtaking ocean vistas from your private balcony. Features a king bed, luxury linens, and modern amenities.',
    amenities: ['Ocean View', 'King Bed', 'Free WiFi', 'Mini Bar', 'Room Service', 'Air Conditioning', 'Flat Screen TV'],
    images: ['/room-ocean-view.jpg'],
    isAvailable: true,
  },
  {
    id: 'room-002',
    name: 'Garden Suite',
    type: 'garden',
    price: 280,
    capacity: 2,
    description: 'Find tranquility surrounded by tropical gardens. Features a private terrace and direct garden access.',
    amenities: ['Garden View', 'Queen Bed', 'Free WiFi', 'Private Terrace', 'Room Service', 'Air Conditioning', 'Rain Shower'],
    images: ['/room-garden.jpg'],
    isAvailable: true,
  },
  {
    id: 'room-003',
    name: 'Presidential Penthouse',
    type: 'penthouse',
    price: 850,
    capacity: 4,
    description: 'The pinnacle of luxury living. Expansive space with panoramic views, butler service, and premium amenities.',
    amenities: ['Panoramic View', 'Master Suite', 'Butler Service', 'Private Pool', 'Kitchen', 'Dining Room', 'Home Theater'],
    images: ['/room-penthouse.jpg'],
    isAvailable: true,
  },
  {
    id: 'room-004',
    name: 'Family Villa',
    type: 'family',
    price: 450,
    capacity: 6,
    description: 'Spacious comfort for the whole family. Multiple bedrooms, living area, and kid-friendly amenities.',
    amenities: ['Multiple Bedrooms', 'Living Area', 'Kitchenette', 'Kids Amenities', 'Pool Access', 'Game Console', 'Crib Available'],
    images: ['/room-family.jpg'],
    isAvailable: true,
  },
];

// ==========================================
// MOCK BOOKINGS
// ==========================================

export const MOCK_BOOKINGS: Booking[] = [
  {
    id: 'booking-001',
    guestId: 'guest-001',
    guestName: 'John Smith',
    roomId: 'room-001',
    roomName: 'Deluxe Ocean View',
    roomNumber: '101', // FIXED: Added missing property
    checkInDate: '2024-03-15',
    checkOutDate: '2024-03-20',
    numberOfGuests: 2,
    specialRequests: 'Champagne on arrival, late check-out requested',
    status: 'checked_in',
    totalAmount: 1750,
    paymentStatus: 'paid',
    createdAt: '2024-03-01T10:30:00Z',
  },
  {
    id: 'booking-002',
    guestId: 'guest-002',
    guestName: 'Emma Wilson',
    roomId: 'room-002',
    roomName: 'Garden Suite',
    roomNumber: '202', // FIXED: Added missing property
    checkInDate: '2024-03-18',
    checkOutDate: '2024-03-22',
    numberOfGuests: 2,
    status: 'confirmed',
    totalAmount: 1120,
    paymentStatus: 'paid',
    createdAt: '2024-03-05T14:20:00Z',
  },
  {
    id: 'booking-003',
    guestId: 'guest-003',
    guestName: 'Robert Brown',
    roomId: 'room-003',
    roomName: 'Presidential Penthouse',
    roomNumber: 'PH-1', // FIXED: Added missing property
    checkInDate: '2024-03-20',
    checkOutDate: '2024-03-25',
    numberOfGuests: 4,
    specialRequests: 'Airport transfer, private chef dinner',
    status: 'confirmed',
    totalAmount: 4250,
    paymentStatus: 'pending',
    createdAt: '2024-03-10T09:15:00Z',
  },
  {
    id: 'booking-004',
    guestId: 'guest-004',
    guestName: 'The Johnson Family',
    roomId: 'room-004',
    roomName: 'Family Villa',
    roomNumber: 'V-05', // FIXED: Added missing property
    checkInDate: '2024-03-16',
    checkOutDate: '2024-03-19',
    numberOfGuests: 5,
    specialRequests: 'Crib needed, connecting rooms',
    status: 'checked_in',
    totalAmount: 1350,
    paymentStatus: 'paid',
    createdAt: '2024-03-08T16:45:00Z',
  },
];

// ==========================================
// MOCK MENU ITEMS
// ==========================================

export const MOCK_MENU_ITEMS: MenuItem[] = [
  // Appetizers
  {
    id: 'menu-001',
    name: 'Tuna Tartare',
    description: 'Fresh yellowfin tuna with avocado, sesame, and citrus soy dressing',
    price: 24,
    category: 'appetizers',
    dietary: ['gluten-free'],
  },
  {
    id: 'menu-002',
    name: 'Truffle Arancini',
    description: 'Crispy risotto balls with black truffle and mozzarella',
    price: 18,
    category: 'appetizers',
    dietary: ['vegetarian'],
  },
  {
    id: 'menu-003',
    name: 'Seafood Ceviche',
    description: 'Daily catch marinated in lime with cilantro and red onion',
    price: 22,
    category: 'appetizers',
    dietary: ['gluten-free', 'dairy-free'],
  },
  // Mains
  {
    id: 'menu-004',
    name: 'Grilled Lobster',
    description: 'Whole lobster with garlic butter and seasonal vegetables',
    price: 65,
    category: 'mains',
    dietary: ['gluten-free'],
  },
  {
    id: 'menu-005',
    name: 'Wagyu Beef Steak',
    description: 'A5 Wagyu with truffle mash and red wine reduction',
    price: 95,
    category: 'mains',
    dietary: ['gluten-free'],
  },
  {
    id: 'menu-006',
    name: 'Mediterranean Pasta',
    description: 'Handmade pasta with sun-dried tomatoes, olives, and feta',
    price: 32,
    category: 'mains',
    dietary: ['vegetarian'],
  },
  {
    id: 'menu-007',
    name: 'Catch of the Day',
    description: 'Fresh local fish with herb crust and lemon butter',
    price: 48,
    category: 'mains',
    dietary: ['gluten-free'],
  },
  // Desserts
  {
    id: 'menu-008',
    name: 'Chocolate Fondant',
    description: 'Warm chocolate cake with vanilla ice cream',
    price: 16,
    category: 'desserts',
    dietary: ['vegetarian'],
  },
  {
    id: 'menu-009',
    name: 'Tropical Fruit Plate',
    description: 'Seasonal exotic fruits with passion fruit coulis',
    price: 14,
    category: 'desserts',
    dietary: ['vegan', 'gluten-free'],
  },
  // Beverages
  {
    id: 'menu-010',
    name: 'Signature Cocktail',
    description: 'Resort special with rum, coconut, and tropical fruits',
    price: 18,
    category: 'beverages',
  },
  {
    id: 'menu-011',
    name: 'Fresh Coconut',
    description: 'Chilled young coconut served naturally',
    price: 12,
    category: 'beverages',
    dietary: ['vegan', 'gluten-free'],
  },
  {
    id: 'menu-012',
    name: 'Artisan Coffee',
    description: 'Locally sourced espresso or cappuccino',
    price: 8,
    category: 'beverages',
    dietary: ['vegan'],
  },
];

// ==========================================
// MOCK ORDERS (for Kitchen Display System)
// ==========================================

export const MOCK_ORDERS: FoodOrder[] = [
  {
    id: 'order-001',
    guestId: 'guest-001',
    guestName: 'John Smith',
    roomNumber: '205',
    orderType: 'room_delivery',
    items: [
      { menuItemId: 'menu-004', name: 'Grilled Lobster', quantity: 1, price: 65 },
      { menuItemId: 'menu-008', name: 'Chocolate Fondant', quantity: 1, price: 16 },
      { menuItemId: 'menu-010', name: 'Signature Cocktail', quantity: 2, price: 36 },
    ],
    totalAmount: 117,
    status: 'pending',
    createdAt: new Date(Date.now() - 5 * 60000).toISOString(),
    estimatedReadyTime: new Date(Date.now() + 25 * 60000).toISOString(),
  },
  {
    id: 'order-002',
    guestId: 'guest-004',
    guestName: 'The Johnson Family',
    tableNumber: 'Table 12',
    orderType: 'dine_in',
    items: [
      { menuItemId: 'menu-001', name: 'Tuna Tartare', quantity: 2, price: 48 },
      { menuItemId: 'menu-006', name: 'Mediterranean Pasta', quantity: 1, price: 32 },
      { menuItemId: 'menu-007', name: 'Catch of the Day', quantity: 2, price: 96 },
    ],
    totalAmount: 176,
    status: 'preparing',
    assignedTo: 'staff-002',
    createdAt: new Date(Date.now() - 15 * 60000).toISOString(),
    estimatedReadyTime: new Date(Date.now() + 15 * 60000).toISOString(),
  },
  {
    id: 'order-003',
    guestId: 'guest-002',
    guestName: 'Emma Wilson',
    roomNumber: '118',
    orderType: 'room_delivery',
    items: [
      { menuItemId: 'menu-003', name: 'Seafood Ceviche', quantity: 1, price: 22 },
      { menuItemId: 'menu-011', name: 'Fresh Coconut', quantity: 1, price: 12 },
    ],
    totalAmount: 34,
    status: 'ready',
    createdAt: new Date(Date.now() - 30 * 60000).toISOString(),
    estimatedReadyTime: new Date(Date.now() - 5 * 60000).toISOString(),
  },
  {
    id: 'order-004',
    guestId: 'guest-005',
    guestName: 'Michael Torres',
    tableNumber: 'Table 8',
    orderType: 'dine_in',
    items: [
      { menuItemId: 'menu-005', name: 'Wagyu Beef Steak', quantity: 1, price: 95 },
      { menuItemId: 'menu-002', name: 'Truffle Arancini', quantity: 1, price: 18 },
      { menuItemId: 'menu-012', name: 'Artisan Coffee', quantity: 1, price: 8 },
    ],
    totalAmount: 121,
    status: 'ready',
    createdAt: new Date(Date.now() - 25 * 60000).toISOString(),
    estimatedReadyTime: new Date(Date.now() - 2 * 60000).toISOString(),
  },
  {
    id: 'order-005',
    guestId: 'guest-006',
    guestName: 'Lisa Chen',
    roomNumber: '302',
    orderType: 'room_delivery',
    items: [
      { menuItemId: 'menu-009', name: 'Tropical Fruit Plate', quantity: 1, price: 14 },
      { menuItemId: 'menu-011', name: 'Fresh Coconut', quantity: 2, price: 24 },
    ],
    totalAmount: 38,
    status: 'pending',
    createdAt: new Date(Date.now() - 2 * 60000).toISOString(),
    estimatedReadyTime: new Date(Date.now() + 20 * 60000).toISOString(),
  },
];

// ==========================================
// MOCK SERVICE REQUESTS
// ==========================================

export const MOCK_SERVICE_REQUESTS: RoomServiceRequest[] = [
  {
    id: 'req-001',
    guestId: 'guest-001',
    guestName: 'John Smith',
    roomNumber: '205',
    type: 'housekeeping',
    description: 'Request extra towels and pillows',
    status: 'pending',
    createdAt: new Date(Date.now() - 10 * 60000).toISOString(),
  },
  {
    id: 'req-002',
    guestId: 'guest-004',
    guestName: 'The Johnson Family',
    roomNumber: '301',
    type: 'maintenance',
    description: 'Air conditioning not cooling properly',
    status: 'in_progress',
    createdAt: new Date(Date.now() - 45 * 60000).toISOString(),
  },
  {
    id: 'req-003',
    guestId: 'guest-002',
    guestName: 'Emma Wilson',
    roomNumber: '118',
    type: 'housekeeping',
    description: 'Room cleaning requested',
    status: 'completed',
    createdAt: new Date(Date.now() - 2 * 60 * 60000).toISOString(),
    completedAt: new Date(Date.now() - 30 * 60000).toISOString(),
  },
];

// ==========================================
// MOCK CHAT MESSAGES
// ==========================================

export const MOCK_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-001',
    senderId: 'system',
    senderName: 'Concierge',
    senderRole: 'concierge',
    message: 'Welcome to Fixed Funding Resort! I\'m your digital concierge. How may I assist you today?',
    timestamp: new Date(Date.now() - 24 * 60 * 60000).toISOString(),
    isRead: true,
  },
  {
    id: 'msg-002',
    senderId: 'guest-001',
    senderName: 'John Smith',
    senderRole: 'guest',
    message: 'Hi! What time is breakfast served?',
    timestamp: new Date(Date.now() - 23 * 60 * 60000).toISOString(),
    isRead: true,
  },
  {
    id: 'msg-003',
    senderId: 'system',
    senderName: 'Concierge',
    senderRole: 'concierge',
    message: 'Breakfast is served at The Ocean View Restaurant from 6:30 AM to 10:30 AM daily. Would you like me to make a reservation?',
    timestamp: new Date(Date.now() - 23 * 60 * 60000 + 60000).toISOString(),
    isRead: true,
  },
  {
    id: 'msg-004',
    senderId: 'guest-001',
    senderName: 'John Smith',
    senderRole: 'guest',
    message: 'Yes, please! For 2 people at 9 AM tomorrow.',
    timestamp: new Date(Date.now() - 22 * 60 * 60000).toISOString(),
    isRead: true,
  },
  {
    id: 'msg-005',
    senderId: 'system',
    senderName: 'Concierge',
    senderRole: 'concierge',
    message: 'Perfect! I\'ve reserved a table for 2 at 9:00 AM tomorrow. Your reservation number is BR-240315-09. Is there anything else I can help you with?',
    timestamp: new Date(Date.now() - 22 * 60 * 60000 + 120000).toISOString(),
    isRead: false,
  },
];

// ==========================================
// MOCK ROOM GUIDE
// ==========================================

export const MOCK_ROOM_GUIDE: GuideSection[] = [
  {
    id: 'guide-001',
    title: 'Resort Overview',
    icon: 'MapPin',
    content: 'Fixed Funding Resort spans 50 acres of pristine coastline. Our facilities include three restaurants, two pools, a world-class spa, fitness center, and private beach access.\n\nFront Desk: Ext. 0\nConcierge: Ext. 1\nRoom Service: Ext. 2\nEmergency: Ext. 911',
  },
  {
    id: 'guide-002',
    title: 'Dining Options',
    icon: 'UtensilsCrossed',
    content: '🍽️ The Ocean View - Fine dining, dinner only\n   Hours: 6:00 PM - 11:00 PM\n\n🥐 Sunrise Café - Breakfast buffet\n   Hours: 6:30 AM - 10:30 AM\n\n🍹 Pool Bar - Light bites & cocktails\n   Hours: 10:00 AM - 8:00 PM\n\n🌙 Late Night Room Service\n   Hours: 11:00 PM - 6:00 AM',
  },
  {
    id: 'guide-003',
    title: 'Spa & Wellness',
    icon: 'Sparkles',
    content: 'Indulge in our award-winning spa treatments.\n\nOperating Hours: 9:00 AM - 9:00 PM\n\nPopular Treatments:\n• Balinese Massage (60/90 min)\n• Hot Stone Therapy\n• Facial Treatments\n• Couples Packages\n\nBookings: Ext. 3 or through the app',
  },
  {
    id: 'guide-004',
    title: 'Activities & Excursions',
    icon: 'Palmtree',
    content: '🏄 Water Sports: Kayaking, paddleboarding, snorkeling\n   Location: Beach Hut\n\n🧘 Yoga Classes: Daily at 7:00 AM\n   Location: Garden Pavilion\n\n🏋️ Fitness Center: 24/7 access\n   Location: Wellness Center\n\n🎯 Daily Activities Schedule available at Front Desk',
  },
  {
    id: 'guide-005',
    title: 'Housekeeping',
    icon: 'Home',
    content: 'Daily housekeeping is provided between 9:00 AM and 4:00 PM.\n\nFor additional services:\n• Extra towels: Ext. 4\n• Turndown service: Available on request\n• Laundry service: Bag pickup by 9:00 AM\n• Do Not Disturb: Place sign on door\n\nNeed something? Use the Room Service section of this app!',
  },
  {
    id: 'guide-006',
    title: 'WiFi & Technology',
    icon: 'Wifi',
    content: 'Complimentary high-speed WiFi throughout the resort.\n\nNetwork: FixedFunding_Guest\nPassword: Paradise2024\n\nSmart TV in your room includes:\n• Netflix & streaming apps\n• Resort information channel\n• Music channels\n\nUSB charging ports available at bedside and desk.',
  },
];

// ==========================================
// MOCK DATA STORE (Simulate Real-time Updates)
// ==========================================

class MockDataStore {
  private listeners: Map<string, Set<(data: unknown) => void>> = new Map();
  private intervals: Map<string, number> = new Map();

  startSimulation() {
    this.simulateDataStream('orders', MOCK_ORDERS, 30000);
    this.simulateDataStream('bookings', MOCK_BOOKINGS, 35000);
    this.simulateDataStream('serviceRequests', MOCK_SERVICE_REQUESTS, 45000);
    this.simulateDataStream('chatMessages', MOCK_CHAT_MESSAGES, 60000);
  }

  private simulateDataStream<T>(key: string, initialData: T[], interval: number) {
    const listeners = this.listeners.get(key) || new Set();
    listeners.forEach(cb => cb(initialData));

    const timer = setInterval(() => {
      listeners.forEach(cb => cb([...initialData]));
    }, interval);

    this.intervals.set(key, timer);
  }

  subscribe<T>(key: string, callback: (data: T) => void): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    
    const listeners = this.listeners.get(key)!;
    listeners.add(callback as (data: unknown) => void);

    return () => {
      listeners.delete(callback as (data: unknown) => void);
    };
  }

  stopSimulation() {
    this.intervals.forEach(timer => clearInterval(timer));
    this.intervals.clear();
  }
}

export const mockDataStore = new MockDataStore();