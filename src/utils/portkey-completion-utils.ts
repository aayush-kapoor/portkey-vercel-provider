import {
  InvalidPromptError,
  LanguageModelV1,
  LanguageModelV1CallWarning,
  LanguageModelV1FinishReason,
  LanguageModelV1Prompt,
  LanguageModelV1StreamPart,
  UnsupportedFunctionalityError,
} from "@ai-sdk/provider";

export function getArgs(
  {
    mode,
    inputFormat,
    prompt,
    maxTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    stopSequences: userStopSequences,
    responseFormat,
    seed,
  }: Parameters<LanguageModelV1["doGenerate"]>[0],
  settings?: PortkeyCompletionSettings,
) {
  const type = mode.type;

  const warnings: LanguageModelV1CallWarning[] = [];

  if (topK != null) {
    warnings.push({
      type: "unsupported-setting",
      setting: "topK",
    });
  }

  if (responseFormat != null && responseFormat.type !== "text") {
    warnings.push({
      type: "unsupported-setting",
      setting: "responseFormat",
      details: "JSON response format is not supported.",
    });
  }

  const { prompt: completionPrompt, stopSequences } =
    convertVercelLanguageModelPromptToPortkeyCompletionPrompt({
      prompt,
      inputFormat,
    });

  const stop = [...(stopSequences ?? []), ...(userStopSequences ?? []), ...(settings?.stop ?? [])];

  const baseArgs = {
    max_tokens: maxTokens || settings?.max_tokens,
    temperature: temperature || settings?.temperature,
    top_p: topP || settings?.top_p,
    frequency_penalty: frequencyPenalty || settings?.frequency_penalty,
    presence_penalty: presencePenalty || settings?.presence_penalty,
    seed,
    prompt: completionPrompt,

    // stop sequences:
    stop: stop.length ? stop : undefined,
  };

  switch (type) {
    case "regular": {
      if (mode.tools?.length) {
        throw new UnsupportedFunctionalityError({
          functionality: "tools",
        });
      }

      if (mode.toolChoice) {
        throw new UnsupportedFunctionalityError({
          functionality: "toolChoice",
        });
      }

      return { args: baseArgs, warnings };
    }

    case "object-json": {
      throw new UnsupportedFunctionalityError({
        functionality: "object-json mode",
      });
    }

    case "object-tool": {
      throw new UnsupportedFunctionalityError({
        functionality: "object-tool mode",
      });
    }

    default: {
      const _exhaustiveCheck: never = type;
      throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
    }
  }
}

export function convertVercelLanguageModelPromptToPortkeyCompletionPrompt({
  prompt,
  inputFormat,
  user = "user",
  assistant = "assistant",
}: {
  prompt: LanguageModelV1Prompt;
  inputFormat: "prompt" | "messages";
  user?: string;
  assistant?: string;
}): {
  prompt: string;
  stopSequences?: string[];
} {
  // When the user supplied a prompt input, we don't transform it:
  if (
    inputFormat === "prompt" &&
    prompt.length === 1 &&
    prompt[0].role === "user" &&
    prompt[0].content.length === 1 &&
    prompt[0].content[0].type === "text"
  ) {
    return { prompt: prompt[0].content[0].text };
  }

  // otherwise transform to a chat message format:
  let text = "";

  // if first message is a system message, add it to the text:
  if (prompt[0].role === "system") {
    text += `${prompt[0].content}\n\n`;
    prompt = prompt.slice(1);
  }

  for (const { role, content } of prompt) {
    switch (role) {
      case "system": {
        throw new InvalidPromptError({
          message: "Unexpected system message in prompt: ${content}",
          prompt,
        });
      }

      case "user": {
        const userMessage = content
          .map((part) => {
            switch (part.type) {
              case "text": {
                return part.text;
              }
              case "image": {
                throw new UnsupportedFunctionalityError({
                  functionality: "images",
                });
              }
            }
          })
          .join("");

        text += `${user}:\n${userMessage}\n\n`;
        break;
      }

      case "assistant": {
        const assistantMessage = content
          .map((part) => {
            switch (part.type) {
              case "text": {
                return part.text;
              }
              case "tool-call": {
                throw new UnsupportedFunctionalityError({
                  functionality: "tool-call messages",
                });
              }
            }
          })
          .join("");

        text += `${assistant}:\n${assistantMessage}\n\n`;
        break;
      }

      case "tool": {
        throw new UnsupportedFunctionalityError({
          functionality: "tool messages",
        });
      }

      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }

  // Assistant message prefix:
  text += `${assistant}:\n`;

  return {
    prompt: text,
    stopSequences: [`\n${user}:`],
  };
}

import { LanguageModelV1LogProbs } from "@ai-sdk/provider";
import { APIResponseType } from "portkey-ai/dist/src/_types/generalTypes";
import { APIPromise } from "portkey-ai/dist/src/baseClient";
import { Stream } from "portkey-ai/dist/src/streaming";
import { mapOpenAIFinishReason } from "./common-utils";
import { PortkeyCompletionSettings } from "../portkey-provider";

type OpenAICompletionLogProps = {
  tokens: string[];
  token_logprobs: number[];
  top_logprobs: Record<string, number>[] | null;
};

export function mapOpenAICompletionLogProbs(
  logprobs: OpenAICompletionLogProps | null | undefined,
): LanguageModelV1LogProbs | undefined {
  return logprobs?.tokens.map((token, index) => ({
    token,
    logprob: logprobs.token_logprobs[index],
    topLogprobs: logprobs.top_logprobs
      ? Object.entries(logprobs.top_logprobs[index]).map(
          ([token, logprob]) => ({
            token,
            logprob,
          }),
        )
      : [],
  }));
}

interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface Choices {
  index?: number;
  text?: string;
  logprobs: any;
  finish_reason?: string;
}

interface TextCompletion extends APIResponseType {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<Choices>;
  usage?: Usage;
}

export async function transformStream(
  inputStream: APIPromise<Stream<TextCompletion>>,
): Promise<ReadableStream<LanguageModelV1StreamPart>> {
  const stream = await inputStream;
  let finishReason: LanguageModelV1FinishReason = "unknown";
  let usage: { promptTokens: number; completionTokens: number } = {
    promptTokens: Number.NaN,
    completionTokens: Number.NaN,
  };
  let logprobs: LanguageModelV1LogProbs;

  return new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (chunk.usage != null) {
          usage = {
            promptTokens: chunk.usage.prompt_tokens ?? 0,
            completionTokens: chunk.usage.completion_tokens ?? 0,
          };
        }

        const choice = chunk.choices[0];

        if (choice?.finish_reason != null) {
          finishReason = mapOpenAIFinishReason(choice.finish_reason);
        }

        if (choice?.text != null) {
          controller.enqueue({
            type: "text-delta",
            textDelta: choice.text,
          });
        }

        const mappedLogprobs = mapOpenAICompletionLogProbs(choice?.logprobs);
        if (mappedLogprobs?.length) {
          if (logprobs === undefined) logprobs = [];
          logprobs.push(...mappedLogprobs);
        }
      }

      controller.enqueue({
        type: "finish",
        finishReason,
        logprobs,
        usage,
      });
      controller.close();
    },
  });
}
