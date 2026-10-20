/**
 * OpenRouter Client for Sovereign AI Receptionist (MCT OS v2.0)
 * Deterministic sampling (temperature 0.1) with timeout control and OpenRouter headers.
 */

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterCompletionOptions {
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface OpenRouterCompletionResult {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export class OpenRouterClient {
  private readonly defaultApiKey?: string;
  private readonly defaultModel: string;

  constructor(options: { apiKey?: string; defaultModel?: string } = {}) {
    this.defaultApiKey = options.apiKey || process.env.OPENROUTER_API_KEY;
    this.defaultModel =
      options.defaultModel ||
      process.env.OPENROUTER_MODEL ||
      "anthropic/claude-3.5-sonnet";
  }

  async complete(
    messages: OpenRouterMessage[],
    options: OpenRouterCompletionOptions = {}
  ): Promise<OpenRouterCompletionResult> {
    const apiKey = options.apiKey || this.defaultApiKey;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY_MISSING: OpenRouter API key is required but not configured");
    }

    const model = options.model || this.defaultModel;
    const temperature = options.temperature !== undefined ? options.temperature : 0.1;
    const maxTokens = options.maxTokens || 1024;
    const timeoutMs = options.timeoutMs || 20000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://chat.automatizaprocessos.tech",
          "X-Title": "SOS Vendas Commercial Receptionist",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new Error(
          `OPENROUTER_API_ERROR: HTTP ${response.status} from OpenRouter: ${errorBody}`
        );
      }

      const data = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string;
          };
        }>;
        model?: string;
        usage?: {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
        };
      };

      const choice = data.choices?.[0];
      const content = choice?.message?.content?.trim() || "";

      return {
        content,
        model: data.model || model,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
