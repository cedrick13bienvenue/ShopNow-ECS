import { useState, useEffect } from 'react';
import type { Cart, Order, Product } from './types';
import Navbar from './components/Navbar';
import AuthModal from './components/AuthModal';
import CartSheet from './components/CartSheet';
import ProductsPage from './pages/ProductsPage';
import OrdersPage from './pages/OrdersPage';
import * as api from './lib/api';
import { getSecure, setSecure, removeSecure } from './lib/storage';

type View = 'products' | 'orders';

export default function App() {
  const [token, setToken] = useState(getSecure('token'));
  const [userId, setUserId] = useState(getSecure('userId'));
  const [username, setUsername] = useState(getSecure('username'));
  const [role, setRole] = useState(getSecure('role') || 'user');

  const [view, setView] = useState<View>('products');
  const [authOpen, setAuthOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');

  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Cart>({ items: [] });
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    if (!token) return;
    try {
      const { exp } = JSON.parse(atob(token.split('.')[1])) as { exp: number };
      if (exp * 1000 < Date.now()) { handleLogout(); return; }
    } catch { handleLogout(); return; }
    api.getProducts(token).then(setProducts);
    api.getCart(token, userId).then(setCart);
  }, [token, userId]);

  function handleAuthSuccess(newToken: string, newUserId: string, newUsername: string, newRole: string) {
    setToken(newToken); setUserId(newUserId); setUsername(newUsername); setRole(newRole);
    setSecure('token', newToken);
    setSecure('userId', newUserId);
    setSecure('username', newUsername);
    setSecure('role', newRole);
    setAuthOpen(false);
  }

  function handleLogout() {
    setToken(''); setUserId(''); setUsername(''); setRole('user');
    setCart({ items: [] }); setOrders([]); setProducts([]);
    removeSecure('token');
    removeSecure('userId');
    removeSecure('username');
    removeSecure('role');
  }

  async function handleCheckout() {
    if (!token) { setAuthOpen(true); return; }
    const order = await api.createOrder(token);
    if (order.id) {
      setCart({ items: [] });
      setOrders((prev) => [order, ...prev]);
      setCartOpen(false);
      setView('orders');
    }
  }

  function handleNavigate(v: View) {
    setView(v);
    if (v === 'orders' && token) api.getOrders(token, userId).then(setOrders);
  }

  return (
    <div className="min-h-screen bg-[#f7f6f3] dark:bg-zinc-950 transition-colors duration-200 font-sans">
      <Navbar
        username={username} role={role} cart={cart} currentView={view} dark={dark}
        onNavigate={handleNavigate}
        onCartOpen={() => setCartOpen(true)}
        onAuthOpen={() => setAuthOpen(true)}
        onLogout={handleLogout}
        onToggleTheme={() => setDark((d) => !d)}
      />

      {view === 'products' && (
        <ProductsPage
          products={products} token={token} userId={userId} isAdmin={role === 'admin'}
          onProductsUpdate={setProducts} onCartUpdate={setCart}
          onCartOpen={() => setCartOpen(true)} onAuthOpen={() => setAuthOpen(true)}
        />
      )}

      {view === 'orders' && (
        <OrdersPage orders={orders} token={token} userId={userId} onOrdersUpdate={setOrders} />
      )}

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onSuccess={handleAuthSuccess} />}

      {cartOpen && (
        <CartSheet
          cart={cart} token={token} userId={userId}
          onClose={() => setCartOpen(false)} onCartUpdate={setCart} onCheckout={handleCheckout}
        />
      )}
    </div>
  );
}
