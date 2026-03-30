import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, AIProviderConfig } from "../provider.ts";
import type { ClassificationRequest, ClassificationResponse } from "../types.ts";
import { buildClassificationPrompt } from "../prompt-builder.ts";
import { parseClassificationResponse } from "../response-parser.ts";

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(config: AIProviderConfig) {
    if (!config.apiKey) {
      throw new Error("Anthropic API key is required. Set ai.apiKey or ANTHROPIC_API_KEY env var.");
    }
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl ?? undefined,
    });
    this.model = config.model || "claude-sonnet-4-20250514";
    this.maxTokens = config.maxTokens || 4096;
  }

  async classify(request: ClassificationRequest): Promise<ClassificationResponse> {
    const prompt = buildClassificationPrompt(request);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages: [{ role: "user", content: prompt }],
      system:
        "You are a HIPAA compliance analyst. Respond only with valid JSON, no markdown.",
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Anthropic returned no text content.");
    }

    return parseClassificationResponse(textBlock.text);
  }
}
