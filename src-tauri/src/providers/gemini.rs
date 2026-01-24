use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use anyhow::Result;

use super::{Message, ModelInfo, Provider};

pub struct GeminiProvider {
    api_key: String,
    client: Client,
}

#[derive(Serialize)]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system_instruction: Option<GeminiContent>,
}

#[derive(Serialize)]
struct GeminiContent {
    #[serde(skip_serializing_if = "Option::is_none")]
    role: Option<String>,
    parts: Vec<GeminiPart>,
}

#[derive(Serialize)]
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
}

#[async_trait]
impl Provider for GeminiProvider {
    async fn chat(&self, messages: Vec<Message>, model: &str) -> Result<String> {
        // Extract system message if present
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

        let request = GeminiRequest {
            contents,
            system_instruction,
        };

        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
            model, self.api_key
        );

        let response = self.client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow::anyhow!("Gemini API error: {}", error_text));
        }

        let result: GeminiResponse = response.json().await?;
        
        Ok(result.candidates
            .first()
            .and_then(|c| c.content.parts.first())
            .map(|p| p.text.clone())
            .unwrap_or_default())
    }

    fn list_models(&self) -> Vec<ModelInfo> {
        vec![
            ModelInfo {
                id: "gemini-2.0-flash-exp".to_string(),
                name: "Gemini 2.0 Flash".to_string(),
                provider: "gemini".to_string(),
                max_tokens: 8192,
            },
            ModelInfo {
                id: "gemini-1.5-pro".to_string(),
                name: "Gemini 1.5 Pro".to_string(),
                provider: "gemini".to_string(),
                max_tokens: 8192,
            },
            ModelInfo {
                id: "gemini-1.5-flash".to_string(),
                name: "Gemini 1.5 Flash".to_string(),
                provider: "gemini".to_string(),
                max_tokens: 8192,
            },
        ]
    }
}
