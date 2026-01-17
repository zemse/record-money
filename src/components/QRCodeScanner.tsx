/**
 * QR Code Scanner Component
 *
 * Camera-based QR code scanning using html5-qrcode
 */

import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode'

interface QRCodeScannerProps {
  onScan: (result: string) => void
  onError?: (error: string) => void
  className?: string
}

export function QRCodeScanner({ onScan, onError, className }: QRCodeScannerProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const scannerId = useRef(`qr-scanner-${Date.now()}`)

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (scannerRef.current) {
        const state = scannerRef.current.getState()
        if (state === Html5QrcodeScannerState.SCANNING) {
          scannerRef.current
            .stop()
            .then(() => {
              scannerRef.current?.clear()
            })
            .catch(() => {})
        } else {
          scannerRef.current.clear()
        }
      }
    }
  }, [])

  const startScanning = async () => {
    setError(null)

    try {
      // Check camera permission
      const devices = await Html5Qrcode.getCameras()
      if (devices.length === 0) {
        const errorMsg = 'No camera found on this device'
        setError(errorMsg)
        onError?.(errorMsg)
        setHasPermission(false)
        return
      }

      setHasPermission(true)

      // Create scanner instance
      scannerRef.current = new Html5Qrcode(scannerId.current)

      // Start scanning with back camera preferred
      await scannerRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        (decodedText) => {
          // Success callback
          onScan(decodedText)
          stopScanning()
        },
        () => {
          // Ignore scan errors (no QR found in frame)
        }
      )

      setIsScanning(true)
    } catch (err) {
      const errorMsg =
        err instanceof Error
          ? err.message.includes('Permission')
            ? 'Camera permission denied. Please allow camera access.'
            : err.message
          : 'Failed to start camera'
      setError(errorMsg)
      onError?.(errorMsg)
      setHasPermission(false)
    }
  }

  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState()
        if (state === Html5QrcodeScannerState.SCANNING) {
          await scannerRef.current.stop()
        }
      } catch {
        // Ignore stop errors
      }
    }
    setIsScanning(false)
  }

  // Not started yet - show start button
  if (!isScanning && hasPermission === null) {
    return (
      <div className={`space-y-4 ${className ?? ''}`}>
        <div className="flex aspect-square items-center justify-center rounded-xl bg-surface-tertiary">
          <div className="text-center">
            <span className="text-4xl">📷</span>
            <p className="mt-2 text-sm text-content-secondary">Tap to scan QR code</p>
          </div>
        </div>
        <button
          onClick={startScanning}
          className="w-full rounded-xl bg-primary py-3 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
        >
          Start Camera
        </button>
      </div>
    )
  }

  // Permission denied or error
  if (hasPermission === false || error) {
    return (
      <div className={`space-y-4 ${className ?? ''}`}>
        <div className="flex aspect-square items-center justify-center rounded-xl bg-red-50 dark:bg-red-500/10">
          <div className="p-4 text-center">
            <span className="text-4xl">⚠️</span>
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              {error || 'Camera access denied'}
            </p>
          </div>
        </div>
        <button
          onClick={startScanning}
          className="w-full rounded-xl border border-border-default py-3 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover"
        >
          Try Again
        </button>
      </div>
    )
  }

  // Scanning active
  return (
    <div className={`space-y-4 ${className ?? ''}`}>
      <div className="relative overflow-hidden rounded-xl">
        <div id={scannerId.current} className="w-full" />
        {/* Scanning overlay */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-64 w-64 rounded-2xl border-4 border-white/50" />
        </div>
      </div>
      <div className="flex items-center justify-center gap-2 text-sm text-content-secondary">
        <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
        <span>Point camera at QR code</span>
      </div>
      <button
        onClick={stopScanning}
        className="w-full rounded-xl border border-border-default py-3 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover"
      >
        Cancel
      </button>
    </div>
  )
}
