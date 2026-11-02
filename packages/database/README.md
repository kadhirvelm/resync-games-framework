# Database

The prisma client for Resync Game Framework's Postgres instance.

## Migrating

1. Make changes to the prisma file
2. cd into the `packages/database` folder
3. `bun run db:create-migration` to generate the migration files
4. Check the resulting file in `packages/database/prisma/migrations` to make sure it makes sense
5. `bun run db:migrate` to apply the migration
6. `bun run db:generate` to update the local client (the types)

## Studio

`bun run db:studio` to inspect data in the browser
