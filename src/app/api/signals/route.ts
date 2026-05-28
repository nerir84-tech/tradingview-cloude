// src/app/api/signals/route.ts
// Retorna historial de señales + estadísticas para el dashboard

import { NextResponse } from 'next/server';
import { getHistory, getStats } from '@/lib/signal-store';

export async function GET() {
  return NextResponse.json({
    signals: getHistory(50),
    stats:   getStats(),
  });
}
