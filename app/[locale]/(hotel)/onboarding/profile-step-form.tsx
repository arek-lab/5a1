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

  const inputClass = 'w-full rounded border px-2 py-1'
  const labelClass = 'flex flex-col gap-1 text-sm font-medium'

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {t(`errors.${error}`)}
        </p>
      )}
      {saved && (
        <p className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
          {t('actions.saved')}
        </p>
      )}
      <label className={labelClass}>
        {t('fields.name')}
        <input className={inputClass} value={name} onChange={e => setName(e.target.value)} required />
      </label>
      <label className={labelClass}>
        {t('fields.address')}
        <input className={inputClass} value={address} onChange={e => setAddress(e.target.value)} />
      </label>
      <label className={labelClass}>
        {t('fields.phone')}
        <input className={inputClass} value={phoneReception} onChange={e => setPhoneReception(e.target.value)} />
      </label>
      <label className={labelClass}>
        {t('fields.timezone')}
        <select className={inputClass} value={timezone} onChange={e => setTimezone(e.target.value)}>
          {TIMEZONES.map(tz => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        {t('fields.checkIn')}
        <input
          className={inputClass}
          type="time"
          value={checkInTime}
          onChange={e => setCheckInTime(e.target.value)}
        />
      </label>
      <label className={labelClass}>
        {t('fields.checkOut')}
        <input
          className={inputClass}
          type="time"
          value={checkOutTime}
          onChange={e => setCheckOutTime(e.target.value)}
        />
      </label>
      <label className={labelClass}>
        {t('fields.logoUrl')}
        <input className={inputClass} value={logoUrl} onChange={e => setLogoUrl(e.target.value)} />
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? t('actions.saving') : t('actions.save')}
      </button>
    </form>
  )
}
