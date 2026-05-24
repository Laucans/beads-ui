use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
    Router,
};
use axum::routing::post;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    auth::{jwt::{Claims, generate_token}, password::{hash_password, verify_password}},
    errors::AppError,
    models::User,
    AppState,
};

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
    pub role: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct UserDto {
    pub id: String,
    pub email: String,
    pub role: String,
}

impl From<User> for UserDto {
    fn from(user: User) -> Self {
        Self {
            id: user.id,
            email: user.email,
            role: user.role,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: UserDto,
}

pub async fn login(
    State(state): State<AppState>,
    Json(request): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    let user: User = sqlx::query_as::<_, User>(
        "SELECT id, email, password_hash, role, created_at FROM users WHERE email = ?",
    )
    .bind(&request.email)
    .fetch_one(&state.pool)
    .await
    .map_err(|_| AppError::Unauthorized)?;

    let is_valid = verify_password(&request.password, &user.password_hash)
        .map_err(AppError::from)?;

    if !is_valid {
        return Err(AppError::Unauthorized);
    }

    let token = generate_token(&user.id, &user.role, &state.jwt_secret)
        .map_err(AppError::from)?;

    Ok(Json(AuthResponse {
        token,
        user: UserDto::from(user),
    }))
}

pub async fn register(
    State(state): State<AppState>,
    Json(request): Json<RegisterRequest>,
) -> Result<(StatusCode, Json<AuthResponse>), AppError> {
    if request.email.is_empty() {
        return Err(AppError::BadRequest("Email cannot be empty".to_string()));
    }

    if request.password.len() < 6 {
        return Err(AppError::BadRequest(
            "Password must be at least 6 characters".to_string(),
        ));
    }

    let role = request.role.unwrap_or_else(|| "client".to_string());

    let existing_user: Option<User> = sqlx::query_as::< _, User>(
        "SELECT id, email, password_hash, role, created_at FROM users WHERE email = ?",
    )
    .bind(&request.email)
    .fetch_optional(&state.pool)
    .await
    .map_err(|_| AppError::BadRequest("Database error".to_string()))?;

    if existing_user.is_some() {
        return Err(AppError::BadRequest("Email already registered".to_string()));
    }

    let user_id = Uuid::new_v4().to_string();
    let password_hash = hash_password(&request.password).map_err(AppError::from)?;

    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&user_id)
    .bind(&request.email)
    .bind(&password_hash)
    .bind(&role)
    .bind(&now)
    .execute(&state.pool)
    .await
    .map_err(|_| AppError::BadRequest("Failed to create user".to_string()))?;

    let user = User {
        id: user_id,
        email: request.email,
        password_hash,
        role,
        created_at: now,
    };

    let token = generate_token(&user.id, &user.role, &state.jwt_secret)
        .map_err(AppError::from)?;

    Ok((
        StatusCode::CREATED,
        Json(AuthResponse {
            token,
            user: UserDto::from(user),
        }),
    ))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/login", post(login))
        .route("/register", post(register))
}
