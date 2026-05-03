# LevelLog

Scaffolded foundations for the LevelLog web application.

## Included

- SvelteKit with the Bun adapter
- Tailwind CSS v4 via `@tailwindcss/vite`
- Drizzle ORM with SQLite
- Better Auth with Google provider scaffolding
- Dockerfile and `docker-compose.yml`
- Reserved route/file structure aligned to `SPEC.md`

## Local setup

1. Copy `.env.example` to `.env`.
2. Fill in the Better Auth and Google OAuth values.
3. Install dependencies with `bun install`.
4. Generate the initial migration with `bun run db:generate`.
5. Apply migrations with `bun run db:migrate`.
6. Start the dev server with `bun run dev`.

## Notes

- `DATABASE_URL` should point to a writable SQLite file.
- The current UI is placeholder-only by design. No app-specific behavior is implemented yet.
- Better Auth wiring is scaffolded, but OAuth will not work until the provider credentials and callback URL are configured.
