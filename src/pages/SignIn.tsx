import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useToast } from '../components/Toast';

export default function SignIn() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    if (mode === 'signin') {
      const { error } = await signIn(email, password);
      if (error) {
        toast(error, 'error');
      } else {
        toast('Welcome back!', 'success');
        navigate('/');
      }
    } else {
      if (!name.trim()) {
        toast('Please enter your name', 'warning');
        setLoading(false);
        return;
      }
      const { error } = await signUp(email, password, name);
      if (error) {
        toast(error, 'error');
      } else {
        toast('Account created!', 'success');
        navigate('/');
      }
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-accent text-white">
            <Package className="size-6" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight text-primary">StockHub</h1>
            <p className="text-sm text-secondary">Inventory for everyone</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-raised p-6">
          <h2 className="text-base font-semibold text-primary">
            {mode === 'signin' ? 'Sign in to your account' : 'Create a new account'}
          </h2>

          {mode === 'signup' && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-secondary">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-secondary">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-secondary">Password</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Sign Up'}
          </Button>

          <button
            type="button"
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            className="w-full text-center text-xs text-secondary hover:text-accent transition-colors"
          >
            {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
