import { ApiClientInterface } from "portkey-ai/dist/src/_types/generalTypes";
import { PortkeyChatLanguageModel } from "./portkey-chat-language-model";
import { PortkeyCompletionLanguageModel } from "./portkey-completion-langugage-model";
import { Portkey } from "portkey-ai";
import { CompletionsBodyNonStreaming } from "portkey-ai/dist/src/apis/completions";
import { ChatCompletionsBodyNonStreaming } from "portkey-ai/dist/src/apis/chatCompletions";

export type PortkeyClient = InstanceType<typeof Portkey>;
export type PortkeyCompletionSettings = Omit<
  CompletionsBodyNonStreaming,
  "prompt"
>;
export type PortkeyChatCompletionSettings = Omit<
  ChatCompletionsBodyNonStreaming,
  "messages"
>;

export interface PortkeyProvider extends PortkeyClient {
  (modelId: string): PortkeyCompletionLanguageModel;

  completionModel(
    modelId: string,
    settings?: PortkeyCompletionSettings,
  ): PortkeyCompletionLanguageModel;
  chatModel(
    modelId: string,
    settings?: PortkeyChatCompletionSettings,
  ): PortkeyChatLanguageModel;
}

export function createPortkey(
  options: ApiClientInterface = {},
): Omit<PortkeyProvider, "chat" | "completions"> {
  const portkeyProvider = new Portkey(options) as PortkeyProvider;

  (modelId: string) =>
    new PortkeyCompletionLanguageModel(modelId, portkeyProvider, {});

  const createCompletionModel = (
    modelId: string,
    settings?: PortkeyCompletionSettings,
  ) => {
    return new PortkeyCompletionLanguageModel(
      modelId,
      portkeyProvider,
      settings,
    );
  };
  const createChatModel = (
    modelId: string,
    settings?: PortkeyChatCompletionSettings,
  ) => {
    return new PortkeyChatLanguageModel(modelId, portkeyProvider, settings);
  };

  portkeyProvider.completionModel = createCompletionModel;
  portkeyProvider.chatModel = createChatModel;
  return portkeyProvider;
}
