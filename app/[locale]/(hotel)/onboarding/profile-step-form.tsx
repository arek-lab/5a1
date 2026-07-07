'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { saveHotelProfile } from './actions'

export type ProfileFormValues = {
  name: string
  address: string | null
  phone_reception: string | null
  timezone: string
  check_in_time: string | null
  check_out_time: string | null
  logo_url: string | null
}

const TIMEZONES = ['Europe/Warsaw', 'Europe/London', 'Europe/Berlin', 'UTC']

interface Props {
  initialValues: ProfileFormValues
}

export default function ProfileStepForm({ initialValues }: Props) {
  const t = useTranslations('onboarding.profile')
  const [name, setName] = useState(initialValues.name)
  const [address, setAddress] = useState(initialValues.address ?? '')
  const [phoneReception, setPhoneReception] = useState(initialValues.phone_reception ?? '')
  const [timezone, setTimezone] = useState(initialValues.timezone || TIMEZONES[0])
  const [checkInTime, setCheckInTime] = useState(initialValues.check_in_time?.slice(0, 5) ?? '')
  const [checkOutTime, setCheckOutTime] = useState(initialValues.check_out_time?.slice(0, 5) ?? '')
  const [logoUrl, setLogoUrl] = useState(initialValues.logo_url ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    const formData = new FormData()
    formData.set('name', name)
    formData.set('address', address)
    formData.set('phone_reception', phoneReception)
    formData.set('timezone', timezone)
    formData.set('check_in_time', checkInTime)
    formData.set('check_out_time', checkOutTime)
    formData.set('logo_url', logoUrl)

    startTransition(async () => {
      const result = await saveHotelProfile(formData)
      if (result.error) {
        setError(result.error)
      } else {
        setSaved(true)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p role="alert">{t(`errors.${error}`)}</p>}
      {saved && <p>{t('actions.saved')}</p>}
      <label>
        {t('fields.name')}
        <input value={name} onChange={e => setName(e.target.value)} required />
      </label>
      <label>
        {t('fields.address')}
        <input value={address} onChange={e => setAddress(e.target.value)} />
      </label>
      <label>
        {t('fields.phone')}
        <input value={phoneReception} onChange={e => setPhoneReception(e.target.value)} />
      </label>
      <label>
        {t('fields.timezone')}
        <select value={timezone} onChange={e => setTimezone(e.target.value)}>
          {TIMEZONES.map(tz => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </label>
      <label>
        {t('fields.checkIn')}
        <input type="time" value={checkInTime} onChange={e => setCheckInTime(e.target.value)} />
      </label>
      <label>
        {t('fields.checkOut')}
        <input type="time" value={checkOutTime} onChange={e => setCheckOutTime(e.target.value)} />
      </label>
      <label>
        {t('fields.logoUrl')}
        <input value={logoUrl} onChange={e => setLogoUrl(e.target.value)} />
      </label>
      <button type="submit" disabled={isPending}>
        {isPending ? t('actions.saving') : t('actions.save')}
      </button>
    </form>
  )
}
