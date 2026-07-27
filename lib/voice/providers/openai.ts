import OpenAI from 'openai';
import { Voice, VoiceProvider, VoicePreview } from '../types';

// OpenAI's text-to-speech API (https://platform.openai.com/docs/guides/text-to-speech)
// doesn't expose a "list voices" endpoint — the catalog is a fixed set of
// named voices, documented here rather than invented. Because there's no
// static preview_url per voice, previews are synthesized on demand via
// synthesizePreview(), which calls the real TTS endpoint. The gpt-4o-mini-tts
// and tts-1 models both auto-detect the language of the input text, so any
// of these voices can speak any language it's given — no per-language
// voice selection needed.

const OPENAI_TTS_VOICES: Omit<Voice, 'previewUrl' | 'supportsMultilingual'>[] = [
  { id: 'alloy', name: 'Alloy', gender: 'neutral' },
  { id: 'echo', name: 'Echo', gender: 'male' },
  { id: 'fable', name: 'Fable', gender: 'male' },
  { id: 'onyx', name: 'Onyx', gender: 'male' },
  { id: 'nova', name: 'Nova', gender: 'female' },
  { id: 'shimmer', name: 'Shimmer', gender: 'female' }
];

export class OpenAiVoiceProvider implements VoiceProvider {
  readonly key = 'openai';
  readonly displayName = 'OpenAI';

  private client: OpenAI;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
    this.client = new OpenAI({ apiKey });
  }

  async listVoices(): Promise<Voice[]> {
    return OPENAI_TTS_VOICES.map((v) => ({
      ...v,
      previewUrl: null,
      supportsMultilingual: true
    }));
  }

  async synthesizePreview(voiceId: string, text: string): Promise<VoicePreview> {
    const response = await this.client.audio.speech.create({
      model: 'tts-1',
      voice: voiceId as any,
      input: text
    });

    const arrayBuffer = await response.arrayBuffer();
    return { audio: Buffer.from(arrayBuffer), contentType: 'audio/mpeg' };
  }
}
