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
