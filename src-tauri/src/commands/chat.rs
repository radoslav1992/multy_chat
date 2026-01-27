use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;
use chrono::Utc;
use tokio::sync::mpsc;

use crate::providers::{Message as ProviderMessage, create_provider, StreamChunk};
use crate::db;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub folder: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SourceReference {
    pub filename: String,
    pub score: f32,
    pub content: String,
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
    #[serde(default)]
    pub sources: Option<Vec<SourceReference>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SendMessageRequest {
    pub conversation_id: String,
    pub content: String,
    pub provider: String,
    pub model: String,
    pub api_key: String,
    pub context: Option<String>,
    pub sources: Option<Vec<SourceReference>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatResponse {
    pub message: Message,
    pub conversation_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchConversationResult {
    pub id: String,
    pub title: String,
    pub updated_at: String,
    pub snippet: String,
    pub pinned: bool,
    pub tags: Vec<String>,
    pub folder: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RegenerateRequest {
    pub conversation_id: String,
    pub provider: String,
    pub model: String,
    pub api_key: String,
    pub context: Option<String>,
    pub sources: Option<Vec<SourceReference>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RegenerateResponse {
    pub message: Message,
    pub conversation_id: String,
    pub replaced_message_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CompareRequest {
    pub conversation_id: String,
    pub provider: String,
    pub model: String,
    pub api_key: String,
    pub context: Option<String>,
    pub sources: Option<Vec<SourceReference>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CompareResponse {
    pub message: Message,
    pub conversation_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamingChunk {
    pub message_id: String,
    pub conversation_id: String,
    pub delta: String,
    pub done: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamStarted {
    pub message_id: String,
    pub conversation_id: String,
    pub provider: String,
    pub model: String,
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
        sources: None,
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
        sources: request.sources.clone(),
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
pub async fn send_message_stream(
    app: AppHandle,
    request: SendMessageRequest,
) -> Result<StreamStarted, String> {
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
        sources: None,
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
            println!("[RAG] Adding knowledge context to streaming conversation ({} chars)", context.len());
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

    // Create assistant message placeholder
    let assistant_message_id = Uuid::new_v4().to_string();
    let conversation_id = request.conversation_id.clone();
    let provider_name = request.provider.clone();
    let model_name = request.model.clone();
    let sources = request.sources.clone();

    // Create provider
    let provider = create_provider(&request.provider, &request.api_key)
        .map_err(|e| format!("Failed to create provider: {}", e))?;

    // Create channel for streaming
    let (tx, mut rx) = mpsc::channel::<StreamChunk>(100);

    // Clone values for the spawned tasks
    let app_for_producer = app.clone();
    let app_for_consumer = app.clone();
    let assistant_id_clone = assistant_message_id.clone();
    let assistant_id_for_producer = assistant_message_id.clone();
    let conv_id_clone = conversation_id.clone();
    let conv_id_for_producer = conversation_id.clone();
    let provider_clone = provider_name.clone();
    let model_clone = model_name.clone();
    let model_for_stream = model_name.clone();
    let sources_clone = sources.clone();

    // Spawn producer task (streams from provider to channel)
    println!("[STREAM] Starting producer task for model: {}", model_for_stream);
    tokio::spawn(async move {
        println!("[STREAM] Producer task started, calling chat_stream...");
        if let Err(e) = provider.chat_stream(provider_messages, &model_for_stream, tx).await {
            eprintln!("[STREAM] Streaming error: {}", e);
            // Emit error to frontend
            let _ = app_for_producer.emit("stream-error", StreamingChunk {
                message_id: assistant_id_for_producer,
                conversation_id: conv_id_for_producer,
                delta: format!("Error: {}", e),
                done: true,
            });
        }
        println!("[STREAM] Producer task completed");
        // tx is dropped here, which will signal rx that streaming is done
    });

    // Spawn consumer task (reads from channel and emits events)
    println!("[STREAM] Starting consumer task");
    tokio::spawn(async move {
        let mut full_content = String::new();
        let mut chunk_count = 0;

        println!("[STREAM] Consumer waiting for chunks...");
        // Process chunks from receiver
        while let Some(chunk) = rx.recv().await {
            chunk_count += 1;
            if !chunk.delta.is_empty() {
                full_content.push_str(&chunk.delta);
                println!("[STREAM] Received chunk #{}: {} chars", chunk_count, chunk.delta.len());
                let _ = app_for_consumer.emit("stream-chunk", StreamingChunk {
                    message_id: assistant_id_clone.clone(),
                    conversation_id: conv_id_clone.clone(),
                    delta: chunk.delta,
                    done: false,
                });
            }

            if chunk.done {
                println!("[STREAM] Received done signal");
                break;
            }
        }
        println!("[STREAM] Consumer finished, total chunks: {}, content length: {}", chunk_count, full_content.len());

        // Only save if we got content
        if !full_content.is_empty() {
            // Save the complete message
            let assistant_message = Message {
                id: assistant_id_clone.clone(),
                conversation_id: conv_id_clone.clone(),
                role: "assistant".to_string(),
                content: full_content.clone(),
                provider: provider_clone.clone(),
                model: model_clone.clone(),
                created_at: Utc::now().to_rfc3339(),
                sources: sources_clone.clone(),
            };

            if let Err(e) = db::save_message(&app_for_consumer, &assistant_message).await {
                eprintln!("Failed to save message: {}", e);
            }

            if let Err(e) = db::update_conversation_timestamp(&app_for_consumer, &conv_id_clone).await {
                eprintln!("Failed to update timestamp: {}", e);
            }
        }

        let _ = app_for_consumer.emit("stream-chunk", StreamingChunk {
            message_id: assistant_id_clone.clone(),
            conversation_id: conv_id_clone.clone(),
            delta: String::new(),
            done: true,
        });
    });

    Ok(StreamStarted {
        message_id: assistant_message_id,
        conversation_id,
        provider: provider_name,
        model: model_name,
    })
}

#[tauri::command]
pub async fn regenerate_last_assistant(
    app: AppHandle,
    request: RegenerateRequest,
) -> Result<RegenerateResponse, String> {
    let messages = db::get_messages(&app, &request.conversation_id).await
        .map_err(|e| format!("Failed to get messages: {}", e))?;

    let last_assistant = messages
        .iter()
        .rev()
        .find(|m| m.role == "assistant")
        .cloned()
        .ok_or_else(|| "No assistant message to regenerate".to_string())?;

    let mut provider_messages: Vec<ProviderMessage> = messages
        .iter()
        .filter(|m| m.id != last_assistant.id)
        .map(|m| ProviderMessage {
            role: m.role.clone(),
            content: m.content.clone(),
        })
        .collect();

    if let Some(context) = &request.context {
        if !context.is_empty() {
            println!(
                "[RAG] Adding knowledge context to regeneration ({} chars)",
                context.len()
            );
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

    let provider = create_provider(&request.provider, &request.api_key)
        .map_err(|e| format!("Failed to create provider: {}", e))?;

    let response = provider.chat(provider_messages, &request.model).await
        .map_err(|e| format!("Failed to get response: {}", e))?;

    let assistant_message_id = Uuid::new_v4().to_string();
    let assistant_message = Message {
        id: assistant_message_id,
        conversation_id: request.conversation_id.clone(),
        role: "assistant".to_string(),
        content: response,
        provider: request.provider.clone(),
        model: request.model.clone(),
        created_at: Utc::now().to_rfc3339(),
        sources: request.sources.clone(),
    };

    db::delete_message(&app, &last_assistant.id).await
        .map_err(|e| format!("Failed to delete previous assistant message: {}", e))?;

    db::save_message(&app, &assistant_message).await
        .map_err(|e| format!("Failed to save assistant message: {}", e))?;

    db::update_conversation_timestamp(&app, &request.conversation_id).await
        .map_err(|e| format!("Failed to update conversation: {}", e))?;

    Ok(RegenerateResponse {
        message: assistant_message,
        conversation_id: request.conversation_id,
        replaced_message_id: last_assistant.id,
    })
}

#[tauri::command]
pub async fn compare_response(
    app: AppHandle,
    request: CompareRequest,
) -> Result<CompareResponse, String> {
    let messages = db::get_messages(&app, &request.conversation_id).await
        .map_err(|e| format!("Failed to get messages: {}", e))?;

    let last_user_index = messages
        .iter()
        .rposition(|m| m.role == "user")
        .ok_or_else(|| "No user message to compare".to_string())?;

    let mut provider_messages: Vec<ProviderMessage> = messages
        .iter()
        .take(last_user_index + 1)
        .map(|m| ProviderMessage {
            role: m.role.clone(),
            content: m.content.clone(),
        })
        .collect();

    if let Some(context) = &request.context {
        if !context.is_empty() {
            println!(
                "[RAG] Adding knowledge context to comparison ({} chars)",
                context.len()
            );
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

    let provider = create_provider(&request.provider, &request.api_key)
        .map_err(|e| format!("Failed to create provider: {}", e))?;

    let response = provider.chat(provider_messages, &request.model).await
        .map_err(|e| format!("Failed to get response: {}", e))?;

    let assistant_message_id = Uuid::new_v4().to_string();
    let assistant_message = Message {
        id: assistant_message_id,
        conversation_id: request.conversation_id.clone(),
        role: "assistant".to_string(),
        content: response,
        provider: request.provider.clone(),
        model: request.model.clone(),
        created_at: Utc::now().to_rfc3339(),
        sources: request.sources.clone(),
    };

    db::save_message(&app, &assistant_message).await
        .map_err(|e| format!("Failed to save assistant message: {}", e))?;

    db::update_conversation_timestamp(&app, &request.conversation_id).await
        .map_err(|e| format!("Failed to update conversation: {}", e))?;

    Ok(CompareResponse {
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
pub async fn search_conversations(
    app: AppHandle,
    query: String,
) -> Result<Vec<SearchConversationResult>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    db::search_conversations(&app, query.trim()).await
        .map_err(|e| format!("Failed to search conversations: {}", e))
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
        pinned: false,
        tags: Vec::new(),
        folder: None,
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

#[tauri::command]
pub async fn update_conversation_pinned(
    app: AppHandle,
    conversation_id: String,
    pinned: bool,
) -> Result<(), String> {
    db::update_conversation_pinned(&app, &conversation_id, pinned).await
        .map_err(|e| format!("Failed to update conversation pinned: {}", e))
}

#[tauri::command]
pub async fn update_conversation_tags(
    app: AppHandle,
    conversation_id: String,
    tags: Vec<String>,
) -> Result<(), String> {
    db::update_conversation_tags(&app, &conversation_id, &tags).await
        .map_err(|e| format!("Failed to update conversation tags: {}", e))
}

#[tauri::command]
pub async fn update_conversation_folder(
    app: AppHandle,
    conversation_id: String,
    folder: Option<String>,
) -> Result<(), String> {
    db::update_conversation_folder(&app, &conversation_id, folder.as_deref()).await
        .map_err(|e| format!("Failed to update conversation folder: {}", e))
}

#[tauri::command]
pub async fn update_message_content(
    app: AppHandle,
    message_id: String,
    content: String,
) -> Result<(), String> {
    db::update_message_content(&app, &message_id, &content).await
        .map_err(|e| format!("Failed to update message: {}", e))
}

#[tauri::command]
pub async fn clone_conversation(
    app: AppHandle,
    conversation_id: String,
    title: String,
) -> Result<Conversation, String> {
    db::clone_conversation(&app, &conversation_id, &title).await
        .map_err(|e| format!("Failed to clone conversation: {}", e))
}

#[tauri::command]
pub async fn export_conversation_markdown(
    app: AppHandle,
    conversation_id: String,
    file_path: String,
) -> Result<(), String> {
    let conversations = db::get_conversations(&app).await
        .map_err(|e| format!("Failed to get conversations: {}", e))?;

    let conversation = conversations
        .iter()
        .find(|c| c.id == conversation_id)
        .ok_or_else(|| "Conversation not found".to_string())?;

    let messages = db::get_messages(&app, &conversation_id).await
        .map_err(|e| format!("Failed to get messages: {}", e))?;

    let mut output = String::new();
    output.push_str("# ");
    output.push_str(&conversation.title);
    output.push_str("\n\n");
    if !conversation.tags.is_empty() {
        output.push_str("**Tags:** ");
        output.push_str(&conversation.tags.join(", "));
        output.push_str("\n\n");
    }
    if let Some(folder) = &conversation.folder {
        if !folder.trim().is_empty() {
            output.push_str("**Folder:** ");
            output.push_str(folder);
            output.push_str("\n\n");
        }
    }
    output.push_str("*Exported from OmniChat*\n\n");

    for message in messages {
        let heading = match message.role.as_str() {
            "user" => "## User",
            "assistant" => "## Assistant",
            "system" => "## System",
            _ => "## Message",
        };
        output.push_str(heading);
        if message.role == "assistant" {
            output.push_str(&format!(
                " ({}/{})",
                message.provider,
                message.model
            ));
        }
        output.push('\n');
        output.push('\n');
        output.push_str(&message.content);
        output.push_str("\n\n");

        if let Some(sources) = &message.sources {
            if !sources.is_empty() {
                output.push_str("### Sources\n");
                for source in sources {
                    output.push_str(&format!(
                        "- {} ({:.1}%)\n",
                        source.filename,
                        source.score * 100.0
                    ));
                }
                output.push('\n');
            }
        }
    }

    std::fs::write(&file_path, output)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(())
}
