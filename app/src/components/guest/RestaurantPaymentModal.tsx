import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertModal } from '@/components/ui/AlertModal';
import { CreditCard, Lock } from 'lucide-react';
import { usePaystackPayment } from 'react-paystack';
import { useAuth } from '@/hooks/useAuth';
import { awardLoyaltyPoints } from '@/services/firebase-services';
import type { User as AppUser } from '@/types';

interface RestaurantPaymentModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  amount: number;
  orderType: string;
  bookingId?: string;
}

const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || 'pk_test_placeholder_key_please_replace';

export function RestaurantPaymentModal({ open, onClose, onSuccess, amount, orderType, bookingId }: RestaurantPaymentModalProps) {
  const { user } = useAuth();
  const [alertModal, setAlertModal] = useState({
    open: false,
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'info' | 'warning'
  });

  const config = {
    reference: `REST-${new Date().getTime().toString()}`,
    email: user?.email || 'guest@azurehorizon.com',
    amount: Math.round(amount * 100),
    publicKey: PAYSTACK_PUBLIC_KEY,
    currency: 'ZAR',
  };

  const initializePayment = usePaystackPayment(config);

    const handlePaystackSuccess = () => {
    document.body.style.pointerEvents = '';
    // Award loyalty points
    const u = user as AppUser & { uid?: string };
    const guestId = u?.id || (u as any)?.uid || '';
    const guestEmail = u?.email || '';
    const pts = Math.floor(amount / 10);
    if (pts > 0) awardLoyaltyPoints(guestId, guestEmail, pts, `Dining: ${orderType} order`);

    setAlertModal({
      open: true,
      title: "Payment Successful!",
      message: `Your ${orderType} order has been paid. Total: R ${amount.toFixed(2)}${pts > 0 ? ` (+${pts} loyalty points)` : ''}`,
      type: "success"
    });
    
    setTimeout(() => {
      onSuccess();
    }, 1500);
  };

  const handlePaystackClose = () => {
    document.body.style.pointerEvents = '';
    console.log('Restaurant payment modal closed');
  };

  const handlePaymentClick = () => {
    if (PAYSTACK_PUBLIC_KEY.includes('placeholder')) {
      alert("Please configure your VITE_PAYSTACK_PUBLIC_KEY in the .env file to test actual payments.");
    }
    // Fix for Radix UI Dialog blocking pointer events on the body, which makes the Paystack iframe unclickable
    document.body.style.pointerEvents = 'auto';
    
    initializePayment({ onSuccess: handlePaystackSuccess, onClose: handlePaystackClose });
  };

  const handleChargeToRoom = async () => {
    const u = user as AppUser & { uid?: string };
    const guestId = u?.id || (u as any)?.uid || '';
    
    if (!bookingId) {
      setAlertModal({
        open: true,
        title: "Error",
        message: "No active room booking found to charge to.",
        type: "error"
      });
      return;
    }

    try {
      // Import addRoomCharge dynamically or rely on auto-import (assuming it's in firebase-services)
      const { addRoomCharge } = await import('@/services/firebase-services');
      const result = await addRoomCharge(bookingId, guestId, `Dining: ${orderType} order`, amount);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      // Award loyalty points
      const guestEmail = u?.email || '';
      const pts = Math.floor(amount / 10);
      if (pts > 0) awardLoyaltyPoints(guestId, guestEmail, pts, `Dining: ${orderType} (room charge)`);

      setAlertModal({
        open: true,
        title: "Added to Room Bill",
        message: `Your ${orderType} order of R ${amount.toFixed(2)} has been successfully charged to your room.${pts > 0 ? ` (+${pts} loyalty points)` : ''}`,
        type: "success"
      });
      
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (error) {
      setAlertModal({
        open: true,
        title: "Charge Failed",
        message: "Failed to add charge to your room bill. Please try another payment method.",
        type: "error"
      });
    }
  };

  return (
    <>
      <AlertModal
        open={alertModal.open}
        onClose={() => setAlertModal(prev => ({ ...prev, open: false }))}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-2 text-xl pb-2 border-b">
              <Lock className="h-5 w-5 text-green-600" />
              Secure Payment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="bg-gray-50 p-6 rounded-lg text-center shadow-inner">
              <p className="text-sm text-gray-500 uppercase tracking-wider font-semibold mb-1">Amount to Pay</p>
              <p className="text-4xl font-bold text-[#1e3a5f] mb-2">R {amount.toFixed(2)}</p>
              <div className="inline-block px-3 py-1 bg-[#1e3a5f]/10 text-[#1e3a5f] text-xs rounded-full font-medium">
                {orderType === 'dine_in' ? 'Dine In' : 'Takeaway'} Order
              </div>
            </div>
            
            <p className="text-sm text-center text-gray-500 px-4">
              Choose your payment method below.
            </p>
            
            <div className="space-y-3">
              <Button 
                className="w-full bg-green-600 hover:bg-green-700 h-12 text-lg font-medium"
                onClick={handlePaymentClick}
              >
                <CreditCard className="mr-2 h-5 w-5" />
                Pay Now
              </Button>
              
              {user?.status === 'resident' && (
                <>
                  <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-gray-200" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white px-2 text-gray-500">Or</span>
                    </div>
                  </div>
                  <Button 
                    variant="outline"
                    className="w-full border-[#1e3a5f] text-[#1e3a5f] hover:bg-blue-50 h-12 text-lg font-medium"
                    onClick={handleChargeToRoom}
                  >
                    Charge to Room Bill
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}