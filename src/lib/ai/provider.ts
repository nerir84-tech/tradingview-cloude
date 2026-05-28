// src/lib/ai/provider.ts
// Abstracción de proveedores de IA
// Soporta: Ollama (local gratis), Gemini (gratis), Groq (gratis), Claude (pago)

export type AIProvider = 'ollama' | 'gemini' | 'groq' | 'claude';

export interface AIResponse {
  signal:          'BUY' | 'SELL' | 'NONE';
  sl_pips:         number;
  tp_pips:         number;
  confidence:      number;
  expiry_minutes:  number;
  reasoning:       string;
}

function getProvider(): AIProvider {
  return (process.env.AI_PROVIDER ?? 'groq') as AIProvider;
}

// ─── Ollama local ──────────────────────────────────────────────────────────
async function callOllama(prompt: string): Promise<string> {
  const host  = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL ?? 'llama3.2:3b';
  const res = await fetch(`${host}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.1, num_predict: 300 } }),
  });
  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = await res.json();
  return data.response as string;
}

// ─── Google Gemini ─────────────────────────────────────────────────────────
async function callGemini(prompt: string): Promise<string> {
  const key   = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';
  if (!key) throw new Error('GEMINI_API_KEY no configurada');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 300 },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
}

// ─── Groq (gratis, muy rápido) ─────────────────────────────────────────────
async function callGroq(prompt: string): Promise<string> {
  const key   = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL ?? 'llama-3.1-8b-instant';
  if (!key) throw new Error('GROQ_API_KEY no configurada en Vercel');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'Eres un experto en trading Forex. Responde SOLO con JSON válido sin markdown ni texto extra.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 300,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '{}';
}

// ─── Anthropic Claude ──────────────────────────────────────────────────────
async function callClaude(prompt: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY no configurada');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL ?? 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text ?? '{}';
}

// ─── Parseador JSON ────────────────────────────────────────────────────────
function parseAIResponse(raw: string): AIResponse {
  const clean = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  const match = clean.match(/\{[\s\S]*\}/);
  const json  = match ? match[0] : '{}';
  let parsed: Partial<AIResponse> = {};
  try { parsed = JSON.parse(json); } catch { console.error('[AI] Parse error:', json); }

  const signal = parsed.signal ?? 'NONE';
  return {
    signal:         ['BUY', 'SELL', 'NONE'].includes(signal) ? signal as AIResponse['signal'] : 'NONE',
    sl_pips:        (parsed.sl_pips  ?? 0) > 0 ? parsed.sl_pips!  : 30,
    tp_pips:        (parsed.tp_pips  ?? 0) > 0 ? parsed.tp_pips!  : 60,
    confidence:     Math.max(0, Math.min(1, parsed.confidence ?? 0)),
    expiry_minutes: (parsed.expiry_minutes ?? 60) > 0 ? parsed.expiry_minutes! : 60,
    reasoning:      (parsed.reasoning ?? 'Sin análisis').slice(0, 120),
  };
}

// ─── Función principal ─────────────────────────────────────────────────────
export async function getAISignal(prompt: string): Promise<AIResponse> {
  const provider = getProvider();
  console.log(`[AI] Proveedor: ${provider}`);

  let raw: string;
  try {
    switch (provider) {
      case 'ollama': raw = await callOllama(prompt); break;
      case 'gemini': raw = await callGemini(prompt); break;
      case 'groq':   raw = await callGroq(prompt);   break;
      case 'claude': raw = await callClaude(prompt);  break;
      default:       raw = await callGroq(prompt);
    }
  } catch (err) {
    console.error(`[AI] Error con ${provider}:`, err);
    return {
      signal: 'NONE', sl_pips: 30, tp_pips: 60,
      confidence: 0, expiry_minutes: 60,
      reasoning: `Error AI (${provider}): ${(err as Error).message}`,
    };
  }
  return parseAIResponse(raw);
}
