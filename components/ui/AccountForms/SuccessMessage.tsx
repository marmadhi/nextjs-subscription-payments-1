'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';

type VerificationStatus = 'verifying' | 'success' | 'pending' | 'failed';

export default function SuccessMessage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<VerificationStatus>('verifying');
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 10;
  const retryInterval = 2000; // 2 seconds

  const checkSubscription = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/subscription/status');
      if (response.ok) {
        const data = await response.json();
        return data.hasActiveSubscription === true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (searchParams.get('success') !== 'true') return;

    setShow(true);
    // Clean up the URL immediately
    window.history.replaceState({}, '', '/account');

    // Start verification polling
    const verifySubscription = async () => {
      const hasSubscription = await checkSubscription();

      if (hasSubscription) {
        setStatus('success');
        // Refresh the page to show updated subscription data
        router.refresh();
        // Auto-hide after 8 seconds
        setTimeout(() => setShow(false), 8000);
      } else if (retryCount < maxRetries) {
        setStatus('pending');
        setRetryCount((prev) => prev + 1);
      } else {
        setStatus('failed');
      }
    };

    verifySubscription();
  }, [searchParams, retryCount, checkSubscription, router]);

  // Polling effect
  useEffect(() => {
    if (status === 'pending' && retryCount > 0 && retryCount < maxRetries) {
      const timer = setTimeout(async () => {
        const hasSubscription = await checkSubscription();
        if (hasSubscription) {
          setStatus('success');
          router.refresh();
          setTimeout(() => setShow(false), 8000);
        } else if (retryCount >= maxRetries - 1) {
          setStatus('failed');
        } else {
          setRetryCount((prev) => prev + 1);
        }
      }, retryInterval);
      return () => clearTimeout(timer);
    }
  }, [status, retryCount, checkSubscription, router]);

  if (!show) return null;

  return (
    <div className="w-full max-w-3xl m-auto mb-8">
      {status === 'verifying' || status === 'pending' ? (
        <div className="bg-blue-900/50 border border-blue-500 rounded-lg p-6 relative">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0">
              <svg
                className="w-12 h-12 text-blue-400 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-blue-400">
                Processing Payment...
              </h3>
              <p className="text-blue-200 mt-1">
                Your payment was received. We're activating your subscription
                now.
              </p>
              <p className="text-blue-300/70 text-sm mt-2">
                This usually takes just a few seconds. ({retryCount}/{maxRetries}
                )
              </p>
            </div>
          </div>
        </div>
      ) : status === 'success' ? (
        <div className="bg-green-900/50 border border-green-500 rounded-lg p-6 relative">
          <button
            onClick={() => setShow(false)}
            className="absolute top-4 right-4 text-green-400 hover:text-white"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0">
              <svg
                className="w-12 h-12 text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-green-400">
                Payment Successful!
              </h3>
              <p className="text-green-200 mt-1">
                Thank you for your subscription. Your account has been upgraded
                and your new quotas are now active.
              </p>
              <p className="text-green-300/70 text-sm mt-2">
                You can start using the AI Agent with your new plan limits.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-yellow-900/50 border border-yellow-500 rounded-lg p-6 relative">
          <button
            onClick={() => setShow(false)}
            className="absolute top-4 right-4 text-yellow-400 hover:text-white"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0">
              <svg
                className="w-12 h-12 text-yellow-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-yellow-400">
                Payment Received - Activation Pending
              </h3>
              <p className="text-yellow-200 mt-1">
                Your payment was successful, but subscription activation is
                taking longer than expected.
              </p>
              <p className="text-yellow-300/70 text-sm mt-2">
                Please refresh the page in a minute or check your email for
                confirmation. If the issue persists, please contact support.
              </p>
              <button
                onClick={() => {
                  setRetryCount(0);
                  setStatus('verifying');
                }}
                className="mt-3 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm transition-colors"
              >
                Retry Verification
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
