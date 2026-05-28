// src/lib/binance/candle-cache.ts
// Cache de velas Binance en tiempo real via WebSocket
// Se mantiene conectado en el servidor y actualiza en memoria
// Usado por el bridge para enriquecer análisis de MT5

export interface Candle {
  time:   number;   // timestamp ms
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
  closed: boolean;  // true = vela cerrada definitiva
}

export interface SymbolCache {
  symbol:       string;
  interval:     string;
  candles:      Candle[];   // últimas 100, índice 0 = más reciente
  currentPrice: number;
  lastUpdate:   number;
  connected:    boolean;
}

const cacheStore   = new Map<string, SymbolCache>();
const wsConnections = new Map<string, WebSocket>();
const MAX_CANDLES   = 100;
const BINANCE_REST  = 'https://api.binance.com/api/v3';
const BINANCE_WS    = 'wss://stream.binance.com:9443/ws';

// Pares a monitorear: crypto + correlaciones Forex
const DEFAULT_PAIRS = [
  { symbol: 'BTCUSDT', interval: '1h' },
  { symbol: 'ETHUSDT', interval: '1h' },
  { symbol: 'XAUUSDT', interval: '1h' }, // Oro — correlación fuerte con Forex
  { symbol: 'EURUSDT', interval: '1h' }, // Correlación EUR/USD
  { symbol: 'GBPUSDT', interval: '1h' }, // Correlación GBP/USD
];

async function loadHistory(symbol: string, interval: string): Promise<Candle[]> {
  try {
    const res  = await fetch(`${BINANCE_REST}/klines?symbol=${symbol}&interval=${interval}&limit=100`);
    const data = await res.json() as number[][];
    return data.map(k => ({
      time:   k[0],
      open:   parseFloat(k[1] as unknown as string),
      high:   parseFloat(k[2] as unknown as string),
      low:    parseFloat(k[3] as unknown as string),
      close:  parseFloat(k[4] as unknown as string),
      volume: parseFloat(k[5] as unknown as string),
      closed: true,
    })).reverse();
  } catch {
    console.error(`[Cache] Error cargando historial ${symbol}`);
    return [];
  }
}

function connectWS(symbol: string, interval: string) {
  const key    = `${symbol}_${interval}`;
  const wsUrl  = `${BINANCE_WS}/${symbol.toLowerCase()}@kline_${interval}`;
  const ws     = new WebSocket(wsUrl);

  ws.onopen = () => {
    const c = cacheStore.get(key);
    if (c) c.connected = true;
    console.log(`[Cache] ✅ WS conectado: ${symbol}`);
  };

  ws.onmessage = (event) => {
    try {
      const k     = JSON.parse(event.data as string).k;
      const cache = cacheStore.get(key);
      if (!cache) return;

      const candle: Candle = {
        time:   k.t,
        open:   parseFloat(k.o),
        high:   parseFloat(k.h),
        low:    parseFloat(k.l),
        close:  parseFloat(k.c),
        volume: parseFloat(k.v),
        closed: k.x,
      };

      cache.currentPrice = candle.close;
      cache.lastUpdate   = Date.now();

      if (k.x) {
        // Vela cerrada: agregar al historial
        cache.candles.unshift(candle);
        if (cache.candles.length > MAX_CANDLES) cache.candles.pop();
      } else {
        // Vela en curso: actualizar la primera
        if (cache.candles[0]?.time === candle.time) {
          cache.candles[0] = candle;
        } else {
          cache.candles.unshift(candle);
        }
      }
    } catch { /* ignorar errores de parse */ }
  };

  ws.onclose = () => {
    const c = cacheStore.get(key);
    if (c) c.connected = false;
    wsConnections.delete(key);
    console.log(`[Cache] WS cerrado ${symbol} — reconectando en 5s...`);
    setTimeout(() => connectWS(symbol, interval), 5000);
  };

  wsConnections.set(key, ws);
}

export async function initSymbolCache(symbol: string, interval = '1h') {
  const key = `${symbol}_${interval}`;
  if (cacheStore.has(key)) return;

  const candles = await loadHistory(symbol, interval);
  cacheStore.set(key, {
    symbol, interval, candles,
    currentPrice: candles[0]?.close ?? 0,
    lastUpdate:   Date.now(),
    connected:    false,
  });
  connectWS(symbol, interval);
}

export function getSymbolCache(symbol: string, interval = '1h'): SymbolCache | null {
  return cacheStore.get(`${symbol}_${interval}`) ?? null;
}

// Genera resumen de mercado crypto para incluir en el prompt de IA
export function getCryptoContext(): string {
  const lines = ['CONTEXTO CRYPTO EN VIVO (Binance WebSocket):'];

  for (const [, c] of cacheStore) {
    if (c.candles.length < 3) continue;
    const c0   = c.candles[0];
    const c1   = c.candles[1];
    const c4   = c.candles[4] ?? c1;
    const chg  = ((c0.close - c1.close) / c1.close * 100).toFixed(2);
    const trend = c0.close > c4.close ? '↑ SUBE' : c0.close < c4.close ? '↓ BAJA' : '→ LATERAL';
    lines.push(`- ${c.symbol}: $${c0.close.toFixed(4)} | ${trend} | Δ: ${chg}%`);
  }

  // Sentimiento de mercado basado en BTC
  const btc = cacheStore.get('BTCUSDT_1h');
  const xau = cacheStore.get('XAUUSDT_1h');
  if (btc?.candles.length) {
    const riskOn = btc.candles[0].close > btc.candles[4]?.close;
    lines.push(`- Sentimiento: ${riskOn ? 'RISK ON → BTC sube, USD tiende a debilitarse' : 'RISK OFF → BTC baja, USD tiende a fortalecerse'}`);
  }
  if (xau?.candles.length) {
    const goldUp = xau.candles[0].close > xau.candles[3]?.close;
    lines.push(`- Oro: ${goldUp ? 'SUBIENDO → presión bajista en USD' : 'BAJANDO → presión alcista en USD'}`);
  }

  return lines.join('\n');
}

// Inicializa todos los pares al arrancar el servidor
let _initialized = false;
export async function initAllCaches() {
  if (_initialized) return;
  _initialized = true;
  for (const p of DEFAULT_PAIRS) {
    await initSymbolCache(p.symbol, p.interval);
    await new Promise(r => setTimeout(r, 250));
  }
  console.log('[Cache] ✅ Todos los pares inicializados');
}
