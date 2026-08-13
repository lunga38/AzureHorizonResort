import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AlertCircle, Lock, CreditCard, CheckCircle, Download, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import {
  applyEventPayment,
  awardLoyaltyPoints,
  createEventPaymentRecord,
  deriveBookingPaymentState,
} from '@/services/firebase-services';
import { generatePDFFromHTML, getProfessionalPDFHTML } from '@/utils/pdfGenerator';

export function PaymentPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const bookingDetails = location.state?.bookingDetails || {};
  const requestedMode = location.state?.paymentMode || 'deposit';
  const bookingId = bookingDetails.bookingId || null;

  const [step, setStep] = useState<'loading' | 'disclaimer' | 'confirmation' | 'error'>('loading');
  const [booking, setBooking] = useState<any>(null);
  const [money, setMoney] = useState<any>(null);
  const [amountNow, setAmountNow] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [confirmationNumber, setConfirmationNumber] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [earnedPoints, setEarnedPoints] = useState(0);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const loadBooking = async () => {
      if (!bookingId) {
        // No booking reference (legacy/demo path) — simulated payment only.
        setBooking(null);
        setMoney(null);
        setStep('disclaimer');
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'event_bookings', bookingId));
        if (!snap.exists()) {
          setErrorMsg('This booking no longer exists. It may have been cancelled by the resort.');
          setStep('error');
          return;
        }
        const b = { id: snap.id, ...snap.data() };
        setBooking(b);
        setMoney(deriveBookingPaymentState(b));
        setStep('disclaimer');
      } catch (err) {
        console.error('Failed to load booking:', err);
        setErrorMsg('We could not load your booking. Please try again.');
        setStep('error');
      }
    };
    loadBooking();
  }, [bookingId]);

  const venueName = booking?.venueName || bookingDetails.roomName || 'Event Venue';
  const guestCount = booking?.expectedAttendance || bookingDetails.guests || 30;
  const maxCapacity = booking?.venueMaxCapacity || bookingDetails.maxCapacity || 400;

  const combinedTotal = money?.combinedTotal ?? bookingDetails.total ?? bookingDetails.depositAmount ?? 0;
  const depositRequired = money?.depositRequired ?? Math.round(combinedTotal / 2);
  const amountPaid = money?.amountPaid ?? 0;
  const balanceDue = money?.balanceDue ?? Math.max(0, combinedTotal - amountPaid);
  const defaultAmount =
    requestedMode === 'full' ? balanceDue :
    requestedMode === 'balance' ? balanceDue :
    requestedMode === 'custom' ? 0 :
    Math.min(depositRequired, balanceDue);

  const paymentLabel =
    defaultAmount >= balanceDue && balanceDue > 0 ? 'Settle Balance in Full' :
    amountPaid > 0 ? 'Pay Updated Balance' : 'Pay Deposit (50%)';

  // Simulated Payment Gateway for the Demo
  const triggerPayment = async () => {
    const amount = defaultAmount;
    if (amount <= 0) {
      window.alert('There is no outstanding balance on this booking.');
      navigate('/');
      return;
    }

    setConfirming(true);
    try {
      const reference = `PAY-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
      const invoice = `INV-${Date.now().toString(36).toUpperCase()}`;
      const currentUser = user || { uid: booking?.guestId || '', email: booking?.guestEmail || '', name: booking?.guestName || 'Guest' };

      if (bookingId) {
        // 1) Persist on the booking: accumulate amountPaid, re-derive balance/status
        const result = await applyEventPayment(bookingId, amount, {
          paymentMethod: 'Online (Simulated)',
          paymentReference: reference,
          paymentMode: 'online',
        });
        if (!result) throw new Error('Payment could not be recorded.');

        // 2) Folio record readable by BOTH apps (payments + receipts)
        const items = [
          { name: `Event Venue — ${venueName} (${guestCount} guests)`, quantity: 1, price: money?.venueCost || 0, subtotal: money?.venueCost || 0 },
          ...(money?.cateringTotal
            ? [{ name: 'Event Catering Package', quantity: 1, price: money.cateringTotal, subtotal: money.cateringTotal }]
            : []),
          { name: 'Event Total (pre-payment)', quantity: 1, price: combinedTotal, subtotal: combinedTotal },
          { name: `Payment ${paymentLabel}`, quantity: 1, price: amount, subtotal: amount },
        ];
        const pts = Math.floor(amount / 10);
        await createEventPaymentRecord({
          guestId: currentUser.uid,
          guestName: currentUser.name,
          guestEmail: currentUser.email,
          bookingId,
          amount,
          paymentMethod: 'Online (Simulated)',
          paymentReference: reference,
          paymentMode: 'online',
          invoiceNumber: invoice,
          items,
          pointsEarned: pts,
        });

        // 3) Loyalty points (1 point per R10, mirrored from the mobile app)
        if (pts > 0) {
          await awardLoyaltyPoints(currentUser.uid, currentUser.email, pts, `Event Payment: ${venueName}`);
        }
        setEarnedPoints(pts);
      }

      setConfirmationNumber(reference);
      setPaymentRef(reference);
      setInvoiceNumber(invoice);
      setStep('confirmation');
    } catch (err) {
      console.error('Payment failed:', err);
      window.alert('Payment could not be completed. Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  const downloadReceipt = async () => {
    const num = invoiceNumber || `INV-${confirmationNumber.slice(-6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    const details = [
      { label: 'Invoice Number', value: num },
      { label: 'Payment Reference', value: paymentRef },
      { label: 'Date Issued', value: new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' }) },
      { label: 'Payment Method', value: 'Online (Simulated)' },
      { label: 'Venue', value: venueName },
      { label: 'Guests', value: guestCount.toString() },
      { label: 'Loyalty Points Earned', value: earnedPoints > 0 ? `+${earnedPoints} pts` : '—' },
    ];
    const items = [
      { name: `Event Venue — ${venueName}`, quantity: 1, price: money?.venueCost || 0, subtotal: money?.venueCost || 0 },
      ...(money?.cateringTotal
        ? [{ name: 'Event Catering Package', quantity: 1, price: money.cateringTotal, subtotal: money.cateringTotal }]
        : []),
      { name: 'Combined Event Total', quantity: 1, price: combinedTotal, subtotal: combinedTotal },
      { name: `Payment Made (${paymentLabel})`, quantity: 1, price: amountNow || defaultAmount, subtotal: amountNow || defaultAmount },
    ];

    const html = getProfessionalPDFHTML({
      title: 'EVENT PAYMENT RECEIPT',
      guestName: user?.name || booking?.guestName || 'Guest',
      details,
      items,
      subtotal: combinedTotal,
      tax: 0,
      total: amountNow || defaultAmount,
      footer: `New balance due: R ${Math.max(0, balanceDue - (amountNow || defaultAmount))}. Settle anytime from My Events.\n\nAzure Horizon Resort • reservations@azurehorizon.com • +27 (0)21 555 0100`
    });
    await generatePDFFromHTML(html, `Payment_Receipt_${confirmationNumber}.pdf`);
  };

  const handleComplete = () => {
    const wantsCatering = window.confirm('Payment recorded! Would you like to add catering to your event?');
    if (wantsCatering && bookingId) {
      navigate('/event-catering', {
        state: { bookingId, expectedAttendance: guestCount, maxCapacity },
      });
    } else {
      navigate('/my-events');
    }
  };

  const onCancel = () => {
    if (bookingId) navigate('/my-events');
    else navigate(-1);
  };

  if (step === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center max-w-3xl mx-auto mt-10 p-6">
        <Loader2 className="h-8 w-8 animate-spin text-[#1e3a5f]" />
        <p className="text-sm text-gray-500 mt-3">Loading your booking...</p>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="max-w-3xl mx-auto mt-10 p-6 bg-white rounded-xl shadow-sm border space-y-4">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="h-6 w-6" />
          <h2 className="text-xl font-serif font-bold">Payment Unavailable</h2>
        </div>
        <p className="text-sm text-gray-600">{errorMsg}</p>
        <Button variant="outline" onClick={() => navigate('/my-events')}>Back to My Events</Button>
      </div>
    );
  }

  if (step === 'disclaimer') {
    return (
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300 pointer-events-auto max-w-3xl mx-auto mt-10 p-6 bg-white rounded-xl shadow-sm border">
        <div className="flex items-center gap-2 text-[#1e3a5f] dark:text-blue-400 mb-2">
          <CreditCard className="h-6 w-6" />
          <h2 className="text-xl font-serif font-bold">Event Payment</h2>
        </div>

        <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
          <p className="text-sm font-semibold text-amber-800 mb-2">How payments work</p>
          <ul className="text-sm text-amber-700 space-y-2 list-disc list-inside">
            <li>A <strong>50% deposit</strong> is required to confirm your venue booking.</li>
            <li>The remaining <strong>50%</strong> can be paid now or settled later from My Events.</li>
            <li>Catering is included in one combined total when added.</li>
            <li>You earn <strong>1 loyalty point per R10</strong> paid.</li>
            <li>A permanent payment record is stored on your folio (visible in Billing).</li>
            <li>This demo simulates the payment gateway — no real money moves.</li>
          </ul>
        </div>

        <div className="bg-gray-50 p-4 rounded-lg space-y-2">
          <div className="flex justify-between text-sm">
            <span>Venue:</span>
            <span className="font-semibold">{venueName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Combined Event Total:</span>
            <span className="font-semibold">R {combinedTotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Already Paid:</span>
            <span>- R {amountPaid.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm text-green-700 font-semibold border-t pt-2 mt-2">
            <span>Amount Due Now:</span>
            <span>R {defaultAmount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Balance After This Payment:</span>
            <span>R {Math.max(0, balanceDue - defaultAmount).toLocaleString()}</span>
          </div>
        </div>

        <div className="bg-[#1e3a5f]/5 border border-[#1e3a5f]/20 p-4 rounded-lg flex items-start gap-3">
          <Lock className="h-5 w-5 text-[#1e3a5f] shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-[#1e3a5f]">Secure Checkout</p>
            <p className="text-xs text-gray-500 mt-1">You will be redirected to our secure payment gateway to complete your transaction. No card details are stored on our servers.</p>
          </div>
        </div>

        <div className="flex gap-4 pt-4">
          <Button variant="outline" className="flex-1" onClick={onCancel} disabled={confirming}>
            Cancel
          </Button>
          <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={triggerPayment} disabled={confirming || defaultAmount <= 0}>
            {confirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
            {paymentLabel} — R {defaultAmount.toLocaleString()}
          </Button>
        </div>
      </div>
    );
  }

  if (step === 'confirmation') {
    const newBalance = Math.max(0, balanceDue - (amountNow || defaultAmount));
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pointer-events-auto max-w-3xl mx-auto mt-10 p-6 bg-white rounded-xl shadow-sm border">
        <div className="text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-serif text-[#1e3a5f] dark:text-blue-400">Payment Successful!</h2>
        </div>

        <div className="bg-green-50 p-4 rounded-lg text-center">
          <p className="text-sm text-green-800">Payment of <strong>R {(amountNow || defaultAmount).toLocaleString()}</strong> received for {venueName}.</p>
          <p className="text-xs text-green-600 mt-1">Reference: {paymentRef}</p>
          {earnedPoints > 0 && (
            <p className="text-xs text-green-700 mt-1">You earned <strong>+{earnedPoints} loyalty points</strong>.</p>
          )}
        </div>

        <div className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b">
            <p className="text-xs font-bold uppercase">Payment Summary</p>
          </div>
          <div className="p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span>Venue:</span>
              <span className="font-semibold">{venueName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Guests:</span>
              <span>{guestCount}</span>
            </div>
            <div className="border-t pt-2 mt-2">
              <div className="flex justify-between text-sm">
                <span>Combined Event Total:</span>
                <span>R {combinedTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm text-green-600">
                <span>Total Paid (incl. this payment):</span>
                <span>- R {(amountPaid + (amountNow || defaultAmount)).toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-bold mt-2">
                <span>Balance Due:</span>
                <span>R {newBalance.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <Button variant="outline" className="flex-1" onClick={downloadReceipt}>
            <Download className="mr-2 h-4 w-4" />
            Receipt
          </Button>
          <Button className="flex-1 bg-[#1e3a5f] hover:bg-[#2c5282] text-white" onClick={handleComplete}>
            Complete Booking
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
