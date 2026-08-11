import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, MapPin, Loader2, Sparkles, Compass, UtensilsCrossed, BedDouble, Bell, X } from 'lucide-react';
import { db } from '@/services/firebase-services';
import { collection, query, where, getDocs } from 'firebase/firestore';
import type { User as AppUser } from '@/types';

type AuthUserBridge = AppUser & { uid?: string };

interface MyScheduleProps {
  user: AuthUserBridge | null;
}

interface ScheduleItem {
  id: string;
  type: 'room' | 'tour' | 'spa' | 'dining';
  title: string;
  date: Date;
  location: string;
  status: string;
}

export function MySchedule({ user }: MyScheduleProps) {
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dismissedItems, setDismissedItems] = useState<string[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('dismissedScheduleItems');
    if (stored) {
      setDismissedItems(JSON.parse(stored));
    }
  }, []);

  const handleDismiss = (id: string) => {
    const newDismissed = [...dismissedItems, id];
    setDismissedItems(newDismissed);
    localStorage.setItem('dismissedScheduleItems', JSON.stringify(newDismissed));
  };

  useEffect(() => {
    const guestId = user?.id || user?.uid;
    if (!guestId) {
      setIsLoading(false);
      return;
    }

    const fetchSchedule = async () => {
      try {
        const schedule: ScheduleItem[] = [];

        // Room Bookings
        const roomSnap = await getDocs(query(collection(db, 'bookings'), where('guestId', '==', guestId)));
        roomSnap.forEach(doc => {
          const data = doc.data();
          if (data.status === 'confirmed' || data.status === 'checked_in') {
            schedule.push({
              id: doc.id,
              type: 'room',
              title: `Stay: ${data.roomName}`,
              date: new Date(`${data.checkInDate}T14:00:00`),
              location: `Room ${data.roomNumber}`,
              status: data.status
            });
            if (data.status === 'checked_in') {
              schedule.push({
                id: `${doc.id}-out`,
                type: 'room',
                title: `Check-out: ${data.roomName}`,
                date: new Date(`${data.checkOutDate}T11:00:00`),
                location: 'Front Desk',
                status: 'pending'
              });
            }
          }
        });

        // Tour Bookings
        const tourSnap = await getDocs(query(collection(db, 'tour_bookings'), where('guestId', '==', guestId)));
        tourSnap.forEach(doc => {
          const data = doc.data();
          if (data.status !== 'cancelled') {
            schedule.push({
              id: doc.id,
              type: 'tour',
              title: `Tour: ${data.tourName}`,
              date: new Date(`${data.date}T${data.time}`),
              location: 'Resort Lobby (Meeting Point)',
              status: data.status
            });
          }
        });

        // Spa Bookings
        const spaSnap = await getDocs(query(collection(db, 'spa_bookings'), where('guestId', '==', guestId)));
        spaSnap.forEach(doc => {
          const data = doc.data();
          if (data.status !== 'cancelled') {
            schedule.push({
              id: doc.id,
              type: 'spa',
              title: `Spa: ${data.treatmentName}`,
              date: new Date(`${data.date}T${data.time}`),
              location: 'Azure Spa, Level 2',
              status: data.status
            });
          }
        });

        // Table Reservations
        const tableSnap = await getDocs(query(collection(db, 'table_reservations'), where('guestId', '==', guestId)));
        tableSnap.forEach(doc => {
          const data = doc.data();
          if (data.status !== 'cancelled') {
            schedule.push({
              id: doc.id,
              type: 'dining',
              title: `Dining Reservation`,
              date: new Date(`${data.date}T${data.time}`),
              location: 'Azure Pavilion',
              status: data.status
            });
          }
        });

        // Sort chronologically
        schedule.sort((a, b) => a.date.getTime() - b.date.getTime());
        
        // Filter out past events (older than 24 hours to keep recent context)
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        setItems(schedule.filter(item => item.date > yesterday));
      } catch (error) {
        console.error("Error fetching schedule:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSchedule();
  }, [user]);

  if (isLoading) {
    return (
      <Card className="border-none shadow-sm bg-white dark:bg-slate-900 mb-8">
        <CardContent className="p-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#1e3a5f] dark:text-blue-400" />
        </CardContent>
      </Card>
    );
  }

  const visibleItems = items.filter(item => !dismissedItems.includes(item.id));

  if (visibleItems.length === 0) {
    return null; // Hide completely if no visible schedule
  }

  const getIcon = (type: string) => {
    switch(type) {
      case 'room': return <BedDouble className="h-4 w-4" />;
      case 'tour': return <Compass className="h-4 w-4" />;
      case 'spa': return <Sparkles className="h-4 w-4" />;
      case 'dining': return <UtensilsCrossed className="h-4 w-4" />;
      default: return <Calendar className="h-4 w-4" />;
    }
  };

  const getColor = (type: string) => {
    switch(type) {
      case 'room': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'tour': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'spa': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
      case 'dining': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
      default: return 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-gray-400';
    }
  };

  const now = new Date();

  return (
    <Card className="border-none shadow-md bg-white dark:bg-slate-900 mb-8 overflow-hidden">
      <CardHeader className="bg-gray-50 dark:bg-slate-800 border-b dark:border-slate-700 py-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-[#1e3a5f] dark:text-blue-400" />
          <CardTitle className="text-lg font-bold text-[#1e3a5f] dark:text-white">My Itinerary</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex flex-col">
          {visibleItems.map((item, index) => {
            const isPast = item.date < now;
            const isSoon = !isPast && (item.date.getTime() - now.getTime() < 60 * 60 * 1000); // within 1 hour
            
            return (
              <div key={item.id} className={`flex items-stretch relative ${index !== visibleItems.length - 1 ? 'border-b dark:border-slate-800' : ''}`}>
                {/* Timeline line */}
                <div className="w-16 flex flex-col items-center py-4 relative">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center z-10 ${getColor(item.type)} ${isPast ? 'opacity-50' : ''}`}>
                    {getIcon(item.type)}
                  </div>
                  {index !== visibleItems.length - 1 && (
                    <div className="absolute top-12 bottom-0 w-px bg-gray-200 dark:bg-slate-800" />
                  )}
                </div>
                
                {/* Content */}
                <div className={`flex-1 py-4 pr-4 ${isPast ? 'opacity-60' : ''}`}>
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex items-center gap-2">
                      <h4 className={`font-semibold text-sm ${isPast ? 'line-through text-gray-500' : 'text-gray-900 dark:text-white'}`}>{item.title}</h4>
                      {isSoon && (
                        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-none animate-pulse">
                          <Bell className="h-3 w-3 mr-1 inline" /> Upcoming
                        </Badge>
                      )}
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleDismiss(item.id)}
                      className="h-6 w-6 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full"
                      title="Dismiss from itinerary"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{item.date.toLocaleDateString('en-ZA', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      <span>{item.location}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
