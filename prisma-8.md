# Welcome to Prisma ORM!

Prisma ORM lets you query your database in simple, easy-to-read TypeScript. Define what your data looks like, and Prisma ORM gives you a fully typed client — with autocomplete for every table, column, and relation.

This project is set up for PostgreSQL. Prisma ORM also supports other databases.

## Requirements

- **PostgreSQL 15 or newer.** Older servers are not supported. Run `SELECT version()` against your server to verify.
- The CLI never connects to your database without explicit consent. Pass `--probe-db` to `npx prisma orm init` if you want `init` to verify the server version itself.

## Your data contract

Your data contract is the heart of your application. It lives at [`src/prisma/schema.prisma`](src/prisma/schema.prisma) and describes your models:

```prisma
model User {
  id       Int     @id @default(autoincrement())
  email    String  @unique
  username String?
  name     String?
}
```

Every model you define in your contract can be queried from your app. Your editor will autocomplete the query methods and show you what type each model field is:

```typescript
import { db } from './src/prisma/db';

const user = await db.orm.public.User
  .where({ email: 'alice@example.com' })
  .first();

// Your editor will show the type of user as
// { id: number; email: string; username: string | null; name: string | null; createdAt: Date; posts: Post[] } | null
```

Your contract has two companion files in the same directory:

- **`contract.json`** — this tells your application what models exist, just like `package-lock.json` tells your package manager what dependencies your project has
- **`contract.d.ts`** — this powers autocomplete and type checking in your editor

Commit both files to git. When you change your contract, run `npx prisma contract emit` to update them.

If you use a framework like Next.js or Vite, the Prisma ORM plugin will do this for you automatically.

## Configuration

[`prisma.config.ts`](prisma.config.ts) tells the CLI where your contract lives and how to connect to your database. It loads environment variables from `.env` automatically:

```typescript
import 'dotenv/config';
import { definePrismaConfig } from '@prisma/cli-engine';
import { defineConfig as ormConfig } from '@prisma/orm-postgres/config';

export default definePrismaConfig({
  orm: ormConfig({
    contract: './src/prisma/schema.prisma',
    db: {
      connection: process.env['DATABASE_URL']!,
    },
  }),
});
```

Notice the `DATABASE_URL` above? It's defined in your [`.env`](./.env) file:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/mydb"
```

You can customize how your environment variables are loaded by changing or removing the `import 'dotenv/config'` line.

## Quick reference

### Commands

```bash
npx prisma contract emit           # Update contract.json and contract.d.ts
npx prisma db init                 # Create tables in the database
npx prisma db sign                 # Sign database with current contract
npx prisma contract emit           # After schema changes
npx prisma migration plan --name <slug>  # Plan migration from contract changes
npx prisma db migrate              # Apply planned migrations
npx prisma db verify               # Verify database matches contract
npx prisma migration status        # Show migration status
```

### Files

| File | Purpose |
|---|---|
| [`src/prisma/schema.prisma`](src/prisma/schema.prisma) | Your data contract — define your models here |
| [`prisma.config.ts`](prisma.config.ts) | CLI configuration |
| [`src/prisma/db.ts`](src/prisma/db.ts) | Database client — `import { db } from './src/prisma/db'` |
| `src/prisma/schema.json` | Compiled contract (generated) |
| `src/prisma/schema.d.ts` | Contract types (generated) |

### Workflow

1. Edit [`src/prisma/schema.prisma`](src/prisma/schema.prisma) to add or change models.
2. Run `npx prisma contract emit` to regenerate the contract.
3. Query your models — your IDE will autocomplete everything.

### Migration Workflow

Prisma 8 uses a contract-first migration system. When you change your schema, you plan and apply migrations explicitly:

```bash
# 1. Edit your schema in schema.prisma
# 2. Emit the updated contract
npx prisma contract emit

# 3. Plan a migration (give it a descriptive name)
npx prisma migration plan --name add-avatar-to-user

# 4. Apply the migration to your database
npx prisma db migrate

# 5. Verify the database matches your contract
npx prisma db verify
```

#### First Migration (Initial Setup)

If this is a fresh database with no migration history:

```bash
# 1. Ensure schema.prisma has your initial models
# 2. Emit contract
npx prisma contract emit

# 3. Sign the database (records current state as baseline)
npx prisma db sign

# 4. Add new models/changes to schema.prisma
# 5. Emit contract again
npx prisma contract emit

# 6. Plan first real migration
npx prisma migration plan --name add-nodebase-models

# 7. Apply migration
npx prisma db migrate
```

#### Migration Commands Reference

```bash
# Show migration status (pending, applied)
npx prisma migration status

# List all migrations
npx prisma migration list

# Preview what would run without applying
npx prisma db migrate --show

# Reset database (drop all + reapply migrations)
npx prisma migrate reset --force
```

#### Key Differences from Prisma 7

| Prisma 7 | Prisma 8 |
|---|---|
| `prisma migrate dev` | `prisma migration plan --name X` + `prisma db migrate` |
| Migration files in `prisma/migrations/` | Migration packages in `migrations/` |
| `schema.prisma` is source of truth | `contract.json` (emitted) is source of truth |
| Auto-generates SQL | Can inspect/edit generated migration package |

## Monorepo notes (pnpm workspaces)

If this project lives inside a pnpm workspace, a few things are worth knowing:

- **Catalogs.** When the workspace's `pnpm-workspace.yaml` defines a `catalogs` entry for `prisma` or `@prisma/orm-postgres`, pnpm uses the catalog version everywhere — `init` does too. If you wanted the published `latest` instead, update or remove the catalog entry, then re-run `pnpm install`.
- **`pnpm dlx`.** `pnpm dlx prisma@latest orm init …` works in any directory. Inside a workspace, pnpm still resolves dependencies through the workspace's catalog/overrides rather than the registry; expect the installed Prisma ORM packages to reflect the workspace's catalog rather than `latest`.
- **`pnpm` → `npm` fallback.** If `pnpm` ever fails to install Prisma ORM with a `workspace:*` or `catalog:` resolution error (a leak in a published artefact), `init` falls back to `npm install` and surfaces a warning. Once the offending package republishes a clean version you can switch back with `pnpm install`.
