import {
  InvalidResponseDataError,
  LanguageModelV1,
  LanguageModelV1CallWarning,
  LanguageModelV1FinishReason,
  LanguageModelV1LogProbs,
  LanguageModelV1Prompt,
  LanguageModelV1StreamPart,
} from "@ai-sdk/provider";
import {
  convertUint8ArrayToBase64,
  generateId,
  isParsableJson,
} from "@ai-sdk/provider-utils";
import { APIPromise } from "portkey-ai/dist/src/baseClient";
import { Stream } from "portkey-ai/dist/src/streaming";
import { APIResponseType } from "portkey-ai/dist/src/_types/generalTypes";
import { mapOpenAIFinishReason as mapPortkeyFinishReason } from "./common-utils";
import { PortkeyChatCompletionSettings } from "../portkey-provider";

export function getChatCompletionArgs(
  {
    mode,
    prompt,
    maxTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    stopSequences,
    responseFormat,
    seed,
  }: Parameters<LanguageModelV1["doGenerate"]>[0],
  settings: PortkeyChatCompletionSettings,
): {
  args: Record<string, any> & { stream: false };
  warnings: LanguageModelV1CallWarning[];
} {
  const type = mode.type;

  const warnings: LanguageModelV1CallWarning[] = [];

  if (topK != null) {
    warnings.push({
      type: "unsupported-setting",
      setting: "topK",
    });
  }

  if (
    responseFormat != null &&
    responseFormat.type === "json" &&
    responseFormat.schema != null
  ) {
    warnings.push({
      type: "unsupported-setting",
      setting: "responseFormat",
      details: "JSON response format schema is not supported",
    });
  }

  const baseArgs = {
    max_tokens: maxTokens || settings?.max_tokens,
    temperature: temperature || settings?.temperature,
    top_p: topP || settings?.top_p,
    frequency_penalty: frequencyPenalty || settings?.frequency_penalty,
    presence_penalty: presencePenalty || settings?.presence_penalty,
    stop: stopSequences || settings?.stop,
    seed: seed,

    // response format:
    response_format:
      responseFormat?.type === "json" ? { type: "json_object" } : undefined,

    // messages:
    messages: convertToPortkeyChatMessages({
      prompt,
    }),
  };

  switch (type) {
    case "regular": {
      return {
        args: {
          ...baseArgs,
          ...prepareToolsAndToolChoice({
            mode,
          }),
          stream: false,
        },
        warnings,
      };
    }

    case "object-json": {
      return {
        args: {
          ...baseArgs,
          response_format: { type: "json_object" },
          stream: false,
        },
        warnings,
      };
    }

    case "object-tool": {
      return {
        args: {
          ...baseArgs,
          tool_choice: {
            type: "function",
            function: { name: mode.tool.name },
          },
          tools: [
            {
              type: "function",
              function: {
                name: mode.tool.name,
                description: mode.tool.description,
                parameters: mode.tool.parameters,
              },
            },
          ],
          stream: false,
        },
        warnings,
      };
    }

    default: {
      const _exhaustiveCheck: never = type;
      throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
    }
  }
}

