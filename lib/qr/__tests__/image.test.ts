import { describe, it, expect } from 'vitest'
import { generateQRImage } from '@/lib/qr/image'

describe('generateQRImage', () => {
  it('returns a string containing <svg', async () => {
    const result = await generateQRImage('https://example.com')
    expect(result).toContain('<svg')
  })

  it('encodes the provided URL in the SVG output', async () => {
    const url = 'https://example.com/scan?init_token=test'
    const result = await generateQRImage(url)
    expect(result).toContain('<svg')
    expect(result.length).toBeGreaterThan(100)
  })

  it('resolves successfully for a typical HTTPS URL', async () => {
    await expect(generateQRImage('https://hotel.example.com/scan?init_token=abc123')).resolves.toBeDefined()
  })
})
