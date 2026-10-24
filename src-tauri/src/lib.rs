mod quick;
mod sign_in;

use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
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
pub(crate) fn no_system_frame(window: &WebviewWindow) {
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

/// The pin window if it has been made: what would only change one is nothing to do before it is.
fn made_pin_window(app: &AppHandle) -> Option<WebviewWindow> {
  app.get_webview_window(PIN_LABEL)
}

/// Set while the pin window is being made, so a second card pinned before it is up makes no second one.
static PIN_MAKING: AtomicBool = AtomicBool::new(false);

/// Makes the pin window, the first time something is to go on it — a card, a notice: until then the app runs one
/// window less, with nothing of its own over the game (players told of FPS drops, poll of October 2026). Made on a
/// thread of its own: built inside a synchronous command, where `pin_set` runs, the window never comes up on
/// Windows and the pin is lost (WebView2; see Tauri's `WebviewWindowBuilder::new`). Once made, it shows what is
/// pinned or on show by then.
fn make_pin_window(app: &AppHandle) {
  if PIN_MAKING.swap(true, Ordering::SeqCst) {
    return;
  }
  let app = app.clone();
  std::thread::spawn(move || {
    let made = create_pin_window(&app);
    PIN_MAKING.store(false, Ordering::SeqCst);
    match made {
      Ok(()) => {
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || pin_window_made(&handle));
      }
      Err(error) => eprintln!("the pin window was not made: {error}"),
    }
  });
}

/// The pin window has just been made: framed like the others, then brought to what is pinned or on show now.
/// The page reads the same with `pin_state` as it loads; it is told too, in case it has loaded already.
fn pin_window_made(app: &AppHandle) {
  let Some(window) = made_pin_window(app) else { return };
  #[cfg(windows)]
  no_system_frame(&window);
  let state = app.state::<Pin>();
  let groups = state.groups.lock().unwrap().clone();
  let toast = state.toast.lock().unwrap().clone();
  let _ = app.emit_to(PIN_LABEL, PIN_GROUPS_EVENT, &groups);
  if let Some(toast) = &toast {
    let shown = with_corner(app, &window, toast.clone());
    *state.toast.lock().unwrap() = Some(shown.clone());
    let _ = app.emit_to(PIN_LABEL, PIN_TOAST_EVENT, &shown);
  }
  if !groups.is_empty() || toast.is_some() {
    let _ = show_pin_window(&window);
  }
}

/// Shows the pin window over the game without taking the focus, the cards taking the mouse.
fn show_pin_window(window: &WebviewWindow) -> Result<(), String> {
  #[cfg(windows)]
  if let Some(hwnd) = pin_window::hwnd(window) {
    // Set again on every show: the window library may still rewrite the styles while the window is being built.
    pin_window::set_click_through(hwnd, false);
    pin_window::show(hwnd);
  }
  #[cfg(not(windows))]
  window.show().map_err(|e| e.to_string())?;
  Ok(())
}