export function convertToPortkeyChatMessages({
  prompt,
}: {
  prompt: LanguageModelV1Prompt;
  useLegacyFunctionCalling?: boolean;
}): any {
  // TODO: This is currently not exported from portkey-sdk, so we've typed it as any.
  const messages: any = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case "system": {
        messages.push({ role: "system", content });
        break;
      }

      case "user": {
        if (content.length === 1 && content[0].type === "text") {
          messages.push({ role: "user", content: content[0].text });
          break;
        }

        messages.push({
          role: "user",
          content: content.map((part) => {
            switch (part.type) {
              case "text": {
                return { type: "text", text: part.text };
              }
              case "image": {
                return {
                  type: "image_url",
                  image_url: {
                    url:
                      part.image instanceof URL
                        ? part.image.toString()
                        : `data:${
                            part.mimeType ?? "image/jpeg"
                          };base64,${convertUint8ArrayToBase64(part.image)}`,
                  },
                };
              }
            }
          }),
        });

        break;
      }

      case "assistant": {
        let text = "";
        const toolCalls: Array<{
          id: string;
          type: "function";
          function: { name: string; arguments: string };
        }> = [];

        for (const part of content) {
          switch (part.type) {
            case "text": {
              text += part.text;
              break;
            }
            case "tool-call": {
              toolCalls.push({
                id: part.toolCallId,
                type: "function",
                function: {
                  name: part.toolName,
                  arguments: JSON.stringify(part.args),
                },
              });
              break;
            }
            default: {
              const _exhaustiveCheck: never = part;
              throw new Error(`Unsupported part: ${_exhaustiveCheck}`);
            }
          }
        }

        messages.push({
          role: "assistant",
          content: text,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        });

        break;
      }

      case "tool": {
        for (const toolResponse of content) {
          messages.push({
            role: "tool",
            tool_call_id: toolResponse.toolCallId,
            content: JSON.stringify(toolResponse.result),
          });
        }
        break;
      }

      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }

  return messages;
}

function prepareToolsAndToolChoice({
  mode,
}: {
  mode: Parameters<LanguageModelV1["doGenerate"]>[0]["mode"] & {
    type: "regular";
  };
  useLegacyFunctionCalling?: boolean;
  structuredOutputs?: boolean;
}) {
  // when the tools array is empty, change it to undefined to prevent errors:
  const tools = mode.tools?.length ? mode.tools : undefined;

  if (tools == null) {
    return { tools: undefined, tool_choice: undefined };
  }

  const toolChoice = mode.toolChoice;

  const mappedTools = tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));

  if (toolChoice == null) {
    return { tools: mappedTools, tool_choice: undefined };
  }

  const type = toolChoice.type;

  switch (type) {
    case "auto":
    case "none":
    case "required":
      return { tools: mappedTools, tool_choice: type };
    case "tool":
      return {
        tools: mappedTools,
        tool_choice: {
          type: "function",
          function: {
            name: toolChoice.toolName,
          },
        },
      };
    default: {
      const _exhaustiveCheck: never = type;
      throw new Error(`Unsupported tool choice type: ${_exhaustiveCheck}`);
    }
  }
}

type PortkeyChatLogProbs = {
  content:
    | {
        token: string;
        logprob: number;
        top_logprobs:
          | {
              token: string;
              logprob: number;
            }[]
          | null;
      }[]
    | null;
};

export function mapPortkeyChatLogProbsOutput(
  logprobs: PortkeyChatLogProbs | null | undefined,
): LanguageModelV1LogProbs | undefined {
  return (
    logprobs?.content?.map(({ token, logprob, top_logprobs }) => ({
      token,
      logprob,
      topLogprobs: top_logprobs
        ? top_logprobs.map(({ token, logprob }) => ({
            token,
            logprob,
          }))
        : [],
    })) ?? undefined
  );
}

interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface FunctionType {
  arguments?: string;
  name?: string;
}

interface ToolCall {
  index?: number;
  id?: string;
  function?: FunctionType;
  type?: "function";
}

interface FunctionCall {
  arguments?: string;
  name?: string;
}

interface Message {
  role: string;
  content: string | null;
  function_call?: FunctionCall;
  tool_calls?: Array<ToolCall>;
}

interface Choices {
  index?: number;
  message?: Message;
  delta?: Message;
  finish_reason?: string;
}

interface ChatCompletion extends APIResponseType {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<Choices>;
  usage: Usage;
}

