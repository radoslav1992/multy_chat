use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use anyhow::Result;

use super::{Message, ModelInfo, Provider};

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

impl AnthropicProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            client: Client::new(),
        }
    }
}

#[async_trait]
impl Provider for AnthropicProvider {
    async fn chat(&self, messages: Vec<Message>, model: &str) -> Result<String> {
        // Extract system message if present
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

        let request = AnthropicRequest {
            model: model.to_string(),
            max_tokens: 4096,
            messages: chat_messages,
            system: system_message,
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

    fn list_models(&self) -> Vec<ModelInfo> {
        vec![
            ModelInfo {
                id: "claude-sonnet-4-20250514".to_string(),
                name: "Claude Sonnet 4".to_string(),
                provider: "anthropic".to_string(),
                max_tokens: 8192,
            },
            ModelInfo {
                id: "claude-3-5-sonnet-20241022".to_string(),
                name: "Claude 3.5 Sonnet".to_string(),
                provider: "anthropic".to_string(),
                max_tokens: 8192,
            },
            ModelInfo {
                id: "claude-3-opus-20240229".to_string(),
                name: "Claude 3 Opus".to_string(),
                provider: "anthropic".to_string(),
                max_tokens: 4096,
            },
            ModelInfo {
                id: "claude-3-5-haiku-20241022".to_string(),
                name: "Claude 3.5 Haiku".to_string(),
                provider: "anthropic".to_string(),
                max_tokens: 8192,
            },
        ]
    }
}
