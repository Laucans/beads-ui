use axum::{
    extract::{Request, State},
    body::Body,
    middleware::Next,
    response::Response,
};
use crate::auth::jwt::{Claims, validate_token};
use crate::errors::AppError;

#[derive(Clone)]
pub struct AppState {
    pub jwt_secret: String,
    pub pool: sqlx::SqlitePool,
}

pub async fn auth_middleware(
    State(state): State<AppState>,
    mut req: Request<Body>,
    next: Next,
) -> Result<Response, AppError> {
    let auth_header = req.headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::Unauthorized)?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or_else(|| AppError::Unauthorized)?;

    let claims = validate_token(token, &state.jwt_secret)
        .map_err(|_| AppError::Unauthorized)?;

    req.extensions_mut().insert(claims);
    Ok(next.run(req).await)
}

pub fn require_role(allowed: &'static str) -> impl Fn(Claims) -> Result<(), AppError> + Clone {
    move |claims: Claims| {
        if claims.role == allowed || claims.role == "admin" {
            Ok(())
        } else {
            Err(AppError::Forbidden)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_require_role_admin_always_passes() {
        let claims = Claims { sub: "u".into(), role: "admin".into(), exp: 9999999999 };
        assert!(require_role("user")(claims).is_ok());
    }

    #[test]
    fn test_require_role_exact_match() {
        let claims = Claims { sub: "u".into(), role: "employee".into(), exp: 9999999999 };
        assert!(require_role("employee")(claims).is_ok());
    }

    #[test]
    fn test_require_role_wrong_role_forbidden() {
        let claims = Claims { sub: "u".into(), role: "guest".into(), exp: 9999999999 };
        assert!(matches!(require_role("user")(claims), Err(AppError::Forbidden)));
    }
}
