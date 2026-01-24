use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use uuid::Uuid;
use chrono::Utc;

use crate::providers::{Message as ProviderMessage, create_provider};
use crate::db;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Message {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub provider: String,
    pub model: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SendMessageRequest {
    pub conversation_id: String,
    pub content: String,
    pub provider: String,
    pub model: String,
    pub api_key: String,
    pub context: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatResponse {
    pub message: Message,
    pub conversation_id: String,
}

#[tauri::command]
pub async fn send_message(
    app: AppHandle,
    request: SendMessageRequest,
) -> Result<ChatResponse, String> {
    // Save user message to database
    let user_message_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    
    let user_message = Message {
        id: user_message_id.clone(),
        conversation_id: request.conversation_id.clone(),
        role: "user".to_string(),
        content: request.content.clone(),
        provider: request.provider.clone(),
        model: request.model.clone(),
        created_at: now.clone(),
    };
    
    db::save_message(&app, &user_message).await
        .map_err(|e| format!("Failed to save user message: {}", e))?;

    // Get conversation history
    let messages = db::get_messages(&app, &request.conversation_id).await
        .map_err(|e| format!("Failed to get messages: {}", e))?;

    // Convert to provider format
    let mut provider_messages: Vec<ProviderMessage> = messages
        .iter()
        .map(|m| ProviderMessage {
            role: m.role.clone(),
            content: m.content.clone(),
        })
        .collect();

    // Add context if provided (from RAG)
    if let Some(context) = &request.context {
        if !context.is_empty() {
            println!("[RAG] Adding knowledge context to conversation ({} chars)", context.len());
            provider_messages.insert(0, ProviderMessage {
                role: "system".to_string(),
                content: format!(
                    "IMPORTANT: The user has provided documents in their knowledge base. \
                    You MUST use the following context from their documents to answer their question. \
                    Base your answer on this context - do not give generic advice. \
                    If the context doesn't contain relevant information, say so.\n\n\
                    === KNOWLEDGE BASE CONTEXT ===\n{}\n=== END CONTEXT ===",
                    context
                ),
            });
        }
    }

    // Create provider and send message
    let provider = create_provider(&request.provider, &request.api_key)
        .map_err(|e| format!("Failed to create provider: {}", e))?;

    let response = provider.chat(provider_messages, &request.model).await
        .map_err(|e| format!("Failed to get response: {}", e))?;

    // Save assistant message
    let assistant_message_id = Uuid::new_v4().to_string();
    let assistant_message = Message {
        id: assistant_message_id,
        conversation_id: request.conversation_id.clone(),
        role: "assistant".to_string(),
        content: response,
        provider: request.provider.clone(),
        model: request.model.clone(),
        created_at: Utc::now().to_rfc3339(),
    };

    db::save_message(&app, &assistant_message).await
        .map_err(|e| format!("Failed to save assistant message: {}", e))?;

    // Update conversation timestamp
    db::update_conversation_timestamp(&app, &request.conversation_id).await
        .map_err(|e| format!("Failed to update conversation: {}", e))?;

    Ok(ChatResponse {
        message: assistant_message,
        conversation_id: request.conversation_id,
    })
}

#[tauri::command]
pub async fn get_conversations(app: AppHandle) -> Result<Vec<Conversation>, String> {
    db::get_conversations(&app).await
        .map_err(|e| format!("Failed to get conversations: {}", e))
}

#[tauri::command]
pub async fn get_messages(app: AppHandle, conversation_id: String) -> Result<Vec<Message>, String> {
    db::get_messages(&app, &conversation_id).await
        .map_err(|e| format!("Failed to get messages: {}", e))
}

#[tauri::command]
pub async fn create_conversation(app: AppHandle, title: String) -> Result<Conversation, String> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    
    let conversation = Conversation {
        id,
        title,
        created_at: now.clone(),
        updated_at: now,
    };
    
    db::create_conversation(&app, &conversation).await
        .map_err(|e| format!("Failed to create conversation: {}", e))?;
    
    Ok(conversation)
}

#[tauri::command]
pub async fn delete_conversation(app: AppHandle, conversation_id: String) -> Result<(), String> {
    db::delete_conversation(&app, &conversation_id).await
        .map_err(|e| format!("Failed to delete conversation: {}", e))
}

#[tauri::command]
pub async fn update_conversation_title(
    app: AppHandle,
    conversation_id: String,
    title: String,
) -> Result<(), String> {
    db::update_conversation_title(&app, &conversation_id, &title).await
        .map_err(|e| format!("Failed to update conversation title: {}", e))
}
