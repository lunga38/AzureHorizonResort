import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Clock, CheckCircle2, Package, Printer } from 'lucide-react';
import { generatePDFFromHTML, getProfessionalPDFHTML } from '../../utils/pdfGenerator';
import { useRef } from 'react';

interface OrderItem {
  name: string;
  price: number;
  quantity: number;
}

interface OrderConfirmationProps {
  orderId: string;
  guestName: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  totalAmount: number;
  estimatedWaitTime?: number;
  createdAt: Date;
  onPrint?: () => void;
}

export function OrderConfirmation({ 
  orderId, 
  guestName, 
  items, 
  subtotal, 
  tax, 
  totalAmount, 
  estimatedWaitTime = 30,
  createdAt,
  onPrint
}: OrderConfirmationProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  const downloadPDF = async () => {
    const details = [
      { label: 'Order Number', value: orderId.slice(-8).toUpperCase() },
      { label: 'Guest Name', value: guestName },
      { label: 'Order Time', value: createdAt.toLocaleTimeString() },
      { label: 'Date', value: createdAt.toLocaleDateString() },
      { label: 'Status', value: 'CONFIRMED' }
    ];
    
    const itemsList = items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      subtotal: item.price * item.quantity
    }));
    
    const html = getProfessionalPDFHTML({
      title: 'ORDER CONFIRMATION',
      guestName: guestName,
      details: details,
      items: itemsList,
      subtotal: subtotal,
      tax: tax,
      total: totalAmount,
      footer: `Estimated wait time: ${estimatedWaitTime} minutes. Please present this confirmation when collecting your order.`
    });
    
    await generatePDFFromHTML(html, `Order_Confirmation_${orderId.slice(-8)}.pdf`);
  };

  return (
    <>
      <div ref={contentRef} className="w-full max-w-md mx-auto bg-white shadow-xl border-0 relative overflow-hidden">
        {/* Decorative header bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#1e3a5f] via-[#c9a227] to-[#1e3a5f]" />
        
        <CardHeader className="text-center pb-2 pt-6">
          <div className="flex justify-between items-start">
            <div className="w-8" />
            <div>
              <div className="flex justify-center mb-2">
                <div className="w-12 h-12 bg-[#1e3a5f]/10 rounded-full flex items-center justify-center">
                  <Package className="h-6 w-6 text-[#1e3a5f]" />
                </div>
              </div>
              <CardTitle className="text-xl font-serif font-bold text-[#1e3a5f]">Order Confirmation</CardTitle>
              <p className="text-xs text-gray-500 mt-1">Azure Horizon Resort</p>
            </div>
            {onPrint && (
              <button 
                onClick={onPrint} 
                className="text-gray-400 hover:text-[#1e3a5f] transition-colors"
                title="Print receipt"
              >
                <Printer className="h-4 w-4" />
              </button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4 px-6 pb-6">
          {/* Status Badge */}
          <div className="flex justify-center">
            <div className="bg-green-50 text-green-700 text-xs font-semibold px-3 py-1 rounded-full border border-green-200">
              ✓ CONFIRMED
            </div>
          </div>

          {/* Order Details */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Order Number</span>
              <span className="font-mono font-bold text-gray-800">{orderId.slice(-8).toUpperCase()}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Guest Name</span>
              <span className="font-medium text-gray-800">{guestName}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Order Time</span>
              <span className="text-gray-800">{createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Date</span>
              <span className="text-gray-800">{createdAt.toLocaleDateString()}</span>
            </div>
          </div>

          <Separator className="border-dashed" />

          {/* Items */}
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase text-gray-400 tracking-wider">Items Ordered</p>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm border-b border-gray-100 pb-2">
                  <span className="text-gray-700">{item.quantity}x {item.name}</span>
                  <span className="font-medium text-gray-800">R {item.price * item.quantity}</span>
                </div>
              ))}
            </div>
          </div>

          <Separator className="border-dashed" />

          {/* Totals */}
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span className="text-gray-700">R {subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Tax (10%)</span>
              <span className="text-gray-700">R {tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold pt-1 border-t border-gray-200">
              <span className="text-[#1e3a5f]">TOTAL</span>
              <span className="text-[#1e3a5f]">R {totalAmount.toFixed(2)}</span>
            </div>
          </div>

          {/* Estimated Time */}
          <div className="bg-blue-50 rounded-lg p-3 flex items-center gap-3">
            <Clock className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-xs font-semibold text-blue-800">Estimated Ready Time</p>
              <p className="text-sm font-bold text-blue-900">{estimatedWaitTime} minutes</p>
            </div>
          </div>

          <div className="bg-green-50 rounded-lg p-3 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <p className="text-xs text-green-700">Your order has been confirmed and is being prepared.</p>
          </div>

          <p className="text-[10px] text-center text-gray-400 pt-2">
            Please present this confirmation when collecting your order.
          </p>
        </CardContent>
      </div>
      
      {/* Download Button outside the printable content */}
      <div className="mt-4 flex justify-center">
        <button 
          onClick={downloadPDF}
          className="bg-[#1e3a5f] hover:bg-[#2c5282] text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
          title="Download PDF receipt"
        >
          <Printer className="h-4 w-4" />
          Download PDF Receipt
        </button>
      </div>
    </>
  );
}