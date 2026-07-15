'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { saveHotelProfile } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

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
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(`errors.${error}`)}
        </p>
      )}
      {saved && (
        <p className="rounded-md border border-panel-success/30 bg-panel-success/10 px-3 py-2 text-sm text-panel-success">
          {t('actions.saved')}
        </p>
      )}
      <div className="space-y-1">
        <Label htmlFor="profile-name">{t('fields.name')}</Label>
        <Input id="profile-name" value={name} onChange={e => setName(e.target.value)} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="profile-address">{t('fields.address')}</Label>
        <Input id="profile-address" value={address} onChange={e => setAddress(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="profile-phone">{t('fields.phone')}</Label>
        <Input id="profile-phone" value={phoneReception} onChange={e => setPhoneReception(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="profile-timezone">{t('fields.timezone')}</Label>
        <Select value={timezone} onValueChange={setTimezone}>
          <SelectTrigger id="profile-timezone" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIMEZONES.map(tz => (
              <SelectItem key={tz} value={tz}>{tz}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="profile-check-in">{t('fields.checkIn')}</Label>
        <Input
          id="profile-check-in"
          type="time"
          value={checkInTime}
          onChange={e => setCheckInTime(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="profile-check-out">{t('fields.checkOut')}</Label>
        <Input
          id="profile-check-out"
          type="time"
          value={checkOutTime}
          onChange={e => setCheckOutTime(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="profile-logo-url">{t('fields.logoUrl')}</Label>
        <Input id="profile-logo-url" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? t('actions.saving') : t('actions.save')}
      </Button>
    </form>
  )
}
