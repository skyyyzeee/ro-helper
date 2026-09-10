use std::sync::Mutex;
use tauri::{
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  Emitter,
};

/// Emitted to the frontend when the tray asks to show or hide the overlay (the same toggle as the hotkey).
const TOGGLE_EVENT: &str = "overlay-toggle";

/// The window that had focus before the overlay was shown — normally the game — as a raw HWND.
#[derive(Default)]
struct PreviousForeground(Mutex<Option<isize>>);

/// Remembers the foreground window so focus can go back to it when the overlay hides.
#[tauri::command]
#[allow(unused_variables)]
fn remember_foreground(window: tauri::WebviewWindow, state: tauri::State<PreviousForeground>) {
  #[cfg(windows)]
  {
    use windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
    let current = unsafe { GetForegroundWindow() } as isize;
    let own = window.hwnd().map(|hwnd| hwnd.0 as isize).unwrap_or(0);
    if current != 0 && current != own {
      *state.0.lock().unwrap() = Some(current);
    }
  }
}

/// Gives focus back to the window that had it before the overlay was shown.
#[tauri::command]
#[allow(unused_variables)]
fn restore_foreground(state: tauri::State<PreviousForeground>) {
  #[cfg(windows)]
  if let Some(hwnd) = *state.0.lock().unwrap() {
    use windows_sys::Win32::UI::WindowsAndMessaging::SetForegroundWindow;
    unsafe { SetForegroundWindow(hwnd as _) };
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // A second launch toggles the running overlay instead of starting another one with a clashing hotkey.
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      let _ = app.emit(TOGGLE_EVENT, ());
    }))
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .plugin(tauri_plugin_store::Builder::default().build())
    .plugin(tauri_plugin_clipboard_manager::init())
    .plugin(tauri_plugin_opener::init())
    .manage(PreviousForeground::default())
    .invoke_handler(tauri::generate_handler![remember_foreground, restore_foreground])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // The overlay has no frame and no taskbar button, so the tray is how to reach it and quit.
      let toggle = MenuItem::with_id(app, "toggle", "Показать / скрыть", true, None::<&str>)?;
      let quit = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;
      let menu = Menu::with_items(app, &[&toggle, &quit])?;
      TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().cloned().expect("app icon"))
        .tooltip("РО Хелпер")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
          "toggle" => {
            let _ = app.emit(TOGGLE_EVENT, ());
          }
          "quit" => app.exit(0),
          _ => {}
        })
        .on_tray_icon_event(|tray, event| {
          if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
          } = event
          {
            let _ = tray.app_handle().emit(TOGGLE_EVENT, ());
          }
        })
        .build(app)?;
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
