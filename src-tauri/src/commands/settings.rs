use tauri::AppHandle;
use tauri_plugin_store::StoreExt;
use serde_json::json;

const STORE_PATH: &str = "settings.json";

#[tauri::command]
pub async fn get_api_key(app: AppHandle, provider: String) -> Result<Option<String>, String> {
    let store = app.store(STORE_PATH)
        .map_err(|e| format!("Failed to open store: {}", e))?;
    
    let key = format!("api_key_{}", provider);
    let value = store.get(&key);
    
    match value {
        Some(v) => {
            if let Some(s) = v.as_str() {
                Ok(Some(s.to_string()))
            } else {
                Ok(None)
            }
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn set_api_key(app: AppHandle, provider: String, api_key: String) -> Result<(), String> {
    let store = app.store(STORE_PATH)
        .map_err(|e| format!("Failed to open store: {}", e))?;
    
    let key = format!("api_key_{}", provider);
    store.set(&key, json!(api_key));
    
    store.save()
        .map_err(|e| format!("Failed to save store: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub async fn delete_api_key(app: AppHandle, provider: String) -> Result<(), String> {
    let store = app.store(STORE_PATH)
        .map_err(|e| format!("Failed to open store: {}", e))?;
    
    let key = format!("api_key_{}", provider);
    store.delete(&key);
    
    store.save()
        .map_err(|e| format!("Failed to save store: {}", e))?;
    
    Ok(())
}
