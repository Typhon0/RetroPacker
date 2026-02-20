use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use tauri::ipc::Response;

/// Read a range of bytes from a file.
/// Returns raw bytes via IPC Response for zero-copy transfer.
#[tauri::command]
fn read_file_bytes(path: String, offset: Option<u64>, length: Option<usize>) -> Result<Response, String> {
    let mut file = File::open(&path).map_err(|e| format!("Failed to open file: {e}"))?;

    if let Some(off) = offset {
        file.seek(SeekFrom::Start(off))
            .map_err(|e| format!("Failed to seek: {e}"))?;
    }

    let read_len = length.unwrap_or(2048);
    let mut buffer = vec![0u8; read_len];
    let bytes_read = file
        .read(&mut buffer)
        .map_err(|e| format!("Failed to read: {e}"))?;

    buffer.truncate(bytes_read);
    Ok(Response::new(buffer))
}

/// Compute the SHA-256 hash of a file, streaming in 8KB chunks.
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![read_file_bytes, compute_file_hash])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
