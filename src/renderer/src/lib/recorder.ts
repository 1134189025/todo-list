import type { VoiceClip } from '@shared/api'
import { encodeWavPcm16, toBase64 } from './wav'

// 录音：MediaRecorder 录下麦克风，结束后解码、重采样成 16 kHz 单声道，再编码成 WAV。
// Chromium 的 MediaRecorder 只出 webm/opus，Gemini 不收这个格式，所以要转一次。

const TARGET_SAMPLE_RATE = 16_000
const METER_FFT_SIZE = 1024
const METER_GAIN = 4

export type RecorderFailure = 'denied' | 'no-device' | 'busy' | 'failed'

export class RecorderError extends Error {
  constructor(readonly reason: RecorderFailure) {
    super(reason)
  }
}

export type Recording = {
  /** 结束录音并转成 WAV。 */
  stop(): Promise<VoiceClip>
  /** 放弃这次录音。 */
  cancel(): void
  /** 当前音量，0–1，用来画音量条。 */
  level(): number
}

function failureOf(error: unknown): RecorderFailure {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no-device'
  // Windows 隐私设置不让桌面应用用麦克风、或麦克风被别的程序独占时，Chromium 报的是这个。
  if (name === 'NotReadableError' || name === 'AbortError') return 'busy'
  return 'failed'
}

async function toClip(blob: Blob): Promise<VoiceClip> {
  const decoder = new AudioContext()
  try {
    const decoded = await decoder.decodeAudioData(await blob.arrayBuffer())
    const frames = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE))
    // 单声道的离线上下文：多声道会自动混成一路，同时重采样到 16 kHz。
    const offline = new OfflineAudioContext(1, frames, TARGET_SAMPLE_RATE)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    const rendered = await offline.startRendering()
    const wav = encodeWavPcm16(rendered.getChannelData(0), TARGET_SAMPLE_RATE)
    return { mimeType: 'audio/wav', data: toBase64(wav), seconds: Math.round(decoded.duration * 10) / 10 }
  } finally {
    void decoder.close().catch(() => undefined)
  }
}

export async function startRecording(): Promise<Recording> {
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
    })
  } catch (error) {
    throw new RecorderError(failureOf(error))
  }

  const chunks: Blob[] = []
  let recorder: MediaRecorder
  let meter: AudioContext | null = null
  let analyser: AnalyserNode
  try {
    recorder = new MediaRecorder(stream)
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    meter = new AudioContext()
    analyser = meter.createAnalyser()
    analyser.fftSize = METER_FFT_SIZE
    meter.createMediaStreamSource(stream).connect(analyser)
    recorder.start()
  } catch {
    // 麦克风已经打开了：出错也要关掉，不然 Windows 会一直显示麦克风在用。
    for (const track of stream.getTracks()) track.stop()
    void meter?.close().catch(() => undefined)
    throw new RecorderError('failed')
  }
  const frame = new Float32Array(analyser.fftSize)
  const openMeter = meter

  function release(): void {
    for (const track of stream.getTracks()) track.stop()
    void openMeter.close().catch(() => undefined)
  }

  return {
    stop(): Promise<VoiceClip> {
      return new Promise((resolve, reject) => {
        const finish = (): void => {
          release()
          toClip(new Blob(chunks, { type: recorder.mimeType })).then(resolve, () => reject(new RecorderError('failed')))
        }
        // 录音已经自己停了（比如设备被拔掉）：直接用已录到的部分。
        if (recorder.state === 'inactive') {
          finish()
          return
        }
        recorder.onstop = finish
        recorder.stop()
      })
    },
    cancel(): void {
      recorder.onstop = null
      if (recorder.state !== 'inactive') recorder.stop()
      release()
    },
    level(): number {
      analyser.getFloatTimeDomainData(frame)
      let sum = 0
      for (const sample of frame) sum += sample * sample
      return Math.min(1, Math.sqrt(sum / frame.length) * METER_GAIN)
    }
  }
}
