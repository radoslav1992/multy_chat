use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;
use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::commands::chat::{Conversation, Message, SearchConversationResult};
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
    conversations.sort_by(|a, b| {
        if a.pinned != b.pinned {
            return b.pinned.cmp(&a.pinned);
        }
        b.updated_at.cmp(&a.updated_at)
    });
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

pub async fn update_conversation_pinned(
    app: &AppHandle,
    id: &str,
    pinned: bool,
) -> Result<()> {
    let mut db = load_db(app);
    if let Some(conv) = db.conversations.iter_mut().find(|c| c.id == id) {
        conv.pinned = pinned;
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

pub async fn delete_message(app: &AppHandle, message_id: &str) -> Result<()> {
    let mut db = load_db(app);
    db.messages.retain(|m| m.id != message_id);
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

fn build_snippet(content: &str, match_index: usize, match_len: usize) -> String {
    let preview_radius = 40usize;
    let start = match_index.saturating_sub(preview_radius);
    let end = (match_index + match_len + preview_radius).min(content.len());
    let snippet = content.get(start..end).unwrap_or(content).trim();
    let prefix = if start > 0 { "..." } else { "" };
    let suffix = if end < content.len() { "..." } else { "" };
    format!("{}{}{}", prefix, snippet, suffix)
}

pub async fn search_conversations(
    app: &AppHandle,
    query: &str,
) -> Result<Vec<SearchConversationResult>> {
    let db = load_db(app);
    let needle = query.to_lowercase();
    let mut results: Vec<SearchConversationResult> = Vec::new();

    for conv in db.conversations.iter() {
        let title_lower = conv.title.to_lowercase();
        if title_lower.contains(&needle) {
            results.push(SearchConversationResult {
                id: conv.id.clone(),
                title: conv.title.clone(),
                updated_at: conv.updated_at.clone(),
                snippet: "Title match".to_string(),
                pinned: conv.pinned,
            });
            continue;
        }

        for msg in db.messages.iter().filter(|m| m.conversation_id == conv.id) {
            let content_lower = msg.content.to_lowercase();
            if let Some(index) = content_lower.find(&needle) {
                let snippet = build_snippet(&msg.content, index, needle.len());
                results.push(SearchConversationResult {
                    id: conv.id.clone(),
                    title: conv.title.clone(),
                    updated_at: conv.updated_at.clone(),
                    snippet,
                    pinned: conv.pinned,
                });
                break;
            }
        }
    }

    results.sort_by(|a, b| {
        if a.pinned != b.pinned {
            return b.pinned.cmp(&a.pinned);
        }
        b.updated_at.cmp(&a.updated_at)
    });
    Ok(results)
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
