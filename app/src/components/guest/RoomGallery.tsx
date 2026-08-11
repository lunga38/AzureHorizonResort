import { useState, useEffect } from 'react';
import { db } from '@/services/firebase-services';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import type { Room } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { 
  ChevronLeft, 
  X, 
  ChevronRight, 
  BedDouble, 
  Users, 
  Wifi, 
  Coffee, 
  Waves, 
  UtensilsCrossed,
  Wind,
  Tv,
  Car,
  Dumbbell,
  Sparkles,
  Maximize2,
  Minimize2,
  Check,
  Loader2,
  Star,
  MessageCircle
} from 'lucide-react';

interface Review {
  id: string;
  guestName: string;
  rating: number;
  comments: string;
  createdAt: string;
}

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
}

const AVATAR_COLORS = ['bg-blue-500','bg-emerald-500','bg-violet-500','bg-rose-500','bg-amber-500','bg-cyan-500','bg-indigo-500','bg-pink-500'];
function getAvatarColor(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function getInitials(name: string) { return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2); }

interface RoomGalleryProps {
  onBack: () => void;
}

export function RoomGallery({ onBack }: RoomGalleryProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [showGalleryModal, setShowGalleryModal] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [roomReviews, setRoomReviews] = useState<Review[]>([]);

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const roomsRef = collection(db, 'rooms');
        const snapshot = await getDocs(roomsRef);
        const roomsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Room));
        setRooms(roomsData);
      } catch (error) {
        console.error("Error fetching rooms:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRooms();

    // Fetch room reviews
    const fetchReviews = async () => {
      try {
        const q = query(collection(db, 'reviews'), where('category', '==', 'room'), orderBy('createdAt', 'desc'), limit(10));
        const snap = await getDocs(q);
        setRoomReviews(snap.docs.map(d => ({ id: d.id, ...d.data() } as Review)));
      } catch (e) { console.error('Error fetching reviews:', e); }
    };
    fetchReviews();
  }, []);

  const avgRating = roomReviews.length > 0
    ? (roomReviews.reduce((s, r) => s + r.rating, 0) / roomReviews.length).toFixed(1)
    : null;

  const openGallery = (room: Room, startIndex: number = 0) => {
    setSelectedRoom(room);
    setCurrentImageIndex(startIndex);
    setShowGalleryModal(true);
  };

  const nextImage = () => {
    if (selectedRoom && selectedRoom.images) {
      setCurrentImageIndex((prev) => (prev + 1) % selectedRoom.images.length);
    }
  };

  const prevImage = () => {
    if (selectedRoom && selectedRoom.images) {
      setCurrentImageIndex((prev) => (prev - 1 + selectedRoom.images.length) % selectedRoom.images.length);
    }
  };

  const toggleFullscreen = () => {
    const galleryContainer = document.getElementById('gallery-container');
    if (!isFullscreen) {
      galleryContainer?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const getAmenityIcon = (amenity: string) => {
    const lower = amenity.toLowerCase();
    if (lower.includes('wifi')) return <Wifi className="h-4 w-4" />;
    if (lower.includes('pool')) return <Waves className="h-4 w-4" />;
    if (lower.includes('service')) return <Coffee className="h-4 w-4" />;
    if (lower.includes('king') || lower.includes('queen') || lower.includes('bed')) return <BedDouble className="h-4 w-4" />;
    if (lower.includes('tv')) return <Tv className="h-4 w-4" />;
    if (lower.includes('ac') || lower.includes('air')) return <Wind className="h-4 w-4" />;
    if (lower.includes('parking')) return <Car className="h-4 w-4" />;
    if (lower.includes('gym') || lower.includes('fitness')) return <Dumbbell className="h-4 w-4" />;
    if (lower.includes('spa')) return <Sparkles className="h-4 w-4" />;
    if (lower.includes('dining')) return <UtensilsCrossed className="h-4 w-4" />;
    return <Check className="h-4 w-4" />;
  };

  const getRoomTypeLabel = (type: string) => {
    switch (type) {
      case 'ocean_view': return 'Ocean View Suite';
      case 'garden': return 'Garden Terrace';
      case 'penthouse': return 'Penthouse';
      case 'family': return 'Family Villa';
      default: return type;
    }
  };

  const getRoomTypeColor = (type: string) => {
    switch (type) {
      case 'ocean_view': return 'bg-blue-100 text-blue-800';
      case 'garden': return 'bg-green-100 text-green-800';
      case 'penthouse': return 'bg-purple-100 text-purple-800';
      case 'family': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100';
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#1e3a5f]" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <Button variant="ghost" onClick={onBack} className="mb-6 dark:text-blue-400">
        <ChevronLeft className="mr-2 h-4 w-4" /> Back to Dashboard
      </Button>

      <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-serif font-bold text-[#1e3a5f] dark:text-white">Our Rooms & Suites</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">Explore our luxurious accommodations</p>
        </div>
        {avgRating && (
          <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 px-4 py-2 rounded-full">
            <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
            <span className="font-bold text-gray-900 dark:text-white">{avgRating}</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">({roomReviews.length} room reviews)</span>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {rooms.map((room) => (
          <Card key={room.id} className="overflow-hidden hover:shadow-xl transition-all duration-300 group bg-white dark:bg-slate-900 border-none shadow-md">
            <div 
              className="relative h-64 overflow-hidden cursor-pointer"
              onClick={() => openGallery(room, 0)}
            >
              <img 
                src={room.images?.[0] || '/placeholder-room.jpg'} 
                alt={room.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                onError={(e) => (e.currentTarget.src = '/placeholder-room.jpg')}
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
                <span className="bg-white/90 text-[#1e3a5f] px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2">
                  <Maximize2 className="h-4 w-4" /> View Gallery
                </span>
              </div>
              {room.images && room.images.length > 1 && (
                <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                  {room.images.length} photos
                </div>
              )}
            </div>
            <CardContent className="p-5">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">{room.name}</h3>
                  <Badge className={`mt-1 ${getRoomTypeColor(room.type)}`}>
                    {getRoomTypeLabel(room.type)}
                  </Badge>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-[#c9a227]">R {room.price}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">per night</p>
                </div>
              </div>
              
              <p className="text-gray-600 dark:text-gray-400 text-sm mt-3 line-clamp-2">{room.description}</p>

              {/* Inline star rating */}
              {avgRating && (
                <div className="flex items-center gap-1.5 mt-3">
                  {[1,2,3,4,5].map(s => (
                    <Star key={s} className={`h-3.5 w-3.5 ${s <= Math.round(Number(avgRating)) ? 'fill-amber-400 text-amber-400' : 'text-gray-200 dark:text-slate-600'}`} />
                  ))}
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">{avgRating} ({roomReviews.length})</span>
                </div>
              )}
              
              <div className="flex flex-wrap gap-2 mt-4">
                {room.amenities?.slice(0, 4).map((amenity, idx) => (
                  <div key={idx} className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-800 px-2 py-1 rounded-full">
                    {getAmenityIcon(amenity)}
                    <span>{amenity}</span>
                  </div>
                ))}
                {room.amenities && room.amenities.length > 4 && (
                  <div className="text-xs text-gray-400 bg-gray-50 dark:bg-slate-800 px-2 py-1 rounded-full">
                    +{room.amenities.length - 4} more
                  </div>
                )}
              </div>
              
              <div className="flex items-center justify-between mt-4 pt-3 border-t dark:border-slate-700">
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <Users className="h-4 w-4" />
                  <span>Up to {room.capacity} guests</span>
                </div>
                <Button 
                  size="sm" 
                  className="bg-[#c9a227] hover:bg-[#b8941f] text-white"
                  onClick={() => openGallery(room, 0)}
                >
                  View Details
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ───── Guest Reviews Section ───── */}
      {roomReviews.length > 0 && (
        <div className="mt-16">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <MessageCircle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-2xl font-serif font-bold text-[#1e3a5f] dark:text-white">What Our Guests Say</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Recent reviews from verified stays</p>
            </div>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {roomReviews.slice(0, 6).map(review => (
              <Card key={review.id} className="border-none shadow-sm bg-white dark:bg-slate-900 hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-9 h-9 rounded-full ${getAvatarColor(review.guestName)} flex items-center justify-center text-white text-xs font-bold`}>
                      {getInitials(review.guestName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{review.guestName}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{timeAgo(review.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 mb-2">
                    {[1,2,3,4,5].map(s => (
                      <Star key={s} className={`h-4 w-4 ${s <= review.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200 dark:text-slate-600'}`} />
                    ))}
                  </div>
                  {review.comments && (
                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed line-clamp-3">"{review.comments}"</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Gallery Modal */}
      <Dialog open={showGalleryModal} onOpenChange={setShowGalleryModal}>
        <DialogContent className="max-w-5xl w-[90vw] h-[80vh] p-0 bg-black/95 border-none">
          {selectedRoom && (
            <div id="gallery-container" className="relative h-full flex flex-col">
              {/* Header */}
              <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/70 to-transparent p-4 flex justify-between items-center">
                <div>
                  <h2 className="text-white text-xl font-bold">{selectedRoom.name}</h2>
                  <p className="text-white/70 text-sm">{getRoomTypeLabel(selectedRoom.type)}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={toggleFullscreen}
                    className="text-white/70 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
                    title="Toggle Fullscreen"
                    aria-label="Toggle Fullscreen"
                  >
                    {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
                  </button>
                  <button
                    onClick={() => setShowGalleryModal(false)}
                    className="text-white/70 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
                    title="Close Gallery"
                    aria-label="Close Gallery"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Main Image */}
              <div className="flex-1 flex items-center justify-center relative">
                <img 
                  src={selectedRoom.images?.[currentImageIndex] || '/placeholder-room.jpg'}
                  alt={selectedRoom.name}
                  className="max-w-full max-h-full object-contain"
                  onError={(e) => (e.currentTarget.src = '/placeholder-room.jpg')}
                />
                
                {/* Navigation Arrows */}
                {selectedRoom.images && selectedRoom.images.length > 1 && (
                  <>
                    <button
                      onClick={prevImage}
                      className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors"
                      title="Previous Image"
                      aria-label="Previous Image"
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </button>
                    <button
                      onClick={nextImage}
                      className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors"
                      title="Next Image"
                      aria-label="Next Image"
                    >
                      <ChevronRight className="h-6 w-6" />
                    </button>
                  </>
                )}
              </div>

              {/* Thumbnails */}
              {selectedRoom.images && selectedRoom.images.length > 1 && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                  <div className="flex justify-center gap-2 overflow-x-auto">
                    {selectedRoom.images.map((img, idx) => (
                      <button
                        key={idx}
                        onClick={() => setCurrentImageIndex(idx)}
                        className={`w-16 h-16 rounded-md overflow-hidden border-2 transition-all ${
                          idx === currentImageIndex ? 'border-[#c9a227] scale-105' : 'border-white/30 hover:border-white/60'
                        }`}
                        title={`View image ${idx + 1} of ${selectedRoom.images?.length}`}
                        aria-label={`View image ${idx + 1}`}
                      >
                        <img 
                          src={img} 
                          alt={`${selectedRoom.name} ${idx + 1}`}
                          className="w-full h-full object-cover"
                          onError={(e) => (e.currentTarget.src = '/placeholder-room.jpg')}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Room Details Sidebar */}
              <div className="absolute top-20 right-4 w-80 bg-white/95 backdrop-blur-sm rounded-lg p-4 shadow-lg hidden lg:block">
                <h3 className="font-bold text-[#1e3a5f] mb-2">Room Details</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Capacity:</span>
                    <span>{selectedRoom.capacity} guests</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Price:</span>
                    <span className="font-bold text-[#c9a227]">R {selectedRoom.price}/night</span>
                  </div>
                  <div className="border-t pt-2 mt-2">
                    <p className="text-gray-600 text-xs">{selectedRoom.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedRoom.amenities?.slice(0, 6).map((amenity, idx) => (
                      <Badge key={idx} variant="secondary" className="text-[10px]">
                        {amenity}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}