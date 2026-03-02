use reqwest::blocking::Client;
use std::io::Cursor;
use zip::ZipArchive;

fn main() {
    let url = "https://github.com/LizardByte/RetroArcher.dats/archive/refs/heads/master.zip";
    let response = Client::new().get(url).send().unwrap();
    println!("Status: {}", response.status());
    let bytes = response.bytes().unwrap();
    println!("Bytes length: {}", bytes.len());
    let reader = Cursor::new(bytes);
    let mut archive = ZipArchive::new(reader).unwrap();
    println!("Archive files: {}", archive.len());
    
    let mut dat_count = 0;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).unwrap();
        if file.name().ends_with(".dat") {
            dat_count += 1;
        }
    }
    println!("DAT files: {}", dat_count);
}
