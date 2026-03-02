use quick_xml::events::Event;
use quick_xml::reader::Reader;
use reqwest::blocking::Client;
use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

pub struct DbState {
    pub conn: Mutex<Connection>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct DbStats {
    pub row_count: i64,
    pub last_updated: String,
}

pub fn init_db(app: &AppHandle) -> SqlResult<Connection> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir");
    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir).expect("Failed to create app data dir");
    }
    let db_path = app_data_dir.join("hashes.db");

    let conn = Connection::open(db_path)?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS rom_hashes (
            sha1 TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            system TEXT
        )",
        [],
    )?;

    // Performance pragmas
    conn.execute_batch(
        "PRAGMA synchronous = OFF;
         PRAGMA journal_mode = MEMORY;
         PRAGMA temp_store = MEMORY;
         PRAGMA cache_size = 10000;",
    )?;

    Ok(conn)
}

#[tauri::command]
pub fn check_hash(
    state: tauri::State<'_, DbState>,
    sha1: String,
) -> Result<Option<String>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT name FROM rom_hashes WHERE sha1 = ?")
        .map_err(|e| e.to_string())?;

    let result = stmt.query_row(params![sha1.to_uppercase()], |row| row.get(0));

    match result {
        Ok(name) => Ok(Some(name)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn get_db_stats(state: tauri::State<'_, DbState>) -> Result<DbStats, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM rom_hashes", [], |row| row.get(0))
        .unwrap_or(0);

    Ok(DbStats {
        row_count: count,
        last_updated: "Unknown".to_string(),
    })
}

fn parse_dat_and_insert(conn: &mut Connection, content: &[u8]) -> Result<usize, String> {
    let content_str = String::from_utf8_lossy(content);
    let trimmed = content_str.trim_start();

    if trimmed.starts_with('<') || trimmed.contains("<datafile") {
        return parse_xml_dat_and_insert(conn, content);
    }

    if trimmed.starts_with("clrmamepro") || trimmed.contains("rom (") {
        return parse_clrmamepro_dat_and_insert(conn, &content_str);
    }

    parse_xml_dat_and_insert(conn, content)
}

fn parse_xml_dat_and_insert(conn: &mut Connection, xml_content: &[u8]) -> Result<usize, String> {
    let mut reader = Reader::from_reader(xml_content);
    reader.config_mut().trim_text(true);

    let mut buf = Vec::new();
    let mut system_name = String::from("Unknown");
    let mut in_header_name = false;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut inserted_count = 0;

    {
        let mut stmt = tx
            .prepare("INSERT OR IGNORE INTO rom_hashes (sha1, name, system) VALUES (?, ?, ?)")
            .map_err(|e| e.to_string())?;

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) if e.name().as_ref() == b"name" => {
                    if system_name == "Unknown" {
                        in_header_name = true;
                    }
                }
                Ok(Event::Text(e)) if in_header_name => {
                    let decoded = e.into_inner();
                    let s = String::from_utf8_lossy(&decoded);
                    system_name = quick_xml::escape::unescape(&s)
                        .unwrap_or(std::borrow::Cow::Borrowed(""))
                        .into_owned();
                    in_header_name = false;
                }
                Ok(Event::Empty(ref e)) if e.name().as_ref() == b"rom" => {
                    let mut rom_name = String::new();
                    let mut rom_sha1 = String::new();

                    for attr in e.attributes() {
                        if let Ok(attr) = attr {
                            if attr.key.as_ref() == b"name" {
                                rom_name = attr.unescape_value().unwrap_or_default().into_owned();
                            } else if attr.key.as_ref() == b"sha1" {
                                rom_sha1 = attr
                                    .unescape_value()
                                    .unwrap_or_default()
                                    .into_owned()
                                    .to_uppercase();
                            }
                        }
                    }

                    if !rom_sha1.is_empty() && !rom_name.is_empty() {
                        if stmt
                            .execute(params![rom_sha1, rom_name, system_name])
                            .is_ok()
                        {
                            inserted_count += 1;
                        }
                    }
                }
                Ok(Event::Eof) => break,
                Err(e) => return Err(format!("XML error: {:?}", e)),
                _ => (),
            }
            buf.clear();
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(inserted_count)
}

fn parse_clrmamepro_dat_and_insert(conn: &mut Connection, content: &str) -> Result<usize, String> {
    let system_name = parse_clrmamepro_header_name(content);
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut inserted_count = 0;

    {
        let mut stmt = tx
            .prepare("INSERT OR IGNORE INTO rom_hashes (sha1, name, system) VALUES (?, ?, ?)")
            .map_err(|e| e.to_string())?;

        for line in content.lines() {
            let trimmed = line.trim_start();
            if !trimmed.starts_with("rom ") && !trimmed.starts_with("rom(") {
                continue;
            }

            if let Some((rom_name, rom_sha1)) = parse_clrmamepro_rom_line(trimmed) {
                if stmt
                    .execute(params![rom_sha1, rom_name, system_name])
                    .is_ok()
                {
                    inserted_count += 1;
                }
            }
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(inserted_count)
}

fn parse_clrmamepro_header_name(content: &str) -> String {
    let mut in_header = false;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        if trimmed.starts_with("clrmamepro") {
            in_header = true;
            continue;
        }

        if trimmed.starts_with("game") {
            break;
        }

        if in_header && trimmed.starts_with("name") {
            let remainder = trimmed.trim_start_matches("name").trim();
            if let Some(name) = parse_clrmamepro_value(remainder) {
                return name;
            }
        }
    }

    "Unknown".to_string()
}

fn parse_clrmamepro_rom_line(line: &str) -> Option<(String, String)> {
    let open = line.find('(')?;
    let close = line.rfind(')')?;
    if close <= open {
        return None;
    }

    let inner = &line[open + 1..close];
    let mut position = 0;
    let mut rom_name: Option<String> = None;
    let mut rom_sha1: Option<String> = None;

    while let Some(key) = parse_clrmamepro_token(inner, &mut position) {
        let Some(value) = parse_clrmamepro_token(inner, &mut position) else {
            break;
        };

        match key.as_str() {
            "name" => rom_name = Some(value),
            "sha1" => rom_sha1 = Some(value.to_uppercase()),
            _ => {}
        }
    }

    match (rom_name, rom_sha1) {
        (Some(name), Some(sha1)) if !name.is_empty() && !sha1.is_empty() => Some((name, sha1)),
        _ => None,
    }
}

fn parse_clrmamepro_value(input: &str) -> Option<String> {
    let mut position = 0;
    parse_clrmamepro_token(input, &mut position)
}

fn parse_clrmamepro_token(input: &str, position: &mut usize) -> Option<String> {
    let bytes = input.as_bytes();
    let len = bytes.len();

    while *position < len && bytes[*position].is_ascii_whitespace() {
        *position += 1;
    }

    if *position >= len {
        return None;
    }

    if bytes[*position] == b'"' {
        *position += 1;
        let start = *position;
        while *position < len && bytes[*position] != b'"' {
            *position += 1;
        }
        let end = *position;
        if *position < len {
            *position += 1;
        }
        return Some(input[start..end].to_string());
    }

    let start = *position;
    while *position < len && !bytes[*position].is_ascii_whitespace() {
        *position += 1;
    }

    Some(input[start..*position].to_string())
}

#[tauri::command]
pub fn import_dat_file(state: tauri::State<'_, DbState>, path: String) -> Result<usize, String> {
    let content = fs::read(&path).map_err(|e| format!("Failed to read DAT file: {}", e))?;
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    parse_dat_and_insert(&mut conn, &content)
}

#[tauri::command]
pub fn sync_online_databases(state: tauri::State<'_, DbState>) -> Result<usize, String> {
    let urls = [
        "https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/redump/Sony%20-%20PlayStation.dat",
        "https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/redump/Sony%20-%20PlayStation%202.dat",
        "https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/redump/Sony%20-%20PlayStation%20Portable.dat",
        "https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/redump/Nintendo%20-%20GameCube.dat",
        "https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/redump/Nintendo%20-%20Wii.dat",
        "https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/redump/Sega%20-%20Dreamcast.dat",
        "https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/redump/Sega%20-%20Saturn.dat",
        "https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/redump/Sega%20-%20Mega-CD%20-%20Sega%20CD.dat",
    ];

    let client = Client::new();
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut total_inserted = 0;
    let mut failures: Vec<String> = Vec::new();

    for url in urls {
        let response = match client.get(url).send() {
            Ok(response) => response,
            Err(error) => {
                failures.push(format!("{} ({})", url, error));
                continue;
            }
        };

        if !response.status().is_success() {
            failures.push(format!("{} (HTTP {})", url, response.status()));
            continue;
        }

        let bytes = match response.bytes() {
            Ok(bytes) => bytes,
            Err(error) => {
                failures.push(format!("{} ({})", url, error));
                continue;
            }
        };

        match parse_dat_and_insert(&mut conn, &bytes) {
            Ok(inserted) => total_inserted += inserted,
            Err(error) => failures.push(format!("{} ({})", url, error)),
        }
    }

    if total_inserted == 0 {
        if failures.is_empty() {
            return Err("No hashes were inserted from Libretro DATs.".to_string());
        }
        return Err(format!("Failed to sync databases. {}", failures.join("; ")));
    }

    Ok(total_inserted)
}
