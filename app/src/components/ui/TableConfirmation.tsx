import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Calendar, Clock, Users, MapPin, CheckCircle2, Printer } from 'lucide-react';
import { generatePDFFromHTML, getProfessionalPDFHTML } from '../../utils/pdfGenerator';
import { useRef } from 'react';

interface TableConfirmationProps {
  reservationId: string;
  guestName: string;
  date: string;
  time: string;
  partySize: number;
  tableNumber: number;
  tableType: string;
  location: string;
  specialRequests?: string;
  createdAt: Date;
  onPrint?: () => void;
}

const getTableTypeLabel = (type: string): string => {
  switch (type) {
    case 'small': return '2-Seater';
    case 'medium': return '4-Seater';
    case 'large': return '6-Seater';
    case 'xl': return '8-Seater';
    case 'vip': return 'VIP Table';
    default: return 'Standard Table';
  }
};

export function TableConfirmation({ 
  reservationId, 
  guestName, 
  date, 
  time, 
  partySize, 
  tableNumber, 
  tableType, 
  location, 
  specialRequests,
  createdAt,
  onPrint
}: TableConfirmationProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  const downloadPDF = async () => {
    const details = [
      { label: 'Reservation ID', value: reservationId.slice(-8).toUpperCase() },
      { label: 'Guest Name', value: guestName },
      { label: 'Date', value: new Date(date).toLocaleDateString() },
      { label: 'Time', value: time },
      { label: 'Party Size', value: `${partySize} ${partySize === 1 ? 'Guest' : 'Guests'}` },
      { label: 'Table Number', value: `#${tableNumber}` },
      { label: 'Table Type', value: getTableTypeLabel(tableType) },
      { label: 'Location', value: location }
    ];
    
    const html = getProfessionalPDFHTML({
      title: 'TABLE RESERVATION CONFIRMATION',
      guestName: guestName,
      details: details,
      total: 0,
      footer: specialRequests ? `Special Requests: ${specialRequests}` : 'Please arrive on time for your reservation.'
    });
    
    await generatePDFFromHTML(html, `Table_Reservation_${reservationId.slice(-8)}.pdf`);
  };

  return (
    <>
      <div ref={contentRef} className="w-full max-w-md mx-auto bg-white shadow-xl border-0 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#c9a227] via-[#1e3a5f] to-[#c9a227]" />
        
        <CardHeader className="text-center pb-2 pt-6">
          <div className="flex justify-between items-start">
            <div className="w-8" />
            <div>
              <div className="flex justify-center mb-2">
                <div className="w-12 h-12 bg-[#c9a227]/10 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-[#c9a227]" />
                </div>
              </div>
              <CardTitle className="text-xl font-serif font-bold text-[#1e3a5f]">Table Confirmation</CardTitle>
              <p className="text-xs text-gray-500 mt-1">Azure Horizon Resort</p>
            </div>
            {onPrint && (
              <button 
                onClick={onPrint} 
                className="text-gray-400 hover:text-[#c9a227] transition-colors"
                title="Print confirmation"
              >
                <Printer className="h-4 w-4" />
              </button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4 px-6 pb-6">
          <div className="flex justify-center">
            <div className="bg-green-50 text-green-700 text-xs font-semibold px-3 py-1 rounded-full border border-green-200">
              ✓ RESERVATION CONFIRMED
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Reservation ID</span>
              <span className="font-mono font-bold text-gray-800">{reservationId.slice(-8).toUpperCase()}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Guest Name</span>
              <span className="font-medium text-gray-800">{guestName}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Booked On</span>
              <span className="text-gray-800">{createdAt.toLocaleString()}</span>
            </div>
          </div>

          <Separator className="border-dashed" />

          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center">
                <Calendar className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Date</p>
                <p className="font-medium text-gray-800">{new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center">
                <Clock className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Time</p>
                <p className="font-medium text-gray-800">{time}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center">
                <Users className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Party Size</p>
                <p className="font-medium text-gray-800">{partySize} {partySize === 1 ? 'Guest' : 'Guests'}</p>
              </div>
            </div>
          </div>

          <Separator className="border-dashed" />

          <div className="bg-gradient-to-r from-[#1e3a5f] to-[#2c5282] rounded-lg p-4 text-white">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-semibold opacity-80">Table Assignment</span>
              <span className="text-xl font-bold">#{tableNumber}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>{getTableTypeLabel(tableType)}</span>
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {location}</span>
            </div>
          </div>

          {specialRequests && (
            <>
              <Separator className="border-dashed" />
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-600 mb-1">Special Requests</p>
                <p className="text-sm text-gray-700 italic">"{specialRequests}"</p>
              </div>
            </>
          )}

          <div className="bg-green-50 rounded-lg p-3 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <p className="text-xs text-green-700">Your table is confirmed. Please arrive on time.</p>
          </div>

          <p className="text-[10px] text-center text-gray-400 pt-2">
            Please show this confirmation to the host upon arrival.
          </p>
        </CardContent>
      </div>
      
      {/* Download Button outside the printable content */}
      <div className="mt-4 flex justify-center">
        <button 
          onClick={downloadPDF}
          className="bg-[#1e3a5f] hover:bg-[#2c5282] text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
          title="Download PDF confirmation"
        >
          <Printer className="h-4 w-4" />
          Download PDF Confirmation
        </button>
      </div>
    </>
  );
}