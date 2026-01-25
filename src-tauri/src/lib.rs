mod commands;
mod providers;
mod db;
mod rag;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            commands::chat::send_message,
            commands::chat::regenerate_last_assistant,
            commands::chat::get_conversations,
            commands::chat::search_conversations,
            commands::chat::get_messages,
            commands::chat::create_conversation,
            commands::chat::delete_conversation,
            commands::chat::update_conversation_title,
            commands::chat::export_conversation_markdown,
            commands::settings::get_api_key,
            commands::settings::set_api_key,
            commands::settings::delete_api_key,
            commands::knowledge::create_bucket,
            commands::knowledge::delete_bucket,
            commands::knowledge::get_buckets,
            commands::knowledge::upload_file,
            commands::knowledge::delete_file,
            commands::knowledge::get_bucket_files,
            commands::knowledge::search_bucket,
        ])
        .setup(|app| {
            // Initialize the database
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = db::init_database(&app_handle).await {
                    eprintln!("Failed to initialize database: {}", e);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
