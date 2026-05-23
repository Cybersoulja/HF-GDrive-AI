export interface Env {
  HF_API_KEY: string;
  ALLOWED_ORIGIN?: string;
}

const HF_BASE = "https://api-inference.huggingface.co";

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------

function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function withCors(response: Response, origin: string): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(origin))) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function optionsResponse(origin: string): Response {
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

function errorResponse(message: string, status: number, origin: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * GET /health
 * Returns 200 if the worker is running and HF_API_KEY is configured.
 */
async function handleHealth(env: Env, origin: string): Promise<Response> {
  if (!env.HF_API_KEY) {
    return errorResponse("HF_API_KEY secret is not configured", 503, origin);
  }

  // Validate the key against HF whoami endpoint
  const res = await fetch("https://huggingface.co/api/whoami-v2", {
    headers: { Authorization: `Bearer ${env.HF_API_KEY}` },
  });

  if (!res.ok) {
    return errorResponse("HF_API_KEY is invalid or expired", 401, origin);
  }

  const body = await res.json() as { name?: string };
  return new Response(
    JSON.stringify({ ok: true, user: body.name ?? "unknown" }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    }
  );
}

/**
 * POST /v1/chat
 * Proxies to the OpenAI-compatible HF chat completions endpoint with streaming.
 *
 * Expected request body:
 * {
 *   modelId: string,
 *   messages: { role: string; content: string }[],
 *   params: { max_tokens: number; temperature: number; top_p: number }
 * }
 */
async function handleChat(request: Request, env: Env, origin: string): Promise<Response> {
  let body: { modelId: string; messages: unknown; params: Record<string, unknown> };

  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400, origin);
  }

  const { modelId, messages, params } = body;

  if (!modelId || typeof modelId !== "string") {
    return errorResponse("modelId is required", 400, origin);
  }

  const hfUrl = `${HF_BASE}/models/${modelId}/v1/chat/completions`;

  const hfResponse = await fetch(hfUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.HF_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      max_tokens: params?.max_tokens ?? 512,
      temperature: params?.temperature ?? 0.7,
      top_p: params?.top_p ?? 0.9,
      stream: true,
    }),
  });

  // Pass the HF stream directly back to the client
  return new Response(hfResponse.body, {
    status: hfResponse.status,
    headers: {
      "Content-Type": hfResponse.headers.get("Content-Type") ?? "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
      ...corsHeaders(origin),
    },
  });
}

/**
 * POST /v1/raw
 * Proxies to the raw HF text generation endpoint with streaming.
 * Used as a fallback for models that don't support the chat completion format.
 *
 * Expected request body:
 * {
 *   modelId: string,
 *   inputs: string,
 *   params: { max_tokens: number; temperature: number; top_p: number }
 * }
 */
async function handleRaw(request: Request, env: Env, origin: string): Promise<Response> {
  let body: { modelId: string; inputs: string; params: Record<string, unknown> };

  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400, origin);
  }

  const { modelId, inputs, params } = body;

  if (!modelId || typeof modelId !== "string") {
    return errorResponse("modelId is required", 400, origin);
  }
  if (typeof inputs !== "string") {
    return errorResponse("inputs must be a string", 400, origin);
  }

  const hfUrl = `${HF_BASE}/models/${modelId}`;

  const hfResponse = await fetch(hfUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.HF_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs,
      parameters: {
        max_new_tokens: params?.max_tokens ?? 512,
        temperature: params?.temperature ?? 0.7,
        top_p: params?.top_p ?? 0.9,
        return_full_text: false,
      },
      stream: true,
    }),
  });

  return new Response(hfResponse.body, {
    status: hfResponse.status,
    headers: {
      "Content-Type": hfResponse.headers.get("Content-Type") ?? "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
      ...corsHeaders(origin),
    },
  });
}

// ---------------------------------------------------------------------------
// Main fetch handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = env.ALLOWED_ORIGIN ?? "*";
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return optionsResponse(origin);
    }

    if (!env.HF_API_KEY) {
      return errorResponse("Worker is not configured: HF_API_KEY secret missing", 503, origin);
    }

    const { pathname } = url;

    if (pathname === "/health" && request.method === "GET") {
      return handleHealth(env, origin);
    }

    if (pathname === "/v1/chat" && request.method === "POST") {
      return handleChat(request, env, origin);
    }

    if (pathname === "/v1/raw" && request.method === "POST") {
      return handleRaw(request, env, origin);
    }

    return errorResponse("Not Found", 404, origin);
  },
};
