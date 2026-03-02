mod db;

use sha1::Sha1;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::sync::Mutex;
use tauri::ipc::Response;
use tauri::Manager;

const DEFAULT_READ_BYTES: usize = 2048;
const MAX_READ_BYTES: usize = 65536;

fn resolve_read_len(requested: Option<usize>) -> Result<usize, String> {
    let read_len = requested.unwrap_or(DEFAULT_READ_BYTES);
    if read_len == 0 {
        return Ok(DEFAULT_READ_BYTES);
    }
    if read_len > MAX_READ_BYTES {
        return Err(format!(
            "Requested read size {read_len} exceeds max supported size {MAX_READ_BYTES}"
        ));
    }
    Ok(read_len)
}

/// Read a range of bytes from a file.
/// Returns raw bytes via IPC Response for zero-copy transfer.
#[tauri::command]
fn read_file_bytes(path: String, offset: Option<u64>, length: Option<usize>) -> Result<Response, String> {
    let mut file = File::open(&path).map_err(|e| format!("Failed to open file: {e}"))?;

    if let Some(off) = offset {
        file.seek(SeekFrom::Start(off))
            .map_err(|e| format!("Failed to seek: {e}"))?;
    }

    let read_len = resolve_read_len(length)?;
    let mut buffer = vec![0u8; read_len];
    let bytes_read = file
        .read(&mut buffer)
        .map_err(|e| format!("Failed to read: {e}"))?;

    buffer.truncate(bytes_read);
    Ok(Response::new(buffer))
}

/// Read a UTF-8 (lossy) text segment from a file.
/// Useful for small descriptor files (.cue/.gdi) without loading full files.
#[tauri::command]
fn read_file_text(path: String, max_bytes: Option<usize>) -> Result<String, String> {
    let mut file = File::open(&path).map_err(|e| format!("Failed to open file: {e}"))?;
    let read_len = resolve_read_len(max_bytes)?;
    let mut buffer = vec![0u8; read_len];
    let bytes_read = file
        .read(&mut buffer)
        .map_err(|e| format!("Failed to read: {e}"))?;
    buffer.truncate(bytes_read);

    Ok(String::from_utf8_lossy(&buffer).to_string())
}

/// Compute the SHA-256 hash of a file, streaming in 128KB chunks.
#[tauri::command]
fn compute_file_hash(path: String) -> Result<String, String> {
    let mut file = File::open(&path).map_err(|e| format!("Failed to open file: {e}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 131072]; // 128KB buffer for faster hashing

    loop {
        let bytes_read = file
            .read(&mut buffer)
            .map_err(|e| format!("Failed to read: {e}"))?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    let hash = hasher.finalize();
    Ok(hex::encode(hash))
}

/// Compute the SHA-1 hash of a file, streaming in 4MB chunks.
#[tauri::command]
fn compute_file_sha1(path: String) -> Result<String, String> {
    let mut file = File::open(&path).map_err(|e| format!("Failed to open file: {e}"))?;
    let mut hasher = Sha1::new();
    let mut buffer = vec![0u8; 4 * 1024 * 1024]; // 4MB buffer for massive ISOs

    loop {
        let bytes_read = file
            .read(&mut buffer)
            .map_err(|e| format!("Failed to read: {e}"))?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    let hash = hasher.finalize();
    Ok(hex::encode(hash))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let conn = db::init_db(app.handle()).expect("Failed to initialize database");
            app.manage(db::DbState {
                conn: Mutex::new(conn),
            });
            Ok(())
        })
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            read_file_bytes,
            read_file_text,
            compute_file_hash,
            compute_file_sha1,
            db::check_hash,
            db::get_db_stats,
            db::import_dat_file,
            db::sync_online_databases
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
