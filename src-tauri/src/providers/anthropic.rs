use async_trait::async_trait;
use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use anyhow::Result;
use tokio::sync::mpsc;

use super::{Message, ModelInfo, Provider, StreamChunk};

pub struct AnthropicProvider {
    api_key: String,
    client: Client,
}

#[derive(Serialize)]
struct AnthropicRequest {
    model: String,
    max_tokens: u32,
    messages: Vec<AnthropicMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
}

#[derive(Serialize)]
struct AnthropicMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct AnthropicResponse {
    content: Vec<ContentBlock>,
}

#[derive(Deserialize)]
struct ContentBlock {
    text: String,
}

#[derive(Deserialize)]
struct StreamEvent {
    #[serde(rename = "type")]
    event_type: String,
    delta: Option<Delta>,
}

#[derive(Deserialize)]
struct Delta {
    text: Option<String>,
}

impl AnthropicProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            client: Client::new(),
        }
    }

    fn prepare_messages(&self, messages: Vec<Message>) -> (Option<String>, Vec<AnthropicMessage>) {
        let mut system_message: Option<String> = None;
        let mut chat_messages: Vec<AnthropicMessage> = Vec::new();
        
        for msg in messages {
            if msg.role == "system" {
                system_message = Some(msg.content);
            } else {
                chat_messages.push(AnthropicMessage {
                    role: msg.role,
                    content: msg.content,
                });
            }
        }
        
        (system_message, chat_messages)
    }
}

#[async_trait]
impl Provider for AnthropicProvider {
    async fn chat(&self, messages: Vec<Message>, model: &str) -> Result<String> {
        let (system_message, chat_messages) = self.prepare_messages(messages);

        let request = AnthropicRequest {
            model: model.to_string(),
            max_tokens: 4096,
            messages: chat_messages,
            system: system_message,
            stream: None,
        };

        let response = self.client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow::anyhow!("Anthropic API error: {}", error_text));
        }

        let result: AnthropicResponse = response.json().await?;
        
        Ok(result.content
            .first()
            .map(|c| c.text.clone())
            .unwrap_or_default())
    }

    async fn chat_stream(
        &self,
        messages: Vec<Message>,
        model: &str,
        tx: mpsc::Sender<StreamChunk>,
    ) -> Result<()> {
        let (system_message, chat_messages) = self.prepare_messages(messages);

        let request = AnthropicRequest {
            model: model.to_string(),
            max_tokens: 4096,
            messages: chat_messages,
            system: system_message,
            stream: Some(true),
        };

        let response = self.client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow::anyhow!("Anthropic API error: {}", error_text));
        }

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();

        while let Some(chunk_result) = stream.next().await {
            let chunk = chunk_result?;
            buffer.push_str(&String::from_utf8_lossy(&chunk));

            // Process complete SSE events
            while let Some(pos) = buffer.find("\n\n") {
                let event_str = buffer[..pos].to_string();
                buffer = buffer[pos + 2..].to_string();

                for line in event_str.lines() {
                    if let Some(data) = line.strip_prefix("data: ") {
                        if data == "[DONE]" {
                            let _ = tx.send(StreamChunk { delta: String::new(), done: true }).await;
                            return Ok(());
                        }

                        if let Ok(event) = serde_json::from_str::<StreamEvent>(data) {
                            if event.event_type == "content_block_delta" {
                                if let Some(delta) = event.delta {
                                    if let Some(text) = delta.text {
                                        let _ = tx.send(StreamChunk { delta: text, done: false }).await;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        let _ = tx.send(StreamChunk { delta: String::new(), done: true }).await;
        Ok(())
    }

    fn list_models(&self) -> Vec<ModelInfo> {
        vec![
            ModelInfo {
                id: "claude-sonnet-4-20250514".to_string(),
                name: "Claude Sonnet 4".to_string(),
                provider: "anthropic".to_string(),
                max_tokens: 8192,
            },
        ]
    }
}
