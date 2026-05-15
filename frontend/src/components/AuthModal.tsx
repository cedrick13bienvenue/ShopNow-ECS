import { useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  onClose: () => void;
  onSuccess: (token: string, userId: string, username: string, role: string) => void;
}

export default function AuthModal({ onClose, onSuccess }: Props) {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setInfo('');
    setLoading(true);
    try {
      const res = await fetch(tab === 'login' ? '/api/auth/login' : '/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (tab === 'register') {
        if (data.id) { setInfo('Account created — sign in below.'); setTab('login'); }
        else setError(data.error || 'Registration failed');
      } else {
        if (data.token) {
          const payload = JSON.parse(atob(data.token.split('.')[1])) as { userId: number; role: string };
          onSuccess(data.token, String(payload.userId), username, payload.role || 'user');
        } else setError(data.error || 'Invalid credentials');
      }
    } catch { setError('Something went wrong.'); }
    finally { setLoading(false); }
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 rounded-lg text-sm bg-white dark:bg-zinc-800 text-black dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white focus:border-black dark:focus:border-white transition-colors';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70" onClick={onClose} />
      <div className="relative bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-sm p-7 border border-gray-200 dark:border-zinc-700">

        <button onClick={onClose} className="absolute top-4 right-4 p-1 text-gray-400 dark:text-zinc-500 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md transition-colors">
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-xl font-bold text-black dark:text-white mb-1">ShopNow</h2>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mb-6">
          {tab === 'login' ? 'Welcome back' : 'Create a new account'}
        </p>

        <div className="flex border-b border-gray-200 dark:border-zinc-700 mb-5">
          {(['login', 'register'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(''); setInfo(''); }}
              className={`flex-1 pb-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === t ? 'border-black dark:border-white text-black dark:text-white' : 'border-transparent text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300'}`}
            >
              {t === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        {info && <p className="mb-4 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 px-3 py-2 rounded-lg">{info}</p>}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-zinc-400 mb-1.5 uppercase tracking-wide">Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="your_username" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-zinc-400 mb-1.5 uppercase tracking-wide">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" className={inputCls} />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-3 py-2 rounded-lg">{error}</p>}
          <button
            type="submit" disabled={loading}
            className="w-full py-2.5 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors disabled:opacity-40 mt-1"
          >
            {loading ? 'Please wait...' : tab === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
