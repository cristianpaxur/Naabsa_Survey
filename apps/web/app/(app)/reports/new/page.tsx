import { createClient } from '@/lib/supabase/server';
import { Wizard, type WizardType } from '@/components/wizard/Wizard';

const TYPE_ORDER = [
  'draft_survey',
  'bunker_surveyor',
  'msc',
  'on_off_hire',
  'rob',
];

export default async function NewReportPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('report_types')
    .select('id,slug,name,variants,active_spec_id');
  const rows = (data ?? []) as {
    id: string;
    slug: string;
    name: string;
    variants: string[];
    active_spec_id: string | null;
  }[];

  const types: WizardType[] = rows
    .map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      variants: t.variants,
      hasActiveSpec: t.active_spec_id !== null,
    }))
    .sort((a, b) => TYPE_ORDER.indexOf(a.slug) - TYPE_ORDER.indexOf(b.slug));

  return <Wizard types={types} />;
}
