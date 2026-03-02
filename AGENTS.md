# RetroPacker Agent Protocol (`AGENTS.md`)

This file contains guidelines, architectural notes, code style, and critical commands for autonomous coding agents (like Cursor, GitHub Copilot, or opencode) operating within the RetroPacker repository. Read this file before proceeding with any significant refactoring, feature implementation, or bug fixes.

---

## 1. Project Overview & Tech Stack

RetroPacker is a desktop application built with a modern web frontend and a Rust-based backend using Tauri.

- **Frontend Framework**: React 19 (TypeScript)
- **Desktop Framework**: Tauri 2 (Rust)
- **Build Tool / Bundler**: Vite (Frontend), Cargo (Backend)
- **Package Manager**: `pnpm` (Workspace/monorepo support)
- **Styling**: Tailwind CSS (v3) + Radix UI Primitives (Shadcn-style components)
- **State Management**: Zustand (Global UI) + `@preact/signals-core` (High-performance granular state like Job queues)
- **Linting & Formatting**: Biome (`@biomejs/biome`)
- **Testing**: Vitest (Node environment)
- **Icons**: `lucide-react`

---

## 2. Build, Lint & Test Commands

Agents must verify their work using the following commands. NEVER assume standard npm commands. Run these from the project root.

### 2.1 Dependency Management
* **Install dependencies**: `pnpm install`

### 2.2 Development & Build
* **Frontend Dev Server**: `pnpm dev`
* **Tauri Desktop Dev**: `pnpm tauri dev`
* **Production Build**: `pnpm build` (TypeScript check + Vite build)
* **Tauri Production Build**: `pnpm tauri build`

### 2.3 Linting & Formatting
The project strictly uses Biome for both formatting and linting. Do not use Prettier or ESLint.
* **Check Code (Lint & Format)**: `pnpm biome check`
* **Auto-fix & Format**: `pnpm biome check --write` (Run this before committing changes)

### 2.4 Testing (Vitest)
Tests are collocated with source files (e.g., `src/.../myModule.test.ts`) and run in a Node environment (no DOM/JSDOM).
* **Run all tests**: `pnpm test` (or `pnpm vitest run`)
* **Watch all tests**: `pnpm vitest`
* **Run a single test file**: `pnpm vitest run <path/to/test.test.ts>` (e.g., `pnpm vitest run src/lib/utils.test.ts`)
* **Watch a single test file**: `pnpm vitest <test-file-name>`

---

## 3. Project Architecture

The application structure follows principles of Domain-Driven Design (DDD) and Clean Architecture on the frontend. Respect these boundaries:

- `src/domain/`: Core business logic, Entities, Models, Types, and abstract Repository interfaces (e.g., `ICommandExecutor`). NO UI logic here.
- `src/data/`: Data persistence implementations, API calls, and Tauri IPC wrappers (implementations of domain interfaces).
- `src/services/`: Application services, business operations, and process management (e.g., `ProcessRegistry.ts`).
- `src/presentation/`: React UI layer. Contains Context providers, global hooks, and complex page layouts.
- `src/components/`: Reusable React components.
  - `src/components/ui/`: Low-level, generic components (Radix UI / Shadcn primitives).
  - `src/components/dashboard/`: Feature-specific UI components.
- `src/stores/`: Global state management (`usePackerStore.ts` for Zustand, `JobStore.ts` for Preact signals).
- `src/lib/`: Utility functions and stateless helpers (`cn` for Tailwind, string formatting, etc.).
- `src-tauri/src/`: Rust backend logic, Tauri IPC commands (`#[tauri::command]`), system-level file/process integrations.

---

## 4. Code Style & Guidelines

### 4.1 Formatting & Conventions
- **Biome Rules**: The codebase uses **tabs** for indentation and **double quotes** for strings. Do not override these manually; rely on `pnpm biome check --write`.
- **Imports**: Biome is configured to auto-organize imports (`assist.actions.source.organizeImports: "on"`).
- **Functional Modules over Classes**: Prefer standalone functional modules with module-scoped state (for tree-shaking and simplicity) over static classes or heavy OOP patterns. See `src/services/ProcessRegistry.ts` as an example.
- **Component Style**: Use React Functional Components. Export functions directly (e.g., `export function MyComponent() { ... }`). Avoid default exports where possible.
- **Styling**: Use Tailwind CSS. For conditional classes, strictly use the `cn()` utility (`import { cn } from "@/lib/utils"`).

### 4.2 Paths & Imports
- **Path Aliases**: ALWAYS use the `@/` prefix for absolute imports inside `src/`.
  * **Correct**: `import { Button } from "@/components/ui/button";`
  * **Incorrect**: `import { Button } from "../../components/ui/button";`
- Never use relative paths `../` to navigate out of the current directory tree if `@/` can be used.

### 4.3 Types & Interfaces
- **Strict TypeScript**: The project uses strict mode (`"strict": true`). Do not use `any`; use `unknown` if the type is truly dynamic, or properly define strict interfaces.
- **Location**: Define domain-specific interfaces in `src/domain/types/` or `src/domain/models/`.
- **Naming**: Use PascalCase for interfaces and types (e.g., `JobStatus`, `ICommandExecutor`).
- Prefix pure interfaces (abstractions meant to be implemented by other layers) with `I` (e.g., `ICommandExecutor`).

### 4.4 State Management
- **Zustand**: Use for global application configuration, user preferences, UI modes, and low-frequency updates (`src/stores/usePackerStore.ts`).
- **Preact Signals**: Use `@preact/signals-core` for highly mutable, rapidly changing state (like processing queues, progress bars, individual job statuses) to avoid excessive React component re-renders. Expose them via custom hooks (e.g., `useSignalValue`).

### 4.5 Error Handling
- **TypeScript**: Throw standard `Error` objects, or use explicit `Result` wrapper patterns if defined in the domain layer. Never swallow errors silently.
- **Rust (Tauri)**: Tauri IPC commands must return `Result<T, String>` for error serialization to the frontend.
  * **Pattern**: `.map_err(|e| format!("Failed to perform action: {}", e))?`
- Present critical errors to the user via UI notifications (e.g., `toast` or Tauri dialogs).

### 4.6 Comments & Documentation
- Write concise JSDoc comments (`/** ... */`) for exported functions, complex interfaces, and domain boundaries.
- Focus on the *why* rather than the *what* when documenting logic.
- Avoid obvious or redundant inline comments (e.g., `// Add 1 to index`). Do not use comments to "talk" to the user.

### 4.7 External Knowledge & Context7 MCP
- When encountering unfamiliar APIs, libraries, or frameworks in this codebase (especially for Tauri, React, Radix UI, or Rust crates), you MUST use the Context7 MCP (Model Context Protocol) to query official, up-to-date documentation.
- Do not guess API signatures or configuration structures. Resolve the library ID first, then query the docs to ensure you are using the correct and most recent patterns.

---

## 5. Agent Instructions (Self-Correction & Operations)

1. **Self-Verification**: When asked to implement a feature or fix a bug, always verify your work by running:
   - `pnpm biome check` (Fix any formatting/lint issues).
   - `pnpm build` (Ensure no TypeScript errors exist).
   - `pnpm vitest run <path/to/relevant_test.ts>` (Ensure tests pass or write new ones).
2. **Safety**: Never run destructive operations or commit changes directly unless explicitly requested by the user. Explain any complex `bash` commands before running them.
3. **Rust Integrity**: When modifying `src-tauri/src/*.rs`, run `cargo check` inside the `src-tauri` directory to validate Rust syntax and types before finalizing your response.