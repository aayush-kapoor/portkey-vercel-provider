import { ApiClientInterface } from "portkey-ai/dist/src/_types/generalTypes";
import {
  OpenAICompatibleChatLanguageModel,
  OpenAICompatibleCompletionLanguageModel,
  OpenAICompatibleEmbeddingModel,
  OpenAICompatibleChatSettings,
  OpenAICompatibleCompletionSettings,
  OpenAICompatibleEmbeddingSettings,
} from "@ai-sdk/openai-compatible";
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from "@ai-sdk/provider-utils";
import { Portkey } from "portkey-ai";
import { defaultHeadersBuilder } from "portkey-ai/dist/src/utils";
import {
  LanguageModelV1,
  ProviderV1,
  EmbeddingModelV1,
} from "@ai-sdk/provider";

export type PortkeyClient = InstanceType<typeof Portkey>;

export interface PortkeyProvider extends PortkeyClient, ProviderV1 {
  (modelId: string): LanguageModelV1;

  chatModel(
    modelId: string,
    settings?: OpenAICompatibleChatSettings,
  ): LanguageModelV1;

  completionModel(
    modelId: string,
    settings?: OpenAICompatibleCompletionSettings,
  ): LanguageModelV1;

  textEmbeddingModel(
    modelId: string,
    settings?: OpenAICompatibleEmbeddingSettings,
  ): EmbeddingModelV1<string>;
}

interface CommonModelConfig {
  provider: string;
  url: ({ path }: { path: string }) => string;
  headers: () => Record<string, string>;
  fetch?: FetchFunction;
}

export function createPortkey(
  options: ApiClientInterface = {},
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
    settings: OpenAICompatibleChatSettings = {},
  ) => {
    return new OpenAICompatibleChatLanguageModel(modelId, settings, {
      ...getCommonModelConfig("chat"),
      defaultObjectGenerationMode: "tool",
    });
  };

  const createCompletionModel = (
    modelId: string,
    settings: OpenAICompatibleCompletionSettings = {},
  ) =>
    new OpenAICompatibleCompletionLanguageModel(
      modelId,
      settings,
      getCommonModelConfig("completion"),
    );

  const createTextEmbeddingModel = (
    modelId: string,
    settings: OpenAICompatibleEmbeddingSettings = {},
  ) =>
    new OpenAICompatibleEmbeddingModel(
      modelId,
      settings,
      getCommonModelConfig("embedding"),
    );

  portkeyProvider.completionModel = createCompletionModel;
  portkeyProvider.languageModel = createChatModel;
  portkeyProvider.chatModel = createChatModel;
  portkeyProvider.textEmbeddingModel = createTextEmbeddingModel;
  return portkeyProvider;
}
