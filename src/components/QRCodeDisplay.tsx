/**
 * QR Code Display Component
 *
 * Renders a QR code from a string value using qrcode.react
 */

import { QRCodeSVG } from 'qrcode.react'

interface QRCodeDisplayProps {
  value: string
  size?: number
  className?: string
}

export function QRCodeDisplay({ value, size = 256, className }: QRCodeDisplayProps) {
  return (
    <div className={`flex items-center justify-center rounded-xl bg-white p-4 ${className ?? ''}`}>
      <QRCodeSVG
        value={value}
        size={size}
        level="M" // Medium error correction
        includeMargin={false}
      />
    </div>
  )
}
