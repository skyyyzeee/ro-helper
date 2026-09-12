use serde_json::Value;
use std::sync::Mutex;
use tauri::{
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

/// Emitted to the frontend when the tray asks to show or hide the overlay (the same toggle as the hotkey).
const TOGGLE_EVENT: &str = "overlay-toggle";

/// The window of the pinned cards, and what it hears: the cards, the overlay shown or hidden.
const PIN_LABEL: &str = "pin";
const PIN_GROUPS_EVENT: &str = "pin-groups";
const PIN_LIVE_EVENT: &str = "pin-live";
/// Told to the overlay when the user moves, joins or closes something on the cards themselves.
const PIN_LAYOUT_EVENT: &str = "pin-layout";
/// A notice to show over the game.
const PIN_TOAST_EVENT: &str = "pin-toast";

/// What is pinned — blocks of cards, each with its place — and whether the overlay is open
/// (the blocks can then be dragged, joined and closed).
#[derive(Default)]
struct Pin {
  groups: Mutex<Vec<Value>>,
  live: Mutex<bool>,
  /// The notice on show, if any: it keeps the window up though nothing is pinned.
  toast: Mutex<Option<Value>>,
}

/// Where one block sits, in physical pixels of the pin window.
#[derive(serde::Deserialize)]
struct PinArea {
  x: i32,
  y: i32,
  width: i32,
  height: i32,
}

/// The pin window is shown, hidden and made click-through with Win32 calls, never through the window
/// library: its show() activates the window, which would take the focus from the game. After the window
/// is built, nothing may change its window flags through the library either, or the library, which
/// believes the window hidden, would hide it again.
#[cfg(windows)]
mod pin_window {
  use windows_sys::Win32::Foundation::HWND;
  use windows_sys::Win32::Graphics::Gdi::{CombineRgn, CreateRectRgn, DeleteObject, SetWindowRgn, RGN_OR};
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

  /// The window covers the whole desktop, but only where the cards are is it there at all: everything
  /// else is cut away, so nothing of it is drawn over the game and the mouse reaches the overlay below.
  pub fn set_areas(hwnd: HWND, areas: &[(i32, i32, i32, i32)]) {
    unsafe {
      let region = CreateRectRgn(0, 0, 0, 0);
      for (x, y, width, height) in areas {
        let part = CreateRectRgn(*x, *y, x + width, y + height);
        CombineRgn(region, region, part, RGN_OR);
        DeleteObject(part as _);
      }
      // The window owns the region from here on and frees it itself.
      SetWindowRgn(hwnd, region, 1);
    }
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

/// Puts the blocks of cards on the pin window, without taking the focus from the game; nothing
/// pinned hides the window.
#[tauri::command]
fn pin_set(app: AppHandle, state: tauri::State<Pin>, groups: Vec<Value>) -> Result<(), String> {
  let window = pin_window(&app)?;
  *state.groups.lock().unwrap() = groups.clone();
  app.emit_to(PIN_LABEL, PIN_GROUPS_EVENT, &groups).map_err(|e| e.to_string())?;
  let empty = groups.is_empty();
  #[cfg(windows)]
  if let Some(hwnd) = pin_window::hwnd(&window) {
    if empty {
      // A notice still on show keeps the window up; it hides once the notice has gone.
      if state.toast.lock().unwrap().is_none() {
        pin_window::hide(hwnd);
      }
    } else {
      // Set again on every show: the window library may still rewrite the styles while the window is being built.
      pin_window::set_click_through(hwnd, !*state.live.lock().unwrap());
      pin_window::show(hwnd);
    }
  }
  #[cfg(not(windows))]
  if empty {
    if state.toast.lock().unwrap().is_none() {
      window.hide().map_err(|e| e.to_string())?;
    }
  } else {
    window.show().map_err(|e| e.to_string())?;
  }
  Ok(())
}

/// What the user did on the cards themselves — moved, joined or closed one — told to the overlay,
/// which keeps what is pinned and saves it.
#[tauri::command]
fn pin_layout(app: AppHandle, state: tauri::State<Pin>, groups: Vec<Value>) -> Result<(), String> {
  *state.groups.lock().unwrap() = groups.clone();
  app.emit_to("main", PIN_LAYOUT_EVENT, &groups).map_err(|e| e.to_string())
}

/// Where the cards are now: the rest of the window is cut away so it takes neither the mouse nor the screen.
#[tauri::command]
#[allow(unused_variables)]
fn pin_areas(app: AppHandle, areas: Vec<PinArea>) -> Result<(), String> {
  let window = pin_window(&app)?;
  #[cfg(windows)]
  if let Some(hwnd) = pin_window::hwnd(&window) {
    let rects: Vec<(i32, i32, i32, i32)> = areas.iter().map(|a| (a.x, a.y, a.width, a.height)).collect();
    pin_window::set_areas(hwnd, &rects);
  }
  Ok(())
}

/// What the pin window shows when it loads: what is pinned, and whether the overlay is open.
#[tauri::command]
fn pin_state(state: tauri::State<Pin>) -> Value {
  serde_json::json!({ "groups": *state.groups.lock().unwrap(), "live": *state.live.lock().unwrap(), "toast": *state.toast.lock().unwrap() })
}

/// The overlay was shown or hidden. While it is shown the cards take the mouse, so they can be dragged,
/// joined and closed, and come back on top of the overlay; while it is hidden, clicks go through to the game.
#[tauri::command]
fn pin_live(app: AppHandle, state: tauri::State<Pin>, live: bool) -> Result<(), String> {
  let window = pin_window(&app)?;
  *state.live.lock().unwrap() = live;
  #[cfg(windows)]
  if let Some(hwnd) = pin_window::hwnd(&window) {
    pin_window::set_click_through(hwnd, !live);
    if live && !state.groups.lock().unwrap().is_empty() {
      unsafe { pin_window::raise(hwnd) };
    }
  }
  #[cfg(not(windows))]
  window.set_ignore_cursor_events(!live).map_err(|e| e.to_string())?;
  app.emit_to(PIN_LABEL, PIN_LIVE_EVENT, live).map_err(|e| e.to_string())
}

/// A notice over the game — a new version has come out — at the top right of the main screen, shown even
/// with nothing pinned. The window takes the corner of the screen's work area along, measured from itself.
#[tauri::command]
fn pin_toast(app: AppHandle, state: tauri::State<Pin>, toast: Value) -> Result<(), String> {
  let window = pin_window(&app)?;
  let mut shown = toast;
  if let (Ok(Some(monitor)), Ok(origin)) = (app.primary_monitor(), window.outer_position()) {
    let area = monitor.work_area();
    shown["corner"] = serde_json::json!({
      "right": area.position.x + area.size.width as i32 - origin.x,
      "top": area.position.y - origin.y,
    });
  }
  *state.toast.lock().unwrap() = Some(shown.clone());
  app.emit_to(PIN_LABEL, PIN_TOAST_EVENT, &shown).map_err(|e| e.to_string())?;
  #[cfg(windows)]
  if let Some(hwnd) = pin_window::hwnd(&window) {
    pin_window::set_click_through(hwnd, !*state.live.lock().unwrap());
    pin_window::show(hwnd);
  }
  #[cfg(not(windows))]
  window.show().map_err(|e| e.to_string())?;
  Ok(())
}

/// The notice has gone by itself: with nothing pinned, the window hides again.
#[tauri::command]
fn pin_toast_done(app: AppHandle, state: tauri::State<Pin>) -> Result<(), String> {
  let window = pin_window(&app)?;
  *state.toast.lock().unwrap() = None;
  if state.groups.lock().unwrap().is_empty() {
    #[cfg(windows)]
    if let Some(hwnd) = pin_window::hwnd(&window) {
      pin_window::hide(hwnd);
    }
    #[cfg(not(windows))]
    window.hide().map_err(|e| e.to_string())?;
  }
  Ok(())
}

/// The hidden pin window: the whole desktop, so a card can be put anywhere on it. Only where the cards
/// are does the window exist at all (`pin_areas`); the rest of it is cut away.
fn create_pin_window(app: &AppHandle) -> tauri::Result<()> {
  let window = WebviewWindowBuilder::new(app, PIN_LABEL, WebviewUrl::App("index.html".into()))
    .title("РО Хелпер — закреплено")
    .inner_size(800.0, 600.0)
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

  let monitors = app.available_monitors().unwrap_or_default();
  if !monitors.is_empty() {
    let left = monitors.iter().map(|m| m.position().x).min().unwrap_or(0);
    let top = monitors.iter().map(|m| m.position().y).min().unwrap_or(0);
    let right = monitors.iter().map(|m| m.position().x + m.size().width as i32).max().unwrap_or(0);
    let bottom = monitors.iter().map(|m| m.position().y + m.size().height as i32).max().unwrap_or(0);
    window.set_position(PhysicalPosition::new(left, top))?;
    window.set_size(PhysicalSize::new((right - left).max(1) as u32, (bottom - top).max(1) as u32))?;
  }

  // Until the cards say where they are, the window is nowhere: a window the size of the desktop would
  // otherwise take the clicks meant for the overlay.
  #[cfg(windows)]
  if let Some(hwnd) = pin_window::hwnd(&window) {
    pin_window::set_areas(hwnd, &[]);
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
      pin_set,
      pin_layout,
      pin_areas,
      pin_state,
      pin_live,
      pin_toast,
      pin_toast_done
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
