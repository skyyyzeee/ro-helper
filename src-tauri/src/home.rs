//! The main window (preview of the redesign): an ordinary window with a taskbar button, for what is read away from
//! the game — today's changes, the laws, the cases, the wiki, the settings. On Windows 11 its background is the
//! system's Mica; elsewhere the page paints its own.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::window::{Effect, EffectsBuilder};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const HOME_LABEL: &str = "home";

/// Whether the system draws the window's background (Mica), so the page leaves it see-through.
#[derive(Default)]
pub struct HomeMica(pub AtomicBool);

pub fn create_home_window(app: &AppHandle) -> tauri::Result<()> {
  let window = WebviewWindowBuilder::new(app, HOME_LABEL, WebviewUrl::App("index.html".into()))
    .title("Кремлёвский Ассистент")
    .inner_size(1100.0, 720.0)
    .min_inner_size(860.0, 560.0)
    .decorations(false)
    .transparent(true)
    .shadow(true)
    .resizable(true)
    .visible(false)
    .center()
    .build()?;
  let mica = windows_11() && window.set_effects(EffectsBuilder::new().effect(Effect::Mica).build()).is_ok();
  app.state::<HomeMica>().0.store(mica, Ordering::Relaxed);
  Ok(())
}

#[tauri::command]
pub fn home_show(app: AppHandle) -> Result<(), String> {
  let window = app.get_webview_window(HOME_LABEL).ok_or("no home window")?;
  window.unminimize().map_err(|e| e.to_string())?;
  window.show().map_err(|e| e.to_string())?;
  window.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn home_mica(state: tauri::State<HomeMica>) -> bool {
  state.0.load(Ordering::Relaxed)
}

/// Windows 11 (build 22000 and later): Mica exists there only.
#[cfg(windows)]
fn windows_11() -> bool {
  use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ};
  let wide = |s: &str| s.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
  let key = wide(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion");
  let value = wide("CurrentBuildNumber");
  let mut buffer = [0u16; 32];
  let mut size = (buffer.len() * 2) as u32;
  let read = unsafe {
    RegGetValueW(HKEY_LOCAL_MACHINE, key.as_ptr(), value.as_ptr(), RRF_RT_REG_SZ, std::ptr::null_mut(), buffer.as_mut_ptr() as *mut _, &mut size)
  };
  if read != 0 {
    return false;
  }
  let text = String::from_utf16_lossy(&buffer[..(size as usize / 2).saturating_sub(1)]);
  text.trim().parse::<u32>().map(|build| build >= 22000).unwrap_or(false)
}

#[cfg(not(windows))]
fn windows_11() -> bool {
  false
}
