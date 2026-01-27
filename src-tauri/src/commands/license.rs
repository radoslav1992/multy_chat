use serde::{Deserialize, Serialize};

const LEMON_SQUEEZY_ACTIVATE_URL: &str = "https://api.lemonsqueezy.com/v1/licenses/activate";
const LEMON_SQUEEZY_DEACTIVATE_URL: &str = "https://api.lemonsqueezy.com/v1/licenses/deactivate";
const OMNICHAT_PRODUCT_ID: u64 = 795978;

#[derive(Debug, Serialize)]
struct ActivateRequest {
    license_key: String,
    instance_name: String,
}

#[derive(Debug, Serialize)]
struct DeactivateRequest {
    license_key: String,
    instance_id: String,
}

#[derive(Debug, Deserialize)]
struct LemonSqueezyMeta {
    product_id: Option<u64>,
    activation_limit_reached: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct LemonSqueezyLicenseKey {
    status: Option<String>,
    product_id: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct LemonSqueezyInstance {
    id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LemonSqueezyResponse {
    activated: Option<bool>,
    deactivated: Option<bool>,
    error: Option<String>,
    license_key: Option<LemonSqueezyLicenseKey>,
    instance: Option<LemonSqueezyInstance>,
    meta: Option<LemonSqueezyMeta>,
}

#[derive(Debug, Serialize)]
pub struct LicenseResult {
    pub success: bool,
    pub message: String,
    pub instance_id: Option<String>,
}

#[tauri::command]
pub async fn activate_license(license_key: String, instance_name: String) -> Result<LicenseResult, String> {
    let client = reqwest::Client::new();
    
    let request = ActivateRequest {
        license_key: license_key.trim().to_string(),
        instance_name,
    };
    
    let response = client
        .post(LEMON_SQUEEZY_ACTIVATE_URL)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;
    
    let data: LemonSqueezyResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;
    
    // Check if activation was successful
    if data.activated == Some(true) || data.license_key.as_ref().map(|k| k.status.as_deref()) == Some(Some("active")) {
        // Verify this license belongs to OmniChat product
        let product_id = data.meta.as_ref().and_then(|m| m.product_id)
            .or_else(|| data.license_key.as_ref().and_then(|k| k.product_id));
        
        if let Some(pid) = product_id {
            if pid != OMNICHAT_PRODUCT_ID {
                return Ok(LicenseResult {
                    success: false,
                    message: "This license key is not valid for OmniChat.".to_string(),
                    instance_id: None,
                });
            }
        }
        
        let instance_id = data.instance.and_then(|i| i.id);
        
        return Ok(LicenseResult {
            success: true,
            message: "License activated successfully!".to_string(),
            instance_id,
        });
    }
    
    // Handle error cases
    let error_message = if let Some(err) = data.error {
        err
    } else if let Some(ref license_key) = data.license_key {
        match license_key.status.as_deref() {
            Some("inactive") => "This license key is inactive.".to_string(),
            Some("expired") => "This license key has expired.".to_string(),
            Some("disabled") => "This license key has been disabled.".to_string(),
            _ => "Invalid license key.".to_string(),
        }
    } else if data.meta.as_ref().and_then(|m| m.activation_limit_reached) == Some(true) {
        "Activation limit reached. Deactivate another device first.".to_string()
    } else {
        "Invalid license key.".to_string()
    };
    
    Ok(LicenseResult {
        success: false,
        message: error_message,
        instance_id: None,
    })
}

#[tauri::command]
pub async fn deactivate_license(license_key: String, instance_id: String) -> Result<LicenseResult, String> {
    let client = reqwest::Client::new();
    
    let request = DeactivateRequest {
        license_key: license_key.trim().to_string(),
        instance_id,
    };
    
    let response = client
        .post(LEMON_SQUEEZY_DEACTIVATE_URL)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;
    
    let data: LemonSqueezyResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;
    
    if data.deactivated == Some(true) {
        return Ok(LicenseResult {
            success: true,
            message: "License deactivated. You can activate on another device.".to_string(),
            instance_id: None,
        });
    }
    
    let error_message = data.error.unwrap_or_else(|| "Failed to deactivate license.".to_string());
    
    Ok(LicenseResult {
        success: false,
        message: error_message,
        instance_id: None,
    })
}
