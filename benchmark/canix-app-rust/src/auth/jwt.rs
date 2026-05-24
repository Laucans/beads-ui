use anyhow::Result;
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub role: String,
    pub exp: usize,
}

pub fn generate_token(user_id: &str, role: &str, secret: &str) -> Result<String> {
    let claims = Claims {
        sub: user_id.to_string(),
        role: role.to_string(),
        exp: (chrono::Utc::now() + chrono::Duration::hours(24)).timestamp() as usize,
    };
    let header = Header::new(Algorithm::HS256);
    let encoding_key = EncodingKey::from_secret(secret.as_bytes());
    encode(&header, &claims, &encoding_key).map_err(|e| anyhow::anyhow!(e.to_string()))
}

pub fn validate_token(token: &str, secret: &str) -> Result<Claims> {
    let decoding_key = DecodingKey::from_secret(secret.as_bytes());
    let validation = Validation::new(Algorithm::HS256);
    let decoded = decode::<Claims>(token, &decoding_key, &validation).map_err(|e| {
        anyhow::anyhow!(match e.kind() {
            jsonwebtoken::errors::ErrorKind::InvalidToken => "Invalid token",
            jsonwebtoken::errors::ErrorKind::InvalidSignature => "Invalid signature",
            jsonwebtoken::errors::ErrorKind::MissingRequiredClaim(_) => "Missing claim",
            _ => "token error",
        })
    })?;
    Ok(decoded.claims)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &str = "test-secret-key-for-jwt-validation-123";

    #[test]
    fn test_generate_and_validate() {
        let token = generate_token("user123", "admin", SECRET).unwrap();
        let claims = validate_token(&token, SECRET).unwrap();
        assert_eq!(claims.sub, "user123");
        assert_eq!(claims.role, "admin");
    }

    #[test]
    fn test_invalid_token_errors() {
        let result = validate_token("garbage.token.here", SECRET);
        assert!(result.is_err());
    }

    #[test]
    fn test_wrong_secret_errors() {
        let token = generate_token("user123", "admin", SECRET).unwrap();
        let result = validate_token(&token, "wrong-secret");
        assert!(result.is_err());
    }

    #[test]
    fn test_role_preserved() {
        let token = generate_token("user456", "employee", SECRET).unwrap();
        let claims = validate_token(&token, SECRET).unwrap();
        assert_eq!(claims.role, "employee");
    }
}
