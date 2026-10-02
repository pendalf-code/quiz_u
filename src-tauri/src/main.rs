// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use tauri::Manager;

#[derive(Serialize)]
struct SystemInfo {
    is_steam_deck: bool,
    version: &'static str,
    platform: &'static str,
}

#[tauri::command]
fn toggle_fullscreen(window: tauri::Window) -> Result<bool, String> {
    let is_fullscreen = window.is_fullscreen().map_err(|e| e.to_string())?;
    window.set_fullscreen(!is_fullscreen).map_err(|e| e.to_string())?;
    Ok(!is_fullscreen)
}

#[tauri::command]
fn set_fullscreen(window: tauri::Window, fullscreen: bool) -> Result<(), String> {
    window.set_fullscreen(fullscreen).map_err(|e| e.to_string())
}

#[tauri::command]
fn is_steam_deck() -> bool {
    // Check Steam Deck environment variable or DMI product name
    if std::env::var("SteamAppId").is_ok() && std::env::var("SteamGamepadUI").is_ok() {
        return true;
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(product) = std::fs::read_to_string("/sys/devices/virtual/dmi/id/product_name") {
            if product.to_lowercase().contains("jupiter") || product.to_lowercase().contains("galileo") {
                return true;
            }
        }
    }
    false
}

#[tauri::command]
fn get_system_info() -> SystemInfo {
    SystemInfo {
        is_steam_deck: is_steam_deck(),
        version: env!("CARGO_PKG_VERSION"),
        platform: std::env::consts::OS,
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            toggle_fullscreen,
            set_fullscreen,
            is_steam_deck,
            get_system_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running Quiz U desktop application");
}
