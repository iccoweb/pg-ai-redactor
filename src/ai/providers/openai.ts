import OpenAI from "openai";
import type { AIProvider, AIProviderConfig } from "../provider.ts";
import type { ClassificationRequest, ClassificationResponse } from "../types.ts";
import { buildClassificationPrompt } from "../prompt-builder.ts";
import { parseClassificationResponse } from "../response-parser.ts";

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;

  constructor(config: AIProviderConfig) {
    if (!config.apiKey) {
      throw new Error("OpenAI API key is required. Set ai.apiKey or OPENAI_API_KEY env var.");
    }
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl ?? undefined,
    });
    this.model = config.model || "gpt-4o";
    this.maxTokens = config.maxTokens || 4096;
  }

  async classify(request: ClassificationRequest): Promise<ClassificationResponse> {
    const prompt = buildClassificationPrompt(request);

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: "You are a HIPAA compliance analyst. Respond only with valid JSON.",
        },
        { role: "user", content: prompt },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned an empty response.");
    }

    return parseClassificationResponse(content);
  }
}
