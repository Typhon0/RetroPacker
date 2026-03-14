# CLAUDE.md

This file provides guidance for AI coding agents (Claude, opencode, etc.) working in the RetroPacker repository.

## Project Overview

RetroPacker is a Tauri 2 + React 19 desktop app for packing, unpacking, and verifying retro game ROMs (CHD, RVZ, CSO). Built for retro gaming enthusiasts who need a fast, reliable GUI alternative to command-line tools like `chdman`.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite 7, Tailwind CSS v4
- **Desktop**: Tauri 2 (Rust)
- **UI**: Shadcn UI (new-york style) + Radix Primitives, Lucide icons
- **State**: Zustand (global config) + Preact Signals (job queues/progress)
- **Styling**: Tailwind CSS with OKLCH CSS variables, `cn()` utility
- **Fonts**: Geist Variable (`@fontsource-variable/geist`)
- **Tooling**: Biome (lint/format), Vitest (test)

## Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Frontend dev server
pnpm tauri dev        # Full desktop dev mode
pnpm build            # Production build (TS check + Vite)
pnpm biome check      # Lint & format check
pnpm biome check --write  # Auto-fix & format
pnpm vitest run       # Run all tests
```

## Architecture

```
src/
  domain/      # Business logic, entities, types (no UI)
  data/        # Tauri IPC, API wrappers (domain implementations)
  services/    # Application services (ProcessRegistry, etc.)
  presentation/  # React context providers, complex layouts
  components/  # UI components
    ui/        # Shadcn primitives (Button, Card, etc.)
    dashboard/ # Feature-specific components
  stores/      # Zustand + Preact Signals
  lib/         # Utilities (cn, formatters)
src-tauri/src/ # Rust backend, Tauri commands
```

## Code Style

- **Indentation**: Tabs (enforced by Biome)
- **Strings**: Double quotes
- **Imports**: Use `@/` alias, never relative `../`
- **Exports**: Named exports, no default exports
- **Components**: `export function MyComponent() { ... }`
- **Styling**: Tailwind only, use `cn()` for conditionals
- **Types**: Strict TypeScript, no `any`, use `unknown` or define interfaces
- **Interfaces**: Prefix with `I` (e.g., `ICommandExecutor`)
- **State**: Zustand for config, Preact Signals for high-frequency updates

## Design Context

### Users
Retro gaming enthusiasts managing large ROM collections. They run batch operations (compress, extract, verify) and want to monitor progress while doing other things. The tool is utilitarian - a means to an end. They're technical but appreciate a clean interface that doesn't require memorizing CLI flags.

### Brand Personality
**Competent. Clean. No-nonsense.** The brand is a trustworthy utility tool. It should feel like a well-engineered piece of software - not playful, not decorative, just reliably efficient.

### Aesthetic Direction
**Modern dark utility, inspired by Spotify and Discord.** Clean visual hierarchy, subtle depth, polished but not flashy. Dark mode as the primary theme. The retro pixel-art banner exists for brand recognition but does NOT inform the UI design language. The UI itself should be pure modern software aesthetics.

### Design Principles

1. **Efficiency over decoration** - Every pixel should serve a function. No ornamental elements. Progress indicators, queue status, and action buttons are the core UI surface.

2. **Dark mode first** - Design for dark theme as the default. Light mode should work but dark is the primary experience (matching Spotify/Discord reference).

3. **Clear visual hierarchy** - Distinguish interactive elements, information states (success/warning/error/info), and inactive states through consistent, high-contrast color usage. Status colors (`--success`, `--warning`, `--destructive`, `--info`) should be immediately readable.

4. **Polish through restraint** - Subtle shadows, consistent spacing, smooth transitions (not bouncy). Quality is signaled through precision, not personality. The `--radius: 0.625rem` base and consistent spacing scale create visual order.

5. **Standard accessibility (WCAG AA)** - Adequate contrast ratios, keyboard navigation, logical focus order. No special accommodations beyond standard unless requested.
