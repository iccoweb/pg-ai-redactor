import type { AIProvider, AIProviderConfig } from "./provider.ts";
import { OpenAIProvider } from "./providers/openai.ts";
import { AnthropicProvider } from "./providers/anthropic.ts";
import { OllamaProvider } from "./providers/ollama.ts";

export function createAIProvider(config: AIProviderConfig): AIProvider {
  switch (config.provider) {
    case "openai":
      return new OpenAIProvider(config);
    case "anthropic":
      return new AnthropicProvider(config);
    case "ollama":
      return new OllamaProvider(config);
    default:
      throw new Error(`Unsupported AI provider: ${config.provider}`);
  }
}
