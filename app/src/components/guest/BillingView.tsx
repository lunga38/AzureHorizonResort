import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/services/firebase-services';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { DigitalReceipt } from '@/components/DigitalReceipt';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ReceiptText, ChevronLeft, CreditCard, Lock, FileDown } from 'lucide-react';
import type { User as AppUser } from '@/types';
import { usePaystackPayment } from 'react-paystack';
import { fetchAllGuestCharges } from '@/services/firebase-services';
import { generatePDFFromHTML, getProfessionalPDFHTML } from '@/utils/pdfGenerator';



interface BillingViewProps {
  onBack: () => void;
}

// Auth Bridge to handle Firebase uid vs AppUser id
type AuthUserBridge = AppUser & { uid?: string };

export function BillingView({ onBack }: BillingViewProps) {
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<any[]>([]);
  const [activeBooking, setActiveBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);

  const currentUser = user as AuthUserBridge;
  const currentUserId = currentUser?.id || currentUser?.uid;

  useEffect(() => {
    const fetchBillingData = async () => {
      if (!currentUserId) return;
      
      try {
        // 1. Fetch Active Booking
        const bq = query(
          collection(db, "bookings"),
          where("guestId", "==", currentUserId),
          where("status", "in", ["confirmed", "checked_in"])
        );
        const bSnap = await getDocs(bq);
        let bookingData = null;
        if (!bSnap.empty) {
          bookingData = { id: bSnap.docs[0].id, ...bSnap.docs[0].data() };
          setActiveBooking(bookingData);
        }

        // 2. Fetch Receipts (Dining)
        const rq = query(
          collection(db, "receipts"), 
          where("guestId", "==", currentUserId)
        );
        const rSnap = await getDocs(rq);
        const rData = rSnap.docs.map(doc => ({ 
          id: doc.id, 
          type: 'dining',
          ...doc.data() 
        }));

        // 3. Fetch Incidental Charges (Spa, Tours, etc.)
        let iData: any[] = [];
        if (bookingData) {
          const iq = query(
            collection(db, "incidental_charges"),
            where("bookingId", "==", bookingData.id)
          );
          const iSnap = await getDocs(iq);
          iData = iSnap.docs.map(doc => ({
            id: doc.id,
            type: 'incidental',
            ...doc.data()
          }));
        }

        // Combine and Sort
        const combined = [...rData, ...iData];
        setReceipts(combined.sort((a, b) => {
          const timeA = a.createdAt?.seconds || new Date(a.date || 0).getTime() / 1000 || 0;
          const timeB = b.createdAt?.seconds || new Date(b.date || 0).getTime() / 1000 || 0;
          return timeB - timeA;
        }));
      } catch (error) {
        console.error("Error fetching billing data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchBillingData();
  }, [currentUserId]);


  // Calculate Unpaid Incidentals for online payment
  const unpaidIncidentals = receipts.filter(r => {
    const lastPaidAt = activeBooking?.lastPaidAt;
    const chargeTime = (r.createdAt?.seconds * 1000) || new Date(r.date || 0).getTime() || 0;
    return !lastPaidAt || chargeTime > new Date(lastPaidAt).getTime();
  });
  
  const unpaidIncidentalsTotal = unpaidIncidentals.reduce((sum, item) => sum + (item.price || item.amount || item.totalAmount || 0), 0);

  const totalBill = activeBooking ? (activeBooking.balanceDue || 0) : 0;
  // Guest online payment should ONLY be for unpaid activities/incidentals
  const amountToPay = unpaidIncidentalsTotal > 0 ? unpaidIncidentalsTotal : 0;

  // Paystack config
  const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || 'pk_test_placeholder_key_please_replace';
  
  const config = {
    reference: `bill_${new Date().getTime()}`,
    email: currentUser?.email || 'guest@example.com',
    amount: Math.round(amountToPay * 100), // ZAR to cents
    publicKey: PAYSTACK_PUBLIC_KEY,
    currency: 'ZAR',
  };

  const initializePayment = usePaystackPayment(config);

  const handlePaystackSuccess = async () => {
    document.body.style.pointerEvents = 'auto'; // ensure clickability
    setPaymentSuccess(true);
    setIsProcessingPayment(false);
    
    // Update DB
    if (activeBooking) {
      try {
        const { doc, updateDoc } = await import('firebase/firestore');
        const paidTimestamp = new Date().toISOString();
        const bookingRef = doc(db, 'bookings', activeBooking.id);
        await updateDoc(bookingRef, {
          balanceDue: 0,
          paymentStatus: 'paid',
          lastPaidAt: paidTimestamp
        });
        // Update local state so UI reflects immediately
        setActiveBooking({ ...activeBooking, balanceDue: 0, paymentStatus: 'paid', lastPaidAt: paidTimestamp });
      } catch (err) {
        console.error("Error updating payment status:", err);
      }
    }
  };

  const handlePaystackClose = () => {
    document.body.style.pointerEvents = 'auto'; // ensure clickability
    setIsProcessingPayment(false);
  };

  const handlePaymentClick = () => {
    if (PAYSTACK_PUBLIC_KEY.includes('placeholder')) {
      alert("Please configure your VITE_PAYSTACK_PUBLIC_KEY in the .env file to test actual payments.");
    }
    setIsProcessingPayment(true);
    document.body.style.pointerEvents = 'auto';
    initializePayment({ onSuccess: handlePaystackSuccess, onClose: handlePaystackClose });
  };

  const handleDownloadInvoice = async () => {
    if (!currentUserId) return;
    setIsGeneratingInvoice(true);
    try {
      const charges = await fetchAllGuestCharges(currentUserId);
      const lineItems: Array<{ name: string; quantity: number; price: number; subtotal: number }> = [];

      // Room bookings
      charges.bookings.forEach((b: any) => {
        lineItems.push({ name: `Room Stay: ${b.roomName || 'Room ' + b.roomNumber}`, quantity: 1, price: b.totalAmount || 0, subtotal: b.totalAmount || 0 });
      });

      // Restaurant receipts
      charges.receipts.forEach((r: any) => {
        (r.items || []).forEach((item: any) => {
          lineItems.push({ name: `Dining: ${item.name}`, quantity: item.quantity || 1, price: item.price || 0, subtotal: (item.price || 0) * (item.quantity || 1) });
        });
      });

      // Spa bookings
      charges.spaBookings.forEach((s: any) => {
        lineItems.push({ name: `Spa: ${s.treatmentName || 'Treatment'}`, quantity: 1, price: s.price || 0, subtotal: s.price || 0 });
      });

      // Tour bookings
      charges.tourBookings.forEach((t: any) => {
        lineItems.push({ name: `Tour: ${t.tourName || 'Excursion'}`, quantity: 1, price: t.totalAmount || 0, subtotal: t.totalAmount || 0 });
      });

      const grandTotal = lineItems.reduce((sum, item) => sum + item.subtotal, 0);
      const tax = grandTotal * 0.15;

      const html = getProfessionalPDFHTML({
        title: 'CONSOLIDATED CHECKOUT INVOICE',
        guestName: currentUser?.name || 'Guest',
        details: [
          { label: 'Guest Name', value: currentUser?.name || 'N/A' },
          { label: 'Room Number', value: currentUser?.roomNumber || 'N/A' },
          { label: 'Invoice Date', value: new Date().toLocaleDateString() },
          { label: 'Status', value: paymentSuccess ? 'PAID' : 'Outstanding' },
        ],
        items: lineItems,
        subtotal: grandTotal,
        tax,
        total: grandTotal + tax,
        footer: 'Thank you for staying at Azure Horizon Resort. We look forward to welcoming you back!',
      });

      await generatePDFFromHTML(html, `AzureHorizon_Invoice_${currentUser?.roomNumber || 'Guest'}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Error generating invoice:', error);
    } finally {
      setIsGeneratingInvoice(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#1e3a5f] mb-4" />
        <p className="text-gray-500 italic">Retrieving your room account...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* BACK BUTTON (Fixed the 'onBack' unused error) */}
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={onBack}
        className="text-gray-500 hover:text-[#1e3a5f]"
      >
        <ChevronLeft className="h-4 w-4 mr-1" /> Return to Overview
      </Button>

      {/* TOTAL BALANCE HEADER */}
      <Card className="bg-gradient-to-br from-[#1e3a5f] to-[#2c5282] text-white border-none shadow-xl">
        <CardContent className="p-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <div className="mb-4">
                <p className="text-white/60 text-xs uppercase tracking-[0.2em] mb-1">Total Room Balance</p>
                <h2 className="text-3xl font-bold font-mono opacity-80">R {totalBill.toLocaleString()}</h2>
                <span className="text-white/60 text-xs italic">Includes room rate & activities (payable at front desk checkout)</span>
              </div>
              
              <div className="pt-4 border-t border-white/20">
                <p className="text-[#c9a227] text-xs uppercase tracking-[0.2em] mb-1 font-semibold">Unpaid Activities & Incidentals</p>
                <h2 className="text-5xl font-bold font-mono text-[#c9a227]">R {unpaidIncidentalsTotal.toLocaleString()}</h2>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <div className="p-4 bg-white/10 rounded-2xl backdrop-blur-md border border-white/10 self-end hidden md:flex">
                <CreditCard className="h-10 w-10 text-[#c9a227]" />
              </div>
              
              {!paymentSuccess && amountToPay > 0 && (
                <Button 
                  onClick={handlePaymentClick}
                  disabled={isProcessingPayment}
                  className="bg-green-500 hover:bg-green-600 text-white font-bold py-6 px-8 rounded-xl shadow-lg mt-2 w-full md:w-auto"
                >
                  {isProcessingPayment ? (
                    <Loader2 className="animate-spin h-5 w-5 mr-2" />
                  ) : (
                    <Lock className="h-5 w-5 mr-2" />
                  )}
                  Pay Activities (R {amountToPay.toLocaleString()})
                </Button>
              )}
              
              {paymentSuccess && (
                <Badge className="bg-green-500 text-white border-none py-2 px-4 text-center justify-center">
                  Payment Completed
                </Badge>
              )}

              <Button
                onClick={handleDownloadInvoice}
                disabled={isGeneratingInvoice}
                className="bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold py-3 px-6 rounded-xl shadow mt-2 w-full md:w-auto"
              >
                {isGeneratingInvoice ? (
                  <Loader2 className="animate-spin h-5 w-5 mr-2" />
                ) : (
                  <FileDown className="h-5 w-5 mr-2" />
                )}
                Download Checkout Invoice
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* TRANSACTION LIST */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="font-bold text-[#1e3a5f] flex items-center gap-2">
            <ReceiptText className="h-5 w-5" /> Transaction History
          </h3>
          <span className="text-xs text-gray-400 font-medium">{receipts.length} slips recorded</span>
        </div>

        {receipts.length === 0 ? (
          <Card className="border-dashed border-2 border-gray-200 bg-gray-50/50">
            <CardContent className="p-12 text-center">
              <ReceiptText className="h-12 w-12 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-400 italic">No charges have been posted to your room yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-8">
            {receipts.map((receipt) => {
              // Determine paid status based on lastPaidAt timestamp
              const lastPaidAt = activeBooking?.lastPaidAt;
              const chargeTime = receipt.createdAt?.seconds
                ? receipt.createdAt.seconds * 1000
                : new Date(receipt.date || receipt.createdAt || 0).getTime();
              const isPaid = lastPaidAt && chargeTime <= new Date(lastPaidAt).getTime();

              if (receipt.type === 'incidental') {
                return (
                  <Card key={receipt.id} className={`border-none shadow-md ${isPaid ? 'opacity-75' : ''}`}>
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className="bg-purple-100 text-purple-800 border-none">Room Charge</Badge>
                            {isPaid ? (
                              <Badge className="bg-green-100 text-green-700 border-none">✓ Paid</Badge>
                            ) : (
                              <Badge className="bg-orange-100 text-orange-700 border-none">Unpaid</Badge>
                            )}
                          </div>
                          <h4 className="font-bold text-[#1e3a5f] text-lg">{receipt.description}</h4>
                          <p className="text-sm text-gray-500 mt-1">{new Date(receipt.date).toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <p className={`font-bold text-xl ${isPaid ? 'text-gray-400 line-through' : 'text-[#1e3a5f]'}`}>R {receipt.amount}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              }
              return (
                <div key={receipt.id} className="relative">
                  {isPaid && (
                    <div className="absolute top-3 right-3 z-10">
                      <Badge className="bg-green-100 text-green-700 border-none">✓ Paid</Badge>
                    </div>
                  )}
                  {!isPaid && (
                    <div className="absolute top-3 right-3 z-10">
                      <Badge className="bg-orange-100 text-orange-700 border-none">Unpaid</Badge>
                    </div>
                  )}
                  <DigitalReceipt key={receipt.id} data={receipt} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="pt-12 pb-20 text-center">
        <p className="text-[10px] text-gray-400 italic max-w-sm mx-auto leading-relaxed">
          Final settlement is required upon check-out. Digital slips are for informational purposes. 
          Standard resort service fees applied where applicable.
        </p>
      </div>
    </div>
  );
}