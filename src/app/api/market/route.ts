// src/app/api/market/route.ts
// Expone datos Binance en vivo del cache del servidor
// Útil para consultar el estado actual sin WebSocket

import { NextRequest, NextResponse } from 'next/server';
import { getSymbolCache, initAllCaches } from '@/lib/binance/candle-cache';

let ready = false;
async function ensureCache() {
  if (!ready) { ready = true; initAllCaches().catch(console.error); }
}

export async function GET(req: NextRequest) {
  await ensureCache();
  const { searchParams } = new URL(req.url);
  const symbol   = (searchParams.get('symbol') ?? 'BTCUSDT').toUpperCase();
  const interval = searchParams.get('interval') ?? '1h';
  const limit    = Math.min(parseInt(searchParams.get('limit') ?? '20'), 100);

  const cache = getSymbolCache(symbol, interval);
  if (!cache) {
    return NextResponse.json({ error: `${symbol} no está en cache. Pares disponibles: BTCUSDT, ETHUSDT, XAUUSDT, EURUSDT, GBPUSDT` }, { status: 404 });
  }

  return NextResponse.json({
    symbol:       cache.symbol,
    interval:     cache.interval,
    currentPrice: cache.currentPrice,
    connected:    cache.connected,
    lastUpdate:   new Date(cache.lastUpdate).toISOString(),
    candles:      cache.candles.slice(0, limit),
    count:        cache.candles.length,
  });
}
