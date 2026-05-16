import { useState, useEffect } from 'react';
import { Package, RefreshCw, ImageOff, Trash2 } from 'lucide-react';
import type { Order } from '../types';
import * as api from '../lib/api';

interface Props {
  orders: Order[];
  token: string;
  userId: string;
  onOrdersUpdate: (o: Order[]) => void;
}

export default function OrdersPage({ orders, token, userId, onOrdersUpdate }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  async function handleDelete(orderId: number) {
    setDeleting(orderId);
    try {
      await api.deleteOrder(token, orderId);
      onOrdersUpdate(orders.filter((o) => o.id !== orderId));
    } finally {
      setDeleting(null);
    }
  }

  useEffect(() => {
    if (!token || !userId) return;
    api.getOrders(token, userId).then(onOrdersUpdate);
  }, [token, userId]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const fresh = await api.getOrders(token, userId);
      onOrdersUpdate(fresh);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">

      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-3xl font-bold text-black dark:text-white tracking-tight">Orders</h1>
          <p className="text-gray-500 dark:text-zinc-400 mt-1 text-sm">{orders.length} order{orders.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-zinc-400 hover:text-black dark:hover:text-white border border-gray-200 dark:border-zinc-700 hover:border-gray-400 dark:hover:border-zinc-500 rounded-lg bg-white dark:bg-zinc-900 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-12 text-center">
          <Package className="h-10 w-10 text-gray-200 dark:text-zinc-700 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-600 dark:text-zinc-400 mb-1">No orders yet</p>
          <p className="text-xs text-gray-400 dark:text-zinc-500">Go shopping and place your first order</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div key={order.id} className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden hover:border-gray-400 dark:hover:border-zinc-600 transition-colors">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50 dark:border-zinc-800">
                <div>
                  <p className="text-sm font-semibold text-black dark:text-white">Order #{order.id}</p>
                  <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">{new Date(order.created_at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-black dark:text-white">${Number(order.total).toFixed(2)}</span>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide ${order.status === 'pending' ? 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400' : 'bg-black dark:bg-white text-white dark:text-black'}`}>
                    {order.status}
                  </span>
                  <button
                    onClick={() => handleDelete(order.id)}
                    disabled={deleting === order.id}
                    className="p-1.5 text-gray-300 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 rounded-md transition-colors disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="px-5 py-3 space-y-2">
                {order.items.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 py-1">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-9 h-9 rounded-lg object-cover flex-shrink-0 bg-gray-100 dark:bg-zinc-800" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg flex-shrink-0 bg-gray-100 dark:bg-zinc-800 flex items-center justify-center">
                        <ImageOff className="h-3.5 w-3.5 text-gray-300 dark:text-zinc-600" />
                      </div>
                    )}
                    <span className="text-sm text-gray-700 dark:text-zinc-300 flex-1">{item.name}</span>
                    <span className="text-xs text-gray-400 dark:text-zinc-500 tabular-nums">×{item.quantity}</span>
                    <span className="text-sm font-semibold text-black dark:text-white tabular-nums w-16 text-right">${(Number(item.price) * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
