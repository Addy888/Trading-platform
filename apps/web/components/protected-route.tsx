'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireRole?: 'ADMIN' | 'USER';
}

export function ProtectedRoute({ children, requireRole }: ProtectedRouteProps) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login');
        return;
      }

      if (requireRole && user.role !== requireRole) {
        // If user tries to access admin area, redirect to their dashboard
        if (requireRole === 'ADMIN') {
          router.push('/dashboard');
        } else {
          router.push('/admin');
        }
      }
    }
  }, [user, loading, requireRole, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (requireRole && user.role !== requireRole) {
    return null;
  }

  return <>{children}</>;
}
