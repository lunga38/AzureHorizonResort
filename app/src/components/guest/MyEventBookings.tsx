import React, { useState, useEffect } from 'react';
import { 
  Calendar, MapPin, Clock, Receipt, Users, 
  CheckCircle, Loader2, AlertCircle, ChevronLeft, ChevronRight, Utensils,
  Mail, XCircle, Send
} from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import emailjs from '@emailjs/browser';
import { Badge } from '@/components/ui/badge';

interface CateringDetail {
  name: string;
  pricePerPerson: number;
  guestsCovered: number;
  itemTotal: number;
}

interface Invitee {
  email: string;
  status: string;
  passLink: string;
}

interface EventBooking {
  id: string;
  venueName?: string;
  date?: string;
  bookedDates?: string[];
  bookingType?: 'hourly' | 'daily';
  startTime?: string | null;
  duration?: number | null;
  expectedAttendance?: number;
  totalAmount?: number;
  depositRequired?: number;
  status?: string;
  createdAt?: string;
  cateringTotal?: number;
  cateringItems?: CateringDetail[];
  invitees?: Invitee[];
}

export function MyEventBookings({ onBack }: { onBack: () => void }) {
  const [bookings, setBookings] = useState<EventBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const user = auth.currentUser;

  // Invitation Modal State
  const [activeInviteBooking, setActiveInviteBooking] = useState<EventBooking | null>(null);
  const [inviteEmailsText, setInviteEmailsText] = useState('');
  const [isSendingInvites, setIsSendingInvites] = useState(false);

  useEffect(() => {
    const fetchMyEvents = async () => {
      if (!user) return;
      
      try {
        const bookingsRef = collection(db, 'event_bookings');
        const q = query(bookingsRef, where('guestId', '==', user.uid));
        const snapshot = await getDocs(q);
        
        const fetchedBookings: EventBooking[] = [];
        snapshot.docs.forEach(docSnap => {
          fetchedBookings.push({ id: docSnap.id, ...docSnap.data() } as EventBooking);
        });

        fetchedBookings.sort((a, b) => {
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return timeB - timeA;
        });
        
        setBookings(fetchedBookings);
      } catch (error) {
        console.error("Error fetching event bookings:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMyEvents();
  }, [user]);

  const handleSimulateReceipt = (booking: EventBooking) => {
    let receiptText = `Downloading Receipt for Booking ID: ${booking.id}\n`;
    receiptText += `\nVenue: ${booking.venueName || 'Resort Venue'}`;
    receiptText += `\nVenue Total: R ${(booking.totalAmount || 0).toLocaleString()}`;
    receiptText += `\nDeposit Paid: R ${(booking.depositRequired || 0).toLocaleString()}`;
    
    if (booking.cateringTotal && booking.cateringItems && booking.cateringItems.length > 0) {
      receiptText += `\n\n--- CATERING ADD-ONS ---`;
      booking.cateringItems.forEach(item => {
         receiptText += `\n* ${item.name} (x${item.guestsCovered}): R ${item.itemTotal.toLocaleString()}`;
      });
      receiptText += `\nTotal Catering: R ${booking.cateringTotal.toLocaleString()}`;
    }
    
    const venueBalance = (booking.totalAmount || 0) - (booking.depositRequired || 0);
    const finalBalance = venueBalance + (booking.cateringTotal || 0);
    receiptText += `\n\nFINAL BALANCE DUE: R ${finalBalance.toLocaleString()}`;
    
    window.alert(receiptText);
  };

 // Real EmailJS Dispatcher
  const dispatchRealEmails = async (
    emails: string[], 
    passLinks: string[], 
    venueName: string, 
    eventDate: string
  ) => {
    // IMPORTANT: Get these 3 keys from your EmailJS dashboard!
    const SERVICE_ID = 'service_os15k5k'; 
    const TEMPLATE_ID = 'template_seim01n'; 
    const PUBLIC_KEY = 'clygGEr0bqOlSNu82'; 

    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      const passLink = passLinks[i];
      
      // Pass the unique passLink into the public QR generator API
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(passLink)}`;

      const templateParams = {
        to_email: email,
        venue_name: venueName,
        event_date: eventDate,
        pass_link: passLink,
        qr_code_url: qrCodeUrl
      };

      try {
        await emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams, PUBLIC_KEY);
        console.log(`Successfully dispatched to: ${email}`);
      } catch (error) {
        console.error(`Failed to send invitation to: ${email}`, error);
      }
    }
  };

  const handleSendInvitations = async () => {
    if (!activeInviteBooking) return;
    
    // Parse the emails from the text area
    const rawEmails = inviteEmailsText.split(/[\n,]+/).map(e => e.trim()).filter(e => e !== '');
    
    if (rawEmails.length === 0) {
      window.alert("Please enter at least one email address.");
      return;
    }

    // SRS Flow Step 3: Validate against venue capacity
    const currentInviteeCount = activeInviteBooking.invitees?.length || 0;
    const maxCapacity = activeInviteBooking.expectedAttendance || 0;
    
    if (currentInviteeCount + rawEmails.length > maxCapacity) {
      window.alert(`Capacity Error!\n\nYou booked this venue for a maximum of ${maxCapacity} guests. You have already invited ${currentInviteeCount} people. You cannot send ${rawEmails.length} new invitations.`);
      return;
    }

    setIsSendingInvites(true);
    
    try {
      // SRS Flow Step 6: Generate unique passes and set status
      const newInvitees: Invitee[] = rawEmails.map(email => ({
        email: email,
        status: 'Invited',
        passLink: `https://azurehorizon.com/pass/${Math.random().toString(36).substring(2, 10).toUpperCase()}`
      }));

      const updatedInviteesList = [...(activeInviteBooking.invitees || []), ...newInvitees];

      // Save to Firestore
      const bookingRef = doc(db, 'event_bookings', activeInviteBooking.id);
      await updateDoc(bookingRef, {
        invitees: updatedInviteesList
      });

      // SRS Flow Step 5: Dispatch the emails
      const displayDate = activeInviteBooking.bookingType === 'daily' && Array.isArray(activeInviteBooking.bookedDates) && activeInviteBooking.bookedDates.length > 1
        ? `${activeInviteBooking.bookedDates[0]} to ${activeInviteBooking.bookedDates[activeInviteBooking.bookedDates.length - 1]}`
        : (activeInviteBooking.date || 'Pending Date');

      await dispatchRealEmails(
        newInvitees.map(i => i.email), 
        newInvitees.map(i => i.passLink),
        activeInviteBooking.venueName || 'Event Venue',
        displayDate
      );

      // Update local UI state to reflect changes instantly
      setBookings(prev => prev.map(b => 
        b.id === activeInviteBooking.id ? { ...b, invitees: updatedInviteesList } : b
      ));

      window.alert(`Successfully dispatched ${rawEmails.length} event invitations! Guests will receive their QR codes shortly.`);
      setActiveInviteBooking(null);
      setInviteEmailsText('');

    } catch (error) {
      console.error("Error sending invitations:", error);
      window.alert("There was an issue sending your invitations. Please try again.");
    } finally {
      setIsSendingInvites(false);
    }
  };
  return (
    <div className="w-full max-w-5xl mx-auto pb-12 relative">
      <div className="flex items-center gap-4 mb-8">
        <Button 
          variant="ghost" 
          onClick={onBack}
          className="text-[#1e3a5f] hover:bg-[#1e3a5f]/5"
        >
          <ChevronLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <div>
          <h1 className="text-3xl font-serif font-bold text-[#1e3a5f] dark:text-white">
            My Event Reservations
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage your venue bookings, catering, and balances.
          </p>
        </div>
      </div>

      {isLoading ? (
        <Card className="border-none shadow-sm bg-gray-50 dark:bg-slate-900 flex justify-center items-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#1e3a5f]" />
        </Card>
      ) : bookings.length === 0 ? (
        <Card className="border-dashed border-2 border-gray-200 bg-gray-50/50 dark:bg-slate-900 text-center py-20">
          <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-200">No Events Scheduled</h3>
          <p className="text-gray-500 mt-2">You haven't booked any venues yet.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {bookings.map((booking) => {
            const isDaily = booking.bookingType === 'daily';
            
            const totalAmt = booking.totalAmount || 0;
            const depositAmt = booking.depositRequired || 0;
            const venueBalance = totalAmt - depositAmt;
            const finalBalanceOwed = venueBalance + (booking.cateringTotal || 0);
            
            const hasMultipleDates = Array.isArray(booking.bookedDates) && booking.bookedDates.length > 1;
            const displayDate = isDaily && hasMultipleDates && booking.bookedDates
              ? `${booking.bookedDates[0]} to ${booking.bookedDates[booking.bookedDates.length - 1]}`
              : (booking.date || 'Pending Date');
            
            const maxCapacity = booking.expectedAttendance || 0;
            const invitesSent = booking.invitees?.length || 0;

            return (
              <Card key={booking.id} className="overflow-hidden border-none shadow-md bg-white dark:bg-slate-900 ring-1 ring-gray-100 dark:ring-slate-800">
                <div className="bg-[#1e3a5f] px-6 py-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold text-white">{booking.venueName || 'Event Venue'}</h3>
                      <Badge className="bg-[#c9a227] text-white border-none hover:bg-[#b48e1f]">
                        {isDaily ? 'Full Day Hire' : 'Hourly Block'}
                      </Badge>
                    </div>
                    <p className="text-blue-100 text-sm mt-1 flex items-center">
                      <MapPin className="h-3 w-3 mr-1" /> Azure Horizon Resort
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-sm text-blue-200 font-mono">REF: {booking.id.substring(0, 8).toUpperCase()}</p>
                    <p className="text-xs text-blue-200/70 mt-0.5">
                      Booked on {booking.createdAt ? new Date(booking.createdAt).toLocaleDateString() : 'Unknown Date'}
                    </p>
                  </div>
                </div>

                <CardContent className="p-6">
                  <div className="grid md:grid-cols-2 gap-8">
                    {/* Left Column - Details */}
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="bg-blue-50 dark:bg-slate-800 p-2 rounded-lg">
                          <Calendar className="h-5 w-5 text-[#1e3a5f] dark:text-blue-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Event Date</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{displayDate}</p>
                        </div>
                      </div>

                      {!isDaily && booking.startTime && (
                        <div className="flex items-start gap-3">
                          <div className="bg-emerald-50 dark:bg-emerald-900/30 p-2 rounded-lg">
                            <Clock className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Reserved Time</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {booking.startTime} ({booking.duration} Hours)
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="flex items-start gap-3">
                        <div className="bg-amber-50 dark:bg-amber-900/30 p-2 rounded-lg">
                          <Users className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div className="w-full">
                          <div className="flex justify-between items-center w-full">
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Guest Capacity</p>
                            <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                              {invitesSent} / {maxCapacity} Invited
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                            <div 
                              className="bg-amber-500 h-1.5 rounded-full" 
                              style={{ width: `${Math.min(100, (invitesSent / (maxCapacity || 1)) * 100)}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>

                      {booking.cateringItems && booking.cateringItems.length > 0 && (
                        <div className="flex items-start gap-3 pt-2">
                          <div className="bg-purple-50 dark:bg-purple-900/30 p-2 rounded-lg">
                            <Utensils className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Catering Added</p>
                            <ul className="mt-1 space-y-1">
                              {booking.cateringItems.map((item, idx) => (
                                <li key={idx} className="text-xs text-gray-600 dark:text-gray-400 flex justify-between">
                                  <span>• {item.name}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right Column - Financials & Actions */}
                    <div className="bg-gray-50 dark:bg-slate-800/50 rounded-xl p-5 border border-gray-100 dark:border-slate-800 flex flex-col justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4 border-b border-gray-200 dark:border-slate-700 pb-2">
                          Financial Summary
                        </h4>
                        
                        <div className="space-y-2 mb-4">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">Venue Full Price:</span>
                            <span className="text-gray-900 dark:text-gray-100">R {totalAmt.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">Venue Deposit Paid:</span>
                            <span className="text-emerald-600 font-medium">- R {depositAmt.toLocaleString()}</span>
                          </div>

                          {booking.cateringTotal ? (
                            <div className="flex justify-between text-sm pt-1">
                              <span className="text-gray-600 dark:text-gray-400">Catering Charges:</span>
                              <span className="text-purple-600">+ R {booking.cateringTotal.toLocaleString()}</span>
                            </div>
                          ) : null}

                          <div className="flex justify-between text-sm font-bold pt-3 border-t border-gray-200 dark:border-slate-700">
                            <span className="text-gray-900 dark:text-gray-100">Total Balance Due:</span>
                            <span className="text-amber-600">R {finalBalanceOwed.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-col gap-2">
                        <Button 
                          className="w-full bg-[#1e3a5f] hover:bg-[#163058] text-white transition-colors gap-2"
                          onClick={() => {
                            setActiveInviteBooking(booking);
                            setInviteEmailsText('');
                          }}
                        >
                          <Mail className="h-4 w-4" /> Send Invitations
                        </Button>

                        <Button 
                          variant="outline" 
                          className="w-full text-[#1e3a5f] border-[#1e3a5f] hover:bg-[#1e3a5f]/5 transition-colors gap-2"
                          onClick={() => handleSimulateReceipt(booking)}
                        >
                          <Receipt className="h-4 w-4" /> Download Receipt
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* SRS Flow Step 1 & 2: Send Invitations Modal */}
      {activeInviteBooking && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="bg-[#1e3a5f] p-5 flex items-center justify-between">
              <h2 className="text-white font-bold text-lg flex items-center gap-2">
                <Mail className="h-5 w-5 text-amber-400" /> Dispatch Invitations
              </h2>
              <button 
                onClick={() => setActiveInviteBooking(null)}
                className="text-white/70 hover:text-white transition-colors"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 dark:bg-slate-800 p-4 rounded-lg border border-blue-100 dark:border-slate-700 text-sm text-gray-700 dark:text-gray-300">
                <p><strong>Venue:</strong> {activeInviteBooking.venueName}</p>
                <p className="mt-1">
                  <strong>Capacity Remaining:</strong> {activeInviteBooking.expectedAttendance! - (activeInviteBooking.invitees?.length || 0)} spots left out of {activeInviteBooking.expectedAttendance}.
                </p>
                <p className="mt-2 text-xs text-gray-500">
                  Enter invitee email addresses below. Separate multiple emails with a comma or new line. The system will dispatch a unique pass link to each guest.
                </p>
              </div>

              <textarea 
                className="w-full border border-gray-300 dark:border-slate-600 rounded-lg p-3 text-sm min-h-[120px] focus:ring-2 focus:ring-[#1e3a5f] outline-none dark:bg-slate-800 dark:text-white"
                placeholder="guest1@example.com, guest2@example.com&#10;guest3@example.com"
                value={inviteEmailsText}
                onChange={(e) => setInviteEmailsText(e.target.value)}
              />

              <div className="flex justify-end gap-3 pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => setActiveInviteBooking(null)}
                  disabled={isSendingInvites}
                >
                  Cancel
                </Button>
                <Button 
                  className="bg-[#c9a227] hover:bg-[#b08d22] text-white font-semibold gap-2"
                  onClick={handleSendInvitations}
                  disabled={isSendingInvites}
                >
                  {isSendingInvites ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {isSendingInvites ? 'Dispatching...' : 'Send Invites'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}