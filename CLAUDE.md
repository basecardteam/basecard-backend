# CLAUDE.md

> **Workspace Navigation:** See `../CLAUDE.md` for full workspace overview (backend, miniapp, ai-agent)

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start Commands

```bash
# Install dependencies
npm install

# Development server (watch mode)
npm run dev:dev           # Uses .env.dev

# Production simulation
npm run dev:prod          # Uses .env.prod.local

# Linting and formatting
npm lint                  # Fix ESLint issues
npm run format            # Format code with Prettier

# Running tests
npm test                  # Unit tests (Jest, rootDir: src)
npm test:watch            # Watch mode
npm test:cov              # Coverage report
npm test:e2e              # E2E tests

# Database operations (uses Drizzle ORM with PostgreSQL)
npm run db:generate       # Generate migrations from schema changes
npm run db:migrate        # Apply migrations
npm run db:push           # Push schema to DB without migrations
npm run db:studio         # Open Drizzle Studio UI
npm run reset:db          # Reset DB and re-seed
npm run db:seed           # Run seed scripts

# Database debugging
npm run db:check          # Verify database connection
npm run db:prod:*         # Production variants of DB commands

# Building
npm run build             # Build for production (outputs to dist/)
npm start                 # Run production build
npm run start:prod        # Run with source maps (node dist/main)
```

## Environment Variables

Configure one of `.env.dev`, `.env.prod.local`, or `.env.prod`. Required variables are enforced in `src/app/configs/app-config.service.ts`:

- **Database**: `DATABASE_URL` (PostgreSQL connection string)
- **JWT**: `JWT_SECRET` (secret key for JWT signing)
- **Pinata (IPFS)**: `PINATA_JWT`, `PINATA_GATEWAY`, `PINATA_GROUP`
- **Blockchain**: `BASE_WS_RPC_URLS`, `BASE_HTTP_RPC_URLS`, `BASECARD_CONTRACT_ADDRESS`, `CHAIN_ID`
- **Neynar API** (Farcaster): `NEYNAR_API_KEY`
- **OAuth**: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `X_CLIENT_ID`, `X_CLIENT_SECRET`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`
- **Optional**: `FARCASTER_DOMAIN` (default: miniapp.basecard.org), `PORT` (default: 3000), `ADMIN_WALLET_ADDRESSES`

## Architecture Overview

### High-Level Structure

BaseCard is a NestJS backend serving a Web3 social platform with user profiles (basecards), quests/gamification, collections, OAuth integration, and blockchain interactions on Base.

```
src/
├── main.ts                    # App bootstrap (Swagger at /api, URI versioning)
├── app/                       # Core framework setup
│   ├── app.module.ts          # Root module with all imports
│   ├── configs/               # Configuration services
│   ├── filters/               # HTTP exception filters
│   ├── interceptors/          # Global interceptors (logging, response transform)
│   ├── middleware/            # Global middleware (request logging)
│   ├── logger/                # Custom logger
│   ├── types/                 # Shared types (ApiResponse, etc.)
│   └── constants.ts           # App-wide constants (CLIENT_FIDS mapping)
├── db/                        # Database layer
│   ├── schema.ts              # Drizzle ORM schema (all tables & relations)
│   └── db.module.ts           # Drizzle provider injection
└── modules/                   # Feature modules (NestJS modular pattern)
    ├── users/                 # User accounts (wallet, FID, profile cache)
    ├── user-wallets/          # Client-specific wallet tracking (Farcaster, BaseApp, MetaMask)
    ├── auth/                  # Authentication (JWT, Farcaster Quick Auth)
    ├── basecards/             # User profile cards (NFT metadata, images)
    ├── quests/                # Quest definitions and user quest tracking
    ├── user-quests/           # User quest progress and claims
    ├── quest-verification/    # Quest claim verification logic
    ├── collections/           # Card collections
    ├── earn/                  # Points and reward logic
    ├── events/                # Event tracking and emission
    ├── images/                # Image upload handling
    ├── ipfs/                  # IPFS/Pinata integration
    ├── blockchain/            # EVM contract interaction (viem library)
    ├── oauth/                 # OAuth flows (GitHub, X, LinkedIn)
    ├── webhook/               # External webhook handling
    ├── health/                # Health check endpoints
    └── config/                # Config endpoints
