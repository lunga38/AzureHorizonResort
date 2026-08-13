import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Calendar, MapPin, Clock, Receipt, Users, 
  CheckCircle, Loader2, AlertCircle, ChevronLeft, ChevronRight, Utensils,
  Mail, XCircle, Send, QrCode, CreditCard
} from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import emailjs from '@emailjs/browser';
import { Badge } from '@/components/ui/badge';
import { QRCodeSVG } from 'qrcode.react';
import { generateInvitationQR, deriveBookingPaymentState } from '@/services/firebase-services';

interface CateringDetail {
  name: string;
  pricePerPerson: number;
  guestsCovered: number;
  itemTotal: number;
}

interface Invitee {
  email: string;
  name?: string;
  inviteeName?: string;
  status: string;
  passLink: string;
  invitationId?: string;
  qrCode?: string;
}

interface EventBooking {
  id: string;
  venueName?: string;
  date?: string;
  eventDateStr?: string;
  bookedDates?: string[];
  bookingType?: 'hourly' | 'daily';
  startTime?: string | null;
  duration?: number | null;
  expectedAttendance?: number;
  totalAmount?: number;
  depositRequired?: number;
  amountPaid?: number;
  paymentStatus?: string;
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
  const navigate = useNavigate();

  // Invitation Modal State
  const [activeInviteBooking, setActiveInviteBooking] = useState<EventBooking | null>(null);
  const [inviteEmailsText, setInviteEmailsText] = useState('');
  const [inviteNameText, setInviteNameText] = useState('');
  const [isSendingInvites, setIsSendingInvites] = useState(false);

  // Guest Passes Modal State
  const [viewPassesBooking, setViewPassesBooking] = useState<EventBooking | null>(null);

