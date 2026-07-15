import { getTranslations } from 'next-intl/server'
import type { ProfileFormValues } from './profile-step-form'

interface Props {
  initialValues: ProfileFormValues
}

export default async function ProfileReadonly({ initialValues }: Props) {
  const t = await getTranslations('onboarding.profile.fields')

  const fields: Array<[string, string | null]> = [
    [t('name'), initialValues.name],
    [t('address'), initialValues.address],
    [t('phone'), initialValues.phone_reception],
    [t('timezone'), initialValues.timezone],
    [t('checkIn'), initialValues.check_in_time],
    [t('checkOut'), initialValues.check_out_time],
    [t('logoUrl'), initialValues.logo_url],
  ]

  return (
    <dl className="space-y-3">
      {fields.map(([label, value]) => (
        <div key={label}>
          <dt className="text-sm font-medium text-panel-ink-muted">{label}</dt>
          <dd className="text-base">{value || '—'}</dd>
        </div>
      ))}
    </dl>
  )
}
