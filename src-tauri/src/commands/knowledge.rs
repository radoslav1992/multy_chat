use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use uuid::Uuid;
use chrono::Utc;
use std::path::PathBuf;

use crate::db;
use crate::rag;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Bucket {
    pub id: String,
    pub name: String,
    pub description: String,
    pub created_at: String,
    pub file_count: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BucketFile {
    pub id: String,
    pub bucket_id: String,
    pub filename: String,
    pub file_type: String,
    pub file_size: i64,
    pub chunk_count: i32,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub content: String,
    pub filename: String,
    pub score: f32,
}

#[tauri::command]
pub async fn create_bucket(
    app: AppHandle,
    name: String,
    description: String,
) -> Result<Bucket, String> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    
    let bucket = Bucket {
        id,
        name,
        description,
        created_at: now,
        file_count: 0,
    };
    
    db::create_bucket(&app, &bucket).await
        .map_err(|e| format!("Failed to create bucket: {}", e))?;
    
    // Initialize vector store for this bucket
    rag::init_bucket_store(&app, &bucket.id).await
        .map_err(|e| format!("Failed to initialize bucket store: {}", e))?;
    
    Ok(bucket)
}

#[tauri::command]
pub async fn delete_bucket(app: AppHandle, bucket_id: String) -> Result<(), String> {
    // Delete from database
    db::delete_bucket(&app, &bucket_id).await
        .map_err(|e| format!("Failed to delete bucket: {}", e))?;
    
    // Delete vector store
    rag::delete_bucket_store(&app, &bucket_id).await
        .map_err(|e| format!("Failed to delete bucket store: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub async fn get_buckets(app: AppHandle) -> Result<Vec<Bucket>, String> {
    db::get_buckets(&app).await
        .map_err(|e| format!("Failed to get buckets: {}", e))
}

#[tauri::command]
pub async fn upload_file(
    app: AppHandle,
    bucket_id: String,
    file_path: String,
    api_key: String,
) -> Result<BucketFile, String> {
    println!("[RAG] Starting file upload: {}", file_path);
    
    let path = PathBuf::from(&file_path);
    
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }
    
    // Get file info
    let filename = path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();
    
    println!("[RAG] Processing file: {}", filename);
    
    let extension = path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    
    let file_type = match extension.as_str() {
        "pdf" => "pdf",
        "docx" | "doc" => "docx",
        "txt" | "md" => "txt",
        _ => return Err(format!("Unsupported file type: {}", extension)),
    };
    
    println!("[RAG] File type detected: {}", file_type);
    
    // Read and parse file
    let content = rag::parse_file(&path, file_type)
        .map_err(|e| format!("Failed to parse file: {}", e))?;
    
    println!("[RAG] Parsed content length: {} characters", content.len());
    
    if content.trim().is_empty() {
        return Err("File appears to be empty or could not extract text. For PDFs, ensure the file contains actual text (not just images).".to_string());
    }
    
    // Get file size
    let metadata = std::fs::metadata(&path)
        .map_err(|e| format!("Failed to get file metadata: {}", e))?;
    
    // Chunk the content
    let chunks = rag::chunk_text(&content, 500, 50);
    
    println!("[RAG] Created {} chunks", chunks.len());
    
    if chunks.is_empty() {
        return Err("No content could be extracted from the file.".to_string());
    }
    
    // Generate embeddings and store
    let chunk_count = chunks.len() as i32;
    
    println!("[RAG] Generating embeddings via OpenAI...");
    rag::store_chunks(&app, &bucket_id, &filename, &chunks, &api_key).await
        .map_err(|e| format!("Failed to generate embeddings: {}", e))?;
    
    println!("[RAG] Embeddings stored successfully");
    
    // Save file metadata
    let file_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    
    let bucket_file = BucketFile {
        id: file_id,
        bucket_id: bucket_id.clone(),
        filename,
        file_type: file_type.to_string(),
        file_size: metadata.len() as i64,
        chunk_count,
        created_at: now,
    };
    
    db::create_bucket_file(&app, &bucket_file).await
        .map_err(|e| format!("Failed to save file metadata: {}", e))?;
    
    // Update bucket file count
    db::update_bucket_file_count(&app, &bucket_id).await
        .map_err(|e| format!("Failed to update bucket: {}", e))?;
    
    println!("[RAG] File upload complete: {} chunks indexed", chunk_count);
    
    Ok(bucket_file)
}

#[tauri::command]
pub async fn delete_file(
    app: AppHandle,
    bucket_id: String,
    file_id: String,
    filename: String,
) -> Result<(), String> {
    // Delete from vector store
    rag::delete_file_chunks(&app, &bucket_id, &filename).await
        .map_err(|e| format!("Failed to delete file chunks: {}", e))?;
    
    // Delete from database
    db::delete_bucket_file(&app, &file_id).await
        .map_err(|e| format!("Failed to delete file: {}", e))?;
    
    // Update bucket file count
    db::update_bucket_file_count(&app, &bucket_id).await
        .map_err(|e| format!("Failed to update bucket: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub async fn get_bucket_files(app: AppHandle, bucket_id: String) -> Result<Vec<BucketFile>, String> {
    db::get_bucket_files(&app, &bucket_id).await
        .map_err(|e| format!("Failed to get bucket files: {}", e))
}

#[tauri::command]
pub async fn search_bucket(
    app: AppHandle,
    bucket_id: String,
    query: String,
    api_key: String,
    top_k: Option<usize>,
) -> Result<Vec<SearchResult>, String> {
    let k = top_k.unwrap_or(5);
    
    rag::search(&app, &bucket_id, &query, &api_key, k).await
        .map_err(|e| format!("Failed to search bucket: {}", e))
}
