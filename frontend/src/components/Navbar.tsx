import { ShoppingCart, LogOut, User, Package, Sun, Moon } from 'lucide-react';
import type { Cart } from '../types';

interface Props {
  username: string;
  role: string;
  cart: Cart;
  currentView: 'products' | 'orders';
  dark: boolean;
  onNavigate: (v: 'products' | 'orders') => void;
  onCartOpen: () => void;
  onAuthOpen: () => void;
  onLogout: () => void;
  onToggleTheme: () => void;
}

export default function Navbar({ username, role, cart, currentView, dark, onNavigate, onCartOpen, onAuthOpen, onLogout, onToggleTheme }: Props) {
  const cartCount = cart.items.reduce((sum, i) => sum + i.quantity, 0);

  const navBtn = (view: 'products' | 'orders', label: string, icon?: React.ReactNode) => (
    <button
      onClick={() => onNavigate(view)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors
        ${currentView === view
          ? 'bg-black text-white dark:bg-white dark:text-black font-medium'
          : 'text-gray-500 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800'}`}
    >
      {icon}{label}
    </button>
  );

  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 transition-colors">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex items-center justify-between h-14">

          <button onClick={() => onNavigate('products')} className="text-base font-bold text-black dark:text-white tracking-tight">
            ShopNow
          </button>

          <nav className="flex items-center gap-1">
            {navBtn('products', 'Products')}
            {navBtn('orders', 'Orders', <Package className="h-3.5 w-3.5" />)}
          </nav>

          <div className="flex items-center gap-1.5">
            <button
              onClick={onToggleTheme}
              className="p-2 text-gray-500 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
              title={dark ? 'Light mode' : 'Dark mode'}
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <button
              onClick={onCartOpen}
              className="relative p-2 text-gray-500 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
            >
              <ShoppingCart className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-black dark:bg-white text-white dark:text-black text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>

            {username ? (
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                  <div className="h-5 w-5 bg-black dark:bg-white rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white dark:text-black text-[10px] font-bold">{username[0].toUpperCase()}</span>
                  </div>
                  <span className="text-sm font-medium text-gray-800 dark:text-zinc-200 hidden sm:block">{username}</span>
                  {role === 'admin' && (
                    <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-black dark:bg-white text-white dark:text-black hidden sm:block">
                      Admin
                    </span>
                  )}
                </div>
                <button onClick={onLogout} className="p-2 text-gray-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 rounded-md transition-colors" title="Logout">
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={onAuthOpen}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-black dark:bg-white text-white dark:text-black rounded-md text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors"
              >
                <User className="h-3.5 w-3.5" /> Sign In
              </button>
            )}
          </div>

        </div>
      </div>
    </header>
  );
}
