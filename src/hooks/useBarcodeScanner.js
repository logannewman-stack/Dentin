import { useCallback, useEffect, useRef, useState } from 'react'

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'data_matrix']

/**
 * Barcode scanning off the rear camera.
 *
 * Prefers the platform BarcodeDetector (Chrome/Android, Safari 17+) because it
 * is hardware-accelerated and costs nothing to ship. Falls back to ZXing,
 * loaded on demand, so older iOS still scans.
 *
 * Dental packaging is mostly UPC-A/EAN-13 on the carton with a Data Matrix on
 * unit-of-use items, so both symbologies are enabled.
 */
export function useBarcodeScanner({ onDetect, enabled = true }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const controlsRef = useRef(null)
  const loopRef = useRef(0)
  const lastHit = useRef({ code: null, at: 0 })

  const [status, setStatus] = useState('idle') // idle | starting | scanning | denied | unsupported | error
  const [error, setError] = useState(null)
  const [torchOn, setTorchOn] = useState(false)
  const [torchAvailable, setTorchAvailable] = useState(false)

  const emit = useCallback(
    (code) => {
      if (!code) return
      const now = Date.now()
      // Debounce: a held camera re-reads the same symbol many times a second.
      if (lastHit.current.code === code && now - lastHit.current.at < 2500) return
      lastHit.current = { code, at: now }
      onDetect?.(code)
    },
    [onDetect],
  )

  const stop = useCallback(() => {
    cancelAnimationFrame(loopRef.current)
    loopRef.current = 0
    controlsRef.current?.stop?.()
    controlsRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setTorchOn(false)
    setStatus('idle')
  }, [])

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks?.()[0]
    if (!track) return
    try {
      const next = !torchOn
      await track.applyConstraints({ advanced: [{ torch: next }] })
      setTorchOn(next)
    } catch {
      setTorchAvailable(false)
    }
  }, [torchOn])

  useEffect(() => {
    if (!enabled) return undefined

    let cancelled = false

    async function start() {
      setStatus('starting')
      setError(null)

      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('unsupported')
        setError('This browser cannot open the camera.')
        return
      }

      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
      } catch (e) {
        if (cancelled) return
        setStatus(e?.name === 'NotAllowedError' ? 'denied' : 'error')
        setError(
          e?.name === 'NotAllowedError'
            ? 'Camera access was declined. Enable it in Settings to scan.'
            : 'Could not start the camera.',
        )
        return
      }

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      streamRef.current = stream
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        video.setAttribute('playsinline', 'true')
        try {
          await video.play()
        } catch {
          /* autoplay rejection is recoverable — the frame loop still runs */
        }
      }

      const track = stream.getVideoTracks()[0]
      setTorchAvailable(Boolean(track?.getCapabilities?.().torch))
      setStatus('scanning')

      // --- Path 1: platform detector ---
      if ('BarcodeDetector' in window) {
        try {
          const supported = await window.BarcodeDetector.getSupportedFormats()
          const detector = new window.BarcodeDetector({
            formats: FORMATS.filter((f) => supported.includes(f)),
          })

          const tick = async () => {
            if (cancelled || !videoRef.current) return
            try {
              const hits = await detector.detect(videoRef.current)
              if (hits?.length) emit(hits[0].rawValue)
            } catch {
              /* transient decode failures are normal between frames */
            }
            loopRef.current = requestAnimationFrame(tick)
          }
          loopRef.current = requestAnimationFrame(tick)
          return
        } catch {
          /* fall through to ZXing */
        }
      }

      // --- Path 2: ZXing, loaded only when actually needed ---
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        if (cancelled) return
        const reader = new BrowserMultiFormatReader()
        controlsRef.current = await reader.decodeFromVideoElement(
          videoRef.current,
          (result) => {
            if (result) emit(result.getText())
          },
        )
      } catch {
        if (!cancelled) {
          setStatus('error')
          setError('Barcode decoding is unavailable on this device.')
        }
      }
    }

    start()

    return () => {
      cancelled = true
      stop()
    }
  }, [enabled, emit, stop])

  return { videoRef, status, error, torchOn, torchAvailable, toggleTorch, stop }
}
