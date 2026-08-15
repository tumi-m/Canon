# CANON

A personal curated content network. Each person has a public "canon": content that
shaped them, with a one-line why and where to stream it in the visitor's region.

> **State:** M0 is done and the app runs. `/` and `/[handle]` are live, along
> with the walkable store. There is still no database, no auth and no writes —
> a canon is a static object in `src/lib/canon.ts`. See `docs/PROGRESS.md` for
> the milestone-by-milestone state before starting anything.
>
> The supabase commands below start working at M1.

## Commands
- `npm run dev` · `npm run build` · `npm run typecheck` · `npm run lint`
- `npm test` (vitest) · `npm run test:e2e` (playwright)
- `npx supabase db diff -f <name>` — generate a migration from local schema changes
- `npx supabase gen types typescript --linked > src/lib/database.types.ts`

## Architecture
- Next.js 15 App Router. Server Components by default; `"use client"` only for
  interactivity (the store, drawers, forms).
- Supabase Postgres. **Row Level Security is the security boundary.** Application
  code must never be the only thing preventing access to a row.
- `src/lib/supabase/server.ts` — server client (cookie-based session)
- `src/lib/supabase/client.ts` — browser client
- The service-role key is used in exactly one place: `src/lib/supabase/admin.ts`,
  which must never be imported by a client component. If you need it elsewhere, stop and ask.

## Non-negotiables
1. **One milestone per session.** Milestones are in `docs/PLAN.md`. Do not work ahead.
2. **Never write or apply a migration without showing me the SQL first and waiting.**
3. Every new table gets RLS enabled in the same migration, plus a policy test in
   `tests/rls/`. A table without RLS is a bug, not a TODO.
4. Never commit secrets. Never `git commit --no-verify`. Never skip or delete a
   failing test to get green — fix it or tell me it's failing.
5. All user input validated with zod at the boundary. Notes are capped at 300
   characters in the DB (CHECK constraint), the API, and the UI — all three.
6. No new dependency without asking. Especially no UI kits, ORMs, or state libraries.
7. If you're blocked twice on the same problem, stop and explain — don't try a third approach.
8. Prefer editing an existing file over creating a new one. Don't create README/docs
   files unless I ask.

## Conventions
- Design tokens are CSS custom properties in `src/app/globals.css` (`--paper`,
  `--ink`, `--red`, `--phos`…). Tailwind for layout, CSS vars for colour/theme.
  Never hardcode a hex value in a component.
- Server actions for mutations; route handlers only for webhooks and public APIs.
- Errors: throw typed errors, catch at the boundary, log to Sentry, never swallow.
- Copy voice: lowercase, warm, plain. "the content that made you" not "curate your media journey".

## Testing
- Any change touching access control requires an RLS test proving an unauthorised
  role gets zero rows. Write the failing test first.
- E2E covers the four critical paths: create a canon, view someone else's canon,
  membership unlock, walk the store.
