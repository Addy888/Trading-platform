'use client';

import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { UserLayout } from '@/components/layout/user-layout';

export default function SettingsPage() {
  const router = useRouter();

  // Redirect to profile by default
  router.push('/dashboard/settings/profile');

  return (
    <ProtectedRoute requireRole="USER">
      <UserLayout>
        <div className="text-center py-12">
          <p className="text-gray-600">Redirecting...</p>
        </div>
      </UserLayout>
    </ProtectedRoute>
  );
}
