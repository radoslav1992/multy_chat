use std::path::{Path, PathBuf};
use std::io::Read;
use std::sync::OnceLock;
use tauri::AppHandle;
use tauri::Manager;
use serde::{Deserialize, Serialize};
use anyhow::Result;
use std::fs;
use fastembed::{TextEmbedding, InitOptions, EmbeddingModel};

use crate::commands::knowledge::SearchResult;

// Global cache directory path - set once on first use
static CACHE_DIR: OnceLock<PathBuf> = OnceLock::new();

/// Initialize the cache directory for embedding models
/// This must be called with the AppHandle before using embeddings
pub fn init_cache_dir(app: &AppHandle) -> Result<()> {
    let app_dir = app.path().app_data_dir().map_err(|e| anyhow::anyhow!("Failed to get app data dir: {}", e))?;
    let cache_dir = app_dir.join("models_cache");
    
    // Create the directory if it doesn't exist
    fs::create_dir_all(&cache_dir)?;
    
    println!("[RAG] Using model cache directory: {:?}", cache_dir);
    
    // Set the global cache directory (only succeeds once)
    let _ = CACHE_DIR.set(cache_dir);
    
    Ok(())
}

#[derive(Serialize, Deserialize, Clone)]
struct Chunk {
    content: String,
    filename: String,
    embedding: Vec<f32>,
}

/// Create an embedding model instance
/// The model files are cached in the app's data directory (~23MB)
fn create_embedding_model(show_progress: bool) -> Result<TextEmbedding> {
    println!("[RAG] Loading local embedding model (all-MiniLM-L6-v2)...");
    
    let cache_dir = CACHE_DIR.get()
        .ok_or_else(|| anyhow::anyhow!("Cache directory not initialized. Call init_cache_dir first."))?;
    
    println!("[RAG] Using cache directory: {:?}", cache_dir);
    
    let model = TextEmbedding::try_new(
        InitOptions::new(EmbeddingModel::AllMiniLML6V2)
            .with_cache_dir(cache_dir.clone())
            .with_show_download_progress(show_progress)
    )?;
    
    println!("[RAG] Embedding model loaded successfully!");
    Ok(model)
}

fn get_bucket_path(app: &AppHandle, bucket_id: &str) -> PathBuf {
    let app_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    app_dir.join("buckets").join(bucket_id)
}

pub async fn init_bucket_store(app: &AppHandle, bucket_id: &str) -> Result<()> {
    let bucket_path = get_bucket_path(app, bucket_id);
    fs::create_dir_all(&bucket_path)?;
    
    // Create empty chunks file
    let chunks_file = bucket_path.join("chunks.json");
    fs::write(chunks_file, "[]")?;
    
    Ok(())
}

pub async fn delete_bucket_store(app: &AppHandle, bucket_id: &str) -> Result<()> {
    let bucket_path = get_bucket_path(app, bucket_id);
    if bucket_path.exists() {
        fs::remove_dir_all(bucket_path)?;
    }
    Ok(())
}

pub fn parse_file(path: &Path, file_type: &str) -> Result<String> {
    match file_type {
        "pdf" => {
            println!("[RAG] Extracting text from PDF using pdf-extract...");
            let text = pdf_extract::extract_text(path)
                .map_err(|e| anyhow::anyhow!("PDF extraction error: {}", e))?;
            println!("[RAG] PDF extraction complete, got {} bytes", text.len());
            Ok(text)
        }
        "docx" => {
            // For docx, we'll do basic XML parsing
            let file = fs::File::open(path)?;
            let mut archive = zip::ZipArchive::new(file)
                .map_err(|e| anyhow::anyhow!("Failed to open docx: {}", e))?;
            
            let mut text = String::new();
            if let Ok(mut document) = archive.by_name("word/document.xml") {
                let mut content = String::new();
                document.read_to_string(&mut content)?;
                
                // Simple extraction - remove XML tags and get text
                let mut in_tag = false;
                let mut result = String::new();
                for c in content.chars() {
                    match c {
                        '<' => in_tag = true,
                        '>' => {
                            in_tag = false;
                            if result.ends_with("w:p") || result.ends_with("w:br") {
                                text.push('\n');
                            }
                            result.clear();
                        }
                        _ if !in_tag => text.push(c),
                        _ => result.push(c),
                    }
                }
            }
            Ok(text)
        }
        "txt" | "md" => {
            let content = fs::read_to_string(path)?;
            Ok(content)
        }
        _ => Err(anyhow::anyhow!("Unsupported file type: {}", file_type)),
    }
}

pub fn chunk_text(text: &str, chunk_size: usize, overlap: usize) -> Vec<String> {
    let words: Vec<&str> = text.split_whitespace().collect();
    let mut chunks = Vec::new();
    
    if words.is_empty() {
        return chunks;
    }
    
    let mut i = 0;
    while i < words.len() {
        let end = (i + chunk_size).min(words.len());
        let chunk: String = words[i..end].join(" ");
        if !chunk.trim().is_empty() {
            chunks.push(chunk);
        }
        
        if end >= words.len() {
            break;
        }
        
        i += chunk_size.saturating_sub(overlap);
    }
    
    chunks
}

