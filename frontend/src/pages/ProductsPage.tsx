import { useState } from 'react';
import { Plus, RefreshCw, X } from 'lucide-react';
import type { Product, Cart } from '../types';
import ProductCard from '../components/ProductCard';
import * as api from '../lib/api';

interface Props {
  products: Product[];
  token: string;
  userId: string;
  isAdmin: boolean;
  onProductsUpdate: (p: Product[]) => void;
  onCartUpdate: (c: Cart) => void;
  onCartOpen: () => void;
  onAuthOpen: () => void;
}

export default function ProductsPage({ products, token, userId, isAdmin, onProductsUpdate, onCartUpdate, onCartOpen, onAuthOpen }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [loading, setLoading] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  }

  function resetForm() {
    setName(''); setPrice(''); setStock('');
    setImageFile(null); setImagePreview('');
    setShowForm(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!imageFile) return;
    setLoading(true);
    try {
      const p = await api.addProduct(token, { name, price: parseFloat(price), stock: parseInt(stock), image: imageFile });
      if (p.id) { onProductsUpdate([...products, p]); resetForm(); }
    } finally { setLoading(false); }
  }

  async function handleAddToCart(product: Product) {
    if (!token) { onAuthOpen(); return; }
    const updated = await api.addToCart(token, userId, { productId: String(product.id), name: product.name, price: product.price, quantity: 1 });
    onCartUpdate(updated);
    onCartOpen();
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">

      <div className="mb-10">
        <h1 className="text-3xl font-bold text-black dark:text-white tracking-tight">All Products</h1>
        <p className="text-gray-500 dark:text-zinc-400 mt-1 text-sm">
          {token ? `${products.length} item${products.length !== 1 ? 's' : ''} available` : 'Sign in to browse and shop'}
        </p>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <button
            onClick={() => api.getProducts(token).then(onProductsUpdate)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-zinc-400 hover:text-black dark:hover:text-white border border-gray-200 dark:border-zinc-700 hover:border-gray-400 dark:hover:border-zinc-500 rounded-lg bg-white dark:bg-zinc-900 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
        {token && isAdmin && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-black dark:bg-white text-white dark:text-black rounded-lg text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add Product
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-black dark:text-white">New product</p>
            <button onClick={resetForm} className="p-1 text-gray-400 dark:text-zinc-500 hover:text-black dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
          <form onSubmit={handleAdd}>
            <div className="flex gap-4">
              <label className="relative flex-shrink-0 w-28 h-28 rounded-lg border-2 border-dashed border-gray-300 dark:border-zinc-600 hover:border-gray-400 dark:hover:border-zinc-500 cursor-pointer transition-colors overflow-hidden bg-gray-50 dark:bg-zinc-800 flex items-center justify-center">
                {imagePreview ? (
                  <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center px-2">
                    <div className="text-2xl mb-1">📷</div>
                    <p className="text-[10px] text-gray-400 dark:text-zinc-500 leading-tight">Click to upload image</p>
                  </div>
                )}
                <input type="file" accept="image/*" required onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer" />
              </label>
              <div className="flex-1 flex flex-col gap-3">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name" required
                  className="px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg text-sm bg-white dark:bg-zinc-800 text-black dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white focus:border-black dark:focus:border-white transition-colors" />
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price ($)" required min="0" step="0.01"
                    className="px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg text-sm bg-white dark:bg-zinc-800 text-black dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white focus:border-black dark:focus:border-white transition-colors" />
                  <input type="number" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="Stock qty" required min="0"
                    className="px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg text-sm bg-white dark:bg-zinc-800 text-black dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white focus:border-black dark:focus:border-white transition-colors" />
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={loading || !imageFile}
                    className="px-5 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors disabled:opacity-40">
                    {loading ? 'Adding...' : 'Add Product'}
                  </button>
                  <button type="button" onClick={resetForm}
                    className="px-5 py-2 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-600 text-gray-700 dark:text-zinc-300 rounded-lg text-xs font-medium hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      )}

      {!token ? (
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-12 text-center">
          <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">Sign in to browse products</p>
          <p className="text-xs text-gray-400 dark:text-zinc-500 mb-5">Create an account or sign in to start shopping</p>
          <button onClick={onAuthOpen}
            className="px-6 py-2.5 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors">
            Sign In
          </button>
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-12 text-center">
          <p className="text-sm font-medium text-gray-600 dark:text-zinc-400 mb-1">No products yet</p>
          <p className="text-xs text-gray-400 dark:text-zinc-500">Click "Add Product" to add your first item</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} onAddToCart={handleAddToCart} isLoggedIn={!!token} />
          ))}
        </div>
      )}
    </div>
  );
}
