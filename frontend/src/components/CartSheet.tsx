import { X, Trash2, ArrowRight, ShoppingCart, ImageOff } from 'lucide-react';
import type { Cart, CartItem } from '../types';
import * as api from '../lib/api';

interface Props {
  cart: Cart;
  token: string;
  userId: string;
  onClose: () => void;
  onCartUpdate: (cart: Cart) => void;
  onCheckout: () => void;
}

export default function CartSheet({ cart, token, userId, onClose, onCartUpdate, onCheckout }: Props) {
  const total = cart.items.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);
  const count = cart.items.reduce((sum, i) => sum + i.quantity, 0);

  async function handleRemove(productId: string) {
    const updated = await api.removeFromCart(token, userId, productId);
    onCartUpdate(updated);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60" onClick={onClose} />
      <div className="relative bg-white dark:bg-zinc-900 w-full max-w-sm h-full flex flex-col border-l border-gray-200 dark:border-zinc-800 transition-colors">

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-zinc-800">
          <span className="font-semibold text-black dark:text-white text-sm">
            Cart {count > 0 && <span className="text-gray-400 dark:text-zinc-500 font-normal">({count})</span>}
          </span>
          <button onClick={onClose} className="p-1.5 text-gray-400 dark:text-zinc-500 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {cart.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <ShoppingCart className="h-10 w-10 text-gray-200 dark:text-zinc-700 mb-3" />
              <p className="text-sm font-medium text-gray-500 dark:text-zinc-400">Your cart is empty</p>
              <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">Add products to get started</p>
            </div>
          ) : (
            <div className="space-y-1">
              {cart.items.map((item: CartItem) => (
                <div key={item.productId} className="flex items-center gap-3 group py-3 border-b border-gray-50 dark:border-zinc-800 last:border-0">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-gray-100 dark:bg-zinc-800" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg flex-shrink-0 bg-gray-100 dark:bg-zinc-800 flex items-center justify-center">
                      <ImageOff className="h-4 w-4 text-gray-300 dark:text-zinc-600" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-black dark:text-white truncate">{item.name}</p>
                    <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">${Number(item.price).toFixed(2)} × {item.quantity}</p>
                    <p className="text-sm font-semibold text-black dark:text-white">${(Number(item.price) * item.quantity).toFixed(2)}</p>
                  </div>
                  <button
                    onClick={() => handleRemove(item.productId)}
                    className="p-1.5 text-gray-300 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {cart.items.length > 0 && (
          <div className="border-t border-gray-100 dark:border-zinc-800 px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-zinc-400">Total</span>
              <span className="text-lg font-bold text-black dark:text-white">${total.toFixed(2)}</span>
            </div>
            <button
              onClick={onCheckout}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors"
            >
              Checkout <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
