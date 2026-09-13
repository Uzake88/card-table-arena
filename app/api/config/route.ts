import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    realtimeUrl: process.env.NEXT_PUBLIC_REALTIME_URL || 'wss://card-table-arena-realtime.onrender.com',
  }, { headers: { 'cache-control': 'no-store' } });
}
