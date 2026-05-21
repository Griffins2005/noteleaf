// AudioWorklet processor: converts float32 input to int16 LINEAR_PCM chunks
// and transfers them to the main thread via MessagePort.
//
// Buffers 4096 samples (256ms @ 16kHz) before posting — matching the chunk
// size NVIDIA NIM expects and keeping the same latency as the old ScriptProcessorNode.

class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Float32Array(4096);
    this._n = 0;
  }

  process(inputs) {
    const ch = inputs[0]?.[0];
    if (!ch) return true;

    let pos = 0;
    while (pos < ch.length) {
      const take = Math.min(ch.length - pos, 4096 - this._n);
      this._buf.set(ch.subarray(pos, pos + take), this._n);
      this._n += take;
      pos += take;

      if (this._n === 4096) {
        const pcm = new Int16Array(4096);
        for (let i = 0; i < 4096; i++) {
          const s = Math.max(-1, Math.min(1, this._buf[i]));
          pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        // Transfer the buffer (zero-copy) to the main thread.
        this.port.postMessage(pcm.buffer, [pcm.buffer]);
        this._n = 0;
      }
    }
    return true;
  }
}

registerProcessor('pcm-processor', PcmProcessor);
