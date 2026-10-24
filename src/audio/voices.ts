// Voice discovery for the browser speech API. The setup voice test lives here and never
// goes through the conversation speech controller or the reducer.
import type { VoiceInfo } from '@/runtime/contract';
import { VOICE_TEST_TEXT } from '@/runtime/contract';

export function getSynth(): SpeechSynthesis | null {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    if (typeof window.SpeechSynthesisUtterance !== 'function') return null;
    return window.speechSynthesis;
  } catch {
    return null;
  }
}

export function toVoiceInfo(v: SpeechSynthesisVoice): VoiceInfo {
  return { voiceURI: v.voiceURI, name: v.name, lang: v.lang, localService: v.localService, default: v.default };
}

export function listVoices(synth: Pick<SpeechSynthesis, 'getVoices'> | null): VoiceInfo[] {
  if (!synth) return [];
  try {
    return synth.getVoices().map(toVoiceInfo);
  } catch {
    return [];
  }
}

export function findVoice(synth: Pick<SpeechSynthesis, 'getVoices'> | null, voiceURI: string | null): SpeechSynthesisVoice | null {
  if (!synth || !voiceURI) return null;
  try {
    return synth.getVoices().find((v) => v.voiceURI === voiceURI) ?? null;
  } catch {
    return null;
  }
}

/** Calls `onChange` now and whenever the voice list updates. Returns an unsubscribe. */
export function subscribeVoices(synth: SpeechSynthesis | null, onChange: (voices: VoiceInfo[]) => void): () => void {
  if (!synth) {
    onChange([]);
    return () => {};
  }
  const handler = () => onChange(listVoices(synth));
  handler();
  try {
    synth.addEventListener('voiceschanged', handler);
  } catch {
    /* older engines */
  }
  // Some engines populate late without firing voiceschanged.
  const retry = setTimeout(handler, 1000);
  return () => {
    clearTimeout(retry);
    try {
      synth.removeEventListener('voiceschanged', handler);
    } catch {
      /* ignore */
    }
  };
}

/** Setup-only voice test: fixed text, deliberate activation, never in conversation history. */
export function speakVoiceTest(voiceURI: string | null, rate: number, lang = 'en-US'): boolean {
  const synth = getSynth();
  if (!synth) return false;
  try {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(VOICE_TEST_TEXT);
    const voice = findVoice(synth, voiceURI);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      u.lang = lang;
    }
    u.rate = rate;
    synth.speak(u);
    return true;
  } catch {
    return false;
  }
}
