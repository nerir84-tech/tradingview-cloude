// src/app/api/signal/route.ts
// Endpoint principal del bridge MT5 ↔ IA
// Recibe datos del EA, agrega contexto Binance en vivo, consulta IA

import { NextRequest, NextResponse } from 'next/server';
import { initAllCaches, getCryptoContext } from '@/lib/binance/candle-cache';
import { getAISignal } from '@/lib/ai/provider';
import { saveSignal } from '@/lib/signal-store';

export const runtime = 'nodejs';

// Inicializar caches Binance al primer request
let cacheReady = false;
async function ensureCache() {
  if (!cacheReady) {
    cacheReady = true;
    initAllCaches().catch(console.error);
  }
}

interface MT5Payload {
  symbol:       string;
  bid:          number;
  ask:          number;
  spread:       number;
  timeframe:    string;
  atr:          number;
  ema20:        number;
  ema50:        number;
  rsi:          number;
  macd_main:    number;
  macd_signal:  number;
  htf_trend:    string;
  ma_position:  string;
  rsi_zone:     string;
  balance:      number;
  equity:       number;
  total_trades: number;
  win_rate:     number;
  candles: Array<{ open: number; high: number; low: number; close: number }>;
}

function buildPrompt(d: MT5Payload, cryptoCtx: string): string {
  const c = d.candles;
  return `Eres un experto en trading Forex con 20 años de experiencia. Analiza los datos y responde SOLO con JSON válido sin markdown ni texto extra.

DATOS FOREX (MetaTrader 5):
- Símbolo: ${d.symbol} | Precio: ${d.bid.toFixed(5)} / ${d.ask.toFixed(5)}
- Spread: ${d.spread.toFixed(1)} pts | Timeframe: ${d.timeframe}
- ATR(14): ${d.atr.toFixed(5)} | EMA20: ${d.ema20.toFixed(5)} | EMA50: ${d.ema50.toFixed(5)}
- Posición vs MAs: ${d.ma_position}
- RSI(14): ${d.rsi.toFixed(2)} → ${d.rsi_zone}
- MACD: ${d.macd_main.toFixed(5)} | Señal: ${d.macd_signal.toFixed(5)}
- Tendencia HTF: ${d.htf_trend}
- Balance: $${d.balance.toFixed(2)} | Equity: $${d.equity.toFixed(2)}
- Historial: ${d.total_trades} trades | WR: ${d.win_rate.toFixed(1)}%

VELAS RECIENTES:
- [0] O:${c[0]?.open.toFixed(5)} H:${c[0]?.high.toFixed(5)} L:${c[0]?.low.toFixed(5)} C:${c[0]?.close.toFixed(5)}
- [1] O:${c[1]?.open.toFixed(5)} H:${c[1]?.high.toFixed(5)} L:${c[1]?.low.toFixed(5)} C:${c[1]?.close.toFixed(5)}
- [2] O:${c[2]?.open.toFixed(5)} H:${c[2]?.high.toFixed(5)} L:${c[2]?.low.toFixed(5)} C:${c[2]?.close.toFixed(5)}

${cryptoCtx}

Responde ÚNICAMENTE con este JSON (sin markdown, sin texto antes o después):
{"signal":"BUY|SELL|NONE","sl_pips":number,"tp_pips":number,"confidence":0.0-1.0,"expiry_minutes":number,"reasoning":"max 100 chars en español"}`;
}

export async function POST(req: NextRequest) {
  await ensureCache();

  // Autenticación opcional con clave secreta
  const botKey     = req.headers.get('x-bot-key');
  const secretKey  = process.env.BOT_SECRET_KEY;
  if (secretKey && botKey !== secretKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let data: MT5Payload;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  if (!data.symbol || !data.bid) {
    return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
  }

  // Obtener contexto crypto en vivo
  const cryptoCtx = getCryptoContext();
  const prompt    = buildPrompt(data, cryptoCtx);

  // Llamar al proveedor de IA configurado
  const signal = await getAISignal(prompt);

  // Guardar en historial
  saveSignal({
    ...signal,
    symbol:    data.symbol,
    price:     data.bid,
    provider:  process.env.AI_PROVIDER ?? 'gemini',
    timestamp: new Date().toISOString(),
  });

  console.log(`[Signal] ${data.symbol} → ${signal.signal} | Conf: ${(signal.confidence * 100).toFixed(0)}% | ${signal.reasoning}`);

  return NextResponse.json(signal);
}

// Health check
export async function GET() {
  return NextResponse.json({
    status:    'ok',
    service:   'MT5 AI Signal Bridge',
    version:   '3.0.0',
    provider:  process.env.AI_PROVIDER ?? 'gemini',
    timestamp: new Date().toISOString(),
  });
}
