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

### Animation Philosophy
**Smooth and polished, never bouncy or playful.** All motion should feel purposeful and professional. Use the established easing curve `cubic-bezier(0.22, 1, 0.36, 1)` for most animations. Standard timing values: 200ms for interactive transitions (hovers, focus), 300ms for state changes (status badges, drag feedback), 400ms for entrances and completions. The app has four custom keyframes defined in `src/App.css`: `fade-in-up` (entrances), `status-complete` (completion pulse), `drag-bounce` (drop zone feedback), and `progress-complete` (progress bar pulse). Always respect `prefers-reduced-motion: reduce` - the media query is already in place.

### Design Tokens (Quick Reference)

All tokens defined in `src/App.css`. Use these directly; do not invent new colors or values.

**Typography**: `--font-sans: "Geist Variable", sans-serif`

**Border Radius**: `--radius: 0.625rem` (10px) | sm: calc -4px | md: calc -2px | lg: 1rem | xl: calc +8px

**Dark Theme Colors** (primary experience):
| Token | Value | Usage |
|---|---|---|
| `--background` | `oklch(0.145 0 0)` | Page background |
| `--foreground` | `oklch(0.985 0 0)` | Primary text |
| `--card` | `oklch(0.205 0 0)` | Elevated surfaces |
| `--primary` | `oklch(0.922 0 0)` | Interactive elements |
| `--secondary` | `oklch(0.269 0 0)` | Secondary surfaces |
| `--muted` | `oklch(0.269 0 0)` | Muted backgrounds |
| `--muted-foreground` | `oklch(0.708 0 0)` | Muted text |
| `--border` | `oklch(1 0 0 / 10%)` | Borders |
| `--destructive` | `oklch(0.704 0.191 22.216)` | Errors/danger |
| `--success` | `oklch(0.7 0.15 160)` | Success states |
| `--warning` | `oklch(0.75 0.15 75)` | Warning states |
| `--info` | `oklch(0.65 0.15 250)` | Info states |

**Component Vocabulary**: Button (variants: default/destructive/outline/secondary/ghost/link), StatusBadge (variants: default/secondary/success/info/warning/destructive), Card (composable: Header/Title/Description/Content/Action/Footer), Dialog, Tabs, Table, Progress, Select, Input, Tooltip, Switch, ScrollArea.

### Design Principles

1. **Efficiency over decoration** - Every pixel should serve a function. No ornamental elements. Progress indicators, queue status, and action buttons are the core UI surface.

2. **Dark mode first** - Design for dark theme as the default. Light mode should work but dark is the primary experience (matching Spotify/Discord reference).

3. **Clear visual hierarchy** - Distinguish interactive elements, information states (success/warning/error/info), and inactive states through consistent, high-contrast color usage. Status colors (`--success`, `--warning`, `--destructive`, `--info`) should be immediately readable.

4. **Polish through restraint** - Subtle shadows, consistent spacing, smooth transitions (not bouncy). Quality is signaled through precision, not personality. The `--radius: 0.625rem` base and consistent spacing scale create visual order.

5. **Standard accessibility (WCAG AA)** - Adequate contrast ratios, keyboard navigation, logical focus order. No special accommodations beyond standard unless requested.

6. **Purposeful motion** - Animations serve feedback and state transitions, never decoration. Use the established keyframes and timing values from `src/App.css`. Keep easing consistent with the project's `cubic-bezier(0.22, 1, 0.36, 1)` curve. Respect reduced-motion preferences.
