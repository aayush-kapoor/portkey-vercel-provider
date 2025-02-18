export function defaultHeadersBuilder(client: any) {
    const customHeaders = client.customHeaders;
    const portkeyHeaders = client.portkeyHeaders;
  
    // Logic to add Bearer only if it is not present.
    // Else it would be added everytime a request is made
    if (
      Object.prototype.hasOwnProperty.call(customHeaders, 'authorization') &&
      !customHeaders['authorization'].startsWith('Bearer')
    ) {
      client.customHeaders['authorization'] =
        'Bearer ' + client.customHeaders['authorization'];
    }
  
    return { ...customHeaders, ...portkeyHeaders };
  }