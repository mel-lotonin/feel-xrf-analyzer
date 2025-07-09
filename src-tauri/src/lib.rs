// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn load_map(path: &str) -> Result<Vec<Vec<f32>>, String> {
    let mut csv = csv::ReaderBuilder::new()
        .delimiter(b';')
        .has_headers(false)
        .from_path(path)
        .map_err(|e| e.to_string())?;
    let mut map = Vec::new();

    for row in csv.records() {
        let row = row.map_err(|e| e.to_string())?;
        let parsed_row = row.iter().map(|s| s.parse::<f32>().unwrap_or(0.0)).collect();
        map.push(parsed_row);
    }

    Ok(map)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![load_map])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
