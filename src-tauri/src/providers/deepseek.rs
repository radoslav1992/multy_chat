use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use anyhow::Result;

use super::{Message, ModelInfo, Provider};

pub struct DeepSeekProvider {
    api_key: String,
    client: Client,
}

#[derive(Serialize)]
struct DeepSeekRequest {
    model: String,
    messages: Vec<DeepSeekMessage>,
    max_tokens: u32,
}

#[derive(Serialize)]
struct DeepSeekMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct DeepSeekResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: ResponseMessage,
}

#[derive(Deserialize)]
struct ResponseMessage {
    content: String,
}

impl DeepSeekProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            client: Client::new(),
        }
    }
}

#[async_trait]
impl Provider for DeepSeekProvider {
    async fn chat(&self, messages: Vec<Message>, model: &str) -> Result<String> {
        let deepseek_messages: Vec<DeepSeekMessage> = messages
            .into_iter()
            .map(|m| DeepSeekMessage {
                role: m.role,
                content: m.content,
            })
            .collect();

        let request = DeepSeekRequest {
            model: model.to_string(),
            messages: deepseek_messages,
            max_tokens: 4096,
        };

        let response = self.client
            .post("https://api.deepseek.com/chat/completions")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow::anyhow!("DeepSeek API error: {}", error_text));
        }

        let result: DeepSeekResponse = response.json().await?;
        
        Ok(result.choices
            .first()
            .map(|c| c.message.content.clone())
            .unwrap_or_default())
    }

    fn list_models(&self) -> Vec<ModelInfo> {
        vec![
            ModelInfo {
                id: "deepseek-chat".to_string(),
                name: "DeepSeek Chat".to_string(),
                provider: "deepseek".to_string(),
                max_tokens: 4096,
            },
            ModelInfo {
                id: "deepseek-coder".to_string(),
                name: "DeepSeek Coder".to_string(),
                provider: "deepseek".to_string(),
                max_tokens: 4096,
            },
            ModelInfo {
                id: "deepseek-reasoner".to_string(),
                name: "DeepSeek Reasoner".to_string(),
                provider: "deepseek".to_string(),
                max_tokens: 8192,
            },
        ]
    }
}
