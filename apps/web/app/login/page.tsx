'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(formData.email, formData.password);
      
      // Get user data from storage to check role
      const accessToken = localStorage.getItem('accessToken');
      if (accessToken) {
        // Decode JWT to get role (simple approach)
        const payload = JSON.parse(atob(accessToken.split('.')[1]));
        const userResponse = await fetch('http://localhost:3001/api/auth/me', {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const userData = await userResponse.json();
        
        // Redirect based on role
        if (userData.role === 'ADMIN') {
          router.push('/admin');
        } else {
          router.push('/dashboard');
        }
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#070908] py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[120px]"></div>
      </div>

      <div className="max-w-md w-full space-y-8 relative z-10">
        {/* Logo */}
        <div className="flex justify-center">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-gradient-to-br from-[#B8FF85] to-[#6ee7b7] rounded-lg flex items-center justify-center">
              <span className="text-[#070908] font-bold text-xl">T</span>
            </div>
            <span className="text-[#F5F7F4] font-semibold text-xl">Trading</span>
          </Link>
        </div>

        <div className="glass-effect rounded-2xl p-8">
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-[#F5F7F4] text-center">
              Sign in to your account
            </h2>
            <p className="mt-2 text-center text-sm text-[#999F99]">
              Don't have an account?{' '}
              <Link href="/register" className="font-medium text-[#B8FF85] hover:text-[#a8ef75]">
                Register here
              </Link>
            </p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4">
                <div className="text-sm text-red-400">{error}</div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-[#F5F7F4] mb-2">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-[#0a0d0a] border border-white/10 text-[#F5F7F4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B8FF85] focus:border-transparent placeholder-[#999F99]"
                  placeholder="Enter your email"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-[#F5F7F4] mb-2">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-[#0a0d0a] border border-white/10 text-[#F5F7F4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B8FF85] focus:border-transparent placeholder-[#999F99]"
                  placeholder="Enter your password"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-[#B8FF85] text-[#070908] rounded-lg text-sm font-semibold hover:bg-[#a8ef75] focus:outline-none focus:ring-2 focus:ring-[#B8FF85] focus:ring-offset-2 focus:ring-offset-[#070908] disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-lg hover:shadow-[#B8FF85]/30"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </div>
          </form>

          <div className="mt-6 text-center">
            <Link href="/" className="text-sm text-[#999F99] hover:text-[#B8FF85] transition-colors">
              ← Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