export async function transformStream(
  inputStream: APIPromise<Stream<ChatCompletion>>,
): Promise<ReadableStream<LanguageModelV1StreamPart>> {
  const stream = await inputStream;
  const toolCalls: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }> = [];

  let finishReason: LanguageModelV1FinishReason = "unknown";
  let usage: {
    promptTokens: number | undefined;
    completionTokens: number | undefined;
  } = {
    promptTokens: undefined,
    completionTokens: undefined,
  };
  let logprobs: LanguageModelV1LogProbs;
  return new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (chunk.usage != null) {
          usage = {
            promptTokens: chunk.usage.prompt_tokens ?? undefined,
            completionTokens: chunk.usage.completion_tokens ?? undefined,
          };
        }

        const choice = chunk.choices[0];

        if (choice?.finish_reason != null) {
          finishReason = mapPortkeyFinishReason(choice.finish_reason);
        }

        if (choice?.delta == null) {
          return;
        }

        const delta = choice.delta;

        if (delta.content != null) {
          controller.enqueue({
            type: "text-delta",
            textDelta: delta.content,
          });
        }

        //   const mappedLogprobs = mapOpenAIChatLogProbsOutput(
        //     choice?.logprobs,
        //   );
        //   if (mappedLogprobs?.length) {
        //     if (logprobs === undefined) logprobs = [];
        //     logprobs.push(...mappedLogprobs);
        //   }

        const mappedToolCalls: typeof delta.tool_calls = delta.tool_calls;

        if (mappedToolCalls != null) {
          for (const toolCallDelta of mappedToolCalls) {
            if (toolCallDelta.index == null) continue;
            const index = toolCallDelta.index;

            // Tool call start. Portkey returns all information except the arguments in the first chunk.
            if (toolCalls[index] == null) {
              if (toolCallDelta.type !== "function") {
                throw new InvalidResponseDataError({
                  data: toolCallDelta,
                  message: `Expected 'function' type.`,
                });
              }

              if (toolCallDelta.id == null) {
                throw new InvalidResponseDataError({
                  data: toolCallDelta,
                  message: `Expected 'id' to be a string.`,
                });
              }

              if (toolCallDelta.function?.name == null) {
                throw new InvalidResponseDataError({
                  data: toolCallDelta,
                  message: `Expected 'function.name' to be a string.`,
                });
              }

              toolCalls[index] = {
                id: toolCallDelta.id,
                type: "function",
                function: {
                  name: toolCallDelta.function.name,
                  arguments: toolCallDelta.function.arguments ?? "",
                },
              };

              const toolCall = toolCalls[index];

              // check if tool call is complete (some providers send the full tool call in one chunk)
              if (
                toolCall.function?.name != null &&
                toolCall.function?.arguments != null &&
                isParsableJson(toolCall.function.arguments)
              ) {
                // send delta
                controller.enqueue({
                  type: "tool-call-delta",
                  toolCallType: "function",
                  toolCallId: toolCall.id,
                  toolName: toolCall.function.name,
                  argsTextDelta: toolCall.function.arguments,
                });

                // send tool call
                controller.enqueue({
                  type: "tool-call",
                  toolCallType: "function",
                  toolCallId: toolCall.id ?? generateId(),
                  toolName: toolCall.function.name,
                  args: toolCall.function.arguments,
                });
              }

              continue;
            }

            // existing tool call, merge
            const toolCall = toolCalls[index];

            if (toolCallDelta.function?.arguments != null) {
              toolCall.function!.arguments +=
                toolCallDelta.function?.arguments ?? "";
            }

            // send delta
            controller.enqueue({
              type: "tool-call-delta",
              toolCallType: "function",
              toolCallId: toolCall.id,
              toolName: toolCall.function.name,
              argsTextDelta: toolCallDelta.function?.arguments ?? "",
            });

            // check if tool call is complete
            if (
              toolCall.function?.name != null &&
              toolCall.function?.arguments != null &&
              isParsableJson(toolCall.function.arguments)
            ) {
              controller.enqueue({
                type: "tool-call",
                toolCallType: "function",
                toolCallId: toolCall.id ?? generateId(),
                toolName: toolCall.function.name,
                args: toolCall.function.arguments,
              });
            }
          }
        }
      }
      controller.close();
    },
  });
}
