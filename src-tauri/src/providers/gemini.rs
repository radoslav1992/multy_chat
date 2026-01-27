use async_trait::async_trait;
use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use anyhow::Result;
use tokio::sync::mpsc;

use super::{Message, ModelInfo, Provider, StreamChunk};

pub struct GeminiProvider {
    api_key: String,
    client: Client,
}

#[derive(Serialize, Clone)]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system_instruction: Option<GeminiContent>,
}

#[derive(Serialize, Clone)]
struct GeminiContent {
    #[serde(skip_serializing_if = "Option::is_none")]
    role: Option<String>,
    parts: Vec<GeminiPart>,
}

#[derive(Serialize, Clone)]
struct GeminiPart {
    text: String,
}

#[derive(Deserialize)]
struct GeminiResponse {
    candidates: Vec<Candidate>,
}

#[derive(Deserialize)]
struct Candidate {
    content: CandidateContent,
}

#[derive(Deserialize)]
struct CandidateContent {
    parts: Vec<ResponsePart>,
}

#[derive(Deserialize)]
struct ResponsePart {
    text: String,
}

impl GeminiProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            client: Client::new(),
        }
    }

    fn prepare_messages(&self, messages: Vec<Message>) -> (Option<GeminiContent>, Vec<GeminiContent>) {
        let mut system_instruction: Option<GeminiContent> = None;
        let mut contents: Vec<GeminiContent> = Vec::new();
        
        for msg in messages {
            if msg.role == "system" {
                system_instruction = Some(GeminiContent {
                    role: None,
                    parts: vec![GeminiPart { text: msg.content }],
                });
            } else {
                let role = if msg.role == "assistant" { "model" } else { "user" };
                contents.push(GeminiContent {
                    role: Some(role.to_string()),
                    parts: vec![GeminiPart { text: msg.content }],
                });
            }
        }

        (system_instruction, contents)
    }

    fn build_url(&self, version: &str, model: &str, action: &str, extra_query: Option<&str>) -> String {
        let mut url = format!(
            "https://generativelanguage.googleapis.com/{}/models/{}:{}?key={}",
            version, model, action, self.api_key
        );
        if let Some(extra) = extra_query {
            url.push('&');
            url.push_str(extra);
        }
        url
    }

    async fn post_request(
        &self,
        request: &GeminiRequest,
        model: &str,
        action: &str,
        stream: bool,
    ) -> Result<reqwest::Response> {
        // Always use v1beta as it supports system_instruction and newer models
        let url = self.build_url("v1beta", model, action, if stream { Some("alt=sse") } else { None });
        println!("[GEMINI] POST request to: {}", url.split("?key=").next().unwrap_or(&url));

        let response = self.client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(request)
            .send()
            .await?;

        println!("[GEMINI] Response status: {}", response.status());

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow::anyhow!("Gemini API error: {}", error_text));
        }

        Ok(response)
    }
}

#[async_trait]
impl Provider for GeminiProvider {
    async fn chat(&self, messages: Vec<Message>, model: &str) -> Result<String> {
        let (system_instruction, contents) = self.prepare_messages(messages);

        let request = GeminiRequest {
            contents,
            system_instruction,
        };

        let response = self.post_request(&request, model, "generateContent", false).await?;

        let result: GeminiResponse = response.json().await?;
        
        Ok(result.candidates
            .first()
            .and_then(|c| c.content.parts.first())
            .map(|p| p.text.clone())
            .unwrap_or_default())
    }

    async fn chat_stream(
        &self,
        messages: Vec<Message>,
        model: &str,
        tx: mpsc::Sender<StreamChunk>,
    ) -> Result<()> {
        let (system_instruction, contents) = self.prepare_messages(messages);

        let request = GeminiRequest {
            contents,
            system_instruction,
        };
        let response = self.post_request(&request, model, "streamGenerateContent", true).await?;

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();

        while let Some(chunk_result) = stream.next().await {
            let chunk = chunk_result?;
            buffer.push_str(&String::from_utf8_lossy(&chunk));

            // Process complete SSE events (separated by double newlines)
            while let Some(pos) = buffer.find("\n\n") {
                let event_str = buffer[..pos].to_string();
                buffer = buffer[pos + 2..].to_string();

                // Parse SSE data line
                for line in event_str.lines() {
                    if let Some(data) = line.strip_prefix("data: ") {
                        let data = data.trim();
                        if data.is_empty() {
                            continue;
                        }

                        // Parse Gemini JSON response
                        if let Ok(response) = serde_json::from_str::<GeminiResponse>(data) {
                            if let Some(candidate) = response.candidates.first() {
                                if let Some(part) = candidate.content.parts.first() {
                                    if !part.text.is_empty() {
                                        let _ = tx.send(StreamChunk { 
                                            delta: part.text.clone(), 
                                            done: false 
                                        }).await;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Process any remaining data in buffer
        for line in buffer.lines() {
            if let Some(data) = line.strip_prefix("data: ") {
                let data = data.trim();
                if let Ok(response) = serde_json::from_str::<GeminiResponse>(data) {
                    if let Some(candidate) = response.candidates.first() {
                        if let Some(part) = candidate.content.parts.first() {
                            if !part.text.is_empty() {
                                let _ = tx.send(StreamChunk { 
                                    delta: part.text.clone(), 
                                    done: false 
                                }).await;
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
                id: "gemini-2.0-flash-exp".to_string(),
                name: "Gemini 2.0 Flash".to_string(),
                provider: "gemini".to_string(),
                max_tokens: 8192,
            },
        ]
    }
}
