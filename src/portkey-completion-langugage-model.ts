import { LanguageModelV1, LanguageModelV1FinishReason, LanguageModelV1LogProbs, LanguageModelV1StreamPart } from "@ai-sdk/provider";
import { getArgs, transformStream } from "./utils/portkey-completion-utils";
import { PortkeyCompletionSettings, PortkeyProvider } from "./portkey-provider";
import { defaultRequestOptions } from "./utils/common-utils";


export class PortkeyCompletionLanguageModel implements LanguageModelV1 {
    readonly specificationVersion = 'v1';
    readonly provider: string;
    readonly defaultObjectGenerationMode = 'json';

    readonly modelId: string;

    private readonly client: PortkeyProvider;
    private readonly settings: PortkeyCompletionSettings;
    

    constructor(modelId: string, client: PortkeyProvider, settings?: PortkeyCompletionSettings) {
        this.client = client;
        this.modelId = modelId;
        this.settings = settings ?? {};
        this.provider = client.provider ? 'portkey-' + client.provider : 'portkey';
    }

    async doGenerate(
        options: Parameters<LanguageModelV1['doGenerate']>[0],
      ): Promise<Awaited<ReturnType<LanguageModelV1['doGenerate']>>> {
        const { args, warnings } = getArgs(options, this.settings);
        const response = await this.client.completions.create({
            model: this.modelId,
            ...this.settings,
            ...args,
        }, defaultRequestOptions)
        
        const { prompt: rawPrompt, ...rawSettings } = args;
        const choice = response.choices[0];

        return {
          text: choice.text,
          usage: {
            promptTokens: response.usage?.prompt_tokens ?? 0,
            completionTokens: response.usage?.completion_tokens ?? 0,
          },
          finishReason: choice.finish_reason as LanguageModelV1FinishReason,
          logprobs: choice.logprobs,
          rawCall: { rawPrompt, rawSettings },
          warnings,
        };
    }

    async doStream(
        options: Parameters<LanguageModelV1['doStream']>[0],
      ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
        const { args, warnings } = getArgs(options, this.settings);
        const { prompt: rawPrompt, ...rawSettings } = args;
        const response = this.client.completions.create({
            model: this.modelId,
            ...this.settings,
            stream: true,
            ...args,
        }, defaultRequestOptions);

        return {
            stream: await transformStream(response),
            rawCall: { rawPrompt, rawSettings },
            warnings,
        }
      }

}