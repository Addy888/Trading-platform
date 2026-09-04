'use client';

import { ProtectedRoute } from '@/components/protected-route';
import { AdminLayout } from '@/components/layout/admin-layout';

export default function AdminSettingsPage() {
  return (
    <ProtectedRoute requireRole="ADMIN">
      <AdminLayout>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600">Settings panel coming soon</p>
          </div>
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
