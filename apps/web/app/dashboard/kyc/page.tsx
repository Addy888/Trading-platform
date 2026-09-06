'use client';

import { useState, useEffect } from 'react';
import { UserLayout } from '@/components/layout/user-layout';
import { ProtectedRoute } from '@/components/protected-route';
import { useAuth } from '@/lib/auth-context';
import { kycApi, type KycSubmission, type SubmitKycData } from '@/lib/kyc-api';

export default function KYCPage() {
  const { accessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [kycSubmission, setKycSubmission] = useState<KycSubmission | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    fullName: '',
    dateOfBirth: '',
    address: '',
    city: '',
    country: '',
    postalCode: '',
    documentType: 'PASSPORT',
    documentNumber: '',
    documentFrontUrl: '',
    documentBackUrl: '',
    selfieUrl: '',
  });

  useEffect(() => {
    loadKYC();
  }, [accessToken]);

  const loadKYC = async () => {
    if (!accessToken) return;
    
    try {
      setLoading(true);
      const data = await kycApi.getOwnKyc(accessToken);
      setKycSubmission(data);
      
      if (data && data.status !== 'NOT_SUBMITTED') {
        setFormData({
          fullName: data.fullName || '',
          dateOfBirth: data.dateOfBirth ? data.dateOfBirth.split('T')[0] : '',
          address: data.address || '',
          city: data.city || '',
          country: data.country || '',
          postalCode: data.postalCode || '',
          documentType: data.documentType || 'PASSPORT',
          documentNumber: data.documentNumber || '',
          documentFrontUrl: data.documentFrontUrl || '',
          documentBackUrl: data.documentBackUrl || '',
          selfieUrl: data.selfieUrl || '',
        });
      }
    } catch (err: any) {
      console.error('Failed to load KYC:', err);
      // Don't show error for NOT_SUBMITTED status
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, fieldName: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // In production, upload to cloud storage (S3, Cloudinary, etc.)
    // For development, we'll use a mock URL
    const mockUrl = `https://example.com/kyc-documents/${Date.now()}-${file.name}`;
    
    setFormData({
      ...formData,
      [fieldName]: mockUrl,
    });

    // Show success message
    setSuccess(`File "${file.name}" uploaded successfully (mock)`);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;

    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      const submitData: SubmitKycData = {
        fullName: formData.fullName,
        dateOfBirth: formData.dateOfBirth,
        address: formData.address,
        city: formData.city,
        country: formData.country,
        postalCode: formData.postalCode,
        documentType: formData.documentType,
        documentNumber: formData.documentNumber,
        documentFrontUrl: formData.documentFrontUrl || undefined,
        documentBackUrl: formData.documentBackUrl || undefined,
        selfieUrl: formData.selfieUrl || undefined,
      };

      let result: KycSubmission;
      
      if (kycSubmission && kycSubmission.id) {
        // Update existing submission
        result = await kycApi.updateKyc(accessToken, kycSubmission.id, submitData);
      } else {
        // Create new submission
        result = await kycApi.submitKyc(accessToken, submitData);
      }

      setKycSubmission(result);
      setSuccess('KYC submitted successfully! Our team will review your documents.');
      
      // Scroll to top to show success message
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setError(err.message || 'Failed to submit KYC');
    } finally {
      setSubmitting(false);
    }
  };

  const canEdit = () => {
    if (!kycSubmission) return true;
    return kycSubmission.status === 'NOT_SUBMITTED' || 
           kycSubmission.status === 'REJECTED' || 
           kycSubmission.status === 'RESUBMISSION_REQUESTED';
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      NOT_SUBMITTED: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Not Submitted' },
      PENDING: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Under Review' },
      APPROVED: { bg: 'bg-green-100', text: 'text-green-800', label: 'Approved' },
      REJECTED: { bg: 'bg-red-100', text: 'text-red-800', label: 'Rejected' },
      RESUBMISSION_REQUESTED: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Resubmission Requested' },
    };

    const badge = badges[status] || badges.NOT_SUBMITTED;
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <UserLayout>
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading KYC information...</p>
            </div>
          </div>
        </UserLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <UserLayout>
        <div className="max-w-4xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">KYC Verification</h1>
            <p className="text-gray-600 mt-1">Complete your identity verification to unlock all features</p>
          </div>

          {/* Status Banner */}
          {kycSubmission && (
            <div className="mb-6 bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Verification Status</h2>
                {getStatusBadge(kycSubmission.status)}
              </div>

              {kycSubmission.status === 'PENDING' && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-yellow-800">
                    📋 Your KYC documents are under review. This typically takes 1-3 business days. 
                    We'll notify you once the review is complete.
                  </p>
                </div>
              )}

              {kycSubmission.status === 'APPROVED' && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-green-800">
                    ✅ Your identity has been verified! You now have full access to all platform features.
                  </p>
                  {kycSubmission.reviewedAt && (
                    <p className="text-sm text-green-700 mt-2">
                      Approved on {new Date(kycSubmission.reviewedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}

              {kycSubmission.status === 'REJECTED' && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-800 font-medium mb-2">
                    ❌ Your KYC submission was rejected.
                  </p>
                  {kycSubmission.reviewNotes && (
                    <div className="mt-2">
                      <p className="text-sm font-medium text-red-900">Reason:</p>
                      <p className="text-sm text-red-700 mt-1">{kycSubmission.reviewNotes}</p>
                    </div>
                  )}
                  <p className="text-sm text-red-700 mt-3">
                    Please review the information and resubmit your documents.
                  </p>
                </div>
              )}

              {kycSubmission.status === 'RESUBMISSION_REQUESTED' && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <p className="text-orange-800 font-medium mb-2">
                    📝 Additional information required
                  </p>
                  {kycSubmission.reviewNotes && (
                    <div className="mt-2">
                      <p className="text-sm font-medium text-orange-900">Details:</p>
                      <p className="text-sm text-orange-700 mt-1">{kycSubmission.reviewNotes}</p>
                    </div>
                  )}
                  <p className="text-sm text-orange-700 mt-3">
                    Please update your information and resubmit.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Alert Messages */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-800">{success}</p>
            </div>
          )}

          {/* KYC Form */}
          {canEdit() && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-6">
                {kycSubmission && kycSubmission.status !== 'NOT_SUBMITTED' ? 'Update Information' : 'Submit KYC Documents'}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Personal Information */}
                <div>
                  <h3 className="text-md font-medium text-gray-900 mb-4">Personal Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="fullName"
                        value={formData.fullName}
                        onChange={handleInputChange}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="John Doe"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Date of Birth <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        name="dateOfBirth"
                        value={formData.dateOfBirth}
                        onChange={handleInputChange}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Address <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="address"
                        value={formData.address}
                        onChange={handleInputChange}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="123 Main Street"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        City <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="city"
                        value={formData.city}
                        onChange={handleInputChange}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="New York"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Country <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="country"
                        value={formData.country}
                        onChange={handleInputChange}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="United States"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Postal Code <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="postalCode"
                        value={formData.postalCode}
                        onChange={handleInputChange}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="10001"
                      />
                    </div>
                  </div>
                </div>

                {/* Document Information */}
                <div>
                  <h3 className="text-md font-medium text-gray-900 mb-4">Document Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Document Type <span className="text-red-500">*</span>
                      </label>
                      <select
                        name="documentType"
                        value={formData.documentType}
                        onChange={handleInputChange}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="PASSPORT">Passport</option>
                        <option value="NATIONAL_ID">National ID</option>
                        <option value="DRIVER_LICENSE">Driver's License</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Document Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="documentNumber"
                        value={formData.documentNumber}
                        onChange={handleInputChange}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="AB123456"
                      />
                    </div>
                  </div>
                </div>

                {/* Document Uploads */}
                <div>
                  <h3 className="text-md font-medium text-gray-900 mb-4">Upload Documents</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Document Front <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => handleFileUpload(e, 'documentFrontUrl')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {formData.documentFrontUrl && (
                        <p className="text-xs text-green-600 mt-1">✓ File uploaded</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Document Back
                      </label>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => handleFileUpload(e, 'documentBackUrl')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {formData.documentBackUrl && (
                        <p className="text-xs text-green-600 mt-1">✓ File uploaded</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Selfie with Document <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileUpload(e, 'selfieUrl')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {formData.selfieUrl && (
                        <p className="text-xs text-green-600 mt-1">✓ File uploaded</p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        Please upload a clear photo of yourself holding your ID document
                      </p>
                    </div>
                  </div>
                </div>

                {/* Development Notice */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    <strong>Development Mode:</strong> File uploads are simulated. In production, files will be securely uploaded to cloud storage.
                  </p>
                </div>

                {/* Submit Button */}
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={submitting || !formData.documentFrontUrl || !formData.selfieUrl}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                  >
                    {submitting ? 'Submitting...' : 'Submit KYC'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Approved - View Only */}
          {kycSubmission && kycSubmission.status === 'APPROVED' && (
            <div className="bg-white rounded-lg shadow p-6 mt-6">
              <h2 className="text-lg font-semibold mb-4">Verified Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Full Name</p>
                  <p className="font-medium">{kycSubmission.fullName}</p>
                </div>
                <div>
                  <p className="text-gray-600">Date of Birth</p>
                  <p className="font-medium">
                    {kycSubmission.dateOfBirth ? new Date(kycSubmission.dateOfBirth).toLocaleDateString() : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600">Country</p>
                  <p className="font-medium">{kycSubmission.country}</p>
                </div>
                <div>
                  <p className="text-gray-600">Document Type</p>
                  <p className="font-medium">{kycSubmission.documentType}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </UserLayout>
    </ProtectedRoute>
  );
}
