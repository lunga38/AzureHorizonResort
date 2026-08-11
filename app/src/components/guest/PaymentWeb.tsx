import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  ChevronLeft, AlertCircle, Lock, CreditCard, 
  Check, Mail, ArrowRight, Loader2 
} from 'lucide-react';
import { auth } from '@/lib/firebase';
import './PaymentWeb.css'; 

export default function PaymentWeb() {
  const user = auth.currentUser;
  const navigate = useNavigate();
  const location = useLocation();

  // Parse details passed via React Router state
  const { 
    roomName = 'Ocean View Suite', 
    total = 10500, 
    depositAmount = Math.round(total * 0.15),
    nights,
    checkIn,
    expectedAttendance,
    bookingId,
    bookingType // Extracted to conditionally route catering
  } = location.state || {};
  
  // Determine if this is a new booking vs a resident checkout
  const isNewBooking = nights !== undefined && checkIn !== undefined;

  const [step, setStep] = useState<'disclaimer' | 'confirmation'>('disclaimer');
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmationNumber, setConfirmationNumber] = useState('');
  
  // Payment Option State
  const [paymentMode, setPaymentMode] = useState<'deposit' | 'full'>('deposit');
  
  // Dynamic Calculation
  const amountToPay = paymentMode === 'full' ? total : depositAmount;
  const balanceDue = paymentMode === 'full' ? 0 : total - depositAmount;

  const handleTriggerPayment = () => {
    setIsProcessing(true);

    // Simulate Paystack or test mode workflow for web presentation
    setTimeout(() => {
      setIsProcessing(false);
      const generatedRef = `BK-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      setConfirmationNumber(generatedRef);
      setStep('confirmation');
    }, 1500);
  };

  const handleSimulateEmailReceipt = () => {
    window.alert(
      `Receipt Sent!\n\nA PDF receipt for transaction #${confirmationNumber} has been dispatched to ${user?.email || 'your registered email'}.`
    );
  };

  const handleCompleteBooking = () => {
    // Only offer catering if they have attendees AND booked for a full day/multi-day
    if (expectedAttendance && bookingType === 'daily') {
      const wantsCatering = window.confirm(
        "Venue Secured!\n\nWould you like to arrange catering for your event now?"
      );

      if (wantsCatering) {
        navigate('/event-catering', { 
          state: { expectedAttendance, bookingId } 
        });
        return; // Stop execution here so it doesn't run the code below
      }
    } 
    
    // If it's an hourly booking, OR they declined catering, just finish the process
    window.alert(isNewBooking ? "Success: Reservation confirmed!" : "Success: Folio balance settled successfully!");
    navigate('/'); 
  };

  if (step === 'disclaimer') {
    return (
      <div className="pw-container">
        {/* HEADER */}
        <header className="pw-header">
          <button className="pw-back-button" onClick={() => navigate(-1)}>
            <ChevronLeft size={28} color="#1e3a5f" />
          </button>
          <div className="pw-header-center">
            <h1 className="pw-header-title">
              {isNewBooking ? 'Complete Reservation' : 'Secure Checkout'}
            </h1>
            <p className="pw-header-subtitle">
              {isNewBooking ? 'Booking Gateway' : 'Folio Payment Gateway'}
            </p>
          </div>
          <div style={{ width: '28px' }} />
        </header>

        <main className="pw-scroll-content">
          {/* POLICY BOX */}
          <div className="pw-policy-card">
            <div className="pw-policy-header-row">
              <AlertCircle size={22} color="#d97706" />
              <h2 className="pw-policy-header-title">Resort Policies & Damages</h2>
            </div>
            <p className="pw-policy-text">
              • A non-refundable deposit is required to secure {isNewBooking ? 'your booking' : 'folio clearance'}.
            </p>
            <p className="pw-policy-text">• Cancellations within 48 hours forfeit the deposit amount.</p>
            <p className="pw-policy-text">
              • <strong>Damage Clause:</strong> Additional penalty fees will be charged to your account if any resort property, furniture, or equipment is damaged during your stay or event.
            </p>
          </div>

          {/* FINANCIAL BREAKDOWN */}
          <div className="pw-breakdown-card">
            <h3 className="pw-breakdown-title">Billing Summary</h3>
            
            <div className="pw-breakdown-row">
              <span className="pw-breakdown-label">Reserved Space:</span>
              <span className="pw-breakdown-value">{roomName}</span>
            </div>

            {isNewBooking && (
              <>
                <div className="pw-breakdown-row">
                  <span className="pw-breakdown-label">Date:</span>
                  <span className="pw-breakdown-value">{checkIn}</span>
                </div>
                {nights && (
                  <div className="pw-breakdown-row">
                    <span className="pw-breakdown-label">Duration:</span>
                    <span className="pw-breakdown-value">{nights} {nights === 1 ? 'Day/Night' : 'Days/Nights'}</span>
                  </div>
                )}
              </>
            )}

            <div className="pw-breakdown-divider" />

            <div className="pw-breakdown-row">
              <span className="pw-breakdown-label">Total Charges (inc. Taxes):</span>
              <span className="pw-breakdown-value">R {total.toLocaleString()}</span>
            </div>
            
            <div className="pw-breakdown-row">
              <span className="pw-breakdown-label">Minimum Deposit:</span>
              <span className="pw-breakdown-value">R {depositAmount.toLocaleString()}</span>
            </div>
          </div>

          {/* PAYMENT OPTION SELECTOR */}
          <div className="pw-payment-selector-box">
            <h4 className="pw-payment-selector-title">Select Payment Amount</h4>
            <div className="pw-payment-toggle-container">
              <button 
                className={`pw-toggle-btn ${paymentMode === 'deposit' ? 'pw-toggle-btn-active' : ''}`}
                onClick={() => setPaymentMode('deposit')}
              >
                <span className={`pw-toggle-btn-text ${paymentMode === 'deposit' ? 'pw-toggle-btn-text-active' : ''}`}>
                  Pay Deposit
                </span>
              </button>
              <button 
                className={`pw-toggle-btn ${paymentMode === 'full' ? 'pw-toggle-btn-active' : ''}`}
                onClick={() => setPaymentMode('full')}
              >
                <span className={`pw-toggle-btn-text ${paymentMode === 'full' ? 'pw-toggle-btn-text-active' : ''}`}>
                  Pay Full Amount
                </span>
              </button>
            </div>
            
            <div className="pw-balance-row">
              <span className="pw-balance-label">Remaining Balance Due Later:</span>
              <span className="pw-balance-value">R {balanceDue.toLocaleString()}</span>
            </div>
          </div>

          {/* SECURE BADGE */}
          <div className="pw-secure-badge">
            <Lock size={20} color="#1e3a5f" />
            <div style={{ flex: 1 }}>
              <h5 className="pw-secure-title">Paystack Secure SSL</h5>
              <p className="pw-secure-desc">Encrypted processing. No banking credentials are stored on resort servers.</p>
            </div>
          </div>

          <div className="pw-action-buttons">
            <button className="pw-cancel-btn" onClick={() => navigate(-1)}>
              <span className="pw-cancel-btn-text">Cancel</span>
            </button>
            
            <button 
              className="pw-pay-btn" 
              onClick={handleTriggerPayment}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <Loader2 className="pw-spinner" size={24} color="#fff" />
              ) : (
                <>
                  <CreditCard size={18} color="#fff" style={{ marginRight: '6px' }} />
                  <span className="pw-pay-btn-text">Pay R {amountToPay.toLocaleString()}</span>
                </>
              )}
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="pw-container">
      {/* SUCCESS CONFIRMATION VIEW */}
      <header className="pw-header">
        <div style={{ width: '28px' }} />
        <div className="pw-header-center">
          <h1 className="pw-header-title">Payment Complete</h1>
        </div>
        <div style={{ width: '28px' }} />
      </header>

      <main className="pw-scroll-content">
        <div className="pw-success-icon-container">
          <div className="pw-success-circle">
            <Check size={40} color="#16a34a" />
          </div>
          <h2 className="pw-success-heading">Transaction Successful!</h2>
          <p className="pw-success-subtext">
            {isNewBooking ? 'Your reservation is secured.' : 'Your payment has been securely processed.'}
          </p>
        </div>

        <div className="pw-receipt-box">
          <p className="pw-receipt-header">CONFIRMATION REF</p>
          <h3 className="pw-receipt-ref-text">{confirmationNumber}</h3>
          
          <div className="pw-receipt-divider" />

          <div className="pw-breakdown-row">
            <span className="pw-breakdown-label">Space Booked:</span>
            <span className="pw-breakdown-value">{roomName}</span>
          </div>

          {isNewBooking && (
            <div className="pw-breakdown-row">
              <span className="pw-breakdown-label">Arrival Date:</span>
              <span className="pw-breakdown-value">{checkIn}</span>
            </div>
          )}

          <div className="pw-breakdown-row">
            <span className="pw-breakdown-label">Amount Paid:</span>
            <span className="pw-breakdown-value" style={{ color: '#16a34a' }}>R {amountToPay.toLocaleString()}</span>
          </div>
          <div className="pw-breakdown-row">
            <span className="pw-breakdown-label">Remaining Balance:</span>
            <span className="pw-breakdown-value">R {balanceDue.toLocaleString()}</span>
          </div>
        </div>

        <div className="pw-action-buttons">
          <button className="pw-cancel-btn" onClick={handleSimulateEmailReceipt}>
            <Mail size={18} color="#1e3a5f" style={{ marginRight: '6px' }} />
            <span className="pw-cancel-btn-text">Email Receipt</span>
          </button>
          
          <button className="pw-pay-btn" onClick={handleCompleteBooking}>
            <span className="pw-pay-btn-text">Continue</span>
            <ArrowRight size={18} color="#fff" style={{ marginLeft: '6px' }} />
          </button>
        </div>
      </main>
    </div>
  );
}