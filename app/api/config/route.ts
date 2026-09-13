import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    realtimeUrl: process.env.NEXT_PUBLIC_REALTIME_URL || 'ws://localhost:8787',
  }, { headers: { 'cache-control': 'no-store' } });
}
