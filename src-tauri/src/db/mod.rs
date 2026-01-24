use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;
use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::commands::chat::{Conversation, Message};
use crate::commands::knowledge::{Bucket, BucketFile};

#[derive(Serialize, Deserialize, Default)]
struct Database {
    conversations: Vec<Conversation>,
    messages: Vec<Message>,
    buckets: Vec<Bucket>,
    bucket_files: Vec<BucketFile>,
}

fn get_db_path(app: &AppHandle) -> PathBuf {
    let app_dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    fs::create_dir_all(&app_dir).ok();
    app_dir.join("database.json")
}

fn load_db(app: &AppHandle) -> Database {
    let path = get_db_path(app);
    if path.exists() {
        let content = fs::read_to_string(&path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Database::default()
    }
}

fn save_db(app: &AppHandle, db: &Database) -> Result<()> {
    let path = get_db_path(app);
    let content = serde_json::to_string_pretty(db)?;
    fs::write(path, content)?;
    Ok(())
}

pub async fn init_database(app: &AppHandle) -> Result<()> {
    let _ = load_db(app);
    Ok(())
}

// Conversation operations
pub async fn create_conversation(app: &AppHandle, conversation: &Conversation) -> Result<()> {
    let mut db = load_db(app);
    db.conversations.insert(0, conversation.clone());
    save_db(app, &db)
}

pub async fn get_conversations(app: &AppHandle) -> Result<Vec<Conversation>> {
    let db = load_db(app);
    let mut conversations = db.conversations;
    conversations.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(conversations)
}

pub async fn delete_conversation(app: &AppHandle, id: &str) -> Result<()> {
    let mut db = load_db(app);
    db.conversations.retain(|c| c.id != id);
    db.messages.retain(|m| m.conversation_id != id);
    save_db(app, &db)
}

pub async fn update_conversation_title(app: &AppHandle, id: &str, title: &str) -> Result<()> {
    let mut db = load_db(app);
    if let Some(conv) = db.conversations.iter_mut().find(|c| c.id == id) {
        conv.title = title.to_string();
    }
    save_db(app, &db)
}

pub async fn update_conversation_timestamp(app: &AppHandle, id: &str) -> Result<()> {
    let mut db = load_db(app);
    if let Some(conv) = db.conversations.iter_mut().find(|c| c.id == id) {
        conv.updated_at = chrono::Utc::now().to_rfc3339();
    }
    save_db(app, &db)
}

// Message operations
pub async fn save_message(app: &AppHandle, message: &Message) -> Result<()> {
    let mut db = load_db(app);
    db.messages.push(message.clone());
    save_db(app, &db)
}

pub async fn get_messages(app: &AppHandle, conversation_id: &str) -> Result<Vec<Message>> {
    let db = load_db(app);
    let mut messages: Vec<Message> = db.messages
        .into_iter()
        .filter(|m| m.conversation_id == conversation_id)
        .collect();
    messages.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    Ok(messages)
}

// Bucket operations
pub async fn create_bucket(app: &AppHandle, bucket: &Bucket) -> Result<()> {
    let mut db = load_db(app);
    db.buckets.insert(0, bucket.clone());
    save_db(app, &db)
}

pub async fn get_buckets(app: &AppHandle) -> Result<Vec<Bucket>> {
    let db = load_db(app);
    Ok(db.buckets)
}

pub async fn delete_bucket(app: &AppHandle, id: &str) -> Result<()> {
    let mut db = load_db(app);
    db.buckets.retain(|b| b.id != id);
    db.bucket_files.retain(|f| f.bucket_id != id);
    save_db(app, &db)
}

pub async fn update_bucket_file_count(app: &AppHandle, bucket_id: &str) -> Result<()> {
    let mut db = load_db(app);
    let count = db.bucket_files.iter().filter(|f| f.bucket_id == bucket_id).count() as i32;
    if let Some(bucket) = db.buckets.iter_mut().find(|b| b.id == bucket_id) {
        bucket.file_count = count;
    }
    save_db(app, &db)
}

// Bucket file operations
pub async fn create_bucket_file(app: &AppHandle, file: &BucketFile) -> Result<()> {
    let mut db = load_db(app);
    db.bucket_files.insert(0, file.clone());
    save_db(app, &db)
}

pub async fn get_bucket_files(app: &AppHandle, bucket_id: &str) -> Result<Vec<BucketFile>> {
    let db = load_db(app);
    Ok(db.bucket_files.into_iter().filter(|f| f.bucket_id == bucket_id).collect())
}

pub async fn delete_bucket_file(app: &AppHandle, file_id: &str) -> Result<()> {
    let mut db = load_db(app);
    db.bucket_files.retain(|f| f.id != file_id);
    save_db(app, &db)
}
