use async_trait::async_trait;
use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use anyhow::Result;
use tokio::sync::mpsc;

use super::{Message, ModelInfo, Provider, StreamChunk};

pub struct OpenAIProvider {
    api_key: String,
    client: Client,
}

#[derive(Serialize)]
struct OpenAIRequest {
    model: String,
    messages: Vec<OpenAIMessage>,
    max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
}

#[derive(Serialize)]
struct OpenAIMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct OpenAIResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: Option<ResponseMessage>,
    delta: Option<DeltaMessage>,
}

#[derive(Deserialize)]
struct ResponseMessage {
    content: String,
}

#[derive(Deserialize)]
struct DeltaMessage {
    content: Option<String>,
}

impl OpenAIProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            client: Client::new(),
        }
    }

    fn prepare_messages(&self, messages: Vec<Message>) -> Vec<OpenAIMessage> {
        messages
            .into_iter()
            .map(|m| OpenAIMessage {
                role: m.role,
                content: m.content,
            })
            .collect()
    }
}

#[async_trait]
impl Provider for OpenAIProvider {
    async fn chat(&self, messages: Vec<Message>, model: &str) -> Result<String> {
        let openai_messages = self.prepare_messages(messages);

        let request = OpenAIRequest {
            model: model.to_string(),
            messages: openai_messages,
            max_tokens: 4096,
            stream: None,
        };

        let response = self.client
            .post("https://api.openai.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow::anyhow!("OpenAI API error: {}", error_text));
        }

        let result: OpenAIResponse = response.json().await?;
        
        Ok(result.choices
            .first()
            .and_then(|c| c.message.as_ref())
            .map(|m| m.content.clone())
            .unwrap_or_default())
    }

    async fn chat_stream(
        &self,
        messages: Vec<Message>,
        model: &str,
        tx: mpsc::Sender<StreamChunk>,
    ) -> Result<()> {
        let openai_messages = self.prepare_messages(messages);

        let request = OpenAIRequest {
            model: model.to_string(),
            messages: openai_messages,
            max_tokens: 4096,
            stream: Some(true),
        };

        let response = self.client
            .post("https://api.openai.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow::anyhow!("OpenAI API error: {}", error_text));
        }

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();

        while let Some(chunk_result) = stream.next().await {
            let chunk = chunk_result?;
            buffer.push_str(&String::from_utf8_lossy(&chunk));

            while let Some(pos) = buffer.find("\n\n") {
                let event_str = buffer[..pos].to_string();
                buffer = buffer[pos + 2..].to_string();

                for line in event_str.lines() {
                    if let Some(data) = line.strip_prefix("data: ") {
                        if data == "[DONE]" {
                            let _ = tx.send(StreamChunk { delta: String::new(), done: true }).await;
                            return Ok(());
                        }

                        if let Ok(response) = serde_json::from_str::<OpenAIResponse>(data) {
                            if let Some(choice) = response.choices.first() {
                                if let Some(delta) = &choice.delta {
                                    if let Some(content) = &delta.content {
                                        let _ = tx.send(StreamChunk { delta: content.clone(), done: false }).await;
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
                id: "gpt-4o".to_string(),
                name: "GPT-4o".to_string(),
                provider: "openai".to_string(),
                max_tokens: 4096,
            },
        ]
    }
}
