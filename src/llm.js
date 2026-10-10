// Minimal OpenAI-compatible chat client (works with OpenAI, DeepSeek, Groq, Tencent Hunyuan, OpenRouter...).
const BASE = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';

function enabled() {
  return !!process.env.LLM_API_KEY;
}

async function chat(messages, tools) {
  const r = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.LLM_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, tools, tool_choice: 'auto', temperature: 0.2 }),
    signal: AbortSignal.timeout(90000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`LLM ${r.status}: ${data.error?.message || JSON.stringify(data).slice(0, 200)}`);
  return data.choices[0].message;
}

module.exports = { enabled, chat, MODEL, BASE };
