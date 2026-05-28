'use client';
// src/app/signals/page.tsx
// Dashboard de señales AI en tiempo real
// Acceder en: https://tu-app.vercel.app/signals

import { useEffect, useState, useCallback } from 'react';

interface Signal {
  id:             string;
  symbol:         string;
  signal:         'BUY' | 'SELL' | 'NONE';
  sl_pips:        number;
  tp_pips:        number;
  confidence:     number;
  expiry_minutes: number;
  reasoning:      string;
  price:          number;
  provider:       string;
  timestamp:      string;
}

interface Stats {
  total:   number;
  buys:    number;
  sells:   number;
  nones:   number;
  avgConf: number;
}

const COLOR = {
  BUY:  { bg: '#0a1f12', border: '#22c55e', text: '#4ade80', pill: '#16a34a' },
  SELL: { bg: '#1f0a0a', border: '#ef4444', text: '#f87171', pill: '#dc2626' },
  NONE: { bg: '#0f0f1a', border: '#6366f1', text: '#a5b4fc', pill: '#4f46e5' },
};

const PROVIDER_LABEL: Record<string, string> = {
  ollama: '🖥️ Local',
  gemini: '✨ Gemini',
  claude: '🤖 Claude',
};

function ConfBar({ value }: { value: number }) {
  const pct   = Math.round(value * 100);
  const color = pct >= 75 ? '#22c55e' : pct >= 55 ? '#f59e0b' : '#6b7280';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 5, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 700, minWidth: 30 }}>{pct}%</span>
    </div>
  );
}

function Card({ s }: { s: Signal }) {
  const c    = COLOR[s.signal];
  const time = new Date(s.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const date = new Date(s.timestamp).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
  const rr   = s.sl_pips > 0 ? (s.tp_pips / s.sl_pips).toFixed(1) : '—';

  return (
    <div style={{
      background: c.bg, border: `1px solid ${c.border}`, borderRadius: 12,
      padding: '14px 18px', marginBottom: 8,
      fontFamily: "'JetBrains Mono','Fira Code',monospace",
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ background: c.pill, color: '#fff', fontWeight: 700, fontSize: 12, padding: '2px 10px', borderRadius: 6, letterSpacing: 1 }}>
            {s.signal}
          </span>
          <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 14 }}>{s.symbol}</span>
          <span style={{ color: '#475569', fontSize: 11 }}>@ {s.price.toFixed(5)}</span>
          <span style={{ color: '#334155', fontSize: 10 }}>{PROVIDER_LABEL[s.provider] ?? s.provider}</span>
        </div>
        <span style={{ color: '#475569', fontSize: 10 }}>{date} {time}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ color: '#475569', fontSize: 9, letterSpacing: 1, marginBottom: 2 }}>SL PIPS</div>
          <div style={{ color: '#f87171', fontWeight: 700, fontSize: 18 }}>{s.sl_pips}</div>
        </div>
        <div>
          <div style={{ color: '#475569', fontSize: 9, letterSpacing: 1, marginBottom: 2 }}>TP PIPS</div>
          <div style={{ color: '#4ade80', fontWeight: 700, fontSize: 18 }}>{s.tp_pips}</div>
        </div>
        <div>
          <div style={{ color: '#475569', fontSize: 9, letterSpacing: 1, marginBottom: 2 }}>R:R</div>
          <div style={{ color: c.text, fontWeight: 700, fontSize: 18 }}>{rr}:1</div>
        </div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ color: '#475569', fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>CONFIANZA</div>
        <ConfBar value={s.confidence} />
      </div>

      <div style={{ color: '#64748b', fontSize: 11, fontStyle: 'italic', borderTop: '1px solid #1e293b', paddingTop: 8 }}>
        "{s.reasoning}"
      </div>
    </div>
  );
}

export default function SignalsDashboard() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [stats,   setStats]   = useState<Stats>({ total: 0, buys: 0, sells: 0, nones: 0, avgConf: 0 });
  const [updated, setUpdated] = useState('—');
  const [live,    setLive]    = useState(true);

  const fetch_ = useCallback(async () => {
    try {
      const r = await fetch('/api/signals');
      const d = await r.json();
      setSignals(d.signals ?? []);
      setStats(d.stats ?? {});
      setUpdated(new Date().toLocaleTimeString('es-MX'));
    } catch { /* red error */ }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(fetch_, 5000);
    return () => clearInterval(t);
  }, [live, fetch_]);

  const statBox = (label: string, value: string | number, color: string) => (
    <div style={{ background: '#0d1117', border: `1px solid ${color}22`, borderRadius: 10, padding: '12px 16px', textAlign: 'center' as const }}>
      <div style={{ color, fontSize: 9, letterSpacing: 1.5, marginBottom: 6 }}>{label}</div>
      <div style={{ color: '#f8fafc', fontSize: 26, fontWeight: 700 }}>{value}</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#060e1a', color: '#e2e8f0', fontFamily: "'JetBrains Mono','Fira Code',monospace", padding: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#f8fafc', letterSpacing: -0.5 }}>
            🤖 AI Signal Monitor
          </h1>
          <p style={{ margin: '3px 0 0', color: '#475569', fontSize: 11 }}>
            MT5 ↔ Bridge ↔ IA · Actualizado: {updated}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={fetch_} style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 11 }}>
            ↻ Refresh
          </button>
          <button onClick={() => setLive(l => !l)} style={{
            background: live ? '#16a34a22' : '#1e293b',
            border: `1px solid ${live ? '#22c55e' : '#334155'}`,
            color: live ? '#4ade80' : '#94a3b8',
            borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 11, fontWeight: 700,
          }}>
            {live ? '● LIVE' : '○ PAUSED'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
        {statBox('TOTAL', stats.total, '#6366f1')}
        {statBox('BUY', stats.buys, '#22c55e')}
        {statBox('SELL', stats.sells, '#ef4444')}
        {statBox('CONF. PROM.', `${Math.round(stats.avgConf * 100)}%`, '#f59e0b')}
      </div>

      {/* Lista de señales */}
      {signals.length === 0 ? (
        <div style={{ background: '#0d1117', border: '1px dashed #334155', borderRadius: 12, padding: '50px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📡</div>
          <div style={{ color: '#475569', fontSize: 13 }}>Esperando señales del MT5...</div>
          <div style={{ color: '#334155', fontSize: 11, marginTop: 6 }}>El EA enviará señales cuando analice el mercado</div>
        </div>
      ) : (
        signals.map(s => <Card key={s.id} s={s} />)
      )}
    </div>
  );
}
