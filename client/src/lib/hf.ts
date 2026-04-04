import { GenerationParams } from "./store";

// When VITE_WORKER_URL is set, all inference is proxied through the Cloudflare
// Worker and the HF API key never leaves the server. Falls back to calling HF
// directly from the browser when the Worker URL is not configured.
const WORKER_URL = import.meta.env.VITE_WORKER_URL as string | undefined;

// ---------------------------------------------------------------------------
// Connection check
// ---------------------------------------------------------------------------

export async function checkConnection(apiKey: string): Promise<boolean> {
  try {
    if (WORKER_URL) {
      const res = await fetch(`${WORKER_URL}/health`);
      return res.ok;
    }
    const res = await fetch("https://huggingface.co/api/whoami-v2", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return res.ok;
  } catch (e) {
    console.error("Connection check failed", e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Chat completions (OpenAI-compatible endpoint)
// ---------------------------------------------------------------------------

export async function runInference(
  apiKey: string,
  modelId: string,
  messages: { role: string; content: string }[],
  params: GenerationParams,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  try {
    return WORKER_URL
      ? await runInferenceViaWorker(modelId, messages, params, onChunk, signal)
      : await runInferenceDirect(apiKey, modelId, messages, params, onChunk, signal);
  } catch (error: unknown) {
    // Fallback to raw generation for models that don't support the chat format
    console.warn("Chat completions failed, trying raw generation fallback…", error);
    const prompt =
      messages.map((m) => `<|${m.role}|>\n${m.content}<|end|>`).join("\n") +
      "\n<|assistant|>\n";
    return runRawInference(apiKey, modelId, prompt, params, onChunk, signal);
  }
}

async function runInferenceViaWorker(
  modelId: string,
  messages: { role: string; content: string }[],
  params: GenerationParams,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const response = await fetch(`${WORKER_URL}/v1/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modelId, messages, params }),
    signal,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Worker error: ${response.status} ${response.statusText} - ${err}`);
  }

  return readChatStream(response, onChunk);
}

async function runInferenceDirect(
  apiKey: string,
  modelId: string,
  messages: { role: string; content: string }[],
  params: GenerationParams,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const url = `https://api-inference.huggingface.co/models/${modelId}/v1/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      max_tokens: params.max_tokens,
      temperature: params.temperature,
      top_p: params.top_p,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`HF API Error: ${response.status} ${response.statusText} - ${err}`);
  }

  return readChatStream(response, onChunk);
}

// Parses the OpenAI-compatible SSE stream and accumulates the full response.
async function readChatStream(
  response: Response,
  onChunk: (text: string) => void
): Promise<string> {
  if (!response.body) throw new Error("No response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const dataStr = line.slice(6).trim();
      if (dataStr === "[DONE]") continue;

      try {
        const data = JSON.parse(dataStr);
        const content: string = data.choices?.[0]?.delta?.content ?? "";
        if (content) {
          fullText += content;
          onChunk(fullText);
        }
      } catch {
        // Ignore malformed SSE lines
      }
    }
  }

  return fullText;
}

// ---------------------------------------------------------------------------
// Raw text generation (fallback for non-chat models)
// ---------------------------------------------------------------------------

async function runRawInference(
  apiKey: string,
  modelId: string,
  inputs: string,
  params: GenerationParams,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const response = WORKER_URL
    ? await fetch(`${WORKER_URL}/v1/raw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, inputs, params }),
        signal,
      })
    : await fetch(`https://api-inference.huggingface.co/models/${modelId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs,
          parameters: {
            max_new_tokens: params.max_tokens,
            temperature: params.temperature,
            top_p: params.top_p,
            return_full_text: false,
          },
          stream: true,
        }),
        signal,
      });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`HF API Error: ${response.status} - ${err}`);
  }

  if (!response.body) throw new Error("No response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const jsonStr = line.slice(5).trim();
      try {
        const data = JSON.parse(jsonStr);
        const token: string = data.token?.text ?? "";
        if (token) {
          fullText += token;
          onChunk(fullText);
        }
      } catch {
        // Ignore malformed SSE lines
      }
    }
  }

  return fullText;
}
