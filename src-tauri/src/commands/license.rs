use serde::{Deserialize, Serialize};

const LEMON_SQUEEZY_ACTIVATE_URL: &str = "https://api.lemonsqueezy.com/v1/licenses/activate";
const LEMON_SQUEEZY_DEACTIVATE_URL: &str = "https://api.lemonsqueezy.com/v1/licenses/deactivate";
const OMNICHAT_PRODUCT_ID: u64 = 795978;
const GUMROAD_VERIFY_URL: &str = "https://api.gumroad.com/v2/licenses/verify";
const GUMROAD_PRODUCT_ID: &str = ""; // TODO: set Gumroad product ID.
const GUMROAD_INSTANCE_PREFIX: &str = "gumroad:";

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
struct GumroadVerifyRequest {
    product_id: String,
    license_key: String,
    increment_uses_count: Option<bool>,
    decrement_uses_count: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct GumroadPurchase {
    refunded: Option<bool>,
    chargebacked: Option<bool>,
    disputed: Option<bool>,
    subscription_cancelled_at: Option<String>,
    subscription_ended_at: Option<String>,
    subscription_failed_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GumroadVerifyResponse {
    success: bool,
    message: Option<String>,
    purchase: Option<GumroadPurchase>,
}

#[derive(Debug, Serialize)]
pub struct LicenseResult {
    pub success: bool,
    pub message: String,
    pub instance_id: Option<String>,
}

fn gumroad_product_configured() -> bool {
    !GUMROAD_PRODUCT_ID.trim().is_empty()
}

fn gumroad_instance_id(instance_name: &str) -> String {
    format!("{}{}", GUMROAD_INSTANCE_PREFIX, instance_name.trim())
}

fn is_gumroad_instance(instance_id: &str) -> bool {
    instance_id.trim_start().starts_with(GUMROAD_INSTANCE_PREFIX)
}

fn should_prefer_gumroad_failure(lemon_message: &str) -> bool {
    let message = lemon_message.to_lowercase();
    message.contains("invalid license key") || message.contains("not valid for omnichat")
}

fn gumroad_purchase_invalid_message(purchase: &GumroadPurchase) -> Option<String> {
    if purchase.refunded == Some(true) {
        return Some("This Gumroad license has been refunded.".to_string());
    }
    if purchase.chargebacked == Some(true) {
        return Some("This Gumroad license was chargebacked.".to_string());
    }
    if purchase.disputed == Some(true) {
        return Some("This Gumroad license is disputed.".to_string());
    }
    if purchase.subscription_ended_at.is_some() {
        return Some("This Gumroad subscription has ended.".to_string());
    }
    if purchase.subscription_cancelled_at.is_some() {
        return Some("This Gumroad subscription was cancelled.".to_string());
    }
    if purchase.subscription_failed_at.is_some() {
        return Some("This Gumroad subscription payment failed.".to_string());
    }
    None
}

async fn activate_lemon_squeezy(
    client: &reqwest::Client,
    license_key: &str,
    instance_name: &str,
) -> Result<LicenseResult, String> {
    let request = ActivateRequest {
        license_key: license_key.trim().to_string(),
        instance_name: instance_name.to_string(),
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

    if data.activated == Some(true)
        || data.license_key.as_ref().map(|k| k.status.as_deref()) == Some(Some("active"))
    {
        let product_id = data
            .meta
            .as_ref()
            .and_then(|m| m.product_id)
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

async fn deactivate_lemon_squeezy(
    client: &reqwest::Client,
    license_key: &str,
    instance_id: &str,
) -> Result<LicenseResult, String> {
    let request = DeactivateRequest {
        license_key: license_key.trim().to_string(),
        instance_id: instance_id.to_string(),
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

    let error_message = data
        .error
        .unwrap_or_else(|| "Failed to deactivate license.".to_string());

    Ok(LicenseResult {
        success: false,
        message: error_message,
        instance_id: None,
    })
}

async fn activate_gumroad(
    client: &reqwest::Client,
    license_key: &str,
    instance_name: &str,
) -> Result<LicenseResult, String> {
    let request = GumroadVerifyRequest {
        product_id: GUMROAD_PRODUCT_ID.trim().to_string(),
        license_key: license_key.trim().to_string(),
        increment_uses_count: Some(true),
        decrement_uses_count: None,
    };

    let response = client
        .post(GUMROAD_VERIFY_URL)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    let data: GumroadVerifyResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    if data.success {
        if let Some(ref purchase) = data.purchase {
            if let Some(message) = gumroad_purchase_invalid_message(purchase) {
                let _ = deactivate_gumroad(client, license_key).await;
                return Ok(LicenseResult {
                    success: false,
                    message,
                    instance_id: None,
                });
            }
        }

        return Ok(LicenseResult {
            success: true,
            message: "License activated successfully!".to_string(),
            instance_id: Some(gumroad_instance_id(instance_name)),
        });
    }

    let error_message = data
        .message
        .unwrap_or_else(|| "Invalid license key.".to_string());

    Ok(LicenseResult {
        success: false,
        message: error_message,
        instance_id: None,
    })
}

async fn deactivate_gumroad(
    client: &reqwest::Client,
    license_key: &str,
) -> Result<LicenseResult, String> {
    let request = GumroadVerifyRequest {
        product_id: GUMROAD_PRODUCT_ID.trim().to_string(),
        license_key: license_key.trim().to_string(),
        increment_uses_count: None,
        decrement_uses_count: Some(true),
    };

    let response = client
        .post(GUMROAD_VERIFY_URL)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    let data: GumroadVerifyResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    if data.success {
        return Ok(LicenseResult {
            success: true,
            message: "License deactivated. You can activate on another device.".to_string(),
            instance_id: None,
        });
    }

    let error_message = data
        .message
        .unwrap_or_else(|| "Failed to deactivate license.".to_string());

    Ok(LicenseResult {
        success: false,
        message: error_message,
        instance_id: None,
    })
}

#[tauri::command]
pub async fn activate_license(license_key: String, instance_name: String) -> Result<LicenseResult, String> {
    let client = reqwest::Client::new();

    let lemon_result = activate_lemon_squeezy(&client, &license_key, &instance_name).await;
    match lemon_result {
        Ok(result) => {
            if result.success {
                return Ok(result);
            }

            if gumroad_product_configured() {
                if let Ok(gumroad_result) =
                    activate_gumroad(&client, &license_key, &instance_name).await
                {
                    if gumroad_result.success {
                        return Ok(gumroad_result);
                    }
                    if should_prefer_gumroad_failure(&result.message) {
                        return Ok(gumroad_result);
                    }
                }
            }

            Ok(result)
        }
        Err(lemon_error) => {
            if gumroad_product_configured() {
                if let Ok(gumroad_result) =
                    activate_gumroad(&client, &license_key, &instance_name).await
                {
                    if gumroad_result.success {
                        return Ok(gumroad_result);
                    }
                }
            }

            Err(lemon_error)
        }
    }
}

#[tauri::command]
pub async fn deactivate_license(license_key: String, instance_id: String) -> Result<LicenseResult, String> {
    let client = reqwest::Client::new();

    if is_gumroad_instance(&instance_id) {
        if !gumroad_product_configured() {
            return Ok(LicenseResult {
                success: false,
                message: "Gumroad product ID is not configured.".to_string(),
                instance_id: None,
            });
        }
        return deactivate_gumroad(&client, &license_key).await;
    }

    deactivate_lemon_squeezy(&client, &license_key, &instance_id).await
}
