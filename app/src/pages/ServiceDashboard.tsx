import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useCentralClock } from '@/components/ui/CentralizedClock';
import { 
  listenForOrders, 
  pickupOrder, 
  deliverOrder 
} from '@/services/firebase-services';
import type { FoodOrder, User as CustomUser } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertModal } from '@/components/ui/AlertModal';
import { 
  Clock, 
  Truck, 
  Home, 
  UtensilsCrossed, 
  Car,
  Loader2, 
  Navigation,
  MapPin,
  PackageCheck,
} from 'lucide-react';

interface DeliveryTracking {
  orderId: string;
  estimatedMinutes: number;
  status: 'preparing' | 'picked_up' | 'en_route' | 'delivered';
}

export function ServiceDashboard() {
  const { user } = useAuth();
  const currentTime = useCentralClock();
  const [orders, setOrders] = useState<FoodOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [deliveryTracking, setDeliveryTracking] = useState<DeliveryTracking[]>([]);
  
  // Alert Modal state
  const [alertModal, setAlertModal] = useState({
    open: false,
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'info' | 'warning'
  });

  useEffect(() => {
    const u = user as CustomUser;
    
    console.log("ServiceDashboard mounted, user:", u?.id);
    
    if (!u?.id) {
      console.log("No user ID, setting loading to false");
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    
    const unsubscribeOrders = listenForOrders((allOrders) => {
      console.log("All orders received:", allOrders);
      console.log("Orders with status 'ready':", allOrders.filter(o => o.status === 'ready'));
      console.log("Orders with status 'ready' and no assignedTo:", allOrders.filter(o => o.status === 'ready' && !o.assignedTo));
      if (isMounted) {
        setOrders(allOrders);
        setIsLoading(false);
      }
    });

    const timeoutId = setTimeout(() => {
      if (isMounted) {
        console.log("Timeout - forcing loading to stop");
        setIsLoading(false);
      }
    }, 5000);

    return () => {
      isMounted = false;
      unsubscribeOrders();
      clearTimeout(timeoutId);
    };
  }, [user]);

  const availablePickups = orders.filter(o => o.status === 'ready' && !o.assignedTo);
  const myActiveDeliveries = orders.filter(o => 
    o.assignedTo === (user as CustomUser)?.id && o.status === 'picked_up'
  );

  const handlePickupOrder = async (e: React.MouseEvent, orderId: string) => {
    e.stopPropagation();
    if (!user) return;
    setIsProcessing(orderId);
    try {
      await pickupOrder(orderId, (user as CustomUser).id);
      setDeliveryTracking(prev => [...prev, {
        orderId,
        estimatedMinutes: Math.floor(Math.random() * 30) + 15,
        status: 'picked_up'
      }]);
    } catch (error) {
      console.error("Pickup failed:", error);
      setAlertModal({
        open: true,
        title: "Pickup Failed",
        message: "Unable to claim order. Please try again.",
        type: "error"
      });
    } finally {
      setIsProcessing(null);
    }
  };

  const handleDeliverOrder = async (e: React.MouseEvent, order: FoodOrder) => {
    e.stopPropagation();
    setIsProcessing(order.id);
    try {
      await deliverOrder(order.id);
      setAlertModal({
        open: true,
        title: "Order Delivered",
        message: `Successfully marked order as delivered to ${order.guestName}.`,
        type: "success"
      });
    } catch (error) {
      console.error("Delivery confirmation failed:", error);
      setAlertModal({
        open: true,
        title: "Delivery Failed",
        message: "Failed to complete delivery. Please try again.",
        type: "error"
      });
    } finally {
      setIsProcessing(null);
    }
  };

  const getOrderTypeIcon = (type: FoodOrder['orderType']) => {
    switch (type) {
      case 'dine_in': return <UtensilsCrossed className="h-5 w-5" />;
      case 'room_delivery': return <Home className="h-5 w-5" />;
      case 'takeaway': return <Car className="h-5 w-5" />;
      default: return <PackageCheck className="h-5 w-5" />;
    }
  };

  const getOrderTypeLabel = (type: FoodOrder['orderType']) => (type || 'dine_in').replace('_', ' ').toUpperCase();
  
  const getElapsedTime = (createdAt: string) => {
    const start = new Date(createdAt).getTime();
    const now = currentTime.getTime();
    return Math.floor((now - start) / 60000);
  };

  const getEstimatedTime = (orderId: string) => {
    const tracking = deliveryTracking.find(t => t.orderId === orderId);
    return tracking ? `${tracking.estimatedMinutes} min` : 'Calculating...';
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-[#1e3a5f] dark:text-blue-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 p-6 transition-colors duration-300">
      <AlertModal
        open={alertModal.open}
        onClose={() => setAlertModal(prev => ({ ...prev, open: false }))}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />
      
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-[#c9a227] rounded-xl shadow-lg text-white">
              <Truck className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-3xl font-serif font-bold text-[#1e3a5f] dark:text-blue-400">Service Delivery Portal</h1>
              <p className="text-gray-500 dark:text-gray-400 italic">Live Food Service Queue • Azure Horizon Resort</p>
            </div>
          </div>
          <Badge variant="outline" className="w-fit px-4 py-2 border-[#1e3a5f] text-[#1e3a5f] bg-white dark:bg-slate-900 dark:border-blue-400 dark:text-blue-400 font-bold">
            USER: {(user as CustomUser)?.name}
          </Badge>
        </div>

        <div className="grid lg:grid-cols-2 gap-10">
          
          <section className="space-y-6">
            <div className="flex items-center justify-between border-b pb-2 border-gray-200 dark:border-slate-800">
              <h2 className="text-xl font-bold text-[#1e3a5f] dark:text-blue-400 flex items-center gap-2">
                <Navigation className="h-5 w-5 text-[#c9a227]" /> Ready for Pickup
              </h2>
              <Badge className="bg-yellow-100 text-yellow-800 border-none">{availablePickups.length}</Badge>
            </div>

            <div className="space-y-4">
              {availablePickups.length === 0 ? (
                <Card className="bg-white/50 dark:bg-slate-900/50 border-dashed border-2 dark:border-slate-800">
                  <CardContent className="py-16 text-center text-gray-400 dark:text-gray-500">
                    <UtensilsCrossed className="mx-auto h-10 w-10 mb-2 opacity-20" />
                    <p className="text-sm italic">No orders ready for pickup.</p>
                  </CardContent>
                </Card>
              ) : (
                availablePickups.map(order => (
                  <OrderCard 
                    key={order.id} 
                    order={order} 
                    getOrderTypeIcon={getOrderTypeIcon}
                    getOrderTypeLabel={getOrderTypeLabel}
                    getElapsedTime={getElapsedTime}
                    showPickupButton={true}
                    onPickup={(e) => handlePickupOrder(e, order.id)}
                    isProcessing={isProcessing}
                  />
                ))
              )}
            </div>
          </section>

          <section className="space-y-6">
            <div className="flex items-center justify-between border-b pb-2 border-gray-200 dark:border-slate-800">
              <h2 className="text-xl font-bold text-[#1e3a5f] dark:text-blue-400 flex items-center gap-2">
                <MapPin className="h-5 w-5 text-green-600" /> My Active Deliveries
              </h2>
              <Badge className="bg-green-100 text-green-800 border-none">{myActiveDeliveries.length}</Badge>
            </div>

            <div className="space-y-4">
              {myActiveDeliveries.length === 0 ? (
                <Card className="bg-white/50 dark:bg-slate-900/50 border-dashed border-2 dark:border-slate-800">
                  <CardContent className="py-16 text-center text-gray-400 dark:text-gray-500">
                    <PackageCheck className="mx-auto h-10 w-10 mb-2 opacity-20" />
                    <p className="text-sm italic">No active deliveries. Ready for new orders!</p>
                  </CardContent>
                </Card>
              ) : (
                myActiveDeliveries.map(order => (
                  <OrderCard 
                    key={order.id} 
                    order={order} 
                    getOrderTypeIcon={getOrderTypeIcon}
                    getOrderTypeLabel={getOrderTypeLabel}
                    getElapsedTime={getElapsedTime}
                    estimatedTime={getEstimatedTime(order.id)}
                    showDeliverButton={true}
                    onDeliver={(e) => handleDeliverOrder(e, order)}
                    isProcessing={isProcessing}
                  />
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// Order Card Component
interface OrderCardProps {
  order: FoodOrder;
  getOrderTypeIcon: (type: FoodOrder['orderType']) => React.ReactNode;
  getOrderTypeLabel: (type: FoodOrder['orderType']) => string;
  getElapsedTime: (createdAt: string) => number;
  estimatedTime?: string;
  showPickupButton?: boolean;
  onPickup?: (e: React.MouseEvent) => void;
  showDeliverButton?: boolean;
  onDeliver?: (e: React.MouseEvent) => void;
  isProcessing?: string | null;
}

function OrderCard({ 
  order, 
  showPickupButton, 
  onPickup, 
  showDeliverButton, 
  onDeliver, 
  isProcessing,
  estimatedTime,
  getOrderTypeIcon,
  getOrderTypeLabel,
  getElapsedTime
}: OrderCardProps) {
  const elapsed = getElapsedTime(order.createdAt);
  
  return (
    <Card className="overflow-hidden border-none shadow-sm hover:shadow-md transition-all bg-white dark:bg-slate-900 group">
      <CardContent className="p-0">
        <div className="p-5">
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${showDeliverButton ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                {getOrderTypeIcon(order.orderType)}
              </div>
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest">
                  {getOrderTypeLabel(order.orderType)}
                </span>
                <h3 className="font-bold text-slate-800 dark:text-slate-200 text-lg">
                  {order.orderType === 'room_delivery' ? `Room ${order.roomNumber}` : 
                   order.orderType === 'dine_in' ? `Table ${order.tableNumber}` : 'Takeaway Pickup'}
                </h3>
                {order.orderType === 'dine_in' && order.tableNumber && (
                  <Badge variant="outline" className="text-xs mt-1">
                    Table {order.tableNumber}
                  </Badge>
                )}
              </div>
            </div>
            <Badge variant={elapsed > 15 ? "destructive" : "secondary"} className="font-mono text-[10px]">
              <Clock className="h-3 w-3 mr-1" /> {elapsed} min ago
            </Badge>
          </div>
          
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-100 dark:border-slate-800">
            <div className="mb-3 space-y-1">
              {order.items.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs">
                  <span className="text-slate-600 dark:text-slate-300 truncate pr-2"><span className="font-semibold text-slate-400 mr-1">{item.quantity}x</span>{item.name}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 pt-3">
              <div>
                <span className="text-xs font-bold text-[#1e3a5f] dark:text-blue-400">{order.guestName}</span>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-medium">
                    {order.items.length} items • R{order.totalAmount}
                  </span>
                  {estimatedTime && (
                    <span className="text-[10px] font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Navigation className="h-2 w-2" /> ETA: {estimatedTime}
                    </span>
                  )}
                </div>
              </div>

              {showPickupButton && onPickup && (
                <Button 
                  size="sm" 
                  className="bg-[#1e3a5f] hover:bg-[#2c5282] text-white h-8 text-[10px] font-black tracking-tighter" 
                  onClick={onPickup}
                  disabled={!!isProcessing}
                >
                  {isProcessing === order.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'PICK UP'}
                </Button>
              )}

              {showDeliverButton && onDeliver && (
                <Button 
                  size="sm" 
                  className="bg-green-600 hover:bg-green-700 text-white h-8 text-[10px] font-black tracking-tighter" 
                  onClick={onDeliver}
                  disabled={!!isProcessing}
                >
                  {isProcessing === order.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'DELIVERED'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}