//! The quick search (ticket 27): a bar of its own at the top centre of the screen, opened by its own key over
//! the game. Hidden, it waits made; shown, it takes the focus, and hidden again it hands the focus back to the
//! window that had it — normally the game — as the overlay does.

use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const QUICK_LABEL: &str = "quick";
/// Told to the bar each time it is shown: it empties its field and takes the focus.
const QUICK_SHOWN_EVENT: &str = "quick-shown";
/// The bar's width; its height follows what it shows (`quick_fit`).
const WIDTH: f64 = 680.0;
/// How far down the screen the bar sits: under the top edge, over the game's own HUD.
const TOP: f64 = 0.12;

/// Made hidden, the first time the key asks for it: until then the app runs one window less (players told of FPS
/// drops). The first time it takes a moment to show; after that, at once.
fn create_quick_window(app: &AppHandle) -> tauri::Result<()> {
  WebviewWindowBuilder::new(app, QUICK_LABEL, WebviewUrl::App("index.html".into()))
    .title("Кремлёвский Ассистент — быстрый поиск")
    .inner_size(WIDTH, 120.0)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .focused(false)
    .visible(false)
    .build()?;
  Ok(())
}

/// The bar's window, made now if it was not yet: framed and kept out of screen capture as the others are.
fn quick_window(app: &AppHandle) -> Result<WebviewWindow, String> {
  if let Some(window) = app.get_webview_window(QUICK_LABEL) {
    return Ok(window);
  }
  create_quick_window(app).map_err(|e| e.to_string())?;
  let window = app.get_webview_window(QUICK_LABEL).ok_or("no quick window")?;
  #[cfg(windows)]
  crate::no_system_frame(&window);
  if crate::CAPTURE_HIDDEN.load(std::sync::atomic::Ordering::Relaxed) {
    let _ = crate::capture_hidden(&window, true);
  }
  Ok(window)
}

/// Where the player last dragged the bar to, in physical pixels (issue #20).
#[derive(serde::Deserialize)]
pub struct QuickPosition {
  x: i32,
  y: i32,
}

/// Shows the bar where the player last dragged it — if that is still on a screen — or else at the top centre of
/// the screen the overlay is on, and gives it the focus.
#[tauri::command]
pub fn quick_show(app: AppHandle, position: Option<QuickPosition>) -> Result<(), String> {
  let window = quick_window(&app)?;
  let on_screen = position.filter(|at| {
    app.available_monitors().unwrap_or_default().iter().any(|m| {
      at.x >= m.position().x - 40
        && at.y >= m.position().y - 10
        && at.x < m.position().x + m.size().width as i32 - 80
        && at.y < m.position().y + m.size().height as i32 - 40
    })
  });
  if let Some(at) = on_screen {
    window.set_position(PhysicalPosition::new(at.x, at.y)).map_err(|e| e.to_string())?;
  } else if let Some(monitor) = app
    .get_webview_window("main")
    .and_then(|main| main.current_monitor().ok().flatten())
    .or_else(|| app.primary_monitor().ok().flatten())
  {
    let width = (WIDTH * monitor.scale_factor()) as i32;
    let x = monitor.position().x + (monitor.size().width as i32 - width) / 2;
    let y = monitor.position().y + (monitor.size().height as f64 * TOP) as i32;
    window.set_position(PhysicalPosition::new(x, y)).map_err(|e| e.to_string())?;
  }
  window.show().map_err(|e| e.to_string())?;
  window.set_always_on_top(true).map_err(|e| e.to_string())?;
  window.set_focus().map_err(|e| e.to_string())?;
  app.emit_to(QUICK_LABEL, QUICK_SHOWN_EVENT, ()).map_err(|e| e.to_string())
}

/// Hides the bar; the focus goes back to the game — unless the overlay is taking the bar's place and has the
/// focus already (`keep_focus`, issue #21).
#[tauri::command]
pub fn quick_hide(app: AppHandle, state: tauri::State<crate::PreviousForeground>, keep_focus: Option<bool>) -> Result<(), String> {
  if let Some(window) = app.get_webview_window(QUICK_LABEL) {
    window.hide().map_err(|e| e.to_string())?;
  }
  if keep_focus != Some(true) {
    crate::give_focus_back(&state);
  }
  Ok(())
}

/// The bar's height, in CSS pixels, as tall as what it shows: no invisible window over the game below it.
#[tauri::command]
pub fn quick_fit(app: AppHandle, height: f64) -> Result<(), String> {
  let Some(window) = app.get_webview_window(QUICK_LABEL) else { return Ok(()) };
  window.set_size(LogicalSize::new(WIDTH, height.clamp(60.0, 640.0))).map_err(|e| e.to_string())
}
