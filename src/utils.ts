export function defaultHeadersBuilder(client: any) {
    const customHeaders = client.customHeaders;
    const portkeyHeaders = client.portkeyHeaders;

    if (
        Object.prototype.hasOwnProperty.call(customHeaders, "authorization") &&
        !customHeaders["authorization"].startsWith("Bearer")
    ) {
        client.customHeaders["authorization"] =
            "Bearer " + client.customHeaders["authorization"];
    }

    return { ...customHeaders, ...portkeyHeaders };
}

export function decodeBase64ToUint8Array(base64: string): Uint8Array {
    if (typeof Buffer !== "undefined") {
        return Uint8Array.from(Buffer.from(base64, "base64"));
    } else {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }
}

/**
 * Fetches an image from a URL and converts it to a base64 string.
 * This function is edge-friendly and works in both Node.js and browser environments.
 * 
 * @param url - The URL of the image to fetch
 * @returns A Promise that resolves to a base64 string representation of the image
 */
export async function fetchImageAsBase64(url: string): Promise<string> {
    const response = await fetch(url);
    
    if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    if (typeof Buffer !== "undefined") {
        return Buffer.from(uint8Array).toString('base64');
    } else {
        let binary = '';
        const len = uint8Array.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(uint8Array[i]);
        }
        return btoa(binary);
    }
}

/**
 * Removes entries from a record where the value is null or undefined.
 * @param record - The input object whose entries may be null or undefined.
 * @returns A new object containing only entries with non-null and non-undefined values.
 */
export function removeUndefinedEntries<T>(
    record: Record<string, T | undefined>,
  ): Record<string, T> {
    return Object.fromEntries(
      Object.entries(record).filter(([, value]) => value !== null),
    ) as Record<string, T>
  }

export function withUserAgentSuffix(
headers: HeadersInit | Record<string, string | undefined> | undefined,
...userAgentSuffixParts: string[]
): Record<string, string> {
const cleanedHeaders = removeUndefinedEntries(
    (headers as Record<string, string | undefined>) ?? {},
)

const currentUserAgentHeader = cleanedHeaders['user-agent'] || ''
const newUserAgent = [currentUserAgentHeader, ...userAgentSuffixParts]
    .filter(Boolean)
    .join(' ')

return {
    ...cleanedHeaders,
    'user-agent': newUserAgent,
}
}
