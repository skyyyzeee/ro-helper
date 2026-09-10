# 01: Инструменты для Tauri

**What to build:** Установить на компьютер разработчика инструменты, без которых Tauri не собирается. Сейчас их нет: `cargo` и `rustc` не найдены, C++ Build Tools не установлены. Node и WebView2 уже стоят. Установщики скачивает и запускает сам пользователь.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Установлен Rust через rustup (официальный сайт rustup.rs), канал stable
- [x] Установлены Microsoft C++ Build Tools (visualstudio.microsoft.com/visual-cpp-build-tools), рабочая нагрузка «Разработка классических приложений на C++», включая MSVC и Windows SDK
- [x] В новом терминале работают `cargo --version` и `rustc --version`
- [x] Приложение Claude перезапущено, чтобы новые инструменты (и git) появились в PATH

## Comments

2026-09-10 — проверено: rustup 1.29.1, cargo 1.98.1, rustc 1.98.1, toolchain `stable-x86_64-pc-windows-msvc` (default); Visual Studio Build Tools 2026 с MSVC x64 и Windows SDK; git 2.55 в PATH.
