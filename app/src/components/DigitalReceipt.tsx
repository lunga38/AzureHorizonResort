import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Printer } from 'lucide-react';
import { generatePDF } from '../utils/pdfGenerator';
import { useRef } from 'react';

// Define strict interfaces to satisfy ESLint
interface ReceiptItem {
  name: string;
  price: number;
  quantity?: number;
}

interface ReceiptData {
  id?: string;
  totalAmount: number;
  items: ReceiptItem[];
  createdAt?: {
    seconds: number;
    nanoseconds: number;
  };
  status?: string;
}

interface DigitalReceiptProps {
  data: ReceiptData;
}

export function DigitalReceipt({ data }: DigitalReceiptProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  const downloadPDF = async () => {
    if (contentRef.current) {
      await generatePDF(contentRef.current, `Receipt_${data.id?.slice(-8) || 'order'}.pdf`);
    }
  };

  // Handle Firestore Timestamp to String conversion safely
  const date = data.createdAt?.seconds 
    ? new Date(data.createdAt.seconds * 1000).toLocaleDateString() 
    : new Date().toLocaleDateString();

  return (
    <>
      <div ref={contentRef}>
        <Card className="w-full max-w-md mx-auto bg-white shadow-md border-dashed border-2 border-gray-200 relative overflow-hidden animate-in zoom-in-95 duration-300">
          {/* Aesthetic "Punch Hole" effect for the receipt look */}
          <div className="absolute top-1/2 -left-3 w-6 h-6 bg-gray-100 rounded-full border-r-2 border-gray-200 transform -translate-y-1/2" />
          <div className="absolute top-1/2 -right-3 w-6 h-6 bg-gray-100 rounded-full border-l-2 border-gray-200 transform -translate-y-1/2" />

          <CardHeader className="text-center pb-2 pt-6">
            <CardTitle className="text-xl font-serif italic text-[#1e3a5f]">Azure Horizon Resort</CardTitle>
            <p className="text-[10px] uppercase tracking-widest text-gray-400">Order Confirmation Slip</p>
          </CardHeader>

          <CardContent className="space-y-4 px-8 pb-8">
            <div className="flex justify-between text-[10px] font-mono text-gray-500">
              <span>DATE: {date}</span>
              <span>REF: {data.id?.toUpperCase().slice(0, 8) || 'PENDING'}</span>
            </div>
            
            <Separator className="bg-gray-100" />

            <div className="space-y-3 py-2">
              {data.items?.map((item: ReceiptItem, i: number) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-700">
                    {item.name} 
                    <span className="text-gray-400 ml-1">x{item.quantity || 1}</span>
                  </span>
                  <span className="font-semibold text-[#1e3a5f]">R {item.price}</span>
                </div>
              ))}
            </div>

            <Separator className="bg-gray-100" />

            <div className="flex justify-between items-center py-2">
              <span className="font-bold text-[#1e3a5f]">TOTAL AMOUNT</span>
              <span className="font-bold text-xl text-[#1e3a5f]">R {data.totalAmount}</span>
            </div>

            <div className="bg-green-50 rounded-lg p-3 flex items-center justify-between border border-green-100">
              <span className="text-[10px] font-bold text-green-700 uppercase tracking-tighter">Payment Status</span>
              <Badge className="bg-green-600 text-[10px] h-5 hover:bg-green-600 border-none">
                {data.status === 'charged_to_room' ? 'CHARGED TO ROOM' : 'VERIFIED'}
              </Badge>
            </div>

            <p className="text-[9px] text-center text-gray-400 italic pt-2">
              Thank you for choosing Azure Horizon. Your order is being processed.
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* Download Button outside the printable content */}
      <div className="mt-4 flex justify-center">
        <button 
          onClick={downloadPDF}
          className="bg-[#1e3a5f] hover:bg-[#2c5282] text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
        >
          <Printer className="h-4 w-4" />
          Download Receipt PDF
        </button>
      </div>
    </>
  );
}