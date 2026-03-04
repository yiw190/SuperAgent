import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'

let transcriber: AutomaticSpeechRecognitionPipeline | null = null

self.onmessage = async (e: MessageEvent) => {
  const { type } = e.data

  if (type === 'load') {
    try {
      self.postMessage({ type: 'loading', message: 'Loading Whisper model...' })
      transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base.en', {
        dtype: 'q8',
        device: 'wasm',
      })
      self.postMessage({ type: 'loaded' })
    } catch (error) {
      self.postMessage({ type: 'error', message: `Failed to load model: ${error}` })
    }
    return
  }

  if (type === 'transcribe') {
    if (!transcriber) {
      self.postMessage({ type: 'error', message: 'Model not loaded' })
      return
    }
    try {
      const { audio } = e.data as { type: string; audio: Float32Array }
      const result = await transcriber(audio, { language: 'en', task: 'transcribe' })
      const text = Array.isArray(result) ? result[0].text : result.text
      self.postMessage({ type: 'transcript', text: text.trim() })
    } catch (error) {
      self.postMessage({ type: 'error', message: `Transcription failed: ${error}` })
    }
  }
}
