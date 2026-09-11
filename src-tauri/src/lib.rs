use serde_json::Value;
use std::sync::Mutex;
use tauri::{
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_store::StoreExt;

/// Emitted to the frontend when the tray asks to show or hide the overlay (the same toggle as the hotkey).
const TOGGLE_EVENT: &str = "overlay-toggle";

/// The pinned card's window, and what it hears: a new card, the overlay shown or hidden.
const PIN_LABEL: &str = "pin";
const PIN_CARD_EVENT: &str = "pin-card";
const PIN_LIVE_EVENT: &str = "pin-live";
/// Told to the overlay when the card is closed from the card itself.
const PIN_CLOSED_EVENT: &str = "pin-closed";
const SETTINGS_FILE: &str = "settings.json";
const PIN_POSITION_KEY: &str = "pin.position";

/// The card on the pin window, and whether the overlay is open (the card can then be dragged and closed).
#[derive(Default)]
struct Pin {
  card: Mutex<Option<Value>>,
  live: Mutex<bool>,
}

/// The pin window is shown, hidden and made click-through with Win32 calls, never through the window
/// library: its show() activates the window, which would take the focus from the game. After the window
/// is built, nothing may change its window flags through the library either, or the library, which
/// believes the window hidden, would hide it again.
#[cfg(windows)]
mod pin_window {
  use windows_sys::Win32::Foundation::HWND;
  use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, ShowWindow, GWL_EXSTYLE, HWND_TOPMOST, SWP_FRAMECHANGED,
    SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SW_HIDE, SW_SHOWNOACTIVATE, WS_EX_LAYERED,
    WS_EX_TRANSPARENT,
  };

  pub fn hwnd(window: &tauri::WebviewWindow) -> Option<HWND> {
    window.hwnd().ok().map(|hwnd| hwnd.0 as HWND)
  }

  /// Shows the window above everything without activating it.
  pub fn show(hwnd: HWND) {
    unsafe {
      ShowWindow(hwnd, SW_SHOWNOACTIVATE);
      raise(hwnd);
    }
  }

  pub fn hide(hwnd: HWND) {
    unsafe { ShowWindow(hwnd, SW_HIDE) };
  }

  /// Back on top of the always-on-top windows (the overlay may have come up over it), still without focus.
  pub unsafe fn raise(hwnd: HWND) {
    SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
  }

  /// Lets the mouse pass through to the game, the same styles the window library uses for it.
  pub fn set_click_through(hwnd: HWND, on: bool) {
    let bits = (WS_EX_TRANSPARENT | WS_EX_LAYERED) as isize;
    unsafe {
      let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
      SetWindowLongPtrW(hwnd, GWL_EXSTYLE, if on { style | bits } else { style & !bits });
      SetWindowPos(hwnd, std::ptr::null_mut(), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
    }
  }
}

/// Windows 11 draws its own thin border and rounded corners around every window, frameless ones too:
/// around the transparent overlay they show as a rectangle outside the panel's rounded corners.
/// The panels draw their own edges, so the system's are turned off (Windows 10 has neither: no effect).
#[cfg(windows)]
fn no_system_frame(window: &WebviewWindow) {
  use windows_sys::Win32::Graphics::Dwm::DwmSetWindowAttribute;
  const DWMWA_WINDOW_CORNER_PREFERENCE: u32 = 33;
  const DWMWA_BORDER_COLOR: u32 = 34;
  const DWMWCP_DONOTROUND: u32 = 1;
  const DWMWA_COLOR_NONE: u32 = 0xFFFF_FFFE;
  let Ok(hwnd) = window.hwnd() else { return };
  let hwnd = hwnd.0 as windows_sys::Win32::Foundation::HWND;
  for (attribute, value) in [(DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND), (DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE)] {
    unsafe { DwmSetWindowAttribute(hwnd, attribute, &value as *const u32 as *const _, 4) };
  }
}

fn pin_window(app: &AppHandle) -> Result<WebviewWindow, String> {
  app.get_webview_window(PIN_LABEL).ok_or_else(|| "no pin window".into())
}

/// Shows a card on the pin window, replacing the one before, without taking the focus from the game.
#[tauri::command]
fn pin_show(app: AppHandle, state: tauri::State<Pin>, card: Value) -> Result<(), String> {
  let window = pin_window(&app)?;
  *state.card.lock().unwrap() = Some(card.clone());
  app.emit_to(PIN_LABEL, PIN_CARD_EVENT, card).map_err(|e| e.to_string())?;
  #[cfg(windows)]
  if let Some(hwnd) = pin_window::hwnd(&window) {
    // Set again on every show: the window library may still rewrite the styles while the window is being built.
    pin_window::set_click_through(hwnd, !*state.live.lock().unwrap());
    pin_window::show(hwnd);
  }
  #[cfg(not(windows))]
  window.show().map_err(|e| e.to_string())?;
  Ok(())
}

/// Hides the card: asked by the overlay, or by the card's own cross, which the overlay is then told of.
#[tauri::command]
fn pin_hide(app: AppHandle, state: tauri::State<Pin>, from_card: Option<bool>) -> Result<(), String> {
  let window = pin_window(&app)?;
  *state.card.lock().unwrap() = None;
  #[cfg(windows)]
  if let Some(hwnd) = pin_window::hwnd(&window) {
    pin_window::hide(hwnd);
  }
  #[cfg(not(windows))]
  window.hide().map_err(|e| e.to_string())?;
  if from_card.unwrap_or(false) {
    app.emit_to("main", PIN_CLOSED_EVENT, ()).map_err(|e| e.to_string())?;
  }
  Ok(())
}

/// What the pin window shows when it loads: the card, if any, and whether the overlay is open.
#[tauri::command]
fn pin_state(state: tauri::State<Pin>) -> Value {
  serde_json::json!({ "card": *state.card.lock().unwrap(), "live": *state.live.lock().unwrap() })
}

/// The overlay was shown or hidden. While it is shown the card takes the mouse, so it can be dragged and
/// closed, and comes back on top of the overlay; while it is hidden, clicks go through to the game.
#[tauri::command]
fn pin_live(app: AppHandle, state: tauri::State<Pin>, live: bool) -> Result<(), String> {
  let window = pin_window(&app)?;
  *state.live.lock().unwrap() = live;
  #[cfg(windows)]
  if let Some(hwnd) = pin_window::hwnd(&window) {
    pin_window::set_click_through(hwnd, !live);
    if live && state.card.lock().unwrap().is_some() {
      unsafe { pin_window::raise(hwnd) };
    }
  }
  #[cfg(not(windows))]
  window.set_ignore_cursor_events(!live).map_err(|e| e.to_string())?;
  app.emit_to(PIN_LABEL, PIN_LIVE_EVENT, live).map_err(|e| e.to_string())
}

/// The hidden pin window, where it was last left (or at the left of the primary screen), remembering
/// where it is dragged to.
fn create_pin_window(app: &AppHandle) -> tauri::Result<()> {
  let window = WebviewWindowBuilder::new(app, PIN_LABEL, WebviewUrl::App("index.html".into()))
    .title("РО Хелпер — закреплено")
    .inner_size(380.0, 160.0)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .focused(false)
    .focusable(false)
    .visible(false)
    .build()?;

  let store = app.store(SETTINGS_FILE).ok();
  let saved = store
    .as_ref()
    .and_then(|s| s.get(PIN_POSITION_KEY))
    .and_then(|v| Some(PhysicalPosition::new(v.get("x")?.as_i64()? as i32, v.get("y")?.as_i64()? as i32)));
  let on_screen = |p: &PhysicalPosition<i32>| {
    app.available_monitors().unwrap_or_default().iter().any(|m| {
      let (pos, size) = (m.position(), m.size());
      p.x >= pos.x && p.x < pos.x + size.width as i32 && p.y >= pos.y && p.y < pos.y + size.height as i32
    })
  };
  let position = match saved.filter(on_screen) {
    Some(p) => Some(p),
    None => app.primary_monitor().ok().flatten().map(|m| {
      let area = m.work_area();
      let scale = m.scale_factor();
      PhysicalPosition::new(area.position.x + (40.0 * scale) as i32, area.position.y + area.size.height as i32 / 3)
    }),
  };
  if let Some(position) = position {
    window.set_position(position)?;
  }

  if let Some(store) = store {
    window.on_window_event(move |event| {
      if let WindowEvent::Moved(p) = event {
        store.set(PIN_POSITION_KEY, serde_json::json!({ "x": p.x, "y": p.y }));
      }
    });
  }
  Ok(())
}

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
    // New versions come from the GitHub releases, signed with the project's key (endpoint and key in tauri.conf.json).
    .plugin(tauri_plugin_updater::Builder::new().build())
    .manage(PreviousForeground::default())
    .manage(Pin::default())
    .invoke_handler(tauri::generate_handler![
      remember_foreground,
      restore_foreground,
      pin_show,
      pin_hide,
      pin_state,
      pin_live
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      create_pin_window(app.handle())?;
      #[cfg(windows)]
      for label in ["main", PIN_LABEL] {
        if let Some(window) = app.get_webview_window(label) {
          no_system_frame(&window);
        }
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