```

### Database (Drizzle ORM + PostgreSQL)

- **Schema**: `src/db/schema.ts` defines all tables with relations
- **Key tables**:
  - `users` (wallet-based identity with Farcaster FID support, role-based access)
  - `user_wallets` (client-type mapping: Farcaster, BaseApp, MetaMask)
  - `basecards` (user profile NFT cards)
  - `quests` (quest definitions)
  - `user_quests` (quest participation and claims)
  - `collections` (basecard collections)
  - `point_logs` (earn/point tracking)
  - Plus: notification logs, events, webhooks, etc.
- **Migrations**: Generated via `drizzle-kit generate` and applied with `drizzle-kit migrate`
- **Seeding**: `scripts/seed-quests.ts` and other seed scripts

### Authentication Flow

1. **Farcaster Quick Auth**: User signs in via Farcaster miniapp → JWT token → `AuthService.validateFarcasterToken()` → resolves FID and primary Ethereum address
2. **Wallet Auth**: Direct wallet verification using viem's `verifyMessage()`
3. **JWT Strategy**: `src/modules/auth/strategies/jwt.strategy.ts` validates Bearer token
4. **Role-Based Access**: `@Roles()` decorator + `RolesGuard` enforce admin-only endpoints
5. **OAuth**: Social login integration (GitHub, X, LinkedIn) via `OAuthService`

### API Response Format

All responses follow a standardized format via `TransformInterceptor`:
```typescript
{
  statusCode: number,
  message: string,
  data: T // endpoint response
}
```

### Key Integrations

- **Neynar API**: Fetches Farcaster user profiles (caching with 30-60s TTL)
- **Viem/EVM**: Low-level blockchain interactions (contract reads, message verification)
- **Pinata/IPFS**: Upload basecard images for NFT metadata
- **Farcaster Quick Auth**: Secure JWT verification for miniapp users
- **AWS S3**: Image storage (via aws-sdk/client-s3)

## Common Development Tasks

### Adding a New API Endpoint

1. Create module: `src/modules/{feature}/{feature}.module.ts` (imports services, controllers)
2. Create controller: `src/modules/{feature}/{feature}.controller.ts` (routes, decorators)
3. Create service: `src/modules/{feature}/{feature}.service.ts` (business logic, DB access)
4. Register module in `src/app/app.module.ts` imports array
5. DTOs: Use `class-validator` for input validation in `src/modules/{feature}/dto/`

### Modifying Database Schema

1. Edit `src/db/schema.ts` (add tables, columns, constraints)
2. `npm run db:generate` (creates migration file in `drizzle/`)
3. `npm run db:migrate` (applies migrations)
4. Restart server

### Adding Quest Verification Logic

- Extend `src/modules/quest-verification/quest-verification.service.ts`
- Different quest types require different verification strategies
- Use `QuestService` to fetch quest definitions and `UserQuestsService` for claims

### Testing

- Write `.spec.ts` files in `src/` (NestJS testing conventions)
- Tests run from `src/` root (rootDir in jest config)
- Use `@nestjs/testing` for module and service testing
- Run with `npm test` or `npm test:watch`

## Deployment Notes

- **Production build**: `npm run build` compiles TypeScript to `dist/`
- **Production start**: `npm run start:prod` runs with source maps
- **Environment**: Use `.env.prod` for production secrets
- **Database**: Ensure `DATABASE_URL` points to production PostgreSQL instance
- **CORS**: Currently allows localhost and `*.basecard.org` domains (see `main.ts`)

## Debugging

- **Logger**: All services use NestJS `Logger` — configure log levels via environment
- **HTTP requests**: `LoggingMiddleware` + `LoggingInterceptor` log all requests/responses
- **Database**: `npm run db:studio` opens Drizzle Studio for direct schema inspection
- **JWT**: Decoded in `jwt.strategy.ts` — verify token claims if auth fails

## Deployment

Deployment uses GitHub CD (Continuous Deployment). Follow these steps:

1. **Stage and commit changes:**
   ```bash
   git add <files>
   git commit -m "<auto-generated commit message>"
   ```
   - Generate a concise commit message summarizing the changes

2. **Push to remote:**
   ```bash
   git push
   ```

3. **Wait for GitHub CD:**
   - GitHub Actions will automatically build and deploy
   - Deployment completes within a few minutes
   - Monitor the Actions tab in GitHub for deployment status
