use std::io::Cursor;
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;
use futures::StreamExt;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

const STORE_PATH: &str = "settings.json";

fn get_whisper_config(app: &AppHandle) -> Result<(String, String, String), String> {
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

    if model_path.trim().is_empty() {
        return Err("Whisper model path not configured.".to_string());
    }

    Ok((binary_path, model_path, language))
}

#[tauri::command]
pub async fn transcribe_audio(app: AppHandle, wav_base64: String) -> Result<String, String> {
    let (_binary_path, model_path, language) = get_whisper_config(&app)?;

    let audio_bytes =
        base64::decode(wav_base64).map_err(|e| format!("Invalid audio data: {}", e))?;

    let mut reader = hound::WavReader::new(Cursor::new(audio_bytes))
        .map_err(|e| format!("Failed to read wav data: {}", e))?;
    let spec = reader.spec();

    if spec.bits_per_sample != 16 {
        return Err("Unsupported audio format. Please record again.".to_string());
    }

    let samples: Vec<i16> = reader
        .into_samples::<i16>()
        .map(|sample| sample.map_err(|e| format!("Invalid audio sample: {}", e)))
        .collect::<Result<Vec<_>, _>>()?;

    let mut audio = vec![0.0f32; samples.len()];
    whisper_rs::convert_integer_to_float_audio(&samples, &mut audio)
        .map_err(|e| format!("Failed to convert audio: {}", e))?;

    if spec.channels == 2 {
        audio = whisper_rs::convert_stereo_to_mono_audio(&audio)
            .map_err(|e| format!("Failed to convert to mono: {}", e))?;
    } else if spec.channels != 1 {
        return Err("Unsupported audio channels. Please record again.".to_string());
    }

    if spec.sample_rate != 16000 {
        return Err("Audio must be 16KHz. Please record again.".to_string());
    }

    // Log which model is being used for debugging
    println!("[Whisper] Loading model: {}", model_path);
    let start = std::time::Instant::now();

    let ctx = WhisperContext::new_with_params(
        &model_path,
        WhisperContextParameters::default(),
    )
    .map_err(|e| format!("Failed to load whisper model: {}", e))?;
    
    println!("[Whisper] Model loaded in {:?}", start.elapsed());
    let mut state = ctx
        .create_state()
        .map_err(|e| format!("Failed to create whisper state: {}", e))?;

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    let language = language.trim();
    if !language.is_empty() {
        params.set_language(Some(language));
    }
    let threads = std::thread::available_parallelism()
        .map(|v| v.get() as i32)
        .unwrap_or(4);
    params.set_n_threads(threads);
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);

    let infer_start = std::time::Instant::now();
    state
        .full(params, &audio[..])
        .map_err(|e| format!("Whisper failed: {}", e))?;
    println!("[Whisper] Transcription took {:?} for {} samples ({:.1}s audio)", 
             infer_start.elapsed(), 
             audio.len(),
             audio.len() as f32 / 16000.0);

    let num_segments = state.full_n_segments();
    let mut transcript_parts = Vec::new();
    for i in 0..num_segments {
        if let Some(segment) = state.get_segment(i) {
            let segment_text = segment
                .to_str_lossy()
                .map_err(|e| format!("Failed to read segment: {}", e))?;
            let cleaned = segment_text.trim();
            if !cleaned.is_empty() {
                transcript_parts.push(cleaned.to_string());
            }
        }
    }
    let transcript = transcript_parts.join(" ");

    if transcript.is_empty() {
        return Err("No speech detected in audio.".to_string());
    }

    Ok(transcript)
}

fn get_model_url(model_id: &str) -> Result<&'static str, String> {
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

// Minimum expected sizes for each model (to detect corrupt/partial files)
fn get_min_model_size(model_id: &str) -> u64 {
    match model_id {
        "tiny.en" | "tiny" => 70_000_000,      // ~75MB
        "base.en" | "base" => 140_000_000,     // ~142MB
        "small.en" | "small" => 460_000_000,   // ~466MB
        _ => 0,
    }
}

#[tauri::command]
pub async fn download_whisper_model(app: AppHandle, model_id: String) -> Result<String, String> {
    let model_id = model_id.trim();
    let url = get_model_url(model_id)?;
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    let models_dir = app_dir.join("whisper_models");
    std::fs::create_dir_all(&models_dir)
        .map_err(|e| format!("Failed to create models directory: {}", e))?;

    let filename = url
        .split('/')
        .last()
        .ok_or_else(|| "Invalid model URL".to_string())?;
    let dest_path = models_dir.join(filename);
    let temp_path = models_dir.join(format!("{}.download", filename));

    // Check if model already exists and is valid (large enough)
    let min_size = get_min_model_size(model_id);
    if dest_path.exists() {
        if let Ok(metadata) = std::fs::metadata(&dest_path) {
            if metadata.len() >= min_size {
                println!("[Whisper] Model {} already exists ({} bytes), skipping download", filename, metadata.len());
                return Ok(dest_path.to_string_lossy().to_string());
            } else {
                println!("[Whisper] Model {} exists but is too small ({} < {}), re-downloading", filename, metadata.len(), min_size);
            }
        }
    }

    // Remove any partial download
    let _ = std::fs::remove_file(&temp_path);

    let client = reqwest::Client::new();
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to download model: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download failed: {}", response.status()));
    }

    // Get expected content length if available
    let expected_size = response.content_length();
    println!("[Whisper] Downloading {} (expected size: {:?} bytes)", filename, expected_size);

    let mut file = std::fs::File::create(&temp_path)
        .map_err(|e| format!("Failed to create model file: {}", e))?;
    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;
        std::io::Write::write_all(&mut file, &chunk)
            .map_err(|e| format!("Failed to write model file: {}", e))?;
        downloaded += chunk.len() as u64;
    }

    // Verify download size if we know expected size
    if let Some(expected) = expected_size {
        if downloaded != expected {
            let _ = std::fs::remove_file(&temp_path);
            return Err(format!("Incomplete download: got {} bytes, expected {}", downloaded, expected));
        }
    }

    println!("[Whisper] Downloaded {} bytes, moving to final location", downloaded);

    // Remove existing file and move temp to final
    let _ = std::fs::remove_file(&dest_path);
    std::fs::rename(&temp_path, &dest_path)
        .map_err(|e| format!("Failed to move model file: {}", e))?;

    Ok(dest_path.to_string_lossy().to_string())
}
