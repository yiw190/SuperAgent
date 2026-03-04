import { useState, useRef, useCallback, useEffect } from 'react'

export type VoiceInputState = 'idle' | 'loading' | 'recording' | 'transcribing'

interface UseVoiceInputReturn {
  state: VoiceInputState
  toggleRecording: () => void
  error: string | null
}

export function useVoiceInput(onTranscript: (text: string) => void): UseVoiceInputReturn {
  const [state, setState] = useState<VoiceInputState>('idle')
  const [error, setError] = useState<string | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const modelLoadedRef = useRef(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      workerRef.current?.terminate()
    }
  }, [])

  const getWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current
    const worker = new Worker(new URL('../workers/whisper-worker.ts', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker
    return worker
  }, [])

  const ensureModelLoaded = useCallback((): Promise<void> => {
    if (modelLoadedRef.current) return Promise.resolve()

    return new Promise((resolve, reject) => {
      const worker = getWorker()
      const handler = (e: MessageEvent) => {
        if (e.data.type === 'loaded') {
          modelLoadedRef.current = true
          worker.removeEventListener('message', handler)
          resolve()
        } else if (e.data.type === 'error') {
          worker.removeEventListener('message', handler)
          reject(new Error(e.data.message))
        }
      }
      worker.addEventListener('message', handler)
      worker.postMessage({ type: 'load' })
    })
  }, [getWorker])

  const processAudio = useCallback(async (audioBlob: Blob): Promise<Float32Array> => {
    const arrayBuffer = await audioBlob.arrayBuffer()
    const audioContext = new AudioContext({ sampleRate: 16000 })
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    const float32 = audioBuffer.getChannelData(0) // mono
    await audioContext.close()
    return float32
  }, [])

  const startRecording = useCallback(async () => {
    setError(null)

    // Load model first if needed
    if (!modelLoadedRef.current) {
      setState('loading')
      try {
        await ensureModelLoaded()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load model')
        setState('idle')
        return
      }
    }

    // Request microphone
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      audioChunksRef.current = []

      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        // Stop mic
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null

        if (audioChunksRef.current.length === 0) {
          setState('idle')
          return
        }

        setState('transcribing')
        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
          const float32 = await processAudio(audioBlob)

          const worker = getWorker()
          const handler = (e: MessageEvent) => {
            if (e.data.type === 'transcript') {
              worker.removeEventListener('message', handler)
              if (e.data.text) onTranscript(e.data.text)
              setState('idle')
            } else if (e.data.type === 'error') {
              worker.removeEventListener('message', handler)
              setError(e.data.message)
              setState('idle')
            }
          }
          worker.addEventListener('message', handler)
          worker.postMessage({ type: 'transcribe', audio: float32 }, [float32.buffer])
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Audio processing failed')
          setState('idle')
        }
      }

      mediaRecorder.start()
      setState('recording')
    } catch (err) {
      setError('Microphone access denied')
      setState('idle')
    }
  }, [ensureModelLoaded, processAudio, getWorker, onTranscript])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  const toggleRecording = useCallback(() => {
    if (state === 'recording') {
      stopRecording()
    } else if (state === 'idle') {
      startRecording()
    }
    // Ignore clicks during loading/transcribing
  }, [state, startRecording, stopRecording])

  return { state, toggleRecording, error }
}
