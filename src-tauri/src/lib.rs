use tauri::Emitter;
use std::thread;
use std::time::Duration;
use mouse_position::mouse_position::Mouse;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;

#[derive(Clone, serde::Serialize)]
struct CursorPos {
    x: i32,
    y: i32
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run () {
    tauri::Builder::default()
     .plugin(tauri_plugin_opener::init())
     .setup(|app| {
        let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
        let menu = Menu::with_items(app, &[&quit])?;

        TrayIconBuilder::new()
            .icon(app.default_window_icon().unwrap().clone())
            .tooltip("Desktop Cat")
            .menu(&menu)
            .on_menu_event(|app, event| match event.id.as_ref() {
                "quit" => app.exit(0),
                _ => {}
            })
            .build(app)?;
        let handle = app.handle().clone();
        thread::spawn(move || {
            let mut was_pressed = false;
            loop {
                let is_pressed = unsafe {
                    (winapi::um::winuser::GetAsyncKeyState(0x01) as u16) & 0x8000 != 0
                };
                if was_pressed && !is_pressed {
                    let _ = handle.emit("mouse-released", ());
                }
                was_pressed = is_pressed;
                
                match Mouse::get_mouse_position() {
                    Mouse::Position { x,y } => {
                        let _ = handle.emit("cursor-moved", CursorPos { x, y });
                    }
                    Mouse::Error => {}
                }
                thread::sleep(Duration::from_millis(16));
            }
        });
        Ok(())
     })
     .run(tauri::generate_context!())
     .expect("error while running tauri application");
}