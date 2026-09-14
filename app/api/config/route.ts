import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    realtimeUrl: process.env.NEXT_PUBLIC_REALTIME_URL || (process.env.NODE_ENV === 'development' ? 'ws://localhost:8787' : 'wss://card-table-arena-realtime.onrender.com'),
  }, { headers: { 'cache-control': 'no-store' } });
}
