use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;
use serde_json::json;
use serde::{Deserialize, Serialize};
use futures::StreamExt;
use std::path::{Path, PathBuf};

const STORE_PATH: &str = "settings.json";
const DEFAULT_MODEL_URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin";
const DEFAULT_MODEL_FILENAME: &str = "ggml-base.en.bin";

fn model_filename(model_id: &str) -> Result<&'static str, String> {
    match model_id {
        "tiny.en" => Ok("ggml-tiny.en.bin"),
        "tiny" => Ok("ggml-tiny.bin"),
        "base.en" => Ok("ggml-base.en.bin"),
        "base" => Ok("ggml-base.bin"),
        "small.en" => Ok("ggml-small.en.bin"),
        "small" => Ok("ggml-small.bin"),
        _ => Err("Unknown model id".to_string()),
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WhisperConfig {
    pub binary_path: String,
    pub model_path: String,
    pub language: String,
}

fn read_whisper_config(app: &AppHandle) -> Result<WhisperConfig, String> {
    let store = app
        .store(STORE_PATH)
        .map_err(|e| format!("Failed to open store: {}", e))?;

    let binary_path = store
        .get("whisper_binary_path")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default();
    let model_path = store
        .get("whisper_model_path")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default();
    let language = store
        .get("whisper_language")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "en".to_string());

    Ok(WhisperConfig {
        binary_path,
        model_path,
        language,
    })
}

fn read_whisper_model_id(app: &AppHandle) -> Result<String, String> {
    let store = app
        .store(STORE_PATH)
        .map_err(|e| format!("Failed to open store: {}", e))?;

    let model_id = store
        .get("whisper_model_id")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "base.en".to_string());

    Ok(model_id)
}

fn model_url(model_id: &str) -> Result<&'static str, String> {
    match model_id {
        "tiny.en" => Ok("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin"),
        "tiny" => Ok("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin"),
        "base.en" => Ok("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin"),
        "base" => Ok("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin"),
        "small.en" => Ok("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin"),
        "small" => Ok("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin"),
        _ => Err("Unknown model id".to_string()),
    }
}

fn find_whisper_binary() -> Option<String> {
    let mut candidates = vec![
        "whisper",
        "whisper.cpp",
        "whisper-cpp",
    ];

    #[cfg(target_os = "windows")]
    {
        candidates = candidates
            .into_iter()
            .flat_map(|name| vec![name.to_string(), format!("{}.exe", name)])
            .collect();
    }

    #[cfg(not(target_os = "windows"))]
    let candidates: Vec<String> = candidates.into_iter().map(|s| s.to_string()).collect();

    if let Some(path_var) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path_var) {
            for name in &candidates {
                let candidate_path = dir.join(name);
                if candidate_path.is_file() {
                    return Some(candidate_path.to_string_lossy().to_string());
                }
            }
        }
    }

    let mut common_paths: Vec<PathBuf> = Vec::new();
    #[cfg(target_os = "macos")]
    {
        common_paths.extend([
            "/opt/homebrew/bin/whisper",
            "/opt/homebrew/bin/whisper.cpp",
            "/opt/homebrew/bin/whisper-cpp",
            "/usr/local/bin/whisper",
            "/usr/local/bin/whisper.cpp",
            "/usr/local/bin/whisper-cpp",
        ].iter().map(PathBuf::from));
    }

    #[cfg(target_os = "linux")]
    {
        common_paths.extend([
            "/usr/bin/whisper",
            "/usr/bin/whisper.cpp",
            "/usr/bin/whisper-cpp",
            "/usr/local/bin/whisper",
            "/usr/local/bin/whisper.cpp",
            "/usr/local/bin/whisper-cpp",
        ].iter().map(PathBuf::from));
    }

    for path in common_paths {
        if path.is_file() {
            return Some(path.to_string_lossy().to_string());
        }
    }

    None
}

fn model_path(app: &AppHandle, model_id: &str) -> Result<PathBuf, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    let models_dir = app_dir.join("whisper_models");
    std::fs::create_dir_all(&models_dir)
        .map_err(|e| format!("Failed to create models directory: {}", e))?;
    Ok(models_dir.join(model_filename(model_id)?))
}

