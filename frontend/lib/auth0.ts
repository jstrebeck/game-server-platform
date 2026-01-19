import { Auth0Client } from '@auth0/nextjs-auth0/server';

const AUTH0_NAMESPACE = 'https://watch2play.local';

export const auth0 = new Auth0Client({
  authorizationParameters: {
    audience: process.env.AUTH0_AUDIENCE,
    scope: 'openid profile email',
  },
  async beforeSessionSaved(session) {
    // Pass custom claims from ID token to the session user object
    const idToken = session.tokenSet.idToken;
    if (idToken) {
      try {
        const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString());
        const roles = payload[`${AUTH0_NAMESPACE}/roles`];
        if (roles) {
          session.user[`${AUTH0_NAMESPACE}/roles`] = roles;
        }
      } catch (e) {
        console.error('Failed to parse ID token for roles:', e);
      }
    }
    return session;
  },
});
