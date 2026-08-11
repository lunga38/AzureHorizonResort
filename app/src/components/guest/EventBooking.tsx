import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ChevronLeft, Calendar, Briefcase, Users, Minus, Plus, 
  Building, XCircle, FileText, AlertCircle 
} from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { fetchBlockedSlotsWithBuffer, awardLoyaltyPoints } from '@/services/firebase-services';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import './EventBooking.css';

interface Venue {
  id: string;
  name: string;
  type: ('Conference' | 'Wedding' | 'Party' | 'Social')[];
  pricePerDay: number;
  maxCapacity: number;
  description: string;
  amenities: string[];
}

const VENUES: Venue[] = [
  {
    id: 'v-grand-ballroom',
    name: 'The Grand Ocean Ballroom',
    type: ['Wedding', 'Conference', 'Party'],
    pricePerDay: 25000,
    maxCapacity: 400,
    description: 'Our flagship venue featuring crystal chandeliers, panoramic ocean views, and a massive mahogany dance floor. Perfect for prestigious galas and weddings.',
    amenities: ['AV System', 'Mahogany Dance Floor', 'Private Bar', 'Stage', 'Backstage VIP Area']
  },
  {
    id: 'v-ashanti-estate',
    name: 'Ashanti Estate',
    type: ['Wedding', 'Party', 'Social'],
    pricePerDay: 32000,
    maxCapacity: 300,
    description: 'An exclusive, secluded estate offering ultimate privacy. Features sprawling lawns, classical architecture, and an elegant arrival courtyard.',
    amenities: ['Private Courtyard', 'Bridal Suite', 'Fountain Feature', 'Exclusive Entrance']
  },
  {
    id: 'v-klein-vineyards',
    name: 'Klein Parys Vineyards',
    type: ['Wedding', 'Party', 'Social'],
    pricePerDay: 18000,
    maxCapacity: 120,
    description: 'Rustic charm meets luxury. Nestled against the resort vineyards, providing a breathtaking, intimate backdrop for romantic celebrations and social mixers.',
    amenities: ['Wine Cellar Access', 'Rustic Decor', 'Fairy Lighting', 'Outdoor Fire Pits']
  },
  {
    id: 'v-beach-pavilion',
    name: 'Sunset Beach Pavilion',
    type: ['Wedding', 'Party', 'Social'],
    pricePerDay: 15000,
    maxCapacity: 150,
    description: 'An elegant open-air structure situated directly on the sand. Let the sound of crashing waves be the backdrop to your special day.',
    amenities: ['Open Air Architecture', 'Direct Beach Access', 'Tiki Torches', 'Ambient Lighting']
  },
  {
    id: 'v-garden-terrace',
    name: 'Botanical Garden Terrace',
    type: ['Party', 'Social', 'Wedding'],
    pricePerDay: 9000,
    maxCapacity: 80,
    description: 'A lush, manicured garden space surrounded by indigenous flora. Ideal for afternoon tea parties, intimate ceremonies, or social mixers.',
    amenities: ['Marquee Available', 'Floral Arches', 'Outdoor Seating', 'Water Features']
  }
];

const LOCAL_VENUE_IMAGES: Record<string, string[]> = {
  'v-grand-ballroom': ['/venues/The grand ocean ballroom 1.png', '/venues/The grand ocean ballroom 2.png'],
  'v-ashanti-estate': ['/venues/Ashanti Estate 1.png', '/venues/Ashanti Estate 3.png'],
  'v-klein-vineyards': ['/venues/Klein-Parys-Vineyards 1.png', '/venues/Klein-Parys-Vineyards 2.png'],
  'v-beach-pavilion': ['/rooms/coastal-breeze-balcony.jpg', '/venues/sunset beach pavilion 2.jpg'],
  'v-garden-terrace': ['/rooms/garden-terrace-garden.png', '/venues/botanical garden terrace 2.jpeg']
};

const EVENT_TYPES = ['All', 'Conference', 'Wedding', 'Party', 'Social'];
const TIME_SLOTS = Array.from({ length: 14 }, (_, i) => `${i + 8}:00`);