async fn ensure_default_model(app: &AppHandle) -> Result<String, String> {
    let dest_path = model_path(app, "base.en")?;

    if dest_path.is_file() {
        return Ok(dest_path.to_string_lossy().to_string());
    }

    let client = reqwest::Client::new();
    let response = client
        .get(DEFAULT_MODEL_URL)
        .send()
        .await
        .map_err(|e| format!("Failed to download model: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download failed: {}", response.status()));
    }

    let mut file = std::fs::File::create(&dest_path)
        .map_err(|e| format!("Failed to create model file: {}", e))?;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;
        std::io::Write::write_all(&mut file, &chunk)
            .map_err(|e| format!("Failed to write model file: {}", e))?;
    }

    Ok(dest_path.to_string_lossy().to_string())
}

async fn ensure_model_by_id(app: &AppHandle, model_id: &str) -> Result<String, String> {
    let dest_path = model_path(app, model_id)?;

    if dest_path.is_file() {
        return Ok(dest_path.to_string_lossy().to_string());
    }

    let url = model_url(model_id)?;
    let client = reqwest::Client::new();
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to download model: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download failed: {}", response.status()));
    }

    let mut file = std::fs::File::create(&dest_path)
        .map_err(|e| format!("Failed to create model file: {}", e))?;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;
        std::io::Write::write_all(&mut file, &chunk)
            .map_err(|e| format!("Failed to write model file: {}", e))?;
    }

    Ok(dest_path.to_string_lossy().to_string())
}

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

#[tauri::command]
pub async fn get_whisper_config(app: AppHandle) -> Result<WhisperConfig, String> {
    read_whisper_config(&app)
}

#[tauri::command]
pub async fn get_default_whisper_model_path(app: AppHandle) -> Result<String, String> {
    let dest_path = model_path(&app, "base.en")?;
    Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn get_whisper_model_path(app: AppHandle, model_id: String) -> Result<String, String> {
    let dest_path = model_path(&app, model_id.trim())?;
    Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn get_whisper_model_id(app: AppHandle) -> Result<String, String> {
    read_whisper_model_id(&app)
}

#[tauri::command]
pub async fn set_whisper_model_id(app: AppHandle, model_id: String) -> Result<(), String> {
    let store = app
        .store(STORE_PATH)
        .map_err(|e| format!("Failed to open store: {}", e))?;

    store.set("whisper_model_id", json!(model_id));
    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn ensure_default_whisper_config(app: AppHandle) -> Result<WhisperConfig, String> {
    let mut config = read_whisper_config(&app)?;
    let mut model_id = read_whisper_model_id(&app)?;
    let mut changed = false;

    if config.binary_path.trim().is_empty() {
        if let Some(path) = find_whisper_binary() {
            config.binary_path = path;
            changed = true;
        }
    }

    if model_id.trim().is_empty() {
        model_id = "base.en".to_string();
        changed = true;
    }

    if model_id != "custom" {
        // Get the expected model path for the current model_id
        let expected_path = model_path(&app, model_id.trim())?;
        let expected_path_str = expected_path.to_string_lossy().to_string();
        
        // Update if path is empty, doesn't match expected, or file doesn't exist
        if config.model_path.trim().is_empty() 
            || config.model_path != expected_path_str
            || !Path::new(&config.model_path).is_file() 
        {
            config.model_path = ensure_model_by_id(&app, model_id.trim()).await?;
            changed = true;
        }
    }

    if config.language.trim().is_empty() {
        config.language = "en".to_string();
        changed = true;
    }

    if changed {
        let store = app
            .store(STORE_PATH)
            .map_err(|e| format!("Failed to open store: {}", e))?;
        store.set("whisper_binary_path", json!(config.binary_path));
        store.set("whisper_model_path", json!(config.model_path));
        store.set("whisper_language", json!(config.language));
        store.set("whisper_model_id", json!(model_id));
        store
            .save()
            .map_err(|e| format!("Failed to save store: {}", e))?;
    }

    Ok(config)
}

#[tauri::command]
pub async fn set_whisper_config(
    app: AppHandle,
    binary_path: String,
    model_path: String,
    language: String,
) -> Result<(), String> {
    let store = app
        .store(STORE_PATH)
        .map_err(|e| format!("Failed to open store: {}", e))?;

    store.set("whisper_binary_path", json!(binary_path));
    store.set("whisper_model_path", json!(model_path));
    store.set("whisper_language", json!(language));

    store.save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}
