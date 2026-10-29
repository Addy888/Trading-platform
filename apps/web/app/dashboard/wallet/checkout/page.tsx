'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { UserLayout } from '@/components/layout/user-layout';
import { useAuth } from '@/lib/auth-context';

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken } = useAuth();

  const ref = searchParams.get('ref') || 'DEP-PENDING';
  const providerRef = searchParams.get('providerRef') || 'SIM-TEST';
  const amount = searchParams.get('amount') || '50.00';
  const currency = searchParams.get('currency') || 'USD';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const sendWebhookSimulation = async (eventType: string) => {
    try {
      setLoading(true);
      setError('');

      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

      const timestamp = Math.floor(Date.now() / 1000);
      const payloadData = {
        event: eventType,
        providerReference: providerRef,
        internalReference: ref,
        amount,
        currency,
        metadata: { simulatedAt: new Date().toISOString() },
      };

      const payloadString = JSON.stringify(payloadData);
      const secret = 'dev-simulated-webhook-secret-tradeing-platform-2026';

      const encoder = new TextEncoder();
      const keyData = encoder.encode(secret);
      const cryptoKey = await window.crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );

      const dataToSign = encoder.encode(`${timestamp}.${payloadString}`);
      const signatureBuffer = await window.crypto.subtle.sign('HMAC', cryptoKey, dataToSign);
      const signatureHex = Array.from(new Uint8Array(signatureBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      const signatureHeader = `t=${timestamp},v1=${signatureHex}`;

      const res = await fetch(`${API_BASE_URL}/payments/webhook/simulation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-signature': signatureHeader,
        },
        body: payloadString,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Webhook verification failed on backend');
      }

      if (eventType === 'payment.succeeded') {
        setSuccess('Provider confirmed payment! Server-to-server webhook verified. Wallet credited.');
        setTimeout(() => {
          router.push('/dashboard/wallet?status=success');
        }, 1500);
      } else {
        setError(`Payment ended with event: ${eventType}. No funds credited to wallet.`);
        setTimeout(() => {
          router.push('/dashboard/wallet?status=cancelled');
        }, 2000);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to complete simulation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <UserLayout>
        <div className="max-w-xl mx-auto py-12 px-4">
          <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-6 sm:p-8">
              <span className="text-xs uppercase font-extrabold tracking-widest text-blue-200">
                Payment Gateway Sandbox
              </span>
              <h1 className="text-2xl font-black mt-1">Complete Checkout</h1>
              <p className="text-xs text-blue-200 mt-1">
                Cryptographically signed server-to-server payment verification test
              </p>
            </div>

            <div className="p-6 sm:p-8 space-y-6">
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Internal Reference</span>
                  <span className="font-mono font-bold text-gray-800">{ref}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Provider Reference</span>
                  <span className="font-mono font-semibold text-gray-700">{providerRef}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-200 text-base">
                  <span className="font-bold text-gray-900">Total Payable</span>
                  <span className="font-extrabold text-indigo-700">
                    ${amount} {currency}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 leading-relaxed">
                <strong>Crucial Platform Rule:</strong> Balances are <em>never</em> credited merely because a frontend
                success page is opened. Crediting only happens after the backend verifies the signed webhook with HMAC-SHA256,
                verifies expected amounts and currencies, and executes an atomic MySQL ledger transaction.
              </div>

              {error && (
                <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-xl border border-rose-200 font-medium">
                  {error}
                </div>
              )}

              {success && (
                <div className="p-3 bg-emerald-50 text-emerald-700 text-xs rounded-xl border border-emerald-200 font-medium">
                  ✓ {success}
                </div>
              )}

              <div className="space-y-3 pt-2">
                <button
                  onClick={() => sendWebhookSimulation('payment.succeeded')}
                  disabled={loading}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                >
                  {loading ? 'Verifying with Backend...' : `Simulate Successful Payment ($${amount})`}
                </button>

                <button
                  onClick={() => sendWebhookSimulation('payment.failed')}
                  disabled={loading}
                  className="w-full py-3 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl border border-rose-200 transition-colors disabled:opacity-50 text-xs"
                >
                  Simulate Failed Payment (Check zero credit)
                </button>

                <button
                  onClick={() => router.push('/dashboard/wallet?status=cancelled')}
                  disabled={loading}
                  className="w-full py-2.5 text-gray-500 hover:text-gray-800 text-xs font-semibold"
                >
                  Cancel and Return to Wallet
                </button>
              </div>
            </div>
          </div>
        </div>
      </UserLayout>
    </ProtectedRoute>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading checkout session...</div>}>
      <CheckoutContent />
    </Suspense>
  );
}
