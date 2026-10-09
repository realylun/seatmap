This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Run locally

Requires Node >= 20.9, pnpm and Docker.

```bash
cp .env.example .env.local        # local Postgres + local file storage defaults
docker compose up -d              # Postgres 17 on localhost:5432
docker exec seatmap-postgres psql -U seatmap -c "create database seatmap_test"   # once, for pnpm test:neon
pnpm install
pnpm db:migrate
pnpm db:seed                      # demo venues, events and seats
pnpm dev                          # http://localhost:3000, admin at /admin
```

Without `BLOB_READ_WRITE_TOKEN`, template geometry and uploaded images are written to
`public/local-blob/` (git-ignored) and served from `/local-blob/...`. In production mode
(`pnpm start`) files written after `pnpm build` are not served; use `pnpm dev` for uploads.

Other commands: `pnpm test` (PGlite, no Docker needed), `pnpm test:neon` (concurrency test on
`DATABASE_URL_TEST`), `pnpm test:e2e`, `pnpm typecheck`, `pnpm lint`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