/// Generate embeddings using local model (no API key required)
fn get_embeddings_local(texts: &[String], show_progress: bool) -> Result<Vec<Vec<f32>>> {
    if texts.is_empty() {
        return Ok(Vec::new());
    }
    
    let model = create_embedding_model(show_progress)?;
    
    // Convert String to &str for the embedding function
    let text_refs: Vec<&str> = texts.iter().map(|s| s.as_str()).collect();
    
    let embeddings = model.embed(text_refs, None)?;
    
    Ok(embeddings)
}

pub async fn store_chunks(
    app: &AppHandle,
    bucket_id: &str,
    filename: &str,
    chunks: &[String],
    _api_key: &str, // No longer needed, kept for API compatibility
) -> Result<()> {
    let bucket_path = get_bucket_path(app, bucket_id);
    let chunks_file = bucket_path.join("chunks.json");
    
    if chunks.is_empty() {
        return Ok(());
    }
    
    println!("[RAG] Generating embeddings for {} chunks using local model...", chunks.len());
    
    // Get embeddings using local model (show progress on first download)
    let embeddings = get_embeddings_local(chunks, true)?;
    
    println!("[RAG] Generated {} embeddings", embeddings.len());
    
    // Load existing chunks
    let mut stored_chunks: Vec<Chunk> = if chunks_file.exists() {
        let content = fs::read_to_string(&chunks_file)?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    };
    
    // Add new chunks
    for (chunk, embedding) in chunks.iter().zip(embeddings.iter()) {
        stored_chunks.push(Chunk {
            content: chunk.clone(),
            filename: filename.to_string(),
            embedding: embedding.clone(),
        });
    }
    
    // Save chunks
    let json = serde_json::to_string_pretty(&stored_chunks)?;
    fs::write(chunks_file, json)?;
    
    println!("[RAG] Stored {} total chunks in bucket", stored_chunks.len());
    
    Ok(())
}

pub async fn delete_file_chunks(
    app: &AppHandle,
    bucket_id: &str,
    filename: &str,
) -> Result<()> {
    let bucket_path = get_bucket_path(app, bucket_id);
    let chunks_file = bucket_path.join("chunks.json");
    
    if !chunks_file.exists() {
        return Ok(());
    }
    
    let content = fs::read_to_string(&chunks_file)?;
    let mut chunks: Vec<Chunk> = serde_json::from_str(&content)?;
    
    chunks.retain(|c| c.filename != filename);
    
    let json = serde_json::to_string_pretty(&chunks)?;
    fs::write(chunks_file, json)?;
    
    Ok(())
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    
    dot / (norm_a * norm_b)
}

pub async fn search(
    app: &AppHandle,
    bucket_id: &str,
    query: &str,
    _api_key: &str, // No longer needed
    top_k: usize,
) -> Result<Vec<SearchResult>> {
    let bucket_path = get_bucket_path(app, bucket_id);
    let chunks_file = bucket_path.join("chunks.json");
    
    println!("[RAG] Looking for chunks file at: {:?}", chunks_file);
    
    if !chunks_file.exists() {
        println!("[RAG] Chunks file does not exist!");
        return Ok(Vec::new());
    }
    
    // Load chunks
    let content = fs::read_to_string(&chunks_file)?;
    let chunks: Vec<Chunk> = serde_json::from_str(&content)?;
    
    println!("[RAG] Loaded {} chunks from file", chunks.len());
    
    if chunks.is_empty() {
        println!("[RAG] No chunks found in file");
        return Ok(Vec::new());
    }
    
    // Log first chunk info for debugging
    if let Some(first) = chunks.first() {
        println!("[RAG] First chunk: file={}, content_len={}, embedding_len={}", 
            first.filename, first.content.len(), first.embedding.len());
    }
    
    println!("[RAG] Searching {} chunks for: {}...", chunks.len(), &query[..query.len().min(50)]);
    
    // Get query embedding using local model (no download progress for searches)
    let query_embeddings = get_embeddings_local(&[query.to_string()], false)?;
    let query_embedding = query_embeddings.first()
        .ok_or_else(|| anyhow::anyhow!("No embedding returned"))?;
    
    println!("[RAG] Query embedding generated, length: {}", query_embedding.len());
    
    // Calculate similarities
    let mut scores: Vec<(usize, f32)> = chunks
        .iter()
        .enumerate()
        .map(|(i, chunk)| {
            let similarity = cosine_similarity(query_embedding, &chunk.embedding);
            (i, similarity)
        })
        .collect();
    
    // Log top scores before filtering
    scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    println!("[RAG] Top 3 similarity scores: {:?}", scores.iter().take(3).map(|(_, s)| s).collect::<Vec<_>>());
    
    // Take top k results - lowered threshold to 0.1 to be more inclusive
    let results: Vec<SearchResult> = scores
        .into_iter()
        .take(top_k)
        .filter(|(_, score)| *score > 0.1) // Lower threshold to include more results
        .map(|(i, score)| SearchResult {
            content: chunks[i].content.clone(),
            filename: chunks[i].filename.clone(),
            score,
        })
        .collect();
    
    println!("[RAG] Returning {} relevant results", results.len());
    
    Ok(results)
}
