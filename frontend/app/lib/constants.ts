export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
export const WS_URL = API_URL.replace(/^http/, 'ws')
export const AUTH0_NAMESPACE = 'https://watch2play.local'

export const LATEST_MC_VERSION = '1.21.11'

export const MINECRAFT_VERSIONS = [
  { value: 'LATEST', label: `Latest (${LATEST_MC_VERSION})` },
  { value: LATEST_MC_VERSION, label: LATEST_MC_VERSION },
  { value: '1.21.4', label: '1.21.4' },
  { value: '1.21.3', label: '1.21.3' },
  { value: '1.21.1', label: '1.21.1' },
  { value: '1.21', label: '1.21' },
  { value: '1.20.6', label: '1.20.6' },
  { value: '1.20.4', label: '1.20.4' },
  { value: '1.20.2', label: '1.20.2' },
  { value: '1.20.1', label: '1.20.1' },
  { value: '1.20', label: '1.20' },
  { value: '1.19.4', label: '1.19.4' },
  { value: '1.19.2', label: '1.19.2' },
  { value: '1.18.2', label: '1.18.2' },
  { value: '1.17.1', label: '1.17.1' },
  { value: '1.16.5', label: '1.16.5' },
  { value: '1.12.2', label: '1.12.2' },
]

export const AVAILABLE_PLANS = [
  { plan_id: '2gb', display_name: '2 GB RAM', memory: '2G', price: '$4.99' },
  { plan_id: '4gb', display_name: '4 GB RAM', memory: '4G', price: '$9.99' },
  { plan_id: '6gb', display_name: '6 GB RAM', memory: '6G', price: '$14.99' },
  { plan_id: '8gb', display_name: '8 GB RAM', memory: '8G', price: '$19.99' },
]

export type Plan = typeof AVAILABLE_PLANS[number]
