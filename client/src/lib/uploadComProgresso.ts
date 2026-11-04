export type ProgressoTransmissao = { loaded: number; total: number; lengthComputable: boolean };
export type CallbacksUpload = { onProgress?: (progresso: ProgressoTransmissao) => void; onUploaded?: () => void };

/** Adapta XHR à interface fetch usada por httpLink; não altera o protocolo tRPC. */
export function criarFetchComProgresso(callbacks: CallbacksUpload) {
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (typeof XMLHttpRequest === "undefined") return globalThis.fetch(input, init);
    return new Promise((resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) { reject(new DOMException("Envio cancelado.", "AbortError")); return; }
      const xhr = new XMLHttpRequest();
      let encerrado = false;
      const abortar = () => xhr.abort();
      const limpar = () => {
        signal?.removeEventListener("abort", abortar);
        xhr.upload.onprogress = null; xhr.upload.onload = null;
        xhr.onload = null; xhr.onerror = null; xhr.onabort = null; xhr.ontimeout = null;
      };
      const falhar = (erro: Error) => { if (encerrado) return; encerrado = true; limpar(); reject(erro); };
      try {
        xhr.open(init?.method ?? "GET", typeof input === "string" ? input : input instanceof URL ? input.href : input.url, true);
        xhr.withCredentials = init?.credentials === "include";
        xhr.timeout = 10 * 60 * 1000;
        new Headers(init?.headers).forEach((value, name) => xhr.setRequestHeader(name, value));
        xhr.upload.onprogress = event => callbacks.onProgress?.({ loaded: event.loaded, total: event.total, lengthComputable: event.lengthComputable });
        // Somente transmissão. Não é confirmação do servidor/armazenamento.
        xhr.upload.onload = () => callbacks.onUploaded?.();
        xhr.onerror = () => falhar(new Error("Falha de conexão ao enviar o PDF. Verifique sua internet antes de tentar novamente."));
        xhr.onabort = () => falhar(new DOMException("Envio cancelado.", "AbortError"));
        xhr.ontimeout = () => falhar(new Error("O envio excedeu o tempo de espera. Verifique o documento no sistema antes de tentar novamente."));
        xhr.onload = () => {
          if (encerrado) return;
          if (!xhr.status) { falhar(new Error("O servidor não retornou uma resposta ao upload.")); return; }
          try {
            const headers = new Headers();
            xhr.getAllResponseHeaders().trim().split(/[\r\n]+/).forEach(line => {
              const pos = line.indexOf(":");
              if (pos > 0) headers.append(line.slice(0, pos).trim(), line.slice(pos + 1).trim());
            });
            const semCorpo = [204, 205, 304].includes(xhr.status);
            const response = new Response(semCorpo ? null : xhr.responseText, { status: xhr.status, statusText: xhr.statusText, headers });
            encerrado = true; limpar(); resolve(response);
          } catch (error) { falhar(error instanceof Error ? error : new Error("Resposta de upload inválida.")); }
        };
        signal?.addEventListener("abort", abortar, { once: true });
        xhr.send((init?.body ?? null) as XMLHttpRequestBodyInit | null);
      } catch (error) { falhar(error instanceof Error ? error : new Error("Não foi possível iniciar o envio.")); }
    });
  };
}
