import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // Use public Binance endpoint (no auth needed)
    const res = await fetch(
      'https://api.binance.com/api/v3/ticker/24hr',
      {
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(10000)
      }
    )
    
    if (!res.ok) {
      console.error('Binance ticker24hr failed:', res.status)
      return NextResponse.json([])
    }
    
    const data = await res.json()
    const result = Array.isArray(data) ? data : []
    
    console.log(`✅ ticker24hr: ${result.length} pairs fetched`)
    return NextResponse.json(result)
    
  } catch(err: any) {
    console.error('ticker24hr route error:', err.message)
    return NextResponse.json([])
  }
}
