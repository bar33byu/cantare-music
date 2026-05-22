import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    { error: 'Audio proxy is disabled. Use the public R2 URL returned by the song APIs.' },
    { status: 410 }
  );
}
