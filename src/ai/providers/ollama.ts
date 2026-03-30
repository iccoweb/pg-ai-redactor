import type { AIProvider, AIProviderConfig } from "../provider.ts";
import type { ClassificationRequest, ClassificationResponse } from "../types.ts";
import { buildClassificationPrompt } from "../prompt-builder.ts";
import { parseClassificationResponse } from "../response-parser.ts";

export class OllamaProvider implements AIProvider {
  private baseUrl: string;
  private model: string;

  constructor(config: AIProviderConfig) {
    this.baseUrl = config.baseUrl || "http://localhost:11434";
    this.model = config.model || "llama3";
  }

  async classify(request: ClassificationRequest): Promise<ClassificationResponse> {
    const prompt = buildClassificationPrompt(request);

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: "json",
        messages: [
          {
            role: "system",
            content:
              "You are a HIPAA compliance analyst. Respond only with valid JSON, no markdown.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Ollama API error (${response.status}): ${text.slice(0, 200)}`,
      );
    }

    const data = (await response.json()) as { message?: { content?: string } };
    const content = data.message?.content;
    if (!content) {
      throw new Error("Ollama returned an empty response.");
    }

    return parseClassificationResponse(content);
  }
}
