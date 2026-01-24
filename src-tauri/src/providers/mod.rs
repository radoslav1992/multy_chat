mod anthropic;
mod openai;
mod gemini;
mod deepseek;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use anyhow::Result;

pub use anthropic::AnthropicProvider;
pub use openai::OpenAIProvider;
pub use gemini::GeminiProvider;
pub use deepseek::DeepSeekProvider;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub max_tokens: u32,
}

#[async_trait]
pub trait Provider: Send + Sync {
    async fn chat(&self, messages: Vec<Message>, model: &str) -> Result<String>;
    fn list_models(&self) -> Vec<ModelInfo>;
}

pub fn create_provider(provider_name: &str, api_key: &str) -> Result<Box<dyn Provider>> {
    match provider_name.to_lowercase().as_str() {
        "anthropic" => Ok(Box::new(AnthropicProvider::new(api_key.to_string()))),
        "openai" => Ok(Box::new(OpenAIProvider::new(api_key.to_string()))),
        "gemini" => Ok(Box::new(GeminiProvider::new(api_key.to_string()))),
        "deepseek" => Ok(Box::new(DeepSeekProvider::new(api_key.to_string()))),
        _ => Err(anyhow::anyhow!("Unknown provider: {}", provider_name)),
    }
}
