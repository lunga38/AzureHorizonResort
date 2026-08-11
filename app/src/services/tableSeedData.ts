import { db } from '../lib/firebase';
import { collection, addDoc, deleteDoc, getDocs } from 'firebase/firestore';

// Table configurations with capacities
export const AVAILABLE_TABLES = [
  // Small tables (2-seaters)
  { number: 1, capacity: 2, type: 'small', location: 'Window', isAvailable: true, description: 'Cozy window table with ocean view' },
  { number: 2, capacity: 2, type: 'small', location: 'Window', isAvailable: true, description: 'Cozy window table with ocean view' },
  { number: 3, capacity: 2, type: 'small', location: 'Indoor', isAvailable: true, description: 'Intimate indoor dining' },
  { number: 4, capacity: 2, type: 'small', location: 'Indoor', isAvailable: true, description: 'Intimate indoor dining' },
  
  // Medium tables (4-seaters)
  { number: 5, capacity: 4, type: 'medium', location: 'Window', isAvailable: true, description: 'Family window table' },
  { number: 6, capacity: 4, type: 'medium', location: 'Window', isAvailable: true, description: 'Family window table' },
  { number: 7, capacity: 4, type: 'medium', location: 'Indoor', isAvailable: true, description: 'Standard dining table' },
  { number: 8, capacity: 4, type: 'medium', location: 'Indoor', isAvailable: true, description: 'Standard dining table' },
  { number: 9, capacity: 4, type: 'medium', location: 'Patio', isAvailable: true, description: 'Outdoor patio seating' },
  { number: 10, capacity: 4, type: 'medium', location: 'Patio', isAvailable: true, description: 'Outdoor patio seating' },
  
  // Large tables (6-seaters)
  { number: 11, capacity: 6, type: 'large', location: 'Window', isAvailable: true, description: 'Large group window table' },
  { number: 12, capacity: 6, type: 'large', location: 'Indoor', isAvailable: true, description: 'Private booth for groups' },
  { number: 13, capacity: 6, type: 'large', location: 'Patio', isAvailable: true, description: 'Large outdoor group table' },
  
  // Extra large tables (8-seaters)
  { number: 14, capacity: 8, type: 'xl', location: 'Private Room', isAvailable: true, description: 'Private dining room' },
  { number: 15, capacity: 8, type: 'xl', location: 'Private Room', isAvailable: true, description: 'Private dining room with garden view' },
];

// VIP tables (special)
const VIP_TABLES = [
  { number: 101, capacity: 4, type: 'vip', location: 'VIP Lounge', isAvailable: true, description: 'VIP lounge with dedicated service' },
  { number: 102, capacity: 6, type: 'vip', location: 'VIP Lounge', isAvailable: true, description: 'VIP lounge with dedicated service' },
];

export const ALL_TABLES = [...AVAILABLE_TABLES, ...VIP_TABLES];

// Interface for table object
export interface RestaurantTable {
  id: string;
  number: number;
  capacity: number;
  type: string;
  location: string;
  isAvailable: boolean;
  description: string;
  createdAt: string;
  lastUpdated: string;
}

// Interface for reservation object
interface TableReservationData {
  id: string;
  date: string;
  time: string;
  status: string;
  tableNumber: number;
}

// Function to seed tables into Firestore
export const seedTables = async () => {
  try {
    console.log("Starting table seeding...");
    
    // First, clear existing tables to avoid duplicates
    const tablesRef = collection(db, 'restaurant_tables');
    const existingTables = await getDocs(tablesRef);
    
    for (const doc of existingTables.docs) {
      await deleteDoc(doc.ref);
    }
    console.log(`Cleared ${existingTables.size} existing tables`);
    
    // Seed new tables
    for (const table of ALL_TABLES) {
      await addDoc(collection(db, 'restaurant_tables'), {
        number: table.number,
        capacity: table.capacity,
        type: table.type,
        location: table.location,
        isAvailable: table.isAvailable,
        description: table.description,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      });
      console.log(`Added table ${table.number} (${table.type}, capacity: ${table.capacity})`);
    }
    
    console.log(`✅ Successfully seeded ${ALL_TABLES.length} tables!`);
    return { success: true, count: ALL_TABLES.length };
  } catch (error) {
    console.error("Error seeding tables:", error);
    return { success: false, error: error };
  }
};

// Function to find available tables for a party size
export const findAvailableTables = async (partySize: number, date: string, time: string): Promise<RestaurantTable[]> => {
  try {
    // Get all tables
    const tablesRef = collection(db, 'restaurant_tables');
    const tablesSnapshot = await getDocs(tablesRef);
    const allTables: RestaurantTable[] = tablesSnapshot.docs.map(doc => ({ 
      id: doc.id, 
      ...doc.data() 
    } as RestaurantTable));
    
    // Filter by capacity
    const suitableTables = allTables.filter(table => table.capacity >= partySize);
    
    // Get existing reservations for the date/time
    const reservationsRef = collection(db, 'table_reservations');
    const reservationsSnapshot = await getDocs(reservationsRef);
    const existingReservations: TableReservationData[] = reservationsSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as TableReservationData))
      .filter(res => res.date === date && res.time === time && res.status === 'confirmed');
    
    // Get booked table numbers
    const bookedTableNumbers = existingReservations.map(res => res.tableNumber);
    
    // Filter available tables
    const availableTables = suitableTables.filter(table => !bookedTableNumbers.includes(table.number));
    
    return availableTables;
  } catch (error) {
    console.error("Error finding available tables:", error);
    return [];
  }
};

// Function to get table type label
export const getTableTypeLabel = (type: string): string => {
  switch (type) {
    case 'small': return '2-Seater';
    case 'medium': return '4-Seater';
    case 'large': return '6-Seater';
    case 'xl': return '8-Seater';
    case 'vip': return 'VIP Table';
    default: return 'Standard Table';
  }
};

// Function to get table type color
export const getTableTypeColor = (type: string): string => {
  switch (type) {
    case 'small': return 'bg-blue-100 text-blue-800';
    case 'medium': return 'bg-green-100 text-green-800';
    case 'large': return 'bg-yellow-100 text-yellow-800';
    case 'xl': return 'bg-purple-100 text-purple-800';
    case 'vip': return 'bg-amber-100 text-amber-800 border border-amber-300';
    default: return 'bg-gray-100 text-gray-800';
  }
};