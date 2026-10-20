import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SovereignLlmClient } from "../ai/llm-client";

describe("SovereignLlmClient", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  });

  it("defaults to nvidia provider and calls Nvidia NIM completions endpoint", async () => {
    process.env.NVIDIA_API_KEY = "nvapi-test-key";

    const mockResponse = {
      choices: [
        {
          message: {
            content: "Olá! Posso te ajudar com o catálogo?",
          },
        },
      ],
      usage: {
        prompt_tokens: 15,
        completion_tokens: 10,
        total_tokens: 25,
      },
    };

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    globalThis.fetch = fetchSpy;

    const client = new SovereignLlmClient();
    const result = await client.complete(
      [{ role: "user", content: "Oi" }],
      { provider: "nvidia" }
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0] as [string, any];
    expect(url).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    expect(options.headers["Authorization"]).toBe("Bearer nvapi-test-key");
    expect(result.content).toBe("Olá! Posso te ajudar com o catálogo?");
    expect(result.provider).toBe("nvidia");
    expect(result.model).toBe("nvidia/nemotron-3-super-120b-a12b");
  });

  it("routes to OpenRouter with proper headers when provider is openrouter", async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: "Resposta do Claude via OpenRouter.",
          },
        },
      ],
    };

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    globalThis.fetch = fetchSpy;

    const client = new SovereignLlmClient();
    const result = await client.complete(
      [{ role: "user", content: "Olá" }],
      {
        provider: "openrouter",
        apiKey: "sk-or-custom-key",
        model: "anthropic/claude-3.5-sonnet",
      }
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0] as [string, any];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(options.headers["Authorization"]).toBe("Bearer sk-or-custom-key");
    expect(options.headers["HTTP-Referer"]).toBe("https://chat.automatizaprocessos.tech");
    expect(result.content).toBe("Resposta do Claude via OpenRouter.");
    expect(result.provider).toBe("openrouter");
    expect(result.model).toBe("anthropic/claude-3.5-sonnet");
  });

  it("throws clear error when API key is missing", async () => {
    delete process.env.NVIDIA_API_KEY;
    delete process.env.AI_RECEPTIONIST_API_KEY;

    const client = new SovereignLlmClient();
    await expect(
      client.complete([{ role: "user", content: "Olá" }], { provider: "nvidia" })
    ).rejects.toThrow("LLM_API_KEY_MISSING");
  });
});
