import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const baseUrl = process.env.BINANCE_BASE_URL || 
                    'https://fapi.binance.com'
    
    const res = await fetch(
      `${baseUrl}/fapi/v1/premiumIndex`,
      {
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(10000)
      }
    )
    
    if (!res.ok) {
      console.error('Binance premiumIndex failed:', res.status)
      return NextResponse.json([], { status: 200 })
    }
    
    const data = await res.json()
    
    // Ensure array
    const result = Array.isArray(data) ? data : [data]
    return NextResponse.json(result)
    
  } catch(err: any) {
    console.error('premium-index route error:', err.message)
    return NextResponse.json([])
  }
}
