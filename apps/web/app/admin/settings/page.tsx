'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AdminLayout } from '@/components/layout/admin-layout';
import { useAuth } from '@/lib/auth-context';
import { settingsApi, PlatformSetting, CreateSettingDto, UpdateSettingDto } from '@/lib/settings-api';

export default function AdminSettingsPage() {
  const { accessToken } = useAuth();
  const [settings, setSettings] = useState<PlatformSetting[]>([]);
  const [grouped, setGrouped] = useState<Record<string, PlatformSetting[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedSetting, setSelectedSetting] = useState<PlatformSetting | null>(null);

  // Form states
  const [formData, setFormData] = useState<CreateSettingDto>({
    key: '',
    value: '',
    description: '',
    category: 'General',
    isPublic: false,
  });

  useEffect(() => {
    fetchSettings();
  }, [accessToken]);

  const fetchSettings = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      setError('');
      const data = await settingsApi.getAllSettings(accessToken);
      setSettings(data.settings);
      setGrouped(data.grouped);
    } catch (err: any) {
      console.error('Failed to load settings:', err);
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;

    try {
      setError('');
      await settingsApi.createSetting(accessToken, formData);
      setSuccess('Setting created successfully');
      setShowCreateModal(false);
      setFormData({ key: '', value: '', description: '', category: 'General', isPublic: false });
      fetchSettings();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to create setting');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !selectedSetting) return;

    try {
      setError('');
      const dto: UpdateSettingDto = {
        value: formData.value,
        description: formData.description || undefined,
        category: formData.category || undefined,
        isPublic: formData.isPublic,
      };
      await settingsApi.updateSetting(accessToken, selectedSetting.key, dto);
      setSuccess('Setting updated successfully');
      setShowEditModal(false);
      setSelectedSetting(null);
      fetchSettings();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update setting');
    }
  };

  const handleDelete = async () => {
    if (!accessToken || !selectedSetting) return;

    try {
      setError('');
      await settingsApi.deleteSetting(accessToken, selectedSetting.key);
      setSuccess('Setting deleted successfully');
      setShowDeleteConfirm(false);
      setSelectedSetting(null);
      fetchSettings();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete setting');
    }
  };

  const openCreateModal = () => {
    setFormData({ key: '', value: '', description: '', category: 'General', isPublic: false });
    setShowCreateModal(true);
  };

  const openEditModal = (setting: PlatformSetting) => {
    setSelectedSetting(setting);
    setFormData({
      key: setting.key,
      value: setting.value,
      description: setting.description || '',
      category: setting.category || 'General',
      isPublic: setting.isPublic,
    });
    setShowEditModal(true);
  };

  const openDeleteConfirm = (setting: PlatformSetting) => {
    setSelectedSetting(setting);
    setShowDeleteConfirm(true);
  };

  const categories = ['General', 'Platform', 'Trading', 'Notifications', 'Email', 'Payments', 'KYC', 'Payouts', 'Security', 'Features'];

  return (
    <ProtectedRoute requireRole="ADMIN">
      <AdminLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Platform Settings</h1>
              <p className="text-gray-600 mt-1">Configure business and application settings</p>
            </div>
            <button
              onClick={openCreateModal}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              + Add Setting
            </button>
          </div>

          {/* Messages */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-800">{success}</p>
            </div>
          )}

          {/* Security Warning */}
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4">
            <h3 className="text-lg font-bold text-yellow-900 mb-2">⚠ Security Notice</h3>
            <p className="text-sm text-yellow-800">
              <strong>Never store sensitive credentials here:</strong> JWT secrets, database passwords, encryption keys, API keys, or any secrets should be stored in environment variables (.env) only.
            </p>
          </div>

          {loading ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <div className="text-gray-600">Loading settings...</div>
            </div>
          ) : (
            <>
              {/* Settings by Category */}
              {Object.keys(grouped).length === 0 ? (
                <div className="bg-white rounded-lg shadow p-12 text-center">
                  <p className="text-gray-600 text-lg">No settings configured yet</p>
                  <p className="text-gray-500 mt-2">Click "Add Setting" to create your first platform setting</p>
                </div>
              ) : (
                Object.entries(grouped).map(([category, categorySettings]) => (
                  <div key={category} className="bg-white rounded-lg shadow overflow-hidden">
                    <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                      <h2 className="text-xl font-bold text-gray-900">{category}</h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Key
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Value
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Description
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Visibility
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {categorySettings.map((setting) => (
                            <tr key={setting.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className="font-mono text-sm text-gray-900">{setting.key}</span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-sm text-gray-900 break-all">
                                  {setting.value.length > 100 ? `${setting.value.substring(0, 100)}...` : setting.value}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-sm text-gray-600">{setting.description || '-'}</span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span
                                  className={`px-2 py-1 text-xs font-medium rounded ${
                                    setting.isPublic
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-gray-100 text-gray-700'
                                  }`}
                                >
                                  {setting.isPublic ? 'Public' : 'Private'}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <button
                                  onClick={() => openEditModal(setting)}
                                  className="text-blue-600 hover:text-blue-700 mr-3"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => openDeleteConfirm(setting)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>

        {/* Create Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-xl font-bold text-gray-900">Create New Setting</h3>
              </div>
              <form onSubmit={handleCreate} className="px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Key <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.key}
                    onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                    placeholder="e.g., platform.name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Unique identifier (use lowercase, dots allowed)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Value <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    placeholder="Setting value"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="What does this setting control?"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isPublic"
                    checked={formData.isPublic}
                    onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
                    className="mr-2"
                  />
                  <label htmlFor="isPublic" className="text-sm text-gray-700">
                    Public (accessible to non-admin users)
                  </label>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="submit"
                    className="flex-1 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Create Setting
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {showEditModal && selectedSetting && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-xl font-bold text-gray-900">Edit Setting</h3>
                <p className="text-sm text-gray-600 mt-1 font-mono">{selectedSetting.key}</p>
              </div>
              <form onSubmit={handleUpdate} className="px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Key (Read-only)
                  </label>
                  <input
                    type="text"
                    value={formData.key}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Value <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isPublicEdit"
                    checked={formData.isPublic}
                    onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
                    className="mr-2"
                  />
                  <label htmlFor="isPublicEdit" className="text-sm text-gray-700">
                    Public (accessible to non-admin users)
                  </label>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="submit"
                    className="flex-1 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Update Setting
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditModal(false);
                      setSelectedSetting(null);
                    }}
                    className="flex-1 px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && selectedSetting && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-xl font-bold text-gray-900">Confirm Deletion</h3>
              </div>
              <div className="px-6 py-4">
                <p className="text-gray-700 mb-4">
                  Are you sure you want to delete this setting?
                </p>
                <p className="font-mono text-sm bg-gray-100 p-2 rounded">
                  {selectedSetting.key}
                </p>
                <p className="text-sm text-red-600 mt-4">
                  This action cannot be undone.
                </p>
              </div>
              <div className="px-6 py-4 border-t border-gray-200 flex space-x-3">
                <button
                  onClick={handleDelete}
                  className="flex-1 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Delete
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setSelectedSetting(null);
                  }}
                  className="flex-1 px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </AdminLayout>
    </ProtectedRoute>
  );
}
