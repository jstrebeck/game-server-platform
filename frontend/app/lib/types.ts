export type { Plan } from './constants'

export interface ServerResult {
  namespace: string
  hostname: string
  port: number
  status: 'ready' | 'stopped' | 'starting'
  version: string
}

export interface BillingStatus {
  subscription_status: string
  stripe_customer_id: string | null
  subscription_id: string | null
  trial_started_at: string | null
  trial_ends_at: string | null
  is_trial_expired: boolean
  can_access_server: boolean
  plan_id: string | null
  memory: string | null
}

export interface ClusterStats {
  cluster_capacity_gb: number
  total_allocated_gb: number
  total_used_gb: number
  remaining_gb: number
  active_servers: number
  usage_percent: number
}

export interface Impersonation {
  userId: string
  sanitizedId: string
  email: string | null
}

export interface Plugin {
  id: string
  modrinth_id: string
  name: string
  description: string
}

export interface Metrics {
  memory_bytes: number
  memory_human: string
}

export interface ConsoleOutput {
  type: 'success' | 'error'
  text: string
}

export interface UploadMessage {
  type: 'success' | 'error'
  text: string
}

export interface AdminUser {
  user_id: string
  email?: string
  name?: string
  picture?: string
  is_admin: boolean
  sanitized_id: string
}

export interface ConfigFile {
  name: string
  path: string
}

export interface MaintenanceBanner {
  enabled: boolean
  message: string
}

export interface ReferralStats {
  successful_referrals: number
  credits_earned_cents: number
  credits_cap_reached: boolean
}

export interface ReferralCodeResponse {
  referral_code: string
  share_url: string
  stats: ReferralStats
  referred_by: string | null
  referred_at: string | null
  max_referrals: number
}

export interface ReferralValidateResponse {
  valid: boolean
  message: string
  referrer_id: string | null
}
