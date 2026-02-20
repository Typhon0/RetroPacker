# RetroPacker

The "Handbrake for ROMs" - A professional-grade, cross-platform compression tool for PS1, PS2, PSP, Dreamcast, Saturn, GameCube, and Wii games using `chdman` and `DolphinTool`.

## Features

- **Batteries Included**: Embeds `chdman` and `DolphinTool` as sidecar binaries.
- **Intelligent Engine**: Auto-detects optimal strategy (DVD vs CD vs GDI) and platform (via extension, path, and binary header analysis).
- **Preset System**: From "Balanced" to "Raw/Lossless", plus custom codec strings.
- **Concurrency**: Parallel processing with auto-detected hardware concurrency.
- **Queue System**: Batch processing with real-time logs, progress tracking, ETA, and compression ratio stats.
- **Queue Persistence**: Queue state survives app restarts via Tauri Store.
- **Cover Art**: Automatic cover art fetching from GameTDB, LibRetro Thumbnails, and local files.
- **Modern UI**: Industrial Dark theme built with Tauri v2, React, Shadcn UI, and Tailwind CSS.
- **Sleep Prevention**: Prevents system sleep during active processing via Wake Lock API.
- **Taskbar Progress**: Shows batch progress in the OS taskbar.

## Setup Instructions

### Prerequisites
- Node.js (v18+)
- pnpm
- Rust (Stable)
- System dependencies for Tauri (Linux only: `libwebkit2gtk-4.0-dev` etc.)

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Download Binaries (Critical)
RetroPacker requires external binaries to be placed in `src-tauri/binaries/`.
Due to licensing/distribution, you must provide these yourself.

1.  Download `chdman` for your OS (part of MAME tools) for CD/DVD images.
2.  *(Optional)* Download `DolphinTool` for your OS (part of Dolphin Emulator) for GameCube/Wii `.rvz` support.
3.  Rename and place them in `src-tauri/binaries/`:

    **For Windows:**
    - `chdman-x86_64-pc-windows-msvc.exe`
    - `DolphinTool-x86_64-pc-windows-msvc.exe`

    **For Linux:**
    - `chdman-x86_64-unknown-linux-gnu`
    - `DolphinTool-x86_64-unknown-linux-gnu`

    **For macOS (Silicon):**
    - `chdman-aarch64-apple-darwin`
    - `DolphinTool-aarch64-apple-darwin`

    **For macOS (Intel):**
    - `chdman-x86_64-apple-darwin`
    - `DolphinTool-x86_64-apple-darwin`

*Note: The target triple suffix is required for Tauri sidecars to find the correct binary.*

### 3. Development
```bash
npm run tauri dev
```

### 4. Build
```bash
npm run tauri build
```

## Architecture

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS + Shadcn UI (Radix primitives).
- **State Management**: Preact Signals (`JobStore`) for fine-grained reactive job state, Zustand (`usePackerStore`) for persisted user settings.
- **Domain Layer**: Clean Architecture with use cases (`ProcessJobUseCase`, `ManageQueueUseCase`, `DetectSystemUseCase`), entities (`JobState`), and repository interfaces.
- **Data Layer**: Tauri implementations (`TauriCommandExecutor`, `TauriFileSystemRepository`, `TauriNotificationService`) injected via React context (`RepositoryProvider`).
- **Services**: `ProcessRegistry` (process lifecycle and cancellation), `MetadataService` (cover art and game ID extraction), `BinaryManagerService` (sidecar binary management).
- **Backend**: Tauri v2 (Rust) providing SHA-256 file hashing, binary byte reading, and Shell Plugin for sidecar process management.