const formatDate = (date: Date) => date.toLocaleDateString('en-ZA', { weekday: 'short', month: 'short', day: 'numeric' });

const getLocalISODate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDatesInRange = (start: Date, end: Date) => {
  const dates = [];
  const current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  
  while (current <= last) {
    dates.push(getLocalISODate(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

const generateDateArray = (startDate: Date) => {
  return Array.from({ length: 14 }).map((_, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    return d;
  });
};

export default function EventBookingWeb() {
  const navigate = useNavigate();
  const user = auth.currentUser;
  
  // Real-time date boundaries
  const todayDate = useMemo(() => new Date(), []);
  const tomorrowDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  }, []);

  // Now defaults back to today to allow same-day hourly bookings
  const [selectedDate, setSelectedDate] = useState<Date>(todayDate);
  const [selectedType, setSelectedType] = useState<string>('All');
  const [expectedAttendance, setExpectedAttendance] = useState<number>(50);

  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [showGalleryModal, setShowGalleryModal] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingType, setBookingType] = useState<'hourly' | 'daily'>('hourly');
  const [selectedDuration, setSelectedDuration] = useState<number>(2); 
  const [selectedStartTime, setSelectedStartTime] = useState<string | null>(null);
  
  const [modalStartDate, setModalStartDate] = useState<Date>(selectedDate);
  const [modalEndDate, setModalEndDate] = useState<Date>(selectedDate);

  const [blockedSlots, setBlockedSlots] = useState<string[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [bookedVenueIds, setBookedVenueIds] = useState<string[]>([]);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(true);

  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const availableDates = useMemo(() => generateDateArray(todayDate), [todayDate]);

  useEffect(() => {
    const fetchAvailability = async () => {
      setIsCheckingAvailability(true);
      try {
        const dateString = getLocalISODate(selectedDate);
        const bookingsRef = collection(db, 'event_bookings');
        const q = query(bookingsRef, where('bookedDates', 'array-contains', dateString));
        const snapshot = await getDocs(q);
        
        const fullyBookedIds = new Set<string>();
        const hourlyBlocks: Record<string, Set<string>> = {};
        
        // Setup real-time calculations to completely hide venues if today's hours have passed
        const isToday = dateString === getLocalISODate(todayDate);
        const currentHour = new Date().getHours();
        let pastSlotsCount = 0;
        
        if (isToday) {
          if (currentHour >= 21) pastSlotsCount = 14; 
          else if (currentHour >= 8) pastSlotsCount = currentHour - 7;
        }

        // If all 14 hours are already in the past, instantly hide all venues
        if (isToday && pastSlotsCount >= 14) {
          VENUES.forEach(v => fullyBookedIds.add(v.id));
        } else {
          snapshot.docs.forEach(docSnap => {
            const data = docSnap.data();
            if (data.bookingType === 'daily') {
              fullyBookedIds.add(data.venueId);
            } else if (data.bookingType === 'hourly') {
              if (!hourlyBlocks[data.venueId]) hourlyBlocks[data.venueId] = new Set();
              if (data.startTime && data.duration) {
                const startHour = parseInt(data.startTime.split(':')[0], 10);
                const endHour = startHour + data.duration;
                
                for (let i = startHour; i < endHour; i++) {
                  if (i <= 21) hourlyBlocks[data.venueId].add(`${i}:00`);
                }
              }
            }
          });

          // Check if the mix of real-time past hours + booked hours = Fully Booked
          Object.keys(hourlyBlocks).forEach(vId => {
            let futureFreeSlots = 0;
            TIME_SLOTS.forEach(slot => {
                const hour = parseInt(slot.split(':')[0], 10);
                const isFuture = !isToday || hour > currentHour;
                if (isFuture && !hourlyBlocks[vId].has(slot)) {
                    futureFreeSlots++;
                }
            });
            
            if (futureFreeSlots === 0) fullyBookedIds.add(vId);
          });
        }

        setBookedVenueIds(Array.from(fullyBookedIds));
      } catch (error) {
        console.error("Failed to fetch venue availability:", error);
      } finally {
        setIsCheckingAvailability(false);
      }
    };

    fetchAvailability();
  }, [selectedDate, todayDate]);

  const filteredVenues = VENUES.filter(venue => {
    const matchesCapacity = venue.maxCapacity >= expectedAttendance;
    const matchesType = selectedType === 'All' || venue.type.includes(selectedType as any);
    const isAvailable = !bookedVenueIds.includes(venue.id);
    return matchesCapacity && matchesType && isAvailable;
  });

  const openGallery = (venue: Venue) => {
    setSelectedVenue(venue);
    setCurrentImageIndex(0);
    setShowGalleryModal(true);
  };

  const openBookingConfig = async (venue: Venue) => {
    setSelectedVenue(venue);
    setBookingType('hourly');
    setSelectedDuration(2);
    setSelectedStartTime(null);
    setTermsAccepted(false); 
    setModalStartDate(selectedDate);
    setModalEndDate(selectedDate);
    setShowBookingModal(true);

    setIsLoadingSlots(true);
    try {
      const dateString = getLocalISODate(selectedDate);
      const blocked = await fetchBlockedSlotsWithBuffer(venue.id, dateString);
      setBlockedSlots(blocked);
    } catch (error) {
      console.error("Failed to load availability:", error);
    } finally {
      setIsLoadingSlots(false);
    }
  };

  // REAL TIME SLOT VALIDATION
  const isSlotAvailable = (slot: string, duration: number) => {
    const slotIndex = TIME_SLOTS.indexOf(slot);
    if (slotIndex + duration > TIME_SLOTS.length) return false;
    
    // Check if the timeslot is already in the past (Real-time check)
    const isToday = getLocalISODate(modalStartDate) === getLocalISODate(todayDate);
    if (isToday) {
      const slotHour = parseInt(slot.split(':')[0], 10);
      const currentHour = new Date().getHours();
      if (slotHour <= currentHour) return false; // Strictly enforces future bookings only
    }

    // Check if the timeslot is already booked
    for (let i = 0; i < duration; i++) {
      if (blockedSlots.includes(TIME_SLOTS[slotIndex + i])) return false;
    }
    return true;
  };

  const getHourlyRate = (dailyRate: number) => Math.round(dailyRate / 10); 
  
  const calculateTotal = () => {
    if (!selectedVenue) return 0;
    if (bookingType === 'hourly') {
      return getHourlyRate(selectedVenue.pricePerDay) * selectedDuration;
    } else {
      const diffDays = Math.ceil(Math.abs(modalEndDate.getTime() - modalStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      return selectedVenue.pricePerDay * diffDays;
    }
  };

  const handleProceedToPayment = async () => {
    if (!user) {
      window.alert("Please log in to reserve a venue.");
      navigate('/login');
      return;
    }
    if (bookingType === 'hourly' && !selectedStartTime) {
      window.alert("Please select an available start time.");
      return;
    }
    if (!selectedVenue) return;

    setIsSubmitting(true);
    try {
      const startDateString = getLocalISODate(modalStartDate);
      const bookedDatesArray = bookingType === 'daily' 
        ? getDatesInRange(modalStartDate, modalEndDate) 
        : [startDateString];

      // PRE-FLIGHT CONCURRENCY & REAL-TIME CHECK
      if (bookingType === 'hourly') {
        // 1. Real-time check (did they leave the screen open and the hour passed?)
        const isToday = startDateString === getLocalISODate(todayDate);
        const currentHour = new Date().getHours();
        const startHour = parseInt(selectedStartTime!.split(':')[0], 10);
        
        if (isToday && startHour <= currentHour) {
          window.alert("This timeslot has just passed in real-time. Please select a future time.");
          setSelectedStartTime(null);
          setIsSubmitting(false);
          return;
        }

        // 2. Concurrency check (did someone else book it while they were thinking?)
        const preFlightBlocked = await fetchBlockedSlotsWithBuffer(selectedVenue.id, startDateString);
        const slotIndex = TIME_SLOTS.indexOf(selectedStartTime!);
        
        let isDoubleBooked = false;
        for (let i = 0; i < selectedDuration; i++) {
          if (preFlightBlocked.includes(TIME_SLOTS[slotIndex + i])) {
            isDoubleBooked = true;
            break;
          }
        }

        if (isDoubleBooked) {
          window.alert("Someone else just secured this timeslot! Please select another time.");
          setBlockedSlots(preFlightBlocked); 
          setSelectedStartTime(null);
          setIsSubmitting(false);
          return; 
        }
      } else {
        // Multi-Day Pre-flight: Scans every single day in the range
        for (const d of bookedDatesArray) {
          const preFlightBlocked = await fetchBlockedSlotsWithBuffer(selectedVenue.id, d);
          if (preFlightBlocked.length > 0) {
            window.alert(`This venue is already in use for parts of ${d}. Multi-day full-hire is unavailable for these dates.`);
            setIsSubmitting(false);
            return;
          }
        }
      }

      const totalAmount = calculateTotal();
      const depositAmount = Math.round(totalAmount * 0.5); 
        
      const bookingData = {
        guestId: user.uid,
        guestName: user.displayName || 'Event Organizer',
        venueId: selectedVenue.id,
        venueName: selectedVenue.name,
        eventDate: modalStartDate.toISOString(),
        date: startDateString,
        bookedDates: bookedDatesArray,
        expectedAttendance,
        eventType: selectedType !== 'All' ? selectedType : 'General Event',
        bookingType,
        totalAmount,
        depositRequired: depositAmount,
        termsAccepted: termsAccepted,
        status: 'pending_payment',
        createdAt: new Date().toISOString(),
        startTime: bookingType === 'hourly' ? selectedStartTime : null,
        duration: bookingType === 'hourly' ? selectedDuration : null,
        endDate: bookingType === 'daily' ? modalEndDate.toISOString() : null,
      };

      const bookingRef = await addDoc(collection(db, 'event_bookings'), bookingData);
      setShowBookingModal(false);

      // Award loyalty points for the deposit paid (1 point per R10)
      const pts = Math.floor(depositAmount / 10);
      if (pts > 0 && user) {
        awardLoyaltyPoints(
          user.uid,
          user.email || '',
          pts,
          `Event Venue Deposit: ${selectedVenue.name}`
        );
      }

      const diffDays = Math.ceil(Math.abs(modalEndDate.getTime() - modalStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      // 🚨 UPDATED: Maps payload perfectly for the PaymentPage component
      navigate('/payment', {
        state: { 
          bookingDetails: {
            roomName: selectedVenue.name,
            checkIn: formatDate(modalStartDate),
            checkOut: bookingType === 'daily' ? formatDate(modalEndDate) : formatDate(modalStartDate),
            guests: expectedAttendance,
            roomRate: bookingType === 'hourly' ? getHourlyRate(selectedVenue.pricePerDay) : selectedVenue.pricePerDay,
            nights: bookingType === 'daily' ? diffDays : selectedDuration,
            subtotal: totalAmount,
            tax: 0, 
            total: totalAmount,
            depositAmount: depositAmount,
            balanceDue: totalAmount - depositAmount,
            bookingId: bookingRef.id // CRITICAL: Passes the real Firebase ID
          }
        }
      });

    } catch (err) {
      console.error("Venue Booking error:", err);
      window.alert("Could not secure the venue. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="eb-container">
      <header className="eb-header">
        <button className="eb-back-button" onClick={() => navigate(-1)}>
          <ChevronLeft size={28} color="#1e3a5f" />
        </button>
        <div className="eb-header-center">
          <h1 className="eb-header-title">Reserve Event Space</h1>
          <p className="eb-header-subtitle">Corporate & Social Venues</p>
        </div>
        <div style={{ width: '28px' }} />
      </header>

      <section className="eb-filter-engine">
        <div className="eb-filter-row">
          <Calendar size={16} color="#64748b" className="eb-filter-icon" />
          
          <input 
            type="date" 
            className="eb-web-date-picker"
            min={getLocalISODate(todayDate)}
            value={getLocalISODate(selectedDate)}
            onChange={(e) => setSelectedDate(new Date(e.target.value))}
          />

          <div className="eb-scroll-x">
            {availableDates.map((date, idx) => {
              const isSelected = date.toDateString() === selectedDate.toDateString();
              return (
                <button 
                  key={idx} 
                  onClick={() => setSelectedDate(date)}
                  className={`eb-date-chip ${isSelected ? 'eb-date-chip-active' : ''}`}
                >
                  {formatDate(date)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="eb-filter-row">
          <Briefcase size={16} color="#64748b" className="eb-filter-icon" />
          <div className="eb-scroll-x">
            {EVENT_TYPES.map((type, idx) => (
              <button 
                key={idx} 
                onClick={() => setSelectedType(type)}
                className={`eb-type-chip ${selectedType === type ? 'eb-type-chip-active' : ''}`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div className="eb-filter-row eb-no-border">
          <Users size={16} color="#64748b" className="eb-filter-icon" />
          <span className="eb-stepper-label">Expected Attendance:</span>
          <div className="eb-stepper-container">
            <button className="eb-stepper-btn" onClick={() => setExpectedAttendance(prev => Math.max(10, prev - 10))}>
              <Minus size={18} color="#1e3a5f" />
            </button>
            <span className="eb-stepper-value">{expectedAttendance}</span>
            <button className="eb-stepper-btn" onClick={() => setExpectedAttendance(prev => prev + 10)}>
              <Plus size={18} color="#1e3a5f" />
            </button>
          </div>
        </div>
      </section>

      <main className="eb-scroll-content">
        {isCheckingAvailability ? (
          <div className="eb-empty-state">
            <div className="eb-spinner"></div>
            <h3 className="eb-empty-title">Checking Availability...</h3>
          </div>
        ) : filteredVenues.length === 0 ? (
          <div className="eb-empty-state">
            <Building size={48} color="#cbd5e1" />
            <h3 className="eb-empty-title">Fully Booked</h3>
            <p className="eb-empty-sub">
              {getLocalISODate(selectedDate) === getLocalISODate(todayDate) && new Date().getHours() >= 21 
                ? "All timeslots have passed for today. Please select tomorrow." 
                : "All venues matching your criteria are reserved on this date. Try adjusting your attendance or date."}
            </p>
          </div>
        ) : (
          filteredVenues.map((venue) => (
            <div key={venue.id} className="eb-card">
              <div className="eb-image-container" onClick={() => openGallery(venue)}>
                <img src={LOCAL_VENUE_IMAGES[venue.id][0]} alt={venue.name} className="eb-card-image" />
                <div className="eb-capacity-badge">
                  <Users size={12} color="#fff" style={{ marginRight: '4px' }} />
                  <span>Max {venue.maxCapacity}</span>
                </div>
              </div>
              
              <div className="eb-card-body">
                <div className="eb-card-header-row">
                  <h2 className="eb-venue-name">{venue.name}</h2>
                  <span className="eb-venue-price">R {venue.pricePerDay.toLocaleString()}</span>
                </div>
                <p className="eb-price-subtext">per day full-hire</p>
                <p className="eb-venue-desc">{venue.description}</p>
                <button className="eb-book-btn" onClick={() => openBookingConfig(venue)}>
                  Check Availability & Reserve
                </button>
              </div>
            </div>
          ))
        )}
      </main>

      {/* GALLERY MODAL */}
      {showGalleryModal && selectedVenue && (
        <div className="eb-modal-overlay">
          <div className="eb-gallery-container">
            <div className="eb-gallery-header">
              <div>
                <h2 className="eb-gallery-title">{selectedVenue.name}</h2>
                <p className="eb-gallery-subtitle">Max {selectedVenue.maxCapacity} Guests</p>
              </div>
              <button onClick={() => setShowGalleryModal(false)} className="eb-close-btn">
                <XCircle size={32} color="#fff" />
              </button>
            </div>

            <div className="eb-gallery-main-wrapper">
              <img src={LOCAL_VENUE_IMAGES[selectedVenue.id][currentImageIndex]} alt="Venue" className="eb-gallery-main-image" />
            </div>

            <div className="eb-thumbnail-scroll">
              {LOCAL_VENUE_IMAGES[selectedVenue.id].map((img, idx) => (
                <button key={idx} onClick={() => setCurrentImageIndex(idx)} className={`eb-thumbnail-btn ${currentImageIndex === idx ? 'eb-thumbnail-active' : ''}`}>
                  <img src={img} alt="Thumbnail" className="eb-thumbnail-image" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* BOOKING CONFIGURATION MODAL */}
      {showBookingModal && selectedVenue && (
        <div className="eb-modal-overlay eb-align-bottom">
          <div className="eb-bottom-sheet">
            <div className="eb-sheet-header">
              <h2 className="eb-sheet-title">Configure Reservation</h2>
              <button onClick={() => setShowBookingModal(false)} className="eb-close-btn-gray">
                <XCircle size={28} color="#94a3b8" />
              </button>
            </div>

            <h3 className="eb-modal-venue-name">{selectedVenue.name}</h3>
            
            <div className="eb-segment-container">
              <button 
                className={`eb-segment-btn ${bookingType === 'hourly' ? 'eb-segment-active' : ''}`} 
                onClick={() => setBookingType('hourly')}
              >
                Hourly Block
              </button>
              <button 
                className={`eb-segment-btn ${bookingType === 'daily' ? 'eb-segment-active' : ''}`} 
                onClick={async () => {
                  setBookingType('daily');
                  // Smart Tab Switching: If they try to book multi-day for "Today", force them to "Tomorrow"
                  if (getLocalISODate(modalStartDate) === getLocalISODate(todayDate)) {
                     setModalStartDate(tomorrowDate);
                     if (modalEndDate < tomorrowDate) setModalEndDate(tomorrowDate);
                     
                     setIsLoadingSlots(true);
                     const blocked = await fetchBlockedSlotsWithBuffer(selectedVenue.id, getLocalISODate(tomorrowDate));
                     setBlockedSlots(blocked);
                     setIsLoadingSlots(false);
                  }
                }}
              >
                Multi-Day
              </button>
            </div>

            {bookingType === 'hourly' && (
              <div className="eb-config-section">
                <label className="eb-config-label">Event Date:</label>
                <input 
                  type="date" 
                  className="eb-web-date-input"
                  min={getLocalISODate(todayDate)}
                  value={getLocalISODate(modalStartDate)}
                  onChange={async (e) => {
                    const date = new Date(e.target.value);
                    setModalStartDate(date);
                    setModalEndDate(date);
                    
                    setIsLoadingSlots(true);
                    const blocked = await fetchBlockedSlotsWithBuffer(selectedVenue.id, getLocalISODate(date));
                    setBlockedSlots(blocked);
                    setSelectedStartTime(null);
                    setIsLoadingSlots(false);
                  }}
                />

                <label className="eb-config-label mt-4">Duration (Hours):</label>
                <div className="eb-duration-stepper">
                  <button className="eb-stepper-btn" onClick={() => { setSelectedDuration(prev => Math.max(1, prev - 1)); setSelectedStartTime(null); }}>
                    <Minus size={20} color="#1e3a5f" />
                  </button>
                  <span className="eb-duration-value">{selectedDuration} Hour{selectedDuration > 1 ? 's' : ''}</span>
                  <button className="eb-stepper-btn" onClick={() => { setSelectedDuration(prev => Math.min(14, prev + 1)); setSelectedStartTime(null); }}>
                    <Plus size={20} color="#1e3a5f" />
                  </button>
                </div>

                <label className="eb-config-label mt-4">Select Start Time (8 AM - 9 PM):</label>
                {isLoadingSlots ? (
                  <div className="eb-spinner" style={{ margin: '20px auto' }}></div>
                ) : (
                  <div className="eb-slot-grid">
                    {TIME_SLOTS.map((slot) => {
                      const available = isSlotAvailable(slot, selectedDuration);
                      const slotHour = parseInt(slot.split(':')[0], 10);
                      const selectedStartHour = selectedStartTime ? parseInt(selectedStartTime.split(':')[0], 10) : -1;
                      const isHighlighted = selectedStartHour !== -1 && slotHour >= selectedStartHour && slotHour < selectedStartHour + selectedDuration;

                      return (
                        <button 
                          key={slot}
                          disabled={!available}
                          className={`eb-time-slot ${!available ? 'eb-disabled-slot' : ''} ${isHighlighted ? 'eb-selected-slot' : ''}`}
                          onClick={() => setSelectedStartTime(slot)}
                        >
                          {slot}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {bookingType === 'daily' && (
              <div className="eb-config-section">
                <label className="eb-config-label">Event Start Date:</label>
                <input 
                  type="date" 
                  className="eb-web-date-input mb-4"
                  min={getLocalISODate(tomorrowDate)}
                  value={getLocalISODate(modalStartDate)}
                  onChange={async (e) => {
                    const date = new Date(e.target.value);
                    setModalStartDate(date);
                    if (date > modalEndDate) setModalEndDate(date);

                    setIsLoadingSlots(true);
                    const blocked = await fetchBlockedSlotsWithBuffer(selectedVenue.id, getLocalISODate(date));
                    setBlockedSlots(blocked);
                    setIsLoadingSlots(false);
                  }}
                />

                <label className="eb-config-label">Event End Date:</label>
                <input 
                  type="date" 
                  className="eb-web-date-input"
                  min={getLocalISODate(modalStartDate)}
                  value={getLocalISODate(modalEndDate)}
                  onChange={(e) => setModalEndDate(new Date(e.target.value))}
                />
                
                {blockedSlots.length > 0 && (
                  <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#b91c1c', fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <p style={{ margin: 0 }}>This venue has existing reservations on this date. Multi-day full-hire is currently unavailable.</p>
                  </div>
                )}
              </div>
            )}
            
            <div className="eb-summary-box">
              <div className="eb-summary-row">
                <span className="eb-summary-label">Total Calculation:</span>
                <span className="eb-summary-value">
                  {bookingType === 'hourly' 
                    ? `${selectedDuration} hrs @ R${getHourlyRate(selectedVenue.pricePerDay)}/hr` 
                    : `${Math.ceil(Math.abs(modalEndDate.getTime() - modalStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1} Days @ R${selectedVenue.pricePerDay}/day`
                  }
                </span>
              </div>
              <div className="eb-summary-divider" />
              <div className="eb-summary-row">
                <span className="eb-summary-label">Total Amount:</span>
                <span className="eb-summary-value">R {calculateTotal().toLocaleString()}</span>
              </div>
              <div className="eb-summary-row">
                <span className="eb-summary-label-deposit">Required Deposit (50%):</span>
                <span className="eb-summary-value-deposit">R {(calculateTotal() * 0.5).toLocaleString()}</span>
              </div>
            </div>

            <div className="eb-policy-box">
              <div className="eb-policy-header">
                <FileText size={18} color="#1e3a5f" />
                <h4 className="eb-policy-title">Resort Rental Policies</h4>
              </div>
              <p className="eb-policy-text">• A 50% non-refundable deposit is required to lock in your date.</p>
              <p className="eb-policy-text">• Setup must occur within your reserved block. <strong>Cleaners will inspect and prepare the venue 5-10 minutes prior to the end of your scheduled time.</strong></p>
              <p className="eb-policy-text">• A refundable breakage deposit of R5,000 applies. If the venue is severely damaged or left in a state that prevents cleaning within the 10-minute turnover window, the guest will incur extra penalty fees.</p>
              
              <div className="eb-terms-row">
                <span className="eb-terms-text">I have read and accept the rental conditions.</span>
                <input 
                  type="checkbox" 
                  className="eb-web-checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                />
              </div>
            </div>

            <button 
              className="eb-confirm-btn" 
              onClick={handleProceedToPayment}
              disabled={
                isSubmitting || 
                !termsAccepted || 
                (bookingType === 'hourly' && !selectedStartTime) || 
                (bookingType === 'daily' && blockedSlots.length > 0)
              }
            >
              {isSubmitting ? (
                <div className="eb-spinner eb-spinner-white"></div>
              ) : (
                "Proceed to Secure Deposit"
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}