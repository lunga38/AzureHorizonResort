import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { rtdb } from '@/services/firebase-services';
import { ref, onValue, off } from 'firebase/database';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { generatePDFFromHTML, getProfessionalPDFHTML } from '../../utils/pdfGenerator';
import { Download, Package, Clock, CheckCircle2, Truck, Home, UtensilsCrossed, Loader2 } from 'lucide-react';
import type { User as CustomUser } from '@/types';

interface FoodOrder {
  id: string;
  guestId: string;
  guestName: string;
  roomNumber?: string;
  tableNumber?: number;
  orderType: 'dine_in' | 'takeaway' | 'room_delivery';
  items: Array<{ name: string; quantity: number; price: number }>;
  totalAmount: number;
  status: 'pending' | 'preparing' | 'ready' | 'picked_up' | 'delivered';
  createdAt: string;
  completedAt?: string;
  assignedTo?: string;
}

interface MyOrdersProps {
  onBack: () => void;
}

type AuthUserBridge = CustomUser & { uid?: string };

export function MyOrders({ onBack }: MyOrdersProps) {
  const { user } = useAuth();
  const [orders, setOrders] = useState<FoodOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<FoodOrder | null>(null);
  const [showOrderDetails, setShowOrderDetails] = useState(false);

  const currentUser = user as AuthUserBridge;
  const currentUserId = currentUser?.id || currentUser?.uid;

  useEffect(() => {
    let isMounted = true;
    
    if (!currentUserId) {
      if (isMounted) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsLoading(false);
      }
      return;
    }

    const ordersRef = ref(rtdb, 'orders');
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleOrders = (snapshot: { val: () => any }) => {
      const data = snapshot.val();
      if (data && isMounted) {
        const allOrders = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        })) as FoodOrder[];
        
        const userOrders = allOrders.filter(order => order.guestId === currentUserId);
        userOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setOrders(userOrders);
      } else if (isMounted) {
        setOrders([]);
      }
      if (isMounted) {
        setIsLoading(false);
      }
    };

    onValue(ordersRef, handleOrders);
    return () => {
      isMounted = false;
      off(ordersRef);
    };
  }, [currentUserId]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case 'preparing':
        return <Badge className="bg-blue-100 text-blue-800">Preparing</Badge>;
      case 'ready':
        return <Badge className="bg-green-100 text-green-800">Ready for Pickup</Badge>;
      case 'picked_up':
        return <Badge className="bg-purple-100 text-purple-800">Out for Delivery</Badge>;
      case 'delivered':
        return <Badge className="bg-gray-100 text-gray-800">Delivered</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'preparing':
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      case 'ready':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'picked_up':
        return <Truck className="h-4 w-4 text-purple-600" />;
      case 'delivered':
        return <CheckCircle2 className="h-4 w-4 text-gray-600" />;
      default:
        return <Package className="h-4 w-4" />;
    }
  };

  const getOrderTypeIcon = (type: string) => {
    switch (type) {
      case 'dine_in':
        return <UtensilsCrossed className="h-4 w-4" />;
      case 'takeaway':
        return <Package className="h-4 w-4" />;
      case 'room_delivery':
        return <Home className="h-4 w-4" />;
      default:
        return <Package className="h-4 w-4" />;
    }
  };

  const downloadOrderPDF = async (order: FoodOrder) => {
    const orderDate = order.createdAt ? new Date(order.createdAt) : new Date();
    
    const details = [
      { label: 'Order ID', value: order.id.slice(-8).toUpperCase() },
      { label: 'Guest Name', value: order.guestName },
      { label: 'Order Type', value: order.orderType.toUpperCase() },
      ...(order.roomNumber ? [{ label: 'Room', value: order.roomNumber }] : []),
      ...(order.tableNumber ? [{ label: 'Table', value: order.tableNumber.toString() }] : []),
      { label: 'Date', value: orderDate.toLocaleString() },
      { label: 'Status', value: `<span class="status-badge status-${order.status}">${order.status.toUpperCase()}</span>` }
    ];
    
    const items = order.items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      subtotal: item.price * item.quantity
    }));
    
    const html = getProfessionalPDFHTML({
      title: 'FOOD ORDER RECEIPT',
      guestName: order.guestName,
      details: details,
      items: items,
      total: order.totalAmount,
      footer: 'Thank you for ordering with Azure Horizon Resort! Please present this receipt when picking up your order.'
    });
    
    await generatePDFFromHTML(html, `Order_Receipt_${order.id.slice(-8)}.pdf`);
  };

  const getProgressWidth = (status: string) => {
    switch (status) {
      case 'pending': return '25%';
      case 'preparing': return '50%';
      case 'ready': return '75%';
      case 'picked_up': return '90%';
      case 'delivered': return '100%';
      default: return '0%';
    }
  };

  const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'preparing');
  const completedOrders = orders.filter(o => o.status === 'ready' || o.status === 'picked_up' || o.status === 'delivered');

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
        ← Back to Dashboard
      </Button>

      <h2 className="text-2xl font-serif font-bold text-[#1e3a5f]">My Orders</h2>
      <p className="text-gray-600 text-sm">Track your food orders in real-time</p>

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="active">Active Orders ({pendingOrders.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completedOrders.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4 space-y-4">
          {pendingOrders.length === 0 ? (
            <Card className="bg-gray-50">
              <CardContent className="p-8 text-center text-gray-400">
                <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No active orders</p>
              </CardContent>
            </Card>
          ) : (
            pendingOrders.map(order => (
              <OrderCard
                key={order.id}
                order={order}
                getStatusBadge={getStatusBadge}
                getStatusIcon={getStatusIcon}
                getOrderTypeIcon={getOrderTypeIcon}
                getProgressWidth={getProgressWidth}
                onViewDetails={() => {
                  setSelectedOrder(order);
                  setShowOrderDetails(true);
                }}
                onDownload={() => downloadOrderPDF(order)}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="completed" className="mt-4 space-y-4">
          {completedOrders.length === 0 ? (
            <Card className="bg-gray-50">
              <CardContent className="p-8 text-center text-gray-400">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No completed orders</p>
              </CardContent>
            </Card>
          ) : (
            completedOrders.map(order => (
              <OrderCard
                key={order.id}
                order={order}
                getStatusBadge={getStatusBadge}
                getStatusIcon={getStatusIcon}
                getOrderTypeIcon={getOrderTypeIcon}
                getProgressWidth={getProgressWidth}
                onViewDetails={() => {
                  setSelectedOrder(order);
                  setShowOrderDetails(true);
                }}
                onDownload={() => downloadOrderPDF(order)}
              />
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Order Details Modal */}
      <Dialog open={showOrderDetails} onOpenChange={setShowOrderDetails}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Order #{selectedOrder.id.slice(-8).toUpperCase()}</span>
                {getStatusBadge(selectedOrder.status)}
              </div>
              
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="flex items-center gap-2 text-sm">
                  {getOrderTypeIcon(selectedOrder.orderType)}
                  <span className="font-semibold capitalize">{selectedOrder.orderType.replace('_', ' ')}</span>
                  {selectedOrder.roomNumber && <span>• Room {selectedOrder.roomNumber}</span>}
                  {selectedOrder.tableNumber && <span>• Table {selectedOrder.tableNumber}</span>}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold uppercase text-gray-500">Items</p>
                {selectedOrder.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span>{item.quantity}x {item.name}</span>
                    <span>R {item.price * item.quantity}</span>
                  </div>
                ))}
              </div>

              <div className="border-t pt-2">
                <div className="flex justify-between font-bold">
                  <span>Total</span>
                  <span>R {selectedOrder.totalAmount}</span>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button variant="outline" className="flex-1" onClick={() => downloadOrderPDF(selectedOrder)}>
                  <Download className="mr-2 h-4 w-4" />
                  Download Receipt
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setShowOrderDetails(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Order Card Component
interface OrderCardProps {
  order: FoodOrder;
  getStatusBadge: (status: string) => React.ReactNode;
  getStatusIcon: (status: string) => React.ReactNode;
  getOrderTypeIcon: (type: string) => React.ReactNode;
  getProgressWidth: (status: string) => string;
  onViewDetails: () => void;
  onDownload: () => void;
}

function OrderCard({ 
  order, 
  getStatusBadge, 
  getStatusIcon, 
  getOrderTypeIcon, 
  getProgressWidth,
  onViewDetails, 
  onDownload
}: OrderCardProps) {
  const orderDate = order.createdAt ? new Date(order.createdAt) : new Date();
  const isValidDate = !isNaN(orderDate.getTime());
  
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2">
            {getOrderTypeIcon(order.orderType)}
            <span className="text-xs font-mono text-gray-500">#{order.id.slice(-8).toUpperCase()}</span>
          </div>
          {getStatusBadge(order.status)}
        </div>
        
        <div className="flex items-center gap-3 mb-3">
          {getStatusIcon(order.status)}
          <div className="flex-1">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-[#1e3a5f] transition-all duration-500"
                style={{ width: getProgressWidth(order.status) }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>Ordered</span>
              <span>Preparing</span>
              <span>Ready</span>
              <span>Delivered</span>
            </div>
          </div>
        </div>

        <p className="text-sm font-medium">{order.guestName}</p>
        <p className="text-xs text-gray-500">{order.items.length} item(s) • R{order.totalAmount}</p>
        <p className="text-xs text-gray-400 mt-1">
          {isValidDate ? orderDate.toLocaleString() : 'Just now'}
        </p>

        <div className="flex gap-2 mt-4">
          <Button size="sm" variant="outline" className="flex-1" onClick={onViewDetails}>
            View Details
          </Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={onDownload}>
            <Download className="h-3 w-3 mr-1" />
            PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}