export class SpeechSession {
  constructor({ api, language, onPartial, onFinal, onError }) {
    Object.assign(this, { api, language, onPartial, onFinal, onError });
    this.parts = new Map(); this.started = new Map(); this.finished = new Set();
    this.pending = new Set(); this.stopped = false; this.lastEvent = 0;
  }
  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      const token = await this.api('/api/realtime/token', { method: 'POST', body: { language: this.language } });
      this.pc = new RTCPeerConnection();
      this.stream.getTracks().forEach(track => this.pc.addTrack(track, this.stream));
      this.dc = this.pc.createDataChannel('oai-events');
      this.dc.onmessage = event => this.message(event);
      this.pc.onconnectionstatechange = () => {
        if (['failed', 'closed'].includes(this.pc.connectionState) && !this.stopped) this.fail('CONNECTION_FAILED');
      };
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      const response = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST', headers: { Authorization: `Bearer ${token.value}`, 'Content-Type': 'application/sdp' },
        body: offer.sdp, signal: AbortSignal.timeout(25000),
      });
      if (!response.ok) throw new Error('CONNECTION_FAILED');
      await this.pc.setRemoteDescription({ type: 'answer', sdp: await response.text() });
      await new Promise((resolve, reject) => {
        if (this.dc.readyState === 'open') { resolve(); return; }
        const timer = setTimeout(() => reject(new Error('CONNECTION_FAILED')), 20000);
        this.dc.onopen = () => { clearTimeout(timer); resolve(); };
        this.dc.onerror = () => { clearTimeout(timer); reject(new Error('CONNECTION_FAILED')); };
      });
      this.startTime = Date.now();
    } catch (e) {
      this.stop();
      throw new Error(e.name === 'NotAllowedError' ? 'MICROPHONE_DENIED' : e.name === 'NotFoundError' ? 'NO_MICROPHONE' : e.message || 'CONNECTION_FAILED');
    }
  }
  message(event) {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }
    this.lastEvent = Date.now();
    if (data.type === 'input_audio_buffer.speech_started') {
      this.started.set(data.item_id, Math.max(0, data.audio_start_ms || Date.now() - this.startTime));
      this.pending.add(data.item_id);
    }
    if (data.type === 'conversation.item.input_audio_transcription.delta') {
      this.parts.set(data.item_id, (this.parts.get(data.item_id) || '') + (data.delta || ''));
      this.onPartial(this.parts.get(data.item_id));
    }
    if (data.type === 'conversation.item.input_audio_transcription.completed') {
      this.pending.delete(data.item_id);
      if (this.finished.has(data.item_id)) return;
      this.finished.add(data.item_id);
      const text = data.transcript?.trim();
      if (text) this.onFinal({ id: crypto.randomUUID(), text, time: this.started.get(data.item_id) || Math.max(0, Date.now() - this.startTime), translations: {} });
      this.parts.delete(data.item_id); this.onPartial('');
    }
    if (data.type === 'error' || data.type === 'conversation.item.input_audio_transcription.failed') this.fail('PROVIDER_ERROR');
  }
  pause(paused) { this.stream?.getAudioTracks().forEach(track => { track.enabled = !paused; }); }
  async finish() {
    this.pause(true);
    const deadline = Date.now() + 6000;
    await new Promise(resolve => setTimeout(resolve, 1000));
    while (!this.stopped && this.pending.size && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 120));
    const unflushed = this.pending.size > 0;
    this.stop();
    return { unflushed };
  }
  fail(code) { this.stop(); this.onError(code); }
  stop() {
    this.stopped = true;
    this.stream?.getTracks().forEach(track => track.stop());
    this.dc?.close(); this.pc?.close();
  }
}
