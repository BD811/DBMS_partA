# ServiceIQ

ServiceIQ is a field-service and AMC management application built with Next.js 14, Supabase, and Tailwind CSS.

## Local setup

Requirements: Node.js 20+ and npm.

1. Install packages:

   ```powershell
   npm install
   ```

2. Create a Supabase project named `serviceiq`. In its SQL Editor, run [`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql).
3. In Supabase Storage, create a public bucket named `job-attachments`.
4. In Supabase Authentication settings, enable email magic links. Disable email confirmation during development if you want to test without confirming addresses. Add these redirect URLs:
   - `http://localhost:3000/auth/callback`
   - Your deployed site's `/auth/callback` URL
5. Copy `.env.example` to `.env.local` and fill in the Supabase project URL, anon key, and service role key. Keep the service role key server-side; never add a `NEXT_PUBLIC_` prefix to it.
6. Start the development server:

   ```powershell
   npm run dev
   ```

   Open `http://localhost:3000`. New users can sign in or sign up with an email magic link, then create their organization through the onboarding form.

For TypeScript and lint checks:

```powershell
npm run typecheck
npm run lint
```

## Supabase type generation

After creating the Supabase project and applying the migration, install/use the Supabase CLI and generate the database types:

```powershell
npx supabase gen types typescript --project-id <your-project-id> --schema public | Set-Content -Encoding utf8 src/lib/supabase/database.types.ts
```

The shared Track A role and row interfaces are in [`src/types/index.ts`](./src/types/index.ts). The generated `database.types.ts` is intentionally kept separate so the CLI can regenerate it without overwriting those app-level types.

## Deployment

Push the project to GitHub and import it into Vercel. Add the values from `.env.example` to the Vercel project settings. `SUPABASE_SERVICE_ROLE_KEY` must be a server-only variable. Configure the production Supabase Auth redirect URL to `https://<your-domain>/auth/callback`.

Cloud resources are not provisioned automatically by this repository. A Supabase project, its credentials, and a Vercel account are required to complete the live deployment.

## Production dependency note

The supplied project brief pins Next.js 14. The current dependency audit reports high/critical advisories for this pinned Next.js line, while npm's suggested automatic fix would upgrade to Next.js 16 and break the specified stack. Review and approve a framework upgrade before exposing a production deployment publicly.
