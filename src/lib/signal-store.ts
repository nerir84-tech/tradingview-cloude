// src/lib/signal-store.ts
// Almacena historial de señales en memoria del servidor

export interface SignalRecord {
  id:              string;
  symbol:          string;
  signal:          'BUY' | 'SELL' | 'NONE';
  sl_pips:         number;
  tp_pips:         number;
  confidence:      number;
  expiry_minutes:  number;
  reasoning:       string;
  price:           number;
  provider:        string;   // ollama | gemini | claude
  timestamp:       string;
}

const history: SignalRecord[] = [];
const MAX = 100;

export function saveSignal(data: Omit<SignalRecord, 'id'>): SignalRecord {
  const record: SignalRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ...data,
  };
  history.unshift(record);
  if (history.length > MAX) history.splice(MAX);
  return record;
}

export function getHistory(limit = 50): SignalRecord[] {
  return history.slice(0, limit);
}

export function getStats() {
  const total  = history.length;
  const buys   = history.filter(s => s.signal === 'BUY').length;
  const sells  = history.filter(s => s.signal === 'SELL').length;
  const avgConf = total > 0
    ? history.reduce((a, s) => a + s.confidence, 0) / total
    : 0;
  return { total, buys, sells, nones: total - buys - sells, avgConf };
}
