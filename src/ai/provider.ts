import type { ClassificationRequest, ClassificationResponse } from "./types.ts";

export interface AIProvider {
  classify(request: ClassificationRequest): Promise<ClassificationResponse>;
}

export interface AIProviderConfig {
  provider: "openai" | "anthropic" | "ollama";
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
}
