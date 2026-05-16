import { ShoppingCart, Trash2, ImageOff } from 'lucide-react';
import type { Product } from '../types';

interface Props {
  product: Product;
  onAddToCart: (product: Product) => void;
  onDelete: (productId: number) => void;
  isLoggedIn: boolean;
  isAdmin: boolean;
}

export default function ProductCard({ product, onAddToCart, onDelete, isLoggedIn, isAdmin }: Props) {
  const inStock = product.stock > 0;

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden hover:border-gray-400 dark:hover:border-zinc-600 hover:shadow-sm transition-all duration-200 group flex flex-col">
      <div className="relative overflow-hidden bg-gray-100 dark:bg-zinc-800">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-48 object-cover group-hover:scale-[1.03] transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-48 flex items-center justify-center">
            <ImageOff className="h-10 w-10 text-gray-300 dark:text-zinc-600" />
          </div>
        )}
        {!inStock && (
          <div className="absolute inset-0 bg-white/70 dark:bg-black/60 flex items-center justify-center">
            <span className="text-xs font-semibold text-gray-500 dark:text-zinc-300 border border-gray-300 dark:border-zinc-600 px-3 py-1 rounded-full bg-white dark:bg-zinc-900">
              Sold Out
            </span>
          </div>
        )}
        {inStock && product.stock <= 5 && (
          <span className="absolute top-2 right-2 text-[10px] font-bold text-white bg-black dark:bg-white dark:text-black px-2 py-0.5 rounded-full">
            {product.stock} left
          </span>
        )}
        {isAdmin && (
          <button
            onClick={() => onDelete(product.id)}
            className="absolute top-2 left-2 p-1.5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-md text-gray-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-700 transition-colors opacity-0 group-hover:opacity-100"
            title="Delete product"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1">
        <p className="text-[11px] text-gray-400 dark:text-zinc-500 font-medium uppercase tracking-wide mb-1">Product</p>
        <h3 className="font-semibold text-black dark:text-white text-sm leading-snug mb-3 flex-1" title={product.name}>
          {product.name}
        </h3>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xl font-bold text-black dark:text-white">${Number(product.price).toFixed(2)}</span>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 bg-gray-50 dark:bg-zinc-800">
            {inStock ? `${product.stock} in stock` : 'out of stock'}
          </span>
        </div>
        <button
          onClick={() => onAddToCart(product)}
          disabled={!inStock || !isLoggedIn}
          className="w-full flex items-center justify-center gap-2 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors disabled:bg-gray-100 dark:disabled:bg-zinc-800 disabled:text-gray-400 dark:disabled:text-zinc-600 disabled:cursor-not-allowed"
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          {!isLoggedIn ? 'Sign in to buy' : inStock ? 'Add to Cart' : 'Unavailable'}
        </button>
      </div>
    </div>
  );
}
