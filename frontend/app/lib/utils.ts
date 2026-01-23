import { AUTH0_NAMESPACE } from './constants'

export function isAdmin(user: any): boolean {
  const roles = user?.[`${AUTH0_NAMESPACE}/roles`] || []
  return Array.isArray(roles) && roles.includes('Admin')
}

export function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    const exp = payload.exp * 1000
    return Date.now() > exp - 30000
  } catch {
    return true
  }
}

export function sanitizeUserId(sub: string): string {
  return sub.replace(/[^a-z0-9-]/gi, '-').toLowerCase().slice(0, 40)
}