/// Puts the blocks of cards on the pin window, without taking the focus from the game; nothing
/// pinned hides the window.
#[tauri::command]
fn pin_set(app: AppHandle, state: tauri::State<Pin>, groups: Vec<Value>) -> Result<(), String> {
  *state.groups.lock().unwrap() = groups.clone();
  // No window yet: made for the first card, and not for nothing.
  let Some(window) = made_pin_window(&app) else {
    if !groups.is_empty() {
      make_pin_window(&app);
    }
    return Ok(());
  };
  app.emit_to(PIN_LABEL, PIN_GROUPS_EVENT, &groups).map_err(|e| e.to_string())?;
  if !groups.is_empty() {
    return show_pin_window(&window);
  }
  // A notice still on show keeps the window up; it hides once the notice has gone.
  if state.toast.lock().unwrap().is_none() {
    #[cfg(windows)]
    if let Some(hwnd) = pin_window::hwnd(&window) {
      pin_window::hide(hwnd);
    }
    #[cfg(not(windows))]
    window.hide().map_err(|e| e.to_string())?;
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
  let Some(window) = made_pin_window(&app) else { return Ok(()) };
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

/// The overlay was shown or hidden. The cards take the mouse either way — the window is only where they are, so
/// they can be moved and closed over the game with the cursor it gives on «ё» (issue #22) — and, the overlay
/// shown, come back on top of it and can be resized and paged too.
#[tauri::command]
fn pin_live(app: AppHandle, state: tauri::State<Pin>, live: bool) -> Result<(), String> {
  *state.live.lock().unwrap() = live;
  // The window made later reads it from `pin_state` as it loads.
  let Some(window) = made_pin_window(&app) else { return Ok(()) };
  #[cfg(windows)]
  if let Some(hwnd) = pin_window::hwnd(&window) {
    pin_window::set_click_through(hwnd, false);
    if live && !state.groups.lock().unwrap().is_empty() {
      unsafe { pin_window::raise(hwnd) };
    }
  }
  #[cfg(not(windows))]
  window.set_ignore_cursor_events(false).map_err(|e| e.to_string())?;
  app.emit_to(PIN_LABEL, PIN_LIVE_EVENT, live).map_err(|e| e.to_string())
}

/// A notice over the game — a new version has come out — at the top right of the main screen, shown even
/// with nothing pinned. The window takes the corner of the screen's work area along, measured from itself.
#[tauri::command]
fn pin_toast(app: AppHandle, state: tauri::State<Pin>, toast: Value) -> Result<(), String> {
  // No window yet: it is made, and shows the notice once it is.
  let Some(window) = made_pin_window(&app) else {
    *state.toast.lock().unwrap() = Some(toast);
    make_pin_window(&app);
    return Ok(());
  };
  let shown = with_corner(&app, &window, toast);
  *state.toast.lock().unwrap() = Some(shown.clone());
  app.emit_to(PIN_LABEL, PIN_TOAST_EVENT, &shown).map_err(|e| e.to_string())?;
  show_pin_window(&window)
}

/// The notice with the corner of the main screen's work area, measured from the pin window, to sit in.
fn with_corner(app: &AppHandle, window: &WebviewWindow, mut toast: Value) -> Value {
  if let (Ok(Some(monitor)), Ok(origin)) = (app.primary_monitor(), window.outer_position()) {
    let area = monitor.work_area();
    toast["corner"] = serde_json::json!({
      "right": area.position.x + area.size.width as i32 - origin.x,
      "top": area.position.y - origin.y,
    });
  }
  toast
}

/// The notice has gone by itself: with nothing pinned, the window hides again.
#[tauri::command]
fn pin_toast_done(app: AppHandle, state: tauri::State<Pin>) -> Result<(), String> {
  *state.toast.lock().unwrap() = None;
  let Some(window) = made_pin_window(&app) else { return Ok(()) };
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
    .title("Кремлёвский Ассистент — закреплено")
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
  // Made after streamer mode was turned on: out of the capture from the start, like the overlay.
  if CAPTURE_HIDDEN.load(Ordering::Relaxed) {
    let _ = capture_hidden(&window, true);
  }
  Ok(())
}

/// Streamer mode, as last set: the pin window is made later, when a first card is pinned, and hides itself too.
pub(crate) static CAPTURE_HIDDEN: AtomicBool = AtomicBool::new(false);

/// One window in or out of screen capture. Win32 directly, not the window library: the pin window's flags
/// must not be touched through it (see `pin_window`).
#[allow(unused_variables)]
pub(crate) fn capture_hidden(window: &WebviewWindow, hidden: bool) -> Result<(), String> {
  #[cfg(windows)]
  {
    use windows_sys::Win32::UI::WindowsAndMessaging::{SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE, WDA_NONE};
    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as windows_sys::Win32::Foundation::HWND;
    if unsafe { SetWindowDisplayAffinity(hwnd, if hidden { WDA_EXCLUDEFROMCAPTURE } else { WDA_NONE }) } == 0 {
      return Err("Windows не дал скрыть окно от записи экрана".into());
    }
  }
  Ok(())
}

/// Streamer mode: every window of the app — the overlay and the pinned cards — stays on the screen but is
/// left out of screen capture, so OBS, Discord and screenshots show the game without it.
#[tauri::command]
fn set_capture_hidden(app: AppHandle, hidden: bool) -> Result<(), String> {
  CAPTURE_HIDDEN.store(hidden, Ordering::Relaxed);
  for window in app.webview_windows().values() {
    capture_hidden(window, hidden)?;
  }
  Ok(())
}

/// The laws of a server downloaded from GitHub, kept in the app's data folder beside the settings.
fn laws_file(app: &AppHandle, server: &str) -> Result<std::path::PathBuf, String> {
  // Only a server id: a name that could reach outside the folder is refused.
  if server.is_empty() || !server.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
    return Err(format!("bad server id: {server}"));
  }
  let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("laws");
  Ok(dir.join(format!("{server}.json")))
}

/// The laws of a server downloaded before, or nothing when there are none.
#[tauri::command]
fn laws_read(app: AppHandle, server: String) -> Result<Option<String>, String> {
  let file = laws_file(&app, &server)?;
  match std::fs::read_to_string(&file) {
    Ok(text) => Ok(Some(text)),
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
    Err(e) => Err(e.to_string()),
  }
}

/// Keeps the laws of a server just downloaded; written aside first, so a half-written file is never read.
#[tauri::command]
fn laws_write(app: AppHandle, server: String, text: String) -> Result<(), String> {
  let file = laws_file(&app, &server)?;
  if let Some(dir) = file.parent() {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
  }
  let partial = file.with_extension("json.part");
  std::fs::write(&partial, text).map_err(|e| e.to_string())?;
  std::fs::rename(&partial, &file).map_err(|e| e.to_string())
}

/// The window that had focus before the overlay was shown — normally the game — as a raw HWND.
#[derive(Default)]
pub(crate) struct PreviousForeground(Mutex<Option<isize>>);

/// Remembers the foreground window so focus can go back to it when the overlay hides. Never one of the app's
/// own windows: with the quick search up, it is the bar that has the focus, and the game is what was
/// remembered when the bar was shown (issue #21).
#[tauri::command]
#[allow(unused_variables)]
fn remember_foreground(app: AppHandle, state: tauri::State<PreviousForeground>) {
  #[cfg(windows)]
  {
    use windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
    let current = unsafe { GetForegroundWindow() } as isize;
    let own = app.webview_windows().values().any(|window| window.hwnd().map(|hwnd| hwnd.0 as isize).ok() == Some(current));
    if current != 0 && !own {
      *state.0.lock().unwrap() = Some(current);
    }
  }
}

/// Gives focus back to the window that had it before the overlay was shown.
#[tauri::command]
fn restore_foreground(state: tauri::State<PreviousForeground>) {
  give_focus_back(&state);
}

/// The overlay and the quick search, hidden, hand the focus back to the game this way.
#[allow(unused_variables)]
pub(crate) fn give_focus_back(state: &PreviousForeground) {
  #[cfg(windows)]
  if let Some(hwnd) = *state.0.lock().unwrap() {
    use windows_sys::Win32::UI::WindowsAndMessaging::SetForegroundWindow;
    unsafe { SetForegroundWindow(hwnd as _) };
  }
}

/// Windows started the app at logon (the autostart entry passes this flag): it waits in the tray for the hotkey.
const AUTOSTART_FLAG: &str = "--autostart";

#[tauri::command]
fn launched_at_startup() -> bool {
  std::env::args().any(|arg| arg == AUTOSTART_FLAG)
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
    // «Запускать вместе с Windows»: the entry Windows starts at logon carries AUTOSTART_FLAG.
    .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec![AUTOSTART_FLAG])))
    .manage(PreviousForeground::default())
    .manage(Pin::default())
    .invoke_handler(tauri::generate_handler![
      remember_foreground,
      laws_read,
      laws_write,
      restore_foreground,
      pin_set,
      pin_layout,
      pin_areas,
      pin_state,
      pin_live,
      pin_toast,
      pin_toast_done,
      launched_at_startup,
      set_capture_hidden,
      sign_in::sign_in_listen,
      sign_in::sign_in_cancel,
      quick::quick_show,
      quick::quick_hide,
      quick::quick_fit
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // The pin window and the quick search's are made when first used (`pin_window`, `quick::quick_window`).
      #[cfg(windows)]
      if let Some(window) = app.get_webview_window("main") {
        no_system_frame(&window);
      }

      // The overlay has no frame and no taskbar button, so the tray is how to reach it and quit.
      let toggle = MenuItem::with_id(app, "toggle", "Показать / скрыть", true, None::<&str>)?;
      let quit = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;
      let menu = Menu::with_items(app, &[&toggle, &quit])?;
      TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().cloned().expect("app icon"))
        .tooltip("Кремлёвский Ассистент")
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
