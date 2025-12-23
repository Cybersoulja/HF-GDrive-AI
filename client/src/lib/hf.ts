import { GenerationParams } from "./store";

export async function checkConnection(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch("https://huggingface.co/api/whoami-v2", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    return res.ok;
  } catch (e) {
    console.error("Connection check failed", e);
    return false;
  }
}

export async function runInference(
  apiKey: string,
  modelId: string,
  messages: { role: string; content: string }[],
  params: GenerationParams,
  onChunk: (chunk: string) => void
): Promise<string> {
  const url = `https://api-inference.huggingface.co/models/${modelId}/v1/chat/completions`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        messages: messages,
        max_tokens: params.max_tokens,
        temperature: params.temperature,
        top_p: params.top_p,
        stream: true,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`HF API Error: ${response.status} ${response.statusText} - ${err}`);
    }

    if (!response.body) throw new Error("No response body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((line) => line.trim() !== "");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const dataStr = line.replace("data: ", "");
          if (dataStr === "[DONE]") continue;

          try {
            const data = JSON.parse(dataStr);
            const content = data.choices?.[0]?.delta?.content || "";
            if (content) {
              fullText += content;
              onChunk(fullText);
            }
          } catch (e) {
            console.warn("Error parsing chunk", e);
          }
        }
      }
    }

    return fullText;
  } catch (error: any) {
    // Fallback for non-chat-completion compatible models (basic text generation)
    // Some HF models use the simplified pipeline API instead of OpenAI compatible API
    console.warn("OpenAI compatible API failed, trying raw generation fallback...", error);
    
    // Construct a raw prompt from messages (simplified)
    const prompt = messages.map(m => `<|${m.role}|>\n${m.content}<|end|>`).join("\n") + "\n<|assistant|>\n";

    return runRawInference(apiKey, modelId, prompt, params, onChunk);
  }
}


async function runRawInference(
    apiKey: string,
    modelId: string,
    inputs: string,
    params: GenerationParams,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const url = `https://api-inference.huggingface.co/models/${modelId}`;
  
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              inputs: inputs,
              parameters: {
                  max_new_tokens: params.max_tokens,
                  temperature: params.temperature,
                  top_p: params.top_p,
                  return_full_text: false
              },
              stream: true,
            }),
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
        const lines = chunk.split("\n").filter((line) => line.trim() !== "");
  
        for (const line of lines) {
            if (line.startsWith("data:")) {
                const jsonStr = line.substring(5).trim();
                try {
                    const data = JSON.parse(jsonStr);
                    // Standard HF stream format
                    const token = data.token?.text || ""; 
                    if (token) {
                        fullText += token;
                        onChunk(fullText);
                    }
                } catch (e) {
                    // ignore
                }
            }
        }
      }
      
      // If stream didn't work (some models don't support stream param properly via API), 
      // it might have returned a single JSON at the end if we didn't use stream:true 
      // but here we force stream. If it fails, the user sees error.
      return fullText;

    } catch(e) {
        throw e;
    }
}
