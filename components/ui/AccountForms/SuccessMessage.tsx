'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function SuccessMessage() {
  const searchParams = useSearchParams();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      setShow(true);
      // Auto-hide after 10 seconds
      const timer = setTimeout(() => setShow(false), 10000);
      // Clean up the URL
      window.history.replaceState({}, '', '/account');
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  if (!show) return null;

  return (
    <div className="w-full max-w-3xl m-auto mb-8">
      <div className="bg-green-900/50 border border-green-500 rounded-lg p-6 relative">
        <button
          onClick={() => setShow(false)}
          className="absolute top-4 right-4 text-green-400 hover:text-white"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0">
            <svg className="w-12 h-12 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-xl font-semibold text-green-400">
              Payment Successful!
            </h3>
            <p className="text-green-200 mt-1">
              Thank you for your subscription. Your account has been upgraded and your new quotas are now active.
            </p>
            <p className="text-green-300/70 text-sm mt-2">
              You can start using the AI Agent with your new plan limits.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
