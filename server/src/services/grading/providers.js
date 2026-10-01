const env = require('../../config/env');

/**
 * Model providers behind one interface:
 *   complete({ system, prompt, schema, name, temperature }) → parsed JSON object that matches `schema`
 * - local:  Ollama on this machine (free, data never leaves the server). Structured output via `format: <JSON schema>`.
 * - claude: Anthropic API (paid, strongest). Structured output via a forced tool call.
 */
function ollamaProvider({ model, numCtx = 8192, timeoutMs = 15 * 60 * 1000 }) {
  const base = env.OLLAMA_URL.replace(/\/$/, '');
  return {
    id: 'local',
    model,
    async complete({ system, prompt, schema, temperature = 0.2, maxTokens = 900 }) {
      // Small models sometimes loop ("token repeat limit reached") or break the JSON. Retry with more variety.
      let lastErr;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          return await once({ system, prompt, schema, maxTokens, temperature: Math.min(1, temperature + attempt * 0.3), repeatPenalty: 1.15 + attempt * 0.15 });
        } catch (e) {
          lastErr = e;
          if (!e.retryable) throw e;
        }
      }
      throw lastErr;
    },
  };

  async function once({ system, prompt, schema, temperature, maxTokens, repeatPenalty }) {
    let res;
    try {
      res = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          model,
          stream: false,
          format: schema,
          keep_alive: '10m',
          options: { temperature, seed: 42, num_ctx: numCtx, num_predict: maxTokens, repeat_penalty: repeatPenalty, repeat_last_n: 128 },
          messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
        }),
      });
    } catch (e) {
      throw new Error(e.name === 'TimeoutError' ? 'Local AI took too long (timeout)' : `Local AI (Ollama) is not reachable at ${base} — is it running?`);
    }
    if (res.status === 404) throw new Error(`Model "${model}" is not installed — run: ollama pull ${model}`);
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      const err = /repeat|repetit/i.test(body)
        ? new Error('The model got stuck repeating itself (Ollama stopped it). Retrying usually works; a bigger model avoids it.')
        : new Error(`Local AI error ${res.status}: ${body}`);
      err.retryable = /repeat|repetit/i.test(body) || res.status >= 500;
      throw err;
    }
    const data = await res.json();
    try {
      return JSON.parse(data.message?.content || '');
    } catch {
      const err = new Error(data.done_reason === 'length' ? 'Local AI answer was cut off (too long)' : 'Local AI returned invalid JSON');
      err.retryable = true;
      throw err;
    }
  }
}

function claudeProvider({ model = env.AI_MODEL } = {}) {
  let client;
  return {
    id: 'claude',
    model,
    async complete({ system, prompt, schema, name = 'result', temperature = 0.2 }) {
      if (!client) {
        const Anthropic = require('@anthropic-ai/sdk');
        client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
      }
      const r = await client.messages.create({
        model, max_tokens: 3000, temperature, system,
        tools: [{ name, description: 'Return the result.', input_schema: schema }],
        tool_choice: { type: 'tool', name },
        messages: [{ role: 'user', content: prompt }],
      });
      const block = r.content.find((b) => b.type === 'tool_use');
      if (!block) throw new Error('Model did not return a result');
      return block.input;
    },
  };
}

/** Installed local models + reachability (for the settings page). */
async function ollamaStatus() {
  try {
    const r = await fetch(`${env.OLLAMA_URL.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return { reachable: false, models: [] };
    const d = await r.json();
    return { reachable: true, models: (d.models || []).map((m) => ({ name: m.name, sizeGB: Math.round((m.size / 1e9) * 10) / 10 })) };
  } catch {
    return { reachable: false, models: [] };
  }
}

module.exports = { ollamaProvider, claudeProvider, ollamaStatus };
