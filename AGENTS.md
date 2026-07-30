# Repository Guidelines

## Project Structure & Module Organization

This repository contains a Vite-powered React 18 nutrition application.

- `src/main.jsx` initializes React and authentication.
- `src/App.jsx` composes the main recipe, meal-plan, favorites, and shopping-list UI.
- `src/*Gate.jsx`, `src/*Dashboard.jsx`, and `src/*CheckIn.jsx` contain feature components.
- `src/use*.js` contains reusable hooks; `src/supabaseClient.js` owns database client setup.
- `src/index.css` contains Tailwind directives and global styles.
- `public/` stores icons and the web-app manifest.
- `supabase-schema*.sql` defines the Supabase database and tracking tables.
- `dist/` is generated output and should not be edited.

Keep UI, hooks, data access, validation, and shared utilities separate. When extending the large `App.jsx`, extract cohesive features rather than adding unrelated logic to it.

## Build, Test, and Development Commands

Use Bun for dependency management and scripts:

```bash
bun install        # install dependencies from bun.lock
bun run dev        # start the Vite development server
bun run build      # create a production build in dist/
bun run preview    # serve the production build locally
```

Copy `.env.example` to `.env` when available and configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Never commit real credentials.

## Coding Style & Naming Conventions

Use ES modules, two-space indentation, double quotes, and semicolons, matching the existing source. Name React components in `PascalCase`, hooks with a `use` prefix, and ordinary functions or variables in `camelCase`. Keep components focused and prefer named exports for reusable modules. Preserve Slovenian user-facing copy unless the feature explicitly changes the product language.

No repository-wide formatter or linter is configured. Review changed files for consistent formatting and run a production build before submitting.

## Testing Guidelines

There is currently no automated test framework or coverage threshold. For every change, run `bun run build` and manually verify affected flows through `bun run dev`, including authentication, profile onboarding, daily logs, and responsive layouts where relevant. If adding tests, prefer Vitest with React Testing Library and name files `*.test.jsx` beside the module under test.

## Commit & Pull Request Guidelines

Recent history uses short imperative summaries but is largely generic. Use specific messages such as `Add daily log validation` instead of `Add files via upload`. Keep commits scoped to one concern.

Pull requests should explain the user-visible change, list verification performed, note Supabase schema or environment changes, and link related issues. Include screenshots for visual changes and call out migrations or deployment steps explicitly.
