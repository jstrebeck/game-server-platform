import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';

export async function GET() {
  try {
    const session = await auth0.getSession();

    if (!session) {
      return NextResponse.json({ user: null, accessToken: null });
    }

    // Get access token for API calls
    const tokenResponse = await auth0.getAccessToken();

    return NextResponse.json({
      user: session.user,
      accessToken: tokenResponse?.token || null,
    });
  } catch (error) {
    console.error('Session error:', error);
    return NextResponse.json({ user: null, accessToken: null });
  }
}
