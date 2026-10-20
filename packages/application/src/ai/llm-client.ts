/**
 * Sovereign Multi-Provider LLM Client (MCT OS v2.0)
 * Native support for Nvidia NIM and OpenRouter with deterministic sampling (temperature 0.1).
 */

export type AiProvider = "nvidia" | "openrouter";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmCompletionOptions {
  provider?: AiProvider;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface LlmCompletionResult {
  content: string;
  model: string;
  provider: AiProvider;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  nvidia: "nvidia/nemotron-3-super-120b-a12b",
  openrouter: "anthropic/claude-3.5-sonnet",
};

export const PROVIDER_BASE_URLS: Record<AiProvider, string> = {
  nvidia: "https://integrate.api.nvidia.com/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
};

export class SovereignLlmClient {
  private readonly defaultProvider: AiProvider;

  constructor(options: { defaultProvider?: AiProvider } = {}) {
    this.defaultProvider = options.defaultProvider || "nvidia";
  }

  async complete(
    messages: LlmMessage[],
    options: LlmCompletionOptions = {}
  ): Promise<LlmCompletionResult> {
    const provider: AiProvider = options.provider || this.defaultProvider;

    // Resolve API key: option -> provider-specific env -> generic env
    let apiKey = options.apiKey;
    if (!apiKey) {
      if (provider === "nvidia") {
        apiKey = process.env.NVIDIA_API_KEY || process.env.NVAPI_KEY;
      } else {
        apiKey = process.env.OPENROUTER_API_KEY;
      }
    }

    if (!apiKey || !apiKey.trim()) {
      throw new Error(
        `LLM_API_KEY_MISSING: API key for provider '${provider}' is required but not configured`
      );
    }

    const model =
      options.model ||
      (provider === "nvidia"
        ? process.env.NVIDIA_TEMPLATE_MODEL || process.env.NVIDIA_MODEL || DEFAULT_MODELS.nvidia
        : process.env.OPENROUTER_MODEL || DEFAULT_MODELS.openrouter);

    const temperature = options.temperature !== undefined ? options.temperature : 0.1;
    const maxTokens = options.maxTokens || 1024;
    const timeoutMs = options.timeoutMs || 25000;

    const endpoint = PROVIDER_BASE_URLS[provider];
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.trim()}`,
    };

    if (provider === "openrouter") {
      headers["HTTP-Referer"] = "https://chat.automatizaprocessos.tech";
      headers["X-Title"] = "SOS Vendas Commercial Receptionist";
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
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
          `LLM_API_ERROR: HTTP ${response.status} from ${provider.toUpperCase()}: ${errorBody}`
        );
      }

      const data = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string;
            reasoning_content?: string;
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
      const content =
        choice?.message?.content?.trim() ||
        choice?.message?.reasoning_content?.trim() ||
        "";

      return {
        content,
        model: data.model || model,
        provider,
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
