'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AdminLayout } from '@/components/layout/admin-layout';
import { useAuth } from '@/lib/auth-context';
import { kycApi, KYCSubmission } from '@/lib/kyc-api';
import Link from 'next/link';

export default function KYCPage() {
  const { accessToken } = useAuth();
  const [submissions, setSubmissions] = useState<KYCSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchSubmissions();
  }, [accessToken, page, statusFilter]);

  const fetchSubmissions = async () => {
    if (!accessToken) return;

    try {
      setLoading(true);
      setError('');
      const response = await kycApi.getKYCSubmissions(accessToken, {
        page,
        limit: 20,
        search: search || undefined,
        status: statusFilter || undefined,
      });
      setSubmissions(response.data || []);
      setTotalPages(response.meta?.totalPages || 1);
    } catch (err: any) {
      console.error('Failed to load KYC submissions:', err);
      setError(err.message || 'Failed to load KYC submissions');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchSubmissions();
  };

  const handleAction = async (
    submissionId: string,
    action: 'approve' | 'reject' | 'resubmit',
  ) => {
    if (!accessToken) return;

    const confirmMessage =
      action === 'approve'
        ? 'Are you sure you want to approve this KYC submission?'
        : action === 'reject'
        ? 'Are you sure you want to reject this KYC submission?'
        : 'Request resubmission of KYC documents?';

    if (!confirm(confirmMessage)) return;

    try {
      setActionLoading(submissionId);
      if (action === 'approve') {
        const notes = prompt('Add optional approval notes:');
        await kycApi.approveKYC(accessToken, submissionId, notes || undefined);
      } else if (action === 'reject') {
        const reason = prompt('Provide a reason for rejection (required):');
        if (!reason) return;
        await kycApi.rejectKYC(accessToken, submissionId, reason);
      } else if (action === 'resubmit') {
        const reason = prompt('Provide a reason for requesting resubmission (required):');
        if (!reason) return;
        await kycApi.requestResubmission(accessToken, submissionId, reason);
      }
      await fetchSubmissions();
    } catch (err: any) {
      alert(`Failed to ${action} KYC submission: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, string> = {
      PENDING: 'bg-yellow-100 text-yellow-700',
      APPROVED: 'bg-green-100 text-green-700',
      REJECTED: 'bg-red-100 text-red-700',
      RESUBMISSION_REQUESTED: 'bg-orange-100 text-orange-700',
    };
    return statusMap[status] || 'bg-gray-100 text-gray-700';
  };

  return (
    <ProtectedRoute requireRole="ADMIN">
      <AdminLayout>
        <div className="space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">KYC Management</h1>
              <p className="text-gray-600 mt-1">Review and manage user identity verification</p>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg shadow p-6">
            <form onSubmit={handleSearch} className="flex gap-4">
              <input
                type="text"
                placeholder="Search by user name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Status</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="RESUBMISSION_REQUESTED">Resubmission Requested</option>
              </select>
              <button
                type="submit"
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Search
              </button>
            </form>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">{error}</p>
              <button
                onClick={fetchSubmissions}
                className="mt-2 text-red-700 underline text-sm"
              >
                Retry
              </button>
            </div>
          )}

          {/* KYC Submissions Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {loading ? (
              <div className="text-center py-12 text-gray-600">Loading KYC submissions...</div>
            ) : submissions.length === 0 ? (
              <div className="text-center py-12 text-gray-600">
                <p>No KYC submissions found</p>
                <p className="text-sm text-gray-500 mt-2">
                  KYC submissions from users will appear here
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Submission ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          User
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Document Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Country
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Submitted
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {submissions.map((submission) => (
                        <tr key={submission.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-mono text-gray-900">
                              {submission.id.substring(0, 8)}...
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {submission.user ? (
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {submission.user.firstName} {submission.user.lastName}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {submission.user.email}
                                </div>
                                {submission.fullName && submission.fullName !== `${submission.user.firstName} ${submission.user.lastName}` && (
                                  <div className="text-xs text-gray-500 italic">
                                    Doc: {submission.fullName}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-sm text-gray-500">N/A</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {submission.documentType || 'N/A'}
                            </div>
                            {submission.documentNumber && (
                              <div className="text-xs text-gray-500 font-mono">
                                {submission.documentNumber}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {submission.country || 'N/A'}
                            </div>
                            {submission.city && (
                              <div className="text-xs text-gray-500">{submission.city}</div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(submission.status)}`}
                            >
                              {submission.status.replace(/_/g, ' ')}
                            </span>
                            {submission.reviewer && (
                              <div className="text-xs text-gray-500 mt-1">
                                by {submission.reviewer.firstName} {submission.reviewer.lastName}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(submission.submittedAt).toLocaleDateString()}
                            <div className="text-xs text-gray-400">
                              {new Date(submission.submittedAt).toLocaleTimeString()}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm space-y-1">
                            <Link
                              href={`/admin/kyc/${submission.id}`}
                              className="block text-blue-600 hover:text-blue-900"
                            >
                              View Details
                            </Link>
                            {submission.status === 'PENDING' && (
                              <>
                                <button
                                  onClick={() => handleAction(submission.id, 'approve')}
                                  disabled={actionLoading === submission.id}
                                  className="block text-green-600 hover:text-green-900 disabled:opacity-50"
                                >
                                  {actionLoading === submission.id ? 'Processing...' : 'Approve'}
                                </button>
                                <button
                                  onClick={() => handleAction(submission.id, 'reject')}
                                  disabled={actionLoading === submission.id}
                                  className="block text-red-600 hover:text-red-900 disabled:opacity-50"
                                >
                                  Reject
                                </button>
                                <button
                                  onClick={() => handleAction(submission.id, 'resubmit')}
                                  disabled={actionLoading === submission.id}
                                  className="block text-orange-600 hover:text-orange-900 disabled:opacity-50"
                                >
                                  Request Resubmission
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                    <div className="flex-1 flex justify-between sm:hidden">
                      <button
                        onClick={() => setPage(Math.max(1, page - 1))}
                        disabled={page === 1}
                        className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setPage(Math.min(totalPages, page + 1))}
                        disabled={page === totalPages}
                        className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                    <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm text-gray-700">
                          Page <span className="font-medium">{page}</span> of{' '}
                          <span className="font-medium">{totalPages}</span>
                        </p>
                      </div>
                      <div>
                        <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                          <button
                            onClick={() => setPage(Math.max(1, page - 1))}
                            disabled={page === 1}
                            className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                          >
                            Previous
                          </button>
                          <button
                            onClick={() => setPage(Math.min(totalPages, page + 1))}
                            disabled={page === totalPages}
                            className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                          >
                            Next
                          </button>
                        </nav>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </AdminLayout>
    </ProtectedRoute>
  );
}
