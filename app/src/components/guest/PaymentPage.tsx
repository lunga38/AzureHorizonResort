import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AlertCircle, Lock, CreditCard, CheckCircle, Download } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { generatePDFFromHTML, getProfessionalPDFHTML } from '@/utils/pdfGenerator';

export function PaymentPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Read booking details passed from the EventBooking page
  const bookingDetails = location.state?.bookingDetails || {
    roomName: 'Event Venue',
    checkIn: '15:00',
    checkOut: '11:00',
    guests: 30,
    roomRate: 0,
    nights: 1,
    subtotal: 0,
    tax: 0,
    total: 0,
    depositAmount: 500,
    balanceDue: 0
  };

  const [step, setStep] = useState<'disclaimer' | 'confirmation'>('disclaimer');
  const [confirmationNumber, setConfirmationNumber] = useState('');

  // Simulated Payment Trigger for the Demo
  const triggerPayment = () => {
    const mockRef = `BK-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
    setConfirmationNumber(mockRef);
    setStep('confirmation');
  };

  const downloadReceipt = async () => {
    const invoiceNumber = `INV-${confirmationNumber.slice(-6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    
    const details = [
      { label: 'Invoice Number', value: invoiceNumber },
      { label: 'Confirmation', value: confirmationNumber },
      { label: 'Date Issued', value: new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' }) },
      { label: 'Payment Method', value: 'Online (Simulated)' },
      { label: 'Room', value: bookingDetails.roomName },
      { label: 'Check-in', value: `${bookingDetails.checkIn} (from 15:00)` },
      { label: 'Check-out', value: `${bookingDetails.checkOut} (by 11:00)` },
      { label: 'Guests', value: bookingDetails.guests.toString() },
    ];

    const items = [
      { name: `${bookingDetails.roomName} (${bookingDetails.nights} nights @ R ${bookingDetails.roomRate}/night)`, quantity: bookingDetails.nights, price: bookingDetails.roomRate, subtotal: bookingDetails.subtotal },
      { name: 'Taxes & Fees (15% VAT)', quantity: 1, price: bookingDetails.tax, subtotal: bookingDetails.tax },
    ];

    const html = getProfessionalPDFHTML({
      title: 'DEPOSIT PAYMENT RECEIPT',
      guestName: user?.name || 'Guest',
      details: details,
      items: items,
      subtotal: bookingDetails.subtotal,
      tax: bookingDetails.tax,
      total: bookingDetails.depositAmount,
      footer: `Deposit of R ${bookingDetails.depositAmount} paid successfully. Remaining balance of R ${bookingDetails.balanceDue} is due upon check-in at 15:00.\n\nAzure Horizon Resort • reservations@azurehorizon.com • +27 (0)21 555 0100`
    });
    
    await generatePDFFromHTML(html, `Deposit_Receipt_${confirmationNumber}.pdf`);
  };

 const handleComplete = () => {
    const wantsCatering = window.confirm("Payment successful! Would you like to add catering to your event?");
    if (wantsCatering) {
      navigate('/event-catering', { 
        state: { 
          // 🚨 CRITICAL: Use bookingDetails.bookingId so Firebase knows what to update!
          bookingId: bookingDetails.bookingId, 
          expectedAttendance: bookingDetails.guests 
        } 
      });
    } else {
      navigate('/');
    }
  };

  const onCancel = () => {
    navigate(-1);
  };

  if (step === 'disclaimer') {
    return (
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300 pointer-events-auto max-w-3xl mx-auto mt-10 p-6 bg-white rounded-xl shadow-sm border">
        <div className="flex items-center gap-2 text-[#1e3a5f] dark:text-blue-400 mb-2">
          <AlertCircle className="h-6 w-6" />
          <h2 className="text-xl font-serif font-bold">Deposit & Cancellation Policy</h2>
        </div>
            <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
              <p className="text-sm font-semibold text-amber-800 mb-2">Important Information</p>
              <ul className="text-sm text-amber-700 space-y-2 list-disc list-inside">
                <li>A non-refundable deposit of <strong>15%</strong> is required to confirm your booking.</li>
                <li>The remaining <strong>85%</strong> is due upon check-in.</li>
                <li>Standard Check-in time is <strong>15:00 (3:00 PM)</strong>.</li>
                <li>Standard Check-out time is <strong>11:00 AM</strong>.</li>
                <li>Cancellations made more than 48 hours before check-in receive a 50% deposit refund.</li>
                <li>Cancellations within 48 hours of check-in forfeit the full deposit.</li>
                <li>No-shows will be charged the full reservation amount.</li>
                <li>Early check-out may incur additional fees. Extended stays can be requested at the Front Desk.</li>
              </ul>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex justify-between mb-2">
                <span>Room Total:</span>
                <span className="font-semibold">R {bookingDetails.total}</span>
              </div>
              <div className="flex justify-between mb-2 text-amber-600">
                <span>Deposit Due Now:</span>
                <span className="font-bold">R {bookingDetails.depositAmount}</span>
              </div>
              <div className="flex justify-between">
                <span>Balance at Check-in:</span>
                <span>R {bookingDetails.balanceDue}</span>
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
              <Button variant="outline" className="flex-1" onClick={onCancel}>
                Cancel Booking
              </Button>
              <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={triggerPayment}>
                <CreditCard className="mr-2 h-4 w-4" />
                Pay R {bookingDetails.depositAmount}
              </Button>
            </div>
      </div>
    );
  }

  if (step === 'confirmation') {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pointer-events-auto max-w-3xl mx-auto mt-10 p-6 bg-white rounded-xl shadow-sm border">
        <div className="text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-serif text-[#1e3a5f] dark:text-blue-400">Payment Successful!</h2>
        </div>
            <div className="bg-green-50 p-4 rounded-lg text-center">
              <p className="text-sm text-green-800">Your deposit of <strong>R {bookingDetails.depositAmount}</strong> has been received.</p>
              <p className="text-xs text-green-600 mt-1">Confirmation: {confirmationNumber}</p>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b">
                <p className="text-xs font-bold uppercase">Booking Summary</p>
              </div>
              <div className="p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Room:</span>
                  <span className="font-semibold">{bookingDetails.roomName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Stay:</span>
                  <div className="text-right">
                    <div>{bookingDetails.checkIn} <span className="text-gray-500 text-xs">(Check-in: 15:00)</span></div>
                    <div>{bookingDetails.checkOut} <span className="text-gray-500 text-xs">(Check-out: 11:00)</span></div>
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Guests:</span>
                  <span>{bookingDetails.guests}</span>
                </div>
                <div className="border-t pt-2 mt-2">
                  <div className="flex justify-between text-sm">
                    <span>Total Room Cost:</span>
                    <span>R {bookingDetails.total}</span>
                  </div>
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Deposit Paid:</span>
                    <span>- R {bookingDetails.depositAmount}</span>
                  </div>
                  <div className="flex justify-between font-bold mt-2">
                    <span>Balance Due at Check-in:</span>
                    <span>R {bookingDetails.balanceDue}</span>
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