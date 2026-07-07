import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createServerClient } from '@/lib/supabase/server'
import { getHotelUser } from '@/lib/panel/auth'
import { canPerform } from '@/lib/panel/rbac'
import RequirePermission from '@/components/panel/require-permission'
import KnowledgeList, { type KnowledgeRecord } from './knowledge-list'
import LocalAreaSection from './local-area-section'

export default async function KnowledgePage() {
  const hotelUser = await getHotelUser()
  if (!hotelUser) redirect('/login')

  const supabase = await createServerClient()
  const { data: entries } = await supabase
    .from('knowledge_chunks')
    .select('id, question, content, category, language, valid_from, valid_until, content_hash')
    .eq('property_id', hotelUser.propertyId)
    .in('category', ['faq', 'local'])
    .order('created_at')

  const allEntries = (entries ?? []) as KnowledgeRecord[]
  const faqEntries = allEntries.filter(e => e.category === 'faq')
  const localEntries = allEntries.filter(e => e.category === 'local')

  const canEdit = canPerform(hotelUser.role, 'knowledge', 'write')
  const t = await getTranslations('knowledge')

  return (
    <RequirePermission role={hotelUser.role} resource="knowledge" level="read">
      <main className="mx-auto max-w-4xl space-y-8 p-6">
        <div>
          <h1 className="mb-6 text-2xl font-semibold">{t('list.title')}</h1>
          <KnowledgeList entries={faqEntries} canEdit={canEdit} />
        </div>
        <div>
          <h2 className="mb-4 border-b pb-1 text-xl font-semibold">{t('local.title')}</h2>
          <LocalAreaSection entries={localEntries} canEdit={canEdit} />
        </div>
      </main>
    </RequirePermission>
  )
}
