import { LanguageModelV1 } from "@ai-sdk/provider";
import {
  PortkeyChatCompletionSettings,
  PortkeyProvider,
} from "./portkey-provider";
import {
  getChatCompletionArgs,
  transformStream,
} from "./utils/portkey-chat-utils";
import { generateId } from "@ai-sdk/provider-utils";
import {
  defaultRequestOptions,
  mapOpenAIFinishReason,
} from "./utils/common-utils";

export class PortkeyChatLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = "v1";
  readonly provider: string;
  readonly defaultObjectGenerationMode = "json";

  readonly modelId: string;

  private readonly client: PortkeyProvider;
  private readonly settings: PortkeyChatCompletionSettings;

  constructor(
    modelId: string,
    client: PortkeyProvider,
    settings?: PortkeyChatCompletionSettings,
  ) {
    this.client = client;
    this.modelId = modelId;
    this.settings = settings ?? {};
    this.provider = client.provider ? "portkey-" + client.provider : "portkey";
  }

  async doGenerate(
    options: Parameters<LanguageModelV1["doGenerate"]>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1["doGenerate"]>>> {
    const { args, warnings } = getChatCompletionArgs(options, this.settings);
    const response = await this.client.chat.completions.create(
      {
        model: this.modelId,
        ...this.settings,
        ...args,
      },
      defaultRequestOptions,
    );
    const { messages: rawPrompt, ...rawSettings } = args;
    const choice = response.choices[0];
    if (!choice?.message) {
      throw new Error("No choice in response");
    }

    return {
      text: choice.message.content ?? undefined,
      toolCalls: choice.message.tool_calls?.map((toolCall) => ({
        toolCallType: "function",
        toolCallId: toolCall.id ?? "portkey-tool-call-" + generateId(),
        toolName: toolCall.function?.name ?? "",
        args: toolCall.function?.arguments ?? "",
      })),
      finishReason: mapOpenAIFinishReason(choice.finish_reason),
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? NaN,
        completionTokens: response.usage?.completion_tokens ?? NaN,
      },
      rawCall: { rawPrompt, rawSettings },
      warnings,
    };
  }

  async doStream(
    options: Parameters<LanguageModelV1["doStream"]>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1["doStream"]>>> {
    const { args, warnings } = getChatCompletionArgs(options, this.settings);
    const { messages: rawPrompt, ...rawSettings } = args;
    const response = this.client.chat.completions.create(
      {
        model: this.modelId,
        ...this.settings,
        ...args,
        stream: true,
      },
      defaultRequestOptions,
    );

    return {
      stream: await transformStream(response),
      rawCall: { rawPrompt, rawSettings },
      warnings,
    };
  }
}
