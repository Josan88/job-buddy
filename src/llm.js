// Minimal OpenAI-compatible chat client (works with OpenAI, DeepSeek, Groq, Tencent Hunyuan, OpenRouter...).
const BASE = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';

// Set once at start-up by probe(). If the model can't do a tool call, HireBuddy uses its rule-based
// planner for every run instead of failing in the middle of one.
let probeFailed = null;

function enabled() {
  return !!process.env.LLM_API_KEY && !probeFailed;
}

async function probe() {
  if (!process.env.LLM_API_KEY) return;
  try {
    const tool = { type: 'function', function: { name: 'ping', description: 'Reply by calling this.', parameters: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] } } };
    const m = await chat([{ role: 'user', content: 'Call the ping tool with ok=true.' }], [tool]);
    if (!m?.tool_calls?.length) throw new Error('the model did not make a tool call');
    console.log(`LLM check passed: ${MODEL}`);
  } catch (e) {
    probeFailed = e.message.slice(0, 200);
    console.log(`LLM check failed for ${MODEL}, using the rule-based planner: ${probeFailed}`);
  }
}
const status = () => !process.env.LLM_API_KEY ? 'autopilot' : probeFailed ? `autopilot (model ${MODEL} failed its check: ${probeFailed})` : `llm:${MODEL}`;

async function chat(messages, tools) {
  const r = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.LLM_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, tools, tool_choice: 'auto', temperature: 0.2 }),
    signal: AbortSignal.timeout(90000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`LLM ${r.status}: ${data.error?.message || JSON.stringify(data).slice(0, 200)}`);
  const msg = data.choices?.[0]?.message;
  if (!msg) throw new Error(`LLM gave no reply: ${JSON.stringify(data).slice(0, 200)}`);
  return msg;
}

module.exports = { enabled, chat, probe, status, MODEL, BASE };
