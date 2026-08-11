import { ref, onChildAdded, off } from 'firebase/database';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db, rtdb } from './firebase-services';
import { toast } from 'sonner';

/**
 * Listens for new food orders in RTDB and fires toast notifications.
 * Only triggers for orders created AFTER the listener is attached.
 */
export const listenForNewOrders = (filterStatus?: string) => {
  const ordersRef = ref(rtdb, 'orders');
  let isInitialLoad = true;

  // Use a timeout to skip the initial batch load
  setTimeout(() => { isInitialLoad = false; }, 3000);

  const handler = onChildAdded(ordersRef, (snapshot) => {
    if (isInitialLoad) return;
    const order = snapshot.val();
    if (!order) return;

    if (filterStatus && order.status !== filterStatus) return;

    const roomInfo = order.roomNumber ? ` • Room ${order.roomNumber}` : '';
    const itemCount = order.items?.length || 0;

    if (order.status === 'ready') {
      toast.info(`🍽️ Order Ready for Pickup`, {
        description: `${order.guestName}${roomInfo} — ${itemCount} item(s)`,
        duration: 8000,
      });
    } else {
      toast.info(`🆕 New Order Received`, {
        description: `${order.guestName}${roomInfo} — ${itemCount} item(s) • ${order.orderType}`,
        duration: 8000,
      });
    }
  });

  return () => off(ordersRef, 'child_added', handler);
};

/**
 * Listens for new service requests (maintenance/housekeeping) in Firestore.
 */
export const listenForNewServiceRequests = (typeFilter?: 'maintenance' | 'housekeeping') => {
  const startTime = new Date().toISOString();
  let isInitialLoad = true;
  setTimeout(() => { isInitialLoad = false; }, 3000);

  const q = typeFilter
    ? query(collection(db, 'service_requests'), where('type', '==', typeFilter))
    : query(collection(db, 'service_requests'));

  const unsub = onSnapshot(q, (snapshot) => {
    if (isInitialLoad) return;

    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const data = change.doc.data();
        if (data.createdAt && data.createdAt > startTime) {
          const emoji = data.type === 'maintenance' ? '🔧' : '🧹';
          toast.info(`${emoji} New ${data.type} Request`, {
            description: `Room ${data.roomNumber} — ${data.description?.substring(0, 60)}...`,
            duration: 8000,
          });
        }
      }
    });
  });

  return unsub;
};
