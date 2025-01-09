import ConversionForm from '@/components/ui/ConversionForms/ConversionForm';
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';

export default async function ConversionPage() {
  const supabase = createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    redirect('/login');
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      <h1 className="text-2xl font-bold mb-8">Conversion PDF vers Texte</h1>
      <ConversionForm user={user} />
    </div>
  );
} 