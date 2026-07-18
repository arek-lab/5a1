import { createServiceRoleClient } from '@/lib/supabase/service-role'

export interface PropertyDpaStatus {
  id: string
  name: string
  dpaSignedAt: string | null
}

export async function listPropertiesDpa(): Promise<PropertyDpaStatus[]> {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('properties')
    .select('id, name, dpa_signed_at')
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    dpaSignedAt: row.dpa_signed_at,
  }))
}

export async function markDpaSigned(
  propertyId: string
): Promise<{ updated: boolean }> {
  const db = createServiceRoleClient()
  // Filtr .is(null): raz ustawiony podpis DPA jest nienadpisywalny z aplikacji —
  // cofnięcie to świadoma operacja SQL, żeby nie dało się przypadkiem
  // przestawić daty warunkującej gate generowania QR (HITL #11).
  const { data, error } = await db
    .from('properties')
    .update({ dpa_signed_at: new Date().toISOString() })
    .eq('id', propertyId)
    .is('dpa_signed_at', null)
    .select('id')

  if (error) throw new Error(error.message)
  return { updated: (data ?? []).length > 0 }
}
