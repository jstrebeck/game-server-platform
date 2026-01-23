# Frontend - Minecraft Server Hosting

Next.js 16 application for on-demand Minecraft server hosting with Auth0 authentication and Stripe billing.

## Tech Stack

- **Framework**: Next.js 16.1.1 with App Router
- **React**: 19.2.3
- **Styling**: Tailwind CSS 4
- **Auth**: Auth0 (`@auth0/nextjs-auth0`)
- **Language**: TypeScript

## Project Structure

```
app/
├── page.tsx              # Main page (authenticated dashboard)
├── layout.tsx            # Root layout with providers
├── api/
│   └── auth/
│       └── session/
│           └── route.ts  # Auth session API route
├── components/
│   ├── LandingPage.tsx   # Public landing page (unauthenticated)
│   ├── LogViewer.tsx     # Real-time server log viewer
│   ├── modals/
│   │   ├── index.ts
│   │   ├── PaymentModal.tsx    # Subscription payment modal
│   │   ├── CapacityModal.tsx   # Server capacity warning modal
│   │   └── UpgradeModal.tsx    # Plan upgrade confirmation modal
│   └── tabs/
│       ├── index.ts
│       ├── DetailsTab.tsx      # Server connection details
│       ├── MonitoringTab.tsx   # Server metrics & controls
│       ├── OperationsTab.tsx   # Console, OP players, world upload
│       ├── PluginsTab.tsx      # Plugin management
│       ├── BillingTab.tsx      # Subscription & plan management
│       └── AdminTab.tsx        # Admin panel (impersonation, stats)
├── hooks/
│   ├── index.ts
│   ├── useAuth.ts        # Authentication & fetch wrapper
│   ├── useServer.ts      # Server CRUD operations
│   ├── useBilling.ts     # Stripe billing & subscriptions
│   ├── useMetrics.ts     # Server metrics polling
│   ├── useLogs.ts        # WebSocket log streaming
│   ├── useConsole.ts     # Server console commands
│   ├── usePlugins.ts     # Plugin install/uninstall
│   ├── useOperations.ts  # OP players, world upload
│   └── useAdmin.ts       # Admin impersonation & stats
└── lib/
    ├── types.ts          # TypeScript interfaces
    ├── constants.ts      # Plans, Minecraft versions
    └── utils.ts          # Helper functions (isAdmin, sanitizeUserId)

components/               # Shared components
└── AccessTokenProvider.tsx

lib/                      # Shared utilities
public/                   # Static assets (logo, favicon, images)
```

## Key Files

- `middleware.ts` - Auth0 middleware for protected routes
- `next.config.ts` - Next.js configuration
- `.env.local` - Environment variables (Auth0, API URL)

## Commands

```bash
npm run dev     # Start development server
npm run build   # Production build
npm run start   # Start production server
npm run lint    # Run ESLint
```

## Architecture

### Authentication Flow
1. Unauthenticated users see `LandingPage`
2. Login redirects through Auth0 (`/auth/login`)
3. Authenticated users see dashboard with server management

### State Management
All state is managed through custom hooks in `app/hooks/`. Each hook encapsulates related functionality:
- `useServer` - Server lifecycle (create, start, stop, delete)
- `useBilling` - Subscription state and Stripe integration
- `useAdmin` - Admin-only features like user impersonation

### API Communication
- Backend API URL configured via `NEXT_PUBLIC_API_URL`
- `fetchWithAuth` wrapper adds JWT token and impersonation headers
- WebSocket connection for real-time log streaming

## Billing Plans

Defined in `app/lib/constants.ts`:
- 2GB RAM - $4.99/mo
- 4GB RAM - $7.99/mo
- 8GB RAM - $14.99/mo
