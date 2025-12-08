/**
 * Admin Dashboard Page
 * Overview of AI usage, users, and system metrics
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import AdminDashboard from '@/components/ui/AdminDashboard';

// List of admin email addresses
const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',') || [];

export default async function AdminPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/signin');
  }

  // Check if user is admin
  if (!ADMIN_EMAILS.includes(user.email || '')) {
    redirect('/');
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
        <p className="text-zinc-400 mt-2">
          Monitor AI usage, manage users, and view system metrics
        </p>
      </div>

      <AdminDashboard />
    </div>
  );
}