  // LIVE subscription: bookings (and every payment/catering change made on
  // web OR mobile) appear instantly without refreshing.
  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    const bookingsRef = collection(db, 'event_bookings');
    const q = query(bookingsRef, where('guestId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as EventBooking));
      fetched.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
      setBookings(fetched);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching event bookings:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleSimulateReceipt = (booking: EventBooking) => {
    const money = deriveBookingPaymentState(booking);
    let receiptText = `Receipt Summary for Booking: ${booking.id.substring(0, 8).toUpperCase()}\n`;
    receiptText += `\nVenue: ${booking.venueName || 'Resort Venue'}`;
    receiptText += `\nVenue Cost: R ${money.venueCost.toLocaleString()}`;
    if (money.cateringTotal > 0) {
      receiptText += `\nCatering: R ${money.cateringTotal.toLocaleString()}`;
      if (booking.cateringItems && booking.cateringItems.length > 0) {
        receiptText += `\n\n--- CATERING ADD-ONS ---`;
        booking.cateringItems.forEach(item => {
          receiptText += `\n* ${item.name} (x${item.guestsCovered}): R ${item.itemTotal.toLocaleString()}`;
        });
      }
    }
    receiptText += `\n\nCOMBINED EVENT TOTAL: R ${money.combinedTotal.toLocaleString()}`;
    receiptText += `\nAmount Paid: R ${money.amountPaid.toLocaleString()}`;
    receiptText += `\nPayment Status: ${money.paymentStatus === 'paid_in_full' ? 'PAID IN FULL' : money.paymentStatus === 'deposit_paid' ? 'DEPOSIT PAID' : 'PENDING PAYMENT'}`;
    receiptText += `\n\nBALANCE DUE: R ${money.balanceDue.toLocaleString()}`;
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
    const rawEmails = inviteEmailsText.split(/[\n,]+/).map(e => e.trim().toLowerCase()).filter(e => e !== '');
    
    if (rawEmails.length === 0) {
      window.alert("Please enter at least one email address.");
      return;
    }

    const batchName = inviteNameText.trim() || 'Guest';
    const existingList = activeInviteBooking.invitees || [];

    // SRS Flow Step 3: Validate against venue capacity (duplicates excluded)
    const alreadyInvited = new Set(existingList.map(i => String(i.email || '').toLowerCase()));
    const freshEmails = rawEmails.filter(e => !alreadyInvited.has(e));
    const resendEmails = rawEmails.filter(e => alreadyInvited.has(e));
    const maxCapacity = activeInviteBooking.expectedAttendance || 0;
    
    if (existingList.length + freshEmails.length > maxCapacity) {
      window.alert(`Capacity Error!\n\nYou booked this venue for a maximum of ${maxCapacity} guests. You have already invited ${existingList.length} people. You cannot add ${freshEmails.length} new guests.`);
      return;
    }

    setIsSendingInvites(true);
    
    try {
      // SRS Flow Step 6: Generate real signed invitation QRs (mobile-identical,
      // validatable by staff attendee scanner on web AND mobile)
      const newInvitees: Invitee[] = [];
      for (const email of freshEmails) {
        const invitation = await generateInvitationQR({
          eventId: activeInviteBooking.id,
          inviteeEmail: email,
          inviteeName: batchName,
        });
        newInvitees.push({
          email: invitation.inviteeEmail,
          name: batchName,
          inviteeName: batchName,
          status: 'Invited',
          passLink: '',
          invitationId: invitation.invitationId,
          qrCode: invitation.qrCode,
        });
      }

      // Mobile-identical dedupe: already-invited emails reuse their existing QR
      // pass — only the reminder email is re-dispatched, no duplicate passes.
      const resendInvitees = existingList.filter(i => resendEmails.includes(String(i.email || '').toLowerCase()));

      const updatedInviteesList = [...existingList, ...newInvitees];

      // Save to Firestore
      const bookingRef = doc(db, 'event_bookings', activeInviteBooking.id);
      if (newInvitees.length > 0) {
        await updateDoc(bookingRef, {
          invitees: updatedInviteesList
        });
      }

      // SRS Flow Step 5: Dispatch the emails (fresh invites + resend reminders)
      const displayDate = activeInviteBooking.bookingType === 'daily' && Array.isArray(activeInviteBooking.bookedDates) && activeInviteBooking.bookedDates.length > 1
        ? `${activeInviteBooking.bookedDates[0]} to ${activeInviteBooking.bookedDates[activeInviteBooking.bookedDates.length - 1]}`
        : (activeInviteBooking.eventDateStr || activeInviteBooking.date || 'Pending Date');

      const emailTargets = [
        ...newInvitees.map(i => ({ email: i.email, qr: i.qrCode || i.passLink, name: i.name || 'Guest' })),
        ...resendInvitees.map(i => ({ email: i.email, qr: i.qrCode || i.passLink, name: i.inviteeName || i.name || 'Guest' })),
      ];

      await dispatchRealEmails(
        emailTargets.map(t => t.email),
        emailTargets.map(t => t.qr),
        activeInviteBooking.venueName || 'Event Venue',
        displayDate
      );

      // Update local UI state to reflect changes instantly
      setBookings(prev => prev.map(b => 
        b.id === activeInviteBooking.id ? { ...b, invitees: updatedInviteesList } : b
      ));

      const summary = [
        freshEmails.length > 0 ? `${freshEmails.length} new invitation(s)` : null,
        resendEmails.length > 0 ? `${resendEmails.length} reminder(s) re-sent` : null,
      ].filter(Boolean).join(' & ');
      window.alert(`Success! ${summary || 'No emails dispatched'}. Guests will receive their QR codes shortly.`);
      setActiveInviteBooking(null);
      setInviteEmailsText('');
      setInviteNameText('');

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
            const money = deriveBookingPaymentState(booking);
            const totalAmt = money.combinedTotal;
            const depositAmt = money.depositRequired;
            const amountPaid = money.amountPaid;
            const finalBalanceOwed = money.balanceDue;
            const payLabel = amountPaid > 0 ? 'Pay Balance' : 'Pay Deposit';
            
            const hasMultipleDates = Array.isArray(booking.bookedDates) && booking.bookedDates.length > 1;
            const displayDate = isDaily && hasMultipleDates && booking.bookedDates
              ? `${booking.bookedDates[0]} to ${booking.bookedDates[booking.bookedDates.length - 1]}`
              : (booking.eventDateStr || booking.date || 'Pending Date');
            
            const maxCapacity = booking.expectedAttendance || 0;
            const invitesSent = booking.invitees?.length || 0;
            const isPending = (booking.status || '').toLowerCase() === 'pending_payment';

            const goPay = (mode?: string) =>
              navigate('/payment', {
                state: {
                  bookingDetails: { bookingId: booking.id, expectedAttendance: maxCapacity, maxCapacity: booking.venueMaxCapacity },
                  paymentMode: mode,
                }
              });

            return (
              <Card key={booking.id} className="overflow-hidden border-none shadow-md bg-white dark:bg-slate-900 ring-1 ring-gray-100 dark:ring-slate-800">
                <div className="bg-[#1e3a5f] px-6 py-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xl font-bold text-white">{booking.venueName || 'Event Venue'}</h3>
                      <Badge className="bg-[#c9a227] text-white border-none hover:bg-[#b48e1f]">
                        {isDaily ? 'Full Day Hire' : 'Hourly Block'}
                      </Badge>
                      {isPending && (
                        <Badge className="bg-amber-500 text-white border-none hover:bg-amber-600 gap-1">
                          <AlertCircle className="h-3 w-3" /> Pending Payment
                        </Badge>
                      )}
                      {money.paymentStatus === 'paid_in_full' && (
                        <Badge className="bg-emerald-500 text-white border-none hover:bg-emerald-600 gap-1">
                          <CheckCircle className="h-3 w-3" /> Paid In Full
                        </Badge>
                      )}
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
                          {(booking.invitees || []).length > 0 && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="mt-3 text-[#1e3a5f] border-[#1e3a5f] hover:bg-[#1e3a5f]/5 gap-1.5"
                              onClick={() => setViewPassesBooking(booking)}
                            >
                              <QrCode className="h-3.5 w-3.5" /> View Guest Passes ({booking.invitees!.length})
                            </Button>
                          )}
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
                            <span className="text-gray-600 dark:text-gray-400">Venue Cost:</span>
                            <span className="text-gray-900 dark:text-gray-100">R {money.venueCost.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">Total Paid:</span>
                            <span className="text-emerald-600 font-medium">- R {amountPaid.toLocaleString()}</span>
                          </div>

                          {booking.cateringTotal ? (
                            <div className="flex justify-between text-sm pt-1">
                              <span className="text-gray-600 dark:text-gray-400">Catering Charges:</span>
                              <span className="text-purple-600">+ R {money.cateringTotal.toLocaleString()}</span>
                            </div>
                          ) : null}

                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">Combined Total:</span>
                            <span className="text-gray-900 dark:text-gray-100">R {totalAmt.toLocaleString()}</span>
                          </div>

                          <div className="flex justify-between text-sm font-bold pt-3 border-t border-gray-200 dark:border-slate-700">
                            <span className="text-gray-900 dark:text-gray-100">Balance Due:</span>
                            <span className={finalBalanceOwed > 0 ? 'text-amber-600' : 'text-emerald-600'}>
                              R {finalBalanceOwed.toLocaleString()}
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-400 text-right">Status: {money.paymentStatus === 'paid_in_full' ? 'Paid in full' : money.paymentStatus === 'deposit_paid' ? 'Deposit paid' : 'No payment yet'}</p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-col gap-2">
                        {finalBalanceOwed > 0 && (
                          <Button 
                            className="w-full bg-green-600 hover:bg-green-700 text-white transition-colors gap-2"
                            onClick={() => goPay()}
                          >
                            <CreditCard className="h-4 w-4" /> {payLabel} — R {Math.min(money.balanceDue, money.amountPaid > 0 ? money.balanceDue : money.depositRequired).toLocaleString()}
                          </Button>
                        )}

                        {!booking.cateringTotal && finalBalanceOwed >= 0 && (
                          <Button 
                            variant="outline" 
                            className="w-full text-[#1e3a5f] border-[#1e3a5f] hover:bg-[#1e3a5f]/5 transition-colors gap-2"
                            onClick={() => navigate('/event-catering', {
                              state: { bookingId: booking.id, expectedAttendance: maxCapacity, maxCapacity: booking.venueMaxCapacity }
                            })}
                          >
                            <Utensils className="h-4 w-4" /> Add Catering
                          </Button>
                        )}

                        <Button 
                          className="w-full bg-[#1e3a5f] hover:bg-[#163058] text-white transition-colors gap-2"
                          onClick={() => {
                            setActiveInviteBooking(booking);
                            setInviteEmailsText('');
                            setInviteNameText('');
                          }}
                        >
                          <Mail className="h-4 w-4" /> Send Invitations
                        </Button>

                        <Button 
                          variant="outline" 
                          className="w-full text-[#1e3a5f] border-[#1e3a5f] hover:bg-[#1e3a5f]/5 transition-colors gap-2"
                          onClick={() => handleSimulateReceipt(booking)}
                        >
                          <Receipt className="h-4 w-4" /> Receipt Summary
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
                  <strong>Capacity Remaining:</strong> {(activeInviteBooking.expectedAttendance || 0) - (activeInviteBooking.invitees?.length || 0)} spots left out of {activeInviteBooking.expectedAttendance || 0}.
                </p>
                <p className="mt-2 text-xs text-gray-500">
                  Enter invitee email addresses below (comma or new line separated). Already-invited emails just get a reminder re-sent with their existing QR pass — no duplicates. A unique, staff-verifiable QR pass is dispatched to each new guest.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
                  Guest Name <span className="text-gray-400">(shown on their QR pass)</span>
                </label>
                <input 
                  className="w-full border border-gray-300 dark:border-slate-600 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-[#1e3a5f] outline-none dark:bg-slate-800 dark:text-white"
                  placeholder="e.g. Sarah Mbeki"
                  value={inviteNameText}
                  onChange={(e) => setInviteNameText(e.target.value)}
                />
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

      {/* GUEST PASSES MODAL — view each attendee's real signed invitation QR */}
      {viewPassesBooking && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden max-h-[85vh] flex flex-col">
            <div className="bg-[#1e3a5f] p-5 flex items-center justify-between shrink-0">
              <h2 className="text-white font-bold text-lg flex items-center gap-2">
                <QrCode className="h-5 w-5 text-amber-400" /> Guest Passes
              </h2>
              <button 
                onClick={() => setViewPassesBooking(null)}
                className="text-white/70 hover:text-white transition-colors"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Each pass is a signed, staff-verifiable QR code — scan it at the entrance with the Attendee Check-In scanner.
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                {(viewPassesBooking.invitees || []).map((invitee, idx) => (
                  <div key={idx} className="border border-gray-200 dark:border-slate-700 rounded-xl p-4 flex items-center gap-4 bg-gray-50 dark:bg-slate-800/50">
                    {invitee.qrCode ? (
                      <QRCodeSVG value={invitee.qrCode} size={110} bgColor="#ffffff" fgColor="#1e3a5f" />
                    ) : (
                      <div className="h-[110px] w-[110px] flex items-center justify-center text-xs text-gray-400 bg-white rounded-lg border border-dashed border-gray-300">
                        No pass yet
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{invitee.name || invitee.inviteeName || invitee.email}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{invitee.email}</p>
                      <Badge className="mt-1 bg-emerald-100 text-emerald-800">{invitee.status}</Badge>
                      <p className="text-[10px] text-gray-400 mt-1.5 break-all font-mono">
                        {invitee.invitationId ? `ID: ${invitee.invitationId.slice(0, 8)}` : 'Legacy pass'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}