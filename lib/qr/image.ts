import QRCode from 'qrcode'

export async function generateQRImage(url: string): Promise<string> {
  if (!url) throw new Error('url must not be empty')
  return QRCode.toString(url, { type: 'svg' })
}
