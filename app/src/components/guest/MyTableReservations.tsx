import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/services/firebase-services';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar, Users, MapPin, XCircle, Download, Loader2, ChevronLeft } from 'lucide-react';
import type { User as CustomUser } from '@/types';

interface TableReservation {
  id: string;
  guestId: string;
  guestName: string;
  date: string;
  time: string;
  partySize: number;
  tableNumber: number;
  tableType: string;
  location: string;
  specialRequests?: string;
  status: 'confirmed' | 'cancelled' | 'completed' | 'seated';
  createdAt: string;
}

interface MyTableReservationsProps {
  onBack: () => void;
}

type AuthUserBridge = CustomUser & { uid?: string };

export function MyTableReservations({ onBack }: MyTableReservationsProps) {
  const { user } = useAuth();
  const [reservations, setReservations] = useState<TableReservation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<TableReservation | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const currentUser = user as AuthUserBridge;
  const currentUserId = currentUser?.id || currentUser?.uid;

  useEffect(() => {
    const fetchReservations = async () => {
      if (!currentUserId) {
        setIsLoading(false);
        return;
      }

      try {
        const reservationsRef = collection(db, 'table_reservations');
        const q = query(reservationsRef, where('guestId', '==', currentUserId));
        const snapshot = await getDocs(q);
        
        const allReservations = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as TableReservation[];
        
        // Sort by date (upcoming first)
        allReservations.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setReservations(allReservations);
      } catch (error) {
        console.error("Error fetching table reservations:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchReservations();
  }, [currentUserId]);

  const handleCancelReservation = async () => {
    if (!selectedReservation) return;
    setIsProcessing(true);
    
    try {
      const reservationRef = doc(db, 'table_reservations', selectedReservation.id);
      await updateDoc(reservationRef, { status: 'cancelled' });
      
      setReservations(prev => prev.map(r => 
        r.id === selectedReservation.id ? { ...r, status: 'cancelled' } : r
      ));
      
      setShowCancelModal(false);
      setSelectedReservation(null);
      alert("Table reservation cancelled successfully.");
    } catch (error) {
      console.error("Cancel failed:", error);
      alert("Failed to cancel reservation. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadReservationPDF = (reservation: TableReservation) => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Table Reservation - ${reservation.id}</title>
            <style>
              body { font-family: 'Courier New', monospace; padding: 40px; max-width: 800px; margin: 0 auto; }
              .header { text-align: center; border-bottom: 2px solid #c9a227; padding-bottom: 20px; margin-bottom: 30px; }
              .hotel-name { font-size: 24px; font-weight: bold; color: #1e3a5f; }
              .receipt-title { font-size: 18px; margin-top: 10px; }
              .details { margin-bottom: 30px; }
              .footer { text-align: center; margin-top: 50px; font-size: 12px; color: #666; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="hotel-name">Azure Horizon Resort</div>
              <div class="receipt-title">TABLE RESERVATION CONFIRMATION</div>
            </div>
            <div class="details">
              <p><strong>Reservation ID:</strong> ${reservation.id.slice(-8).toUpperCase()}</p>
              <p><strong>Booked On:</strong> ${new Date(reservation.createdAt).toLocaleString()}</p>
              <p><strong>Guest:</strong> ${reservation.guestName}</p>
              <p><strong>Date:</strong> ${new Date(reservation.date).toLocaleDateString()}</p>
              <p><strong>Time:</strong> ${reservation.time}</p>
              <p><strong>Party Size:</strong> ${reservation.partySize} guests</p>
              <p><strong>Table:</strong> #${reservation.tableNumber} (${reservation.tableType})</p>
              <p><strong>Location:</strong> ${reservation.location}</p>
              ${reservation.specialRequests ? `<p><strong>Special Requests:</strong> ${reservation.specialRequests}</p>` : ''}
              <p><strong>Status:</strong> ${reservation.status.toUpperCase()}</p>
            </div>
            <div class="footer">
              <p>Please arrive on time for your reservation.</p>
              <p>Show this confirmation to the host upon arrival.</p>
            </div>
          </body>
        </html>
      `);
      printWindow.print();
      printWindow.close();
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <Badge className="bg-blue-100 text-blue-800">Confirmed</Badge>;
      case 'seated':
        return <Badge className="bg-green-100 text-green-800">Seated</Badge>;
      case 'completed':
        return <Badge className="bg-gray-100 text-gray-800">Completed</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-800">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTableTypeLabel = (type: string) => {
    switch (type) {
      case 'small': return '2-Seater';
      case 'medium': return '4-Seater';
      case 'large': return '6-Seater';
      case 'xl': return '8-Seater';
      case 'vip': return 'VIP Table';
      default: return 'Standard Table';
    }
  };

  const activeReservations = reservations.filter(r => 
    r.status === 'confirmed' && new Date(r.date) >= new Date()
  );
  
  const pastReservations = reservations.filter(r => 
    r.status !== 'confirmed' || new Date(r.date) < new Date()
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#1e3a5f]" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button variant="ghost" onClick={onBack} className="mb-4">
        <ChevronLeft className="mr-2 h-4 w-4" /> Back to Dashboard
      </Button>

      <div>
        <h2 className="text-2xl font-serif font-bold text-[#1e3a5f]">My Table Reservations</h2>
        <p className="text-gray-600 text-sm">View and manage your restaurant table bookings</p>
      </div>

      {reservations.length === 0 ? (
        <Card className="bg-gray-50 border-dashed border-2">
          <CardContent className="p-12 text-center text-gray-400">
            <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>You don't have any table reservations yet.</p>
            <Button variant="link" onClick={onBack} className="mt-2">
              Go to Restaurant to Book a Table
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {activeReservations.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-[#1e3a5f]">Active Reservations</h3>
              {activeReservations.map(res => (
                <Card key={res.id} className="border-l-4 border-l-[#c9a227]">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          {getStatusBadge(res.status)}
                          <span className="text-xs text-gray-400">Table #{res.tableNumber}</span>
                        </div>
                        <h3 className="font-semibold">{res.guestName}</h3>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">{res.time}</p>
                        <p className="text-xs text-gray-500">{new Date(res.date).toLocaleDateString()}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-3">
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        <span>{res.partySize} guests</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        <span>{res.location}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs">{getTableTypeLabel(res.tableType)}</span>
                      </div>
                    </div>

                    {res.specialRequests && (
                      <p className="text-xs text-gray-400 italic mb-3">"{res.specialRequests}"</p>
                    )}

                    <div className="flex gap-2 mt-2">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => downloadReservationPDF(res)}>
                        <Download className="h-3 w-3 mr-1" />
                        PDF Confirmation
                      </Button>
                      <Button size="sm" variant="destructive" className="flex-1" onClick={() => {
                        setSelectedReservation(res);
                        setShowCancelModal(true);
                      }}>
                        <XCircle className="h-3 w-3 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {pastReservations.length > 0 && (
            <div className="space-y-3 mt-6">
              <h3 className="font-semibold text-gray-500">Past Reservations</h3>
              {pastReservations.map(res => (
                <Card key={res.id} className="border-l-4 border-l-gray-300 opacity-75">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          {getStatusBadge(res.status)}
                          <span className="text-xs text-gray-400">Table #{res.tableNumber}</span>
                        </div>
                        <h3 className="font-semibold">{res.guestName}</h3>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">{res.time}</p>
                        <p className="text-xs text-gray-500">{new Date(res.date).toLocaleDateString()}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-3">
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        <span>{res.partySize} guests</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        <span>{res.location}</span>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-2">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => downloadReservationPDF(res)}>
                        <Download className="h-3 w-3 mr-1" />
                        PDF Confirmation
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Cancel Confirmation Modal */}
      <Dialog open={showCancelModal} onOpenChange={setShowCancelModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Table Reservation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p>Are you sure you want to cancel your table reservation for <strong>{selectedReservation?.date}</strong> at <strong>{selectedReservation?.time}</strong>?</p>
            <div className="flex gap-3 pt-4">
              <Button variant="outline" className="flex-1" onClick={() => setShowCancelModal(false)}>
                Keep Reservation
              </Button>
              <Button variant="destructive" className="flex-1" onClick={handleCancelReservation} disabled={isProcessing}>
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes, Cancel"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}