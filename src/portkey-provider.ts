import { ApiClientInterface } from "portkey-ai/dist/src/_types/generalTypes";
import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleCompletionLanguageModel,
  OpenAICompatibleEmbeddingModel,
  OpenAICompatibleChatSettings,
  OpenAICompatibleCompletionSettings,
  OpenAICompatibleEmbeddingSettings,
} from "@ai-sdk/openai-compatible";
import { FetchFunction } from "@ai-sdk/provider-utils";
import { Portkey } from "portkey-ai";
import { defaultHeadersBuilder } from "./utils";
import {
  LanguageModelV1,
  ProviderV1,
  EmbeddingModelV1,
  ImageModelV1,
  ImageModelV1CallOptions,
} from "@ai-sdk/provider";

export type PortkeyClient = InstanceType<typeof Portkey>;

export interface PortkeyProvider extends PortkeyClient, ProviderV1 {
  (modelId: string): LanguageModelV1;

  chatModel(
    modelId: string,
    settings?: OpenAICompatibleChatSettings
  ): LanguageModelV1;

  completionModel(
    modelId: string,
    settings?: OpenAICompatibleCompletionSettings
  ): LanguageModelV1;

  textEmbeddingModel(
    modelId: string,
    settings?: OpenAICompatibleEmbeddingSettings
  ): EmbeddingModelV1<string>;

  imageModel(
    modelId: string,
    settings?: { maxImagesPerCall: number }
  ): ImageModelV1;
}

interface CommonModelConfig {
  provider: string;
  url: ({ path }: { path: string }) => string;
  headers: () => Record<string, string>;
  fetch?: FetchFunction;
}

export function createPortkey(
  options: ApiClientInterface = {}
): Omit<PortkeyProvider, "chat" | "completions"> {
  const portkeyProvider = new Portkey(options) as PortkeyProvider;

  const headers = defaultHeadersBuilder(portkeyProvider);
  const getHeaders = () => headers;

  const getCommonModelConfig = (modelType: string): CommonModelConfig => ({
    provider: `portkey.${modelType}`,
    url: ({ path }) => `${portkeyProvider.baseURL}${path}`, //TODO: Check if this is correct
    headers: getHeaders,
    fetch: options.fetch,
  });

  const createChatModel = (
    modelId: string,
    settings: OpenAICompatibleChatSettings = {}
  ) => {
    return new OpenAICompatibleChatLanguageModel(modelId, settings, {
      ...getCommonModelConfig("chat"),
      defaultObjectGenerationMode: "tool",
    });
  };

  const createCompletionModel = (
    modelId: string,
    settings: OpenAICompatibleCompletionSettings = {}
  ) =>
    new OpenAICompatibleCompletionLanguageModel(
      modelId,
      settings,
      getCommonModelConfig("completion")
    );

  const createTextEmbeddingModel = (
    modelId: string,
    settings: OpenAICompatibleEmbeddingSettings = {}
  ) =>
    new OpenAICompatibleEmbeddingModel(
      modelId,
      settings,
      getCommonModelConfig("embedding")
    );

  const createImageModel = (
    modelId: string,
    settings: { maxImagesPerCall: number } = { maxImagesPerCall: 1 }
  ) => {
    return {
      ...getCommonModelConfig("image"),
      specificationVersion: "v1",
      modelId: modelId,
      maxImagesPerCall: settings.maxImagesPerCall,
      doGenerate: async (options: ImageModelV1CallOptions) => {
        try {
          const result = await portkeyProvider.images.generate({
            model: modelId,
            prompt: options.prompt,
            n: options.n,
            size: options.size,
          });

          return {
            images: result.data.map((img) => img.url),
            warnings: [],
            response: {
              timestamp: new Date(result.created),
              modelId: modelId,
              headers: undefined,
            },
          };
        } catch (error) {
          console.error("Error in image model", error);

          let errorMessage = "Unknown error";
          if (error.response) {
            errorMessage = `Error ${error.response.status}: ${error.response.statusText}`;
          } else if (error.message) {
            errorMessage = error.message;
          }

          return {
            images: [],
            warnings: [errorMessage],
            response: {
              timestamp: new Date(),
              modelId: modelId,
              headers: undefined,
            },
          };
        }
      },
    } as ImageModelV1;
  };

  portkeyProvider.completionModel = createCompletionModel;
  portkeyProvider.languageModel = createChatModel;
  portkeyProvider.chatModel = createChatModel;
  portkeyProvider.textEmbeddingModel = createTextEmbeddingModel;
  portkeyProvider.imageModel = createImageModel;
  
  return portkeyProvider;
}
