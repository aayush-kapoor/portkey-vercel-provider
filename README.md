# Vercel AI SDK - Portkey Provider

The **[Portkey provider](https://sdk.vercel.ai/providers/community-providers/portkey)** for the [Vercel AI SDK](https://sdk.vercel.ai/docs)
contains language model support for the Portkey chat and completion APIs.

## Setup

The Portkey provider is available in the `portkey-ai-provider` module. You can install it with

```bash
pnpm add portkey-ai-provider
```

### Provider and Model

```ts
import { createPortkey } from '@ai-sdk/portkey'
const llmClient = createPortkey(
  {
    apiKey: {{PORTKEY_API_KEY}},
    config: {{PORTKEY_CONFIG_ID}},
  }
)
```

## Example

```ts
  const response = await generateText({
    model: llmClient.chatModel({{MODEL_ID}}),
    messages: [
      {
        role: "user",
        content: "What is a portkey?"
      }
    ],
    maxTokens: 40
  })

console.log(response)
```

## Provider Instance

You can import the default provider instance `portkey` from `portkey-ai-provider`:

```ts
import { portkey } from 'portkey-ai-provider';
```

## Example

```ts
import { portkey } from 'portkey-ai-provider';
import { generateText } from 'ai';

const { text } = await generateText({
  model: portkey('gpt-4-turbo'),
  prompt: 'What is a portkey?',
});
```

## Documentation

Please check out the **[Portkey provider documentation](https://docs.portkey.ai/docs/integrations/libraries/vercel)** for more information.
