# RetroPacker

The "Handbrake for ROMs" - A professional-grade, cross-platform compression tool for PS1, PS2, PSP, Dreamcast, and Saturn games using `chdman`.

## Features

- **Batteries Included**: Embeds `chdman` for a seamless experience.
- **Intelligent Engine**: Auto-detects optimal strategy (DVD vs CD vs GDI).
- **Preset System**: From "Balanced" to "Raw/Lossless".
- **Concurrency**: Parallel processing to maximize CPU usage.
- **Queue System**: Batch processing with real-time logs and progress.
- **Modern UI**: Industrial Dark theme built with Tauri v2, React, and Shadcn UI.

## Setup Instructions

### Prerequisites
- Node.js (v18+)
- Rust (Stable)
- System dependencies for Tauri (Linux only: `libwebkit2gtk-4.0-dev` etc.)

### 1. Install Dependencies
```bash
npm install
```

### 2. Download Binaries (Critical)
RetroPacker requires `chdman` binaries to be placed in `src-tauri/binaries/`.
Due to licensing/distribution, you must provide these.

1.  Download `chdman` for your OS (part of MAME tools).
2.  Rename and place them in `src-tauri/binaries/`:
    - **Windows**: `chdman-x86_64-pc-windows-msvc.exe`
    - **Linux**: `chdman-x86_64-unknown-linux-gnu`
    - **macOS (Silicon)**: `chdman-aarch64-apple-darwin`
    - **macOS (Intel)**: `chdman-x86_64-apple-darwin`

*Note: The target triple suffix is required for Tauri sidecars.*

### 3. Development
```bash
npm run tauri dev
```

### 4. Build
```bash
npm run tauri build
```

## Architecture
- **Frontend**: React + TypeScript + Vite + Zustand + Shadcn UI.
- **Backend**: Tauri v2 (Rust) + Shell Plugin.
- **Logic**: `ChdmanService` handles argument generation and process management.

