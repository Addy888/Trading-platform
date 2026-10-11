'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phone: '',
    country: '',
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
      await register(formData);
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Registration failed. Please try again.');
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
              Create your account
            </h2>
            <p className="mt-2 text-center text-sm text-[#999F99]">
              Already have an account?{' '}
              <Link href="/login" className="font-medium text-[#B8FF85] hover:text-[#a8ef75]">
                Sign in
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-[#F5F7F4] mb-2">
                    First Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-[#0a0d0a] border border-white/10 text-[#F5F7F4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B8FF85] focus:border-transparent placeholder-[#999F99]"
                    placeholder="First Name"
                  />
                </div>
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-[#F5F7F4] mb-2">
                    Last Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="lastName"
                    name="lastName"
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-[#0a0d0a] border border-white/10 text-[#F5F7F4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B8FF85] focus:border-transparent placeholder-[#999F99]"
                    placeholder="Last Name"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-[#F5F7F4] mb-2">
                  Email address <span className="text-red-400">*</span>
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
                  Password <span className="text-red-400">*</span>
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-[#0a0d0a] border border-white/10 text-[#F5F7F4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B8FF85] focus:border-transparent placeholder-[#999F99]"
                  placeholder="Min 8 characters"
                  minLength={8}
                />
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-[#F5F7F4] mb-2">
                  Phone (optional)
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-[#0a0d0a] border border-white/10 text-[#F5F7F4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B8FF85] focus:border-transparent placeholder-[#999F99]"
                  placeholder="Phone number"
                />
              </div>

              <div>
                <label htmlFor="country" className="block text-sm font-medium text-[#F5F7F4] mb-2">
                  Country (optional)
                </label>
                <input
                  id="country"
                  name="country"
                  type="text"
                  value={formData.country}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-[#0a0d0a] border border-white/10 text-[#F5F7F4] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B8FF85] focus:border-transparent placeholder-[#999F99]"
                  placeholder="Country"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-[#B8FF85] text-[#070908] rounded-lg text-sm font-semibold hover:bg-[#a8ef75] focus:outline-none focus:ring-2 focus:ring-[#B8FF85] focus:ring-offset-2 focus:ring-offset-[#070908] disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-lg hover:shadow-[#B8FF85]/30"
              >
                {loading ? 'Creating account...' : 'Create account'}
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
