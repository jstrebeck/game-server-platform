import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { auth0 } from '@/lib/auth0';

export async function GET(request: NextRequest) {
  try {
    const session = await auth0.getSession();

    if (!session) {
      return NextResponse.json({ user: null, accessToken: null });
    }

    // Check if refresh is requested
    const forceRefresh = request.nextUrl.searchParams.has('refresh');

    // Get access token for API calls
    const tokenResponse = await auth0.getAccessToken({
      refresh: forceRefresh,
    });

    return NextResponse.json({
      user: session.user,
      accessToken: tokenResponse?.token || null,
    });
  } catch (error) {
    console.error('Session error:', error);
    return NextResponse.json({ user: null, accessToken: null });
  }
}
