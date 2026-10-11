import { logger } from "@sos-sales/observability";

export interface WhisperTranscriberOptions {
  apiKey?: string;
  provider?: "groq" | "openai";
  timeoutMs?: number;
}

export class WhisperTranscriber {
  private readonly apiKey: string | null;
  private readonly provider: "groq" | "openai";
  private readonly timeoutMs: number;

  constructor(options: WhisperTranscriberOptions = {}) {
    this.apiKey =
      options.apiKey ||
      process.env.GROQ_API_KEY ||
      process.env.OPENAI_API_KEY ||
      null;

    this.provider =
      options.provider ||
      (process.env.GROQ_API_KEY ? "groq" : "openai");

    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  /**
   * Transcribes an audio Buffer (.ogg, .mp3, .wav) to Portuguese text using Groq or OpenAI Whisper.
   * Returns null if not configured or if an error occurs (fail-open for operational resilience).
   */
  async transcribeAudio(audioBuffer: Buffer, mimeType = "audio/ogg"): Promise<string | null> {
    if (!this.apiKey) {
      return null;
    }

    const endpoint =
      this.provider === "groq"
        ? "https://api.groq.com/openai/v1/audio/transcriptions"
        : "https://api.openai.com/v1/audio/transcriptions";

    const model = this.provider === "groq" ? "whisper-large-v3-turbo" : "whisper-1";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
      formData.append("file", blob, "voice_message.ogg");
      formData.append("model", model);
      formData.append("language", "pt");
      formData.append("response_format", "json");

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.warn(
          { status: response.status, errorText, provider: this.provider },
          "Whisper STT transcription API returned non-200"
        );
        return null;
      }

      const json = (await response.json()) as { text?: string };
      const text = json.text?.trim() || null;

      if (text) {
        logger.info(
          { textLength: text.length, provider: this.provider, model },
          "Audio voice note transcribed successfully"
        );
      }

      return text;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ error: msg, provider: this.provider }, "Failed to transcribe audio via Whisper");
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
