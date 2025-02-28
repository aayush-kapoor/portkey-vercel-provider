import { Portkey } from 'portkey-ai';
import {
  ImageModelV1,
  ImageModelV1CallOptions,
  ImageModelV1CallWarning,
} from '@ai-sdk/provider';
import type { Image } from 'portkey-ai/dist/src/apis/images';
import { fetchImageAsBase64 } from './utils';

export class PortkeyImageModel implements ImageModelV1 {
  readonly specificationVersion: 'v1' = 'v1';
  readonly provider: string;
  readonly modelId: string;
  readonly maxImagesPerCall: number | undefined;
  private portkey: Portkey;

  /**
   * Creates an instance of PortkeyImageModel.
   *
   * @param portkey - The Portkey client instance.
   * @param modelId - The provider-specific image model ID.
   * @param config  - Optional configuration, including the maximum images per call and provider name.
   */
  constructor(
    portkey: Portkey,
    modelId: string,
    config?: { maxImagesPerCall?: number; provider?: string }
  ) {
    this.portkey = portkey;
    this.modelId = modelId;
    this.maxImagesPerCall = config?.maxImagesPerCall;
    this.provider = config?.provider || 'portkey.image';
  }

  /**
   * Generates images based on the provided options.
   *
   * - Checks for unsupported settings (aspectRatio, seed) and returns warnings.
   * - Uses any provider-specific options specified under "portkey" in providerOptions.
   * - Handles errors gracefully.
   * - Always returns base64 encoded strings, fetching URLs if necessary.
   *
   * @param options - Options for the image generation call.
   * @returns An object containing the generated images as base64 strings, any warnings, and response metadata.
   */
  async doGenerate(
    options: ImageModelV1CallOptions
  ): Promise<{
    images: Array<string>;
    warnings: Array<ImageModelV1CallWarning>;
    response: {
      timestamp: Date;
      modelId: string;
      headers: Record<string, string> | undefined;
    };
  }> {
    if (this.maxImagesPerCall !== undefined && options.n > this.maxImagesPerCall) {
      throw new Error(
        `Too many images requested: ${options.n}. Maximum allowed is ${this.maxImagesPerCall}.`
      );
    }

    const warnings: ImageModelV1CallWarning[] = [];

    if (options.aspectRatio) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'aspectRatio',
        details: 'Aspect ratio setting is not supported and will be ignored.',
      });
    }
    if (options.seed) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'seed',
        details: 'Seed setting is not supported and will be ignored.',
      });
    }

    const portkeyOptions = options.providerOptions?.['portkey'] || {};

    try {
      const result = await this.portkey.images.generate({
        model: this.modelId,
        prompt: options.prompt,
        n: options.n,
        size: options.size,
        ...portkeyOptions,
        abortSignal: options.abortSignal,
        headers: options.headers,
      });

      const base64Images: Promise<string>[] = result.data.map(async (img: Image) => {
        if (img.url) {
          return await fetchImageAsBase64(img.url);
        } else if (img.b64_json) {
          return img.b64_json;
        }
        throw new Error('Image data contains neither URL nor base64 content');
      });

      const images = await Promise.all(base64Images);

      return {
        images,
        warnings,
        response: {
          timestamp: new Date(result.created || Date.now()),
          modelId: this.modelId,
          headers: undefined, // TODO: Add headers from the response if available.
        },
      };
    } catch (error: any) {
      console.error('Error in PortkeyImageModel.doGenerate:', error);
      let errorMessage = 'Unknown error';

      if (error.response?.status) {
        errorMessage = `HTTP Error ${error.response.status}${
          error.response.statusText ? `: ${error.response.statusText}` : ''
        }`;
      } else if (error.message) {
        errorMessage = error.message;
      }

      warnings.push({ type: 'other', message: errorMessage });
      return {
        images: [],
        warnings,
        response: {
          timestamp: new Date(),
          modelId: this.modelId,
          headers: undefined,
        },
      };
    }
  }
}
