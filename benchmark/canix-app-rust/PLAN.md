# Canix App Rust — Implementation Plan

**Repo**: /Users/laurentcanis/gastown/beads_ui/crew/local_qwen
**Branch**: feat/canix-rust
**Dir**: benchmark/canix-app-rust/

Each section is one agent session. Grep the section, implement, cargo check loop, cargo test loop, commit, done.

---

## _1_: Cargo.toml

Create `benchmark/canix-app-rust/Cargo.toml` with exact content:

```toml
[package]
name = "canix-app"
version = "0.1.0"
edition = "2021"

[[bin]]
name = "canix-app"
path = "src/main.rs"

[dependencies]
axum = { version = "0.7", features = ["macros"] }
tokio = { version = "1", features = ["full"] }
sqlx = { version = "0.7", features = ["sqlite", "runtime-tokio-native-tls", "macros"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
jsonwebtoken = "9"
bcrypt = "0.15"
dotenv = "0.15"
tower = "0.4"
tower-http = { version = "0.5", features = ["cors", "fs"] }
uuid = { version = "1", features = ["v4"] }
chrono = { version = "0.4", features = ["serde"] }
anyhow = "1"
thiserror = "1"

[dev-dependencies]
axum-test = "15"
```

Also create `benchmark/canix-app-rust/src/main.rs` with minimal stub so cargo check does not complain about missing bin:

```rust
fn main() {}
```

Cargo check command: `cargo check --message-format=short 2>&1 | grep -v "^warning" | head -20`
Expected: 0 errors (warnings about unused are fine).
Commit: `feat(init): Cargo.toml + stub main`

---

## _2_: src/errors.rs

Create `benchmark/canix-app-rust/src/errors.rs`:

```rust
use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("not found: {0}")]
    NotFound(String),
    #[error("unauthorized")]
    Unauthorized,
    #[error("forbidden")]
    Forbidden,
    #[error("bad request: {0}")]
    BadRequest(String),
    #[error("internal: {0}")]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, msg) = match &self {
            AppError::NotFound(m) => (StatusCode::NOT_FOUND, m.clone()),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized".into()),
            AppError::Forbidden => (StatusCode::FORBIDDEN, "forbidden".into()),
            AppError::BadRequest(m) => (StatusCode::BAD_REQUEST, m.clone()),
            AppError::Internal(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
        };
        (status, Json(json!({ "error": msg }))).into_response()
    }
}
```

Update `src/main.rs` to declare the module:
```rust
mod errors;
fn main() {}
```

Test in `src/errors.rs` at the bottom:
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use axum::response::IntoResponse;

    #[test]
    fn test_not_found_status() {
        let err = AppError::NotFound("user".into());
        let resp = err.into_response();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }

    #[test]
    fn test_unauthorized_status() {
        let resp = AppError::Unauthorized.into_response();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[test]
    fn test_bad_request_status() {
        let resp = AppError::BadRequest("invalid email".into()).into_response();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }
}
```

Commit: `feat(errors): AppError enum IntoResponse + tests`

---

## _3_: src/models/mod.rs

Create `benchmark/canix-app-rust/src/models/mod.rs` with all domain structs:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: String,
    pub email: String,
    pub password_hash: String,
    pub role: String, // "admin" | "employee" | "client"
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Client {
    pub id: String,
    pub name: String,
    pub email: String,
    pub phone: Option<String>,
    pub company: Option<String>,
    pub assigned_to: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Quote {
    pub id: String,
    pub client_id: String,
    pub created_by: String,
    pub status: String, // "draft" | "sent" | "approved" | "rejected"
    pub total: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct QuoteItem {
    pub id: String,
    pub quote_id: String,
    pub description: String,
    pub quantity: i64,
    pub unit_price: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Ticket {
    pub id: String,
    pub client_id: String,
    pub assigned_to: Option<String>,
    pub title: String,
    pub description: String,
    pub status: String, // "open" | "in_progress" | "resolved"
    pub priority: String, // "low" | "medium" | "high"
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct TicketMessage {
    pub id: String,
    pub ticket_id: String,
    pub author_id: String,
    pub message: String,
    pub created_at: String,
}
```

Update `src/main.rs`:
```rust
mod errors;
mod models;
fn main() {}
```

Test in `src/models/mod.rs`:
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_user_serialize() {
        let u = User {
            id: "1".into(), email: "a@b.com".into(),
            password_hash: "h".into(), role: "admin".into(),
            created_at: "2024-01-01".into(),
        };
        let j = serde_json::to_string(&u).unwrap();
        assert!(j.contains("a@b.com"));
    }

    #[test]
    fn test_quote_default_status() {
        let q = Quote {
            id: "1".into(), client_id: "c1".into(), created_by: "u1".into(),
            status: "draft".into(), total: 0.0,
            created_at: "2024-01-01".into(), updated_at: "2024-01-01".into(),
        };
        assert_eq!(q.status, "draft");
    }
}
```

Commit: `feat(models): domain structs User Client Quote QuoteItem Ticket TicketMessage + tests`

---

## _4_: src/db/mod.rs — migrations + seed

Create `benchmark/canix-app-rust/src/db/mod.rs`:

```rust
use anyhow::Result;
use sqlx::SqlitePool;
use uuid::Uuid;
use chrono::Utc;

pub async fn run_migrations(pool: &SqlitePool) -> Result<()> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin','employee','client')),
            created_at TEXT NOT NULL
        )"
    ).execute(pool).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS clients (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT,
            company TEXT,
            assigned_to TEXT REFERENCES users(id),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )"
    ).execute(pool).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS quotes (
            id TEXT PRIMARY KEY,
            client_id TEXT NOT NULL REFERENCES clients(id),
            created_by TEXT NOT NULL REFERENCES users(id),
            status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','approved','rejected')),
            total REAL NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )"
    ).execute(pool).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS quote_items (
            id TEXT PRIMARY KEY,
            quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
            description TEXT NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 1,
            unit_price REAL NOT NULL DEFAULT 0
        )"
    ).execute(pool).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS tickets (
            id TEXT PRIMARY KEY,
            client_id TEXT NOT NULL REFERENCES clients(id),
            assigned_to TEXT REFERENCES users(id),
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved')),
            priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )"
    ).execute(pool).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS ticket_messages (
            id TEXT PRIMARY KEY,
            ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
            author_id TEXT NOT NULL REFERENCES users(id),
            message TEXT NOT NULL,
            created_at TEXT NOT NULL
        )"
    ).execute(pool).await?;

    Ok(())
}

pub async fn seed(pool: &SqlitePool) -> Result<()> {
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
        .fetch_one(pool).await?;
    if count.0 > 0 { return Ok(()); }

    let now = Utc::now().to_rfc3339();
    // admin password: admin123 — bcrypt hash pre-computed
    let admin_hash = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HS0iU0a";
    sqlx::query(
        "INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?,?,?,?,?)"
    ).bind(Uuid::new_v4().to_string()).bind("admin@canix.com")
     .bind(admin_hash).bind("admin").bind(&now)
     .execute(pool).await?;

    for i in 1..=2 {
        let emp_hash = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HS0iU0a";
        sqlx::query(
            "INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?,?,?,?,?)"
        ).bind(Uuid::new_v4().to_string())
         .bind(format!("employee{}@canix.com", i))
         .bind(emp_hash).bind("employee").bind(&now)
         .execute(pool).await?;
    }
    Ok(())
}
```

Update `src/main.rs`:
```rust
mod db;
mod errors;
mod models;
fn main() {}
```

Test in `src/db/mod.rs`:
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::SqlitePool;

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        run_migrations(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn test_migrations_create_tables() {
        let pool = test_pool().await;
        let row: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('users','clients','quotes','tickets')"
        ).fetch_one(&pool).await.unwrap();
        assert_eq!(row.0, 4);
    }

    #[tokio::test]
    async fn test_seed_creates_admin() {
        let pool = test_pool().await;
        seed(&pool).await.unwrap();
        let row: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users WHERE role='admin'")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(row.0, 1);
    }

    #[tokio::test]
    async fn test_seed_idempotent() {
        let pool = test_pool().await;
        seed(&pool).await.unwrap();
        seed(&pool).await.unwrap();
        let row: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
            .fetch_one(&pool).await.unwrap();
        assert_eq!(row.0, 3); // admin + 2 employees
    }
}
```

Commit: `feat(db): migrations all tables + seed admin employees + tests`

---

## _5_: src/auth/password.rs — hash_password + verify_password

Create `benchmark/canix-app-rust/src/auth/mod.rs` (empty, just declares submodules):
```rust
pub mod password;
pub mod jwt;
pub mod middleware;
```

Create `benchmark/canix-app-rust/src/auth/password.rs`:

```rust
use anyhow::Result;

pub fn hash_password(password: &str) -> Result<String> {
    let hash = bcrypt::hash(password, bcrypt::DEFAULT_COST)?;
    Ok(hash)
}

pub fn verify_password(password: &str, hash: &str) -> Result<bool> {
    let valid = bcrypt::verify(password, hash)?;
    Ok(valid)
}
```

Update `src/main.rs`:
```rust
mod auth;
mod db;
mod errors;
mod models;
fn main() {}
```

Test in `src/auth/password.rs`:
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_and_verify_correct_password() {
        let hash = hash_password("secret123").unwrap();
        assert!(verify_password("secret123", &hash).unwrap());
    }

    #[test]
    fn test_verify_wrong_password_returns_false() {
        let hash = hash_password("secret123").unwrap();
        assert!(!verify_password("wrong", &hash).unwrap());
    }

    #[test]
    fn test_hash_is_different_each_time() {
        let h1 = hash_password("pass").unwrap();
        let h2 = hash_password("pass").unwrap();
        assert_ne!(h1, h2);
    }
}
```

Commit: `feat(auth): hash_password verify_password + tests`

---

## _6_: src/auth/jwt.rs — Claims + generate_token + validate_token

Create `benchmark/canix-app-rust/src/auth/jwt.rs`:

```rust
use anyhow::{anyhow, Result};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,   // user id
    pub role: String,  // "admin" | "employee" | "client"
    pub exp: usize,    // unix timestamp
}

pub fn generate_token(user_id: &str, role: &str, secret: &str) -> Result<String> {
    let exp = (chrono::Utc::now() + chrono::Duration::hours(24)).timestamp() as usize;
    let claims = Claims { sub: user_id.to_string(), role: role.to_string(), exp };
    let token = encode(&Header::default(), &claims, &EncodingKey::from_secret(secret.as_bytes()))?;
    Ok(token)
}

pub fn validate_token(token: &str, secret: &str) -> Result<Claims> {
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    ).map_err(|e| anyhow!("invalid token: {}", e))?;
    Ok(data.claims)
}
```

Test in `src/auth/jwt.rs`:
```rust
#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &str = "test_secret_key_minimum_32_chars_long!";

    #[test]
    fn test_generate_and_validate_token() {
        let token = generate_token("user-1", "admin", SECRET).unwrap();
        let claims = validate_token(&token, SECRET).unwrap();
        assert_eq!(claims.sub, "user-1");
        assert_eq!(claims.role, "admin");
    }

    #[test]
    fn test_validate_invalid_token_returns_err() {
        let result = validate_token("not.a.token", SECRET);
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_wrong_secret_returns_err() {
        let token = generate_token("user-1", "admin", SECRET).unwrap();
        let result = validate_token(&token, "wrong_secret_also_32_chars_long!!");
        assert!(result.is_err());
    }

    #[test]
    fn test_claims_contains_role() {
        let token = generate_token("u1", "employee", SECRET).unwrap();
        let claims = validate_token(&token, SECRET).unwrap();
        assert_eq!(claims.role, "employee");
    }
}
```

Commit: `feat(auth): Claims generate_token validate_token + tests`

---

## _7_: src/auth/middleware.rs — auth_middleware + require_role

Create `benchmark/canix-app-rust/src/auth/middleware.rs`:

```rust
use crate::{auth::jwt::validate_token, errors::AppError};
use axum::{
    body::Body,
    extract::State,
    http::{header, Request},
    middleware::Next,
    response::Response,
};
use crate::AppState;
use super::jwt::Claims;

pub async fn auth_middleware(
    State(state): State<AppState>,
    mut req: Request<Body>,
    next: Next,
) -> Result<Response, AppError> {
    let auth_header = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .ok_or(AppError::Unauthorized)?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or(AppError::Unauthorized)?;

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
```

Test in `src/auth/middleware.rs`:
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::jwt::Claims;

    fn make_claims(role: &str) -> Claims {
        Claims { sub: "u1".into(), role: role.into(), exp: 9999999999 }
    }

    #[test]
    fn test_require_role_admin_passes_always() {
        let check = require_role("employee");
        assert!(check(make_claims("admin")).is_ok());
    }

    #[test]
    fn test_require_role_exact_match_passes() {
        let check = require_role("employee");
        assert!(check(make_claims("employee")).is_ok());
    }

    #[test]
    fn test_require_role_wrong_role_fails() {
        let check = require_role("admin");
        let result = check(make_claims("client"));
        assert!(matches!(result, Err(AppError::Forbidden)));
    }
}
```

Commit: `feat(auth): auth_middleware require_role + tests`

---

## _8_: src/main.rs + AppState — full server setup

Replace `benchmark/canix-app-rust/src/main.rs` with complete version:

```rust
mod auth;
mod db;
mod errors;
mod models;
mod routes;

use anyhow::Result;
use axum::Router;
use sqlx::SqlitePool;
use std::env;
use tower_http::cors::CorsLayer;

#[derive(Clone)]
pub struct AppState {
    pub pool: SqlitePool,
    pub jwt_secret: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenv::dotenv().ok();

    let db_path = env::var("DB_PATH").unwrap_or_else(|_| "sqlite:./data/canix.db".into());
    let jwt_secret = env::var("JWT_SECRET").unwrap_or_else(|_| "dev_secret_change_in_prod_32chars!".into());

    std::fs::create_dir_all("./data")?;

    let pool = SqlitePool::connect(&db_path).await?;
    db::run_migrations(&pool).await?;
    db::seed(&pool).await?;

    let state = AppState { pool, jwt_secret };

    let app = Router::new()
        .merge(routes::auth::router())
        .merge(routes::clients::router())
        .merge(routes::quotes::router())
        .merge(routes::tickets::router())
        .merge(routes::analytics::router())
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await?;
    println!("Canix app listening on :3000");
    axum::serve(listener, app).await?;
    Ok(())
}
```

Create stub `benchmark/canix-app-rust/src/routes/mod.rs`:
```rust
pub mod analytics;
pub mod auth;
pub mod clients;
pub mod quotes;
pub mod tickets;
```

Create each stub route file with a placeholder `pub fn router() -> axum::Router<crate::AppState> { axum::Router::new() }`:
- `src/routes/auth.rs`
- `src/routes/clients.rs`
- `src/routes/quotes.rs`
- `src/routes/tickets.rs`
- `src/routes/analytics.rs`

Also create `.env.example`:
```
DB_PATH=sqlite:./data/canix.db
JWT_SECRET=change_me_to_random_32_char_string
PORT=3000
```

Cargo check: `cargo check --message-format=short 2>&1 | grep "^error" | head -20`
Expected: 0 errors.
Commit: `feat(main): AppState full server setup route stubs + env`

---

## _9_: src/routes/auth.rs — login + register + me

Replace stub `benchmark/canix-app-rust/src/routes/auth.rs`:

```rust
use crate::{
    AppState,
    auth::{jwt::generate_token, middleware::auth_middleware, password::{hash_password, verify_password}, jwt::Claims},
    errors::AppError,
    models::User,
};
use axum::{
    extract::{Extension, State},
    http::StatusCode,
    middleware,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;
use chrono::Utc;

#[derive(Deserialize)]
pub struct LoginRequest { pub email: String, pub password: String }

#[derive(Deserialize)]
pub struct RegisterRequest { pub email: String, pub password: String, pub role: Option<String> }

#[derive(Serialize)]
pub struct AuthResponse { pub token: String, pub user: UserDto }

#[derive(Serialize)]
pub struct UserDto { pub id: String, pub email: String, pub role: String }

impl From<User> for UserDto {
    fn from(u: User) -> Self { UserDto { id: u.id, email: u.email, role: u.role } }
}

async fn find_user_by_email(pool: &SqlitePool, email: &str) -> Result<Option<User>, AppError> {
    sqlx::query_as::<_, User>("SELECT id, email, password_hash, role, created_at FROM users WHERE email = ?")
        .bind(email)
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Internal(e.into()))
}

async fn create_user(pool: &SqlitePool, email: &str, password: &str, role: &str) -> Result<User, AppError> {
    let id = Uuid::new_v4().to_string();
    let hash = hash_password(password).map_err(|e| AppError::Internal(e))?;
    let now = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?,?,?,?,?)")
        .bind(&id).bind(email).bind(&hash).bind(role).bind(&now)
        .execute(pool).await.map_err(|e| AppError::Internal(e.into()))?;
    Ok(User { id, email: email.into(), password_hash: hash, role: role.into(), created_at: now })
}

async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, AppError> {
    let user = find_user_by_email(&state.pool, &body.email).await?
        .ok_or_else(|| AppError::BadRequest("invalid credentials".into()))?;
    let valid = verify_password(&body.password, &user.password_hash)
        .map_err(|e| AppError::Internal(e))?;
    if !valid { return Err(AppError::BadRequest("invalid credentials".into())); }
    let token = generate_token(&user.id, &user.role, &state.jwt_secret)
        .map_err(|e| AppError::Internal(e))?;
    Ok(Json(AuthResponse { token, user: user.into() }))
}

async fn register(
    State(state): State<AppState>,
    Json(body): Json<RegisterRequest>,
) -> Result<(StatusCode, Json<AuthResponse>), AppError> {
    if body.email.is_empty() || body.password.len() < 6 {
        return Err(AppError::BadRequest("email required, password min 6 chars".into()));
    }
    if find_user_by_email(&state.pool, &body.email).await?.is_some() {
        return Err(AppError::BadRequest("email already in use".into()));
    }
    let role = body.role.as_deref().unwrap_or("client");
    let user = create_user(&state.pool, &body.email, &body.password, role).await?;
    let token = generate_token(&user.id, &user.role, &state.jwt_secret)
        .map_err(|e| AppError::Internal(e))?;
    Ok((StatusCode::CREATED, Json(AuthResponse { token, user: user.into() })))
}

async fn me(
    Extension(claims): Extension<Claims>,
    State(state): State<AppState>,
) -> Result<Json<UserDto>, AppError> {
    let user = sqlx::query_as::<_, User>(
        "SELECT id, email, password_hash, role, created_at FROM users WHERE id = ?"
    ).bind(&claims.sub).fetch_optional(&state.pool).await
     .map_err(|e| AppError::Internal(e.into()))?
     .ok_or_else(|| AppError::NotFound("user".into()))?;
    Ok(Json(user.into()))
}

pub fn router() -> Router<AppState> {
    let protected = Router::new()
        .route("/api/auth/me", get(me))
        .layer(middleware::from_fn_with_state(AppState::default_placeholder(), auth_middleware));
    Router::new()
        .route("/api/auth/login", post(login))
        .route("/api/auth/register", post(register))
        .merge(protected)
}
```

NOTE: `auth_middleware` needs `AppState` as layer state. Use `route_layer` pattern instead — replace the `protected` block with:
```rust
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/auth/login", post(login))
        .route("/api/auth/register", post(register))
        .route("/api/auth/me", get(me).layer(middleware::from_fn_with_state(
            // state injected by outer Router — use route_layer
            tower::ServiceBuilder::new().layer(middleware::from_fn(auth_middleware_passthrough))
        )))
}
```

Simpler pattern — add auth as a layer on the whole router in `main.rs` selectively. For auth routes, `me` just reads Extension<Claims>; the middleware is applied per-router in main.rs.

Test using axum-test in `src/routes/auth.rs`:
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use axum_test::TestServer;
    use serde_json::json;

    async fn test_app() -> TestServer {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        crate::db::run_migrations(&pool).await.unwrap();
        crate::db::seed(&pool).await.unwrap();
        let state = AppState { pool, jwt_secret: "test_secret_32chars_minimum_len!!".into() };
        let app = router().with_state(state);
        TestServer::new(app).unwrap()
    }

    #[tokio::test]
    async fn test_login_admin_success() {
        let server = test_app().await;
        let resp = server.post("/api/auth/login")
            .json(&json!({"email": "admin@canix.com", "password": "admin123"}))
            .await;
        resp.assert_status_ok();
        let body: serde_json::Value = resp.json();
        assert!(body["token"].as_str().is_some());
        assert_eq!(body["user"]["role"], "admin");
    }

    #[tokio::test]
    async fn test_login_wrong_password_returns_400() {
        let server = test_app().await;
        let resp = server.post("/api/auth/login")
            .json(&json!({"email": "admin@canix.com", "password": "wrong"}))
            .await;
        resp.assert_status_bad_request();
    }

    #[tokio::test]
    async fn test_register_new_user() {
        let server = test_app().await;
        let resp = server.post("/api/auth/register")
            .json(&json!({"email": "new@canix.com", "password": "pass123"}))
            .await;
        resp.assert_status(StatusCode::CREATED);
    }
}
```

Commit: `feat(routes/auth): login register me handlers + integration tests`

---

## _10_: src/routes/clients.rs — CRUD clients

Replace stub `benchmark/canix-app-rust/src/routes/clients.rs`:

```rust
use crate::{AppState, auth::{jwt::Claims, middleware::auth_middleware}, errors::AppError, models::Client};
use axum::{
    extract::{Extension, Path, State},
    http::StatusCode,
    middleware,
    routing::{delete, get, post, put},
    Json, Router,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Deserialize)]
pub struct ClientPayload {
    pub name: String,
    pub email: String,
    pub phone: Option<String>,
    pub company: Option<String>,
    pub assigned_to: Option<String>,
}

async fn list_clients(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Vec<Client>>, AppError> {
    let rows = if claims.role == "admin" {
        sqlx::query_as::<_, Client>("SELECT * FROM clients ORDER BY created_at DESC")
            .fetch_all(&state.pool).await
    } else {
        sqlx::query_as::<_, Client>("SELECT * FROM clients WHERE assigned_to = ? ORDER BY created_at DESC")
            .bind(&claims.sub).fetch_all(&state.pool).await
    }.map_err(|e| AppError::Internal(e.into()))?;
    Ok(Json(rows))
}

async fn get_client(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Client>, AppError> {
    sqlx::query_as::<_, Client>("SELECT * FROM clients WHERE id = ?")
        .bind(&id).fetch_optional(&state.pool).await
        .map_err(|e| AppError::Internal(e.into()))?
        .map(Json)
        .ok_or_else(|| AppError::NotFound(format!("client {}", id)))
}

async fn create_client(
    State(state): State<AppState>,
    Json(body): Json<ClientPayload>,
) -> Result<(StatusCode, Json<Client>), AppError> {
    if body.name.is_empty() || body.email.is_empty() {
        return Err(AppError::BadRequest("name and email are required".into()));
    }
    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO clients (id,name,email,phone,company,assigned_to,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
        .bind(&id).bind(&body.name).bind(&body.email)
        .bind(&body.phone).bind(&body.company).bind(&body.assigned_to)
        .bind(&now).bind(&now)
        .execute(&state.pool).await.map_err(|e| AppError::Internal(e.into()))?;
    let client = Client { id, name: body.name, email: body.email, phone: body.phone,
        company: body.company, assigned_to: body.assigned_to, created_at: now.clone(), updated_at: now };
    Ok((StatusCode::CREATED, Json(client)))
}

async fn update_client(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<ClientPayload>,
) -> Result<Json<Client>, AppError> {
    let now = Utc::now().to_rfc3339();
    let result = sqlx::query(
        "UPDATE clients SET name=?,email=?,phone=?,company=?,assigned_to=?,updated_at=? WHERE id=?"
    ).bind(&body.name).bind(&body.email).bind(&body.phone)
     .bind(&body.company).bind(&body.assigned_to).bind(&now).bind(&id)
     .execute(&state.pool).await.map_err(|e| AppError::Internal(e.into()))?;
    if result.rows_affected() == 0 { return Err(AppError::NotFound(format!("client {}", id))); }
    get_client(State(state), Path(id)).await
}

async fn delete_client(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    let result = sqlx::query("DELETE FROM clients WHERE id=?")
        .bind(&id).execute(&state.pool).await
        .map_err(|e| AppError::Internal(e.into()))?;
    if result.rows_affected() == 0 { return Err(AppError::NotFound(format!("client {}", id))); }
    Ok(StatusCode::NO_CONTENT)
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/clients", get(list_clients).post(create_client))
        .route("/api/clients/:id", get(get_client).put(update_client).delete(delete_client))
        .layer(middleware::from_fn_with_state(
            AppState { pool: sqlx::SqlitePool::connect_lazy("sqlite::memory:").unwrap(), jwt_secret: String::new() },
            auth_middleware
        ))
}
```

NOTE: The `route_layer`/middleware approach for per-router state injection in axum 0.7 requires the state to be available at build time. Use `Router::new()...with_state()` pattern in tests and pass the real state from main. Adjust `router()` signature if needed to accept state at call site.

Test in `src/routes/clients.rs`:
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use axum_test::TestServer;
    use crate::auth::jwt::generate_token;
    use serde_json::json;

    async fn setup() -> (TestServer, String) {
        let pool = sqlx::SqlitePool::connect("sqlite::memory:").await.unwrap();
        crate::db::run_migrations(&pool).await.unwrap();
        crate::db::seed(&pool).await.unwrap();
        let secret = "test_secret_32chars_minimum_len!!".to_string();
        let admin_id: (String,) = sqlx::query_as("SELECT id FROM users WHERE role='admin'")
            .fetch_one(&pool).await.unwrap();
        let token = generate_token(&admin_id.0, "admin", &secret).unwrap();
        let state = AppState { pool, jwt_secret: secret };
        let app = router().with_state(state);
        (TestServer::new(app).unwrap(), token)
    }

    #[tokio::test]
    async fn test_create_and_list_client() {
        let (server, token) = setup().await;
        let resp = server.post("/api/clients")
            .add_header("Authorization", format!("Bearer {}", token).parse().unwrap())
            .json(&json!({"name":"Acme","email":"acme@example.com"}))
            .await;
        resp.assert_status(StatusCode::CREATED);
        let list = server.get("/api/clients")
            .add_header("Authorization", format!("Bearer {}", token).parse().unwrap())
            .await;
        list.assert_status_ok();
        let body: serde_json::Value = list.json();
        assert!(!body.as_array().unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_create_client_missing_fields_returns_400() {
        let (server, token) = setup().await;
        let resp = server.post("/api/clients")
            .add_header("Authorization", format!("Bearer {}", token).parse().unwrap())
            .json(&json!({"name":""}))
            .await;
        resp.assert_status_bad_request();
    }
}
```

Commit: `feat(routes/clients): CRUD list get create update delete + tests`

---

## _11_: src/routes/quotes.rs — quotes CRUD + status + items

Replace stub `benchmark/canix-app-rust/src/routes/quotes.rs`:

```rust
use crate::{AppState, auth::{jwt::Claims, middleware::auth_middleware}, errors::AppError, models::{Quote, QuoteItem}};
use axum::{
    extract::{Extension, Path, State},
    http::StatusCode,
    middleware,
    routing::{get, patch, post},
    Json, Router,
};
use chrono::Utc;
use serde::Deserialize;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct CreateQuotePayload { pub client_id: String }

#[derive(Deserialize)]
pub struct StatusPayload { pub status: String }

#[derive(Deserialize)]
pub struct AddItemPayload {
    pub description: String,
    pub quantity: i64,
    pub unit_price: f64,
}

async fn recalculate_total(pool: &sqlx::SqlitePool, quote_id: &str) -> Result<f64, AppError> {
    let row: (f64,) = sqlx::query_as(
        "SELECT COALESCE(SUM(quantity * unit_price), 0.0) FROM quote_items WHERE quote_id = ?"
    ).bind(quote_id).fetch_one(pool).await
     .map_err(|e| AppError::Internal(e.into()))?;
    sqlx::query("UPDATE quotes SET total = ?, updated_at = ? WHERE id = ?")
        .bind(row.0).bind(Utc::now().to_rfc3339()).bind(quote_id)
        .execute(pool).await.map_err(|e| AppError::Internal(e.into()))?;
    Ok(row.0)
}

async fn list_quotes(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Vec<Quote>>, AppError> {
    let rows = if claims.role == "admin" {
        sqlx::query_as::<_, Quote>("SELECT * FROM quotes ORDER BY created_at DESC")
            .fetch_all(&state.pool).await
    } else {
        sqlx::query_as::<_, Quote>("SELECT * FROM quotes WHERE created_by = ? ORDER BY created_at DESC")
            .bind(&claims.sub).fetch_all(&state.pool).await
    }.map_err(|e| AppError::Internal(e.into()))?;
    Ok(Json(rows))
}

async fn create_quote(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<CreateQuotePayload>,
) -> Result<(StatusCode, Json<Quote>), AppError> {
    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO quotes (id,client_id,created_by,status,total,created_at,updated_at) VALUES (?,?,?,'draft',0,?,?)")
        .bind(&id).bind(&body.client_id).bind(&claims.sub).bind(&now).bind(&now)
        .execute(&state.pool).await.map_err(|e| AppError::Internal(e.into()))?;
    let quote = Quote { id, client_id: body.client_id, created_by: claims.sub,
        status: "draft".into(), total: 0.0, created_at: now.clone(), updated_at: now };
    Ok((StatusCode::CREATED, Json(quote)))
}

async fn update_status(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<StatusPayload>,
) -> Result<Json<Quote>, AppError> {
    let valid = ["draft", "sent", "approved", "rejected"];
    if !valid.contains(&body.status.as_str()) {
        return Err(AppError::BadRequest(format!("status must be one of {:?}", valid)));
    }
    let now = Utc::now().to_rfc3339();
    let res = sqlx::query("UPDATE quotes SET status=?,updated_at=? WHERE id=?")
        .bind(&body.status).bind(&now).bind(&id)
        .execute(&state.pool).await.map_err(|e| AppError::Internal(e.into()))?;
    if res.rows_affected() == 0 { return Err(AppError::NotFound(format!("quote {}", id))); }
    sqlx::query_as::<_, Quote>("SELECT * FROM quotes WHERE id=?")
        .bind(&id).fetch_one(&state.pool).await
        .map(Json).map_err(|e| AppError::Internal(e.into()))
}

async fn add_item(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<AddItemPayload>,
) -> Result<(StatusCode, Json<QuoteItem>), AppError> {
    let item_id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO quote_items (id,quote_id,description,quantity,unit_price) VALUES (?,?,?,?,?)")
        .bind(&item_id).bind(&id).bind(&body.description).bind(body.quantity).bind(body.unit_price)
        .execute(&state.pool).await.map_err(|e| AppError::Internal(e.into()))?;
    recalculate_total(&state.pool, &id).await?;
    let item = QuoteItem { id: item_id, quote_id: id, description: body.description,
        quantity: body.quantity, unit_price: body.unit_price };
    Ok((StatusCode::CREATED, Json(item)))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/quotes", get(list_quotes).post(create_quote))
        .route("/api/quotes/:id/status", patch(update_status))
        .route("/api/quotes/:id/items", post(add_item))
}
```

Test in `src/routes/quotes.rs`:
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use axum_test::TestServer;
    use crate::auth::jwt::generate_token;
    use serde_json::json;

    async fn setup() -> (TestServer, String, String) {
        let pool = sqlx::SqlitePool::connect("sqlite::memory:").await.unwrap();
        crate::db::run_migrations(&pool).await.unwrap();
        crate::db::seed(&pool).await.unwrap();
        let secret = "test_secret_32chars_minimum_len!!".to_string();
        let admin: (String,) = sqlx::query_as("SELECT id FROM users WHERE role='admin'")
            .fetch_one(&pool).await.unwrap();
        // insert a client
        let client_id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        sqlx::query("INSERT INTO clients (id,name,email,created_at,updated_at) VALUES (?,?,?,?,?)")
            .bind(&client_id).bind("Test Client").bind("c@c.com").bind(&now).bind(&now)
            .execute(&pool).await.unwrap();
        let token = generate_token(&admin.0, "admin", &secret).unwrap();
        let state = AppState { pool, jwt_secret: secret };
        let app = router().with_state(state);
        (TestServer::new(app).unwrap(), token, client_id)
    }

    #[tokio::test]
    async fn test_create_quote_and_add_item() {
        let (server, token, client_id) = setup().await;
        let resp = server.post("/api/quotes")
            .add_header("Authorization", format!("Bearer {}", token).parse().unwrap())
            .json(&json!({"client_id": client_id}))
            .await;
        resp.assert_status(StatusCode::CREATED);
        let quote: serde_json::Value = resp.json();
        let qid = quote["id"].as_str().unwrap();
        let item_resp = server.post(&format!("/api/quotes/{}/items", qid))
            .add_header("Authorization", format!("Bearer {}", token).parse().unwrap())
            .json(&json!({"description":"Widget","quantity":2,"unit_price":50.0}))
            .await;
        item_resp.assert_status(StatusCode::CREATED);
    }

    #[tokio::test]
    async fn test_update_quote_status() {
        let (server, token, client_id) = setup().await;
        let resp = server.post("/api/quotes")
            .add_header("Authorization", format!("Bearer {}", token).parse().unwrap())
            .json(&json!({"client_id": client_id}))
            .await;
        let quote: serde_json::Value = resp.json();
        let qid = quote["id"].as_str().unwrap();
        let patch = server.patch(&format!("/api/quotes/{}/status", qid))
            .add_header("Authorization", format!("Bearer {}", token).parse().unwrap())
            .json(&json!({"status":"sent"}))
            .await;
        patch.assert_status_ok();
        let updated: serde_json::Value = patch.json();
        assert_eq!(updated["status"], "sent");
    }
}
```

Commit: `feat(routes/quotes): list create update_status add_item recalculate_total + tests`

---

## _12_: src/routes/tickets.rs — tickets + messages

Replace stub `benchmark/canix-app-rust/src/routes/tickets.rs`:

```rust
use crate::{AppState, auth::jwt::Claims, errors::AppError, models::{Ticket, TicketMessage}};
use axum::{
    extract::{Extension, Path, State},
    http::StatusCode,
    routing::{get, patch, post},
    Json, Router,
};
use chrono::Utc;
use serde::Deserialize;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct CreateTicketPayload {
    pub client_id: String,
    pub title: String,
    pub description: String,
    pub priority: Option<String>,
    pub assigned_to: Option<String>,
}

#[derive(Deserialize)]
pub struct StatusPayload { pub status: String }

#[derive(Deserialize)]
pub struct PriorityPayload { pub priority: String }

#[derive(Deserialize)]
pub struct MessagePayload { pub message: String }

async fn list_tickets(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Vec<Ticket>>, AppError> {
    let rows = match claims.role.as_str() {
        "admin" => sqlx::query_as::<_, Ticket>("SELECT * FROM tickets ORDER BY created_at DESC")
            .fetch_all(&state.pool).await,
        "employee" => sqlx::query_as::<_, Ticket>(
            "SELECT * FROM tickets WHERE assigned_to = ? ORDER BY created_at DESC"
        ).bind(&claims.sub).fetch_all(&state.pool).await,
        _ => sqlx::query_as::<_, Ticket>(
            "SELECT * FROM tickets WHERE client_id IN (SELECT id FROM clients WHERE assigned_to = ?) ORDER BY created_at DESC"
        ).bind(&claims.sub).fetch_all(&state.pool).await,
    }.map_err(|e| AppError::Internal(e.into()))?;
    Ok(Json(rows))
}

async fn create_ticket(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<CreateTicketPayload>,
) -> Result<(StatusCode, Json<Ticket>), AppError> {
    if body.title.is_empty() { return Err(AppError::BadRequest("title required".into())); }
    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();
    let priority = body.priority.as_deref().unwrap_or("medium");
    sqlx::query("INSERT INTO tickets (id,client_id,assigned_to,title,description,status,priority,created_at,updated_at) VALUES (?,?,?,?,?,'open',?,?,?)")
        .bind(&id).bind(&body.client_id).bind(&body.assigned_to)
        .bind(&body.title).bind(&body.description)
        .bind(priority).bind(&now).bind(&now)
        .execute(&state.pool).await.map_err(|e| AppError::Internal(e.into()))?;
    let ticket = Ticket { id, client_id: body.client_id, assigned_to: body.assigned_to,
        title: body.title, description: body.description, status: "open".into(),
        priority: priority.into(), created_at: now.clone(), updated_at: now };
    Ok((StatusCode::CREATED, Json(ticket)))
}

async fn update_ticket_status(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<StatusPayload>,
) -> Result<Json<Ticket>, AppError> {
    let valid = ["open", "in_progress", "resolved"];
    if !valid.contains(&body.status.as_str()) {
        return Err(AppError::BadRequest("invalid status".into()));
    }
    let now = Utc::now().to_rfc3339();
    sqlx::query("UPDATE tickets SET status=?,updated_at=? WHERE id=?")
        .bind(&body.status).bind(&now).bind(&id)
        .execute(&state.pool).await.map_err(|e| AppError::Internal(e.into()))?;
    sqlx::query_as::<_, Ticket>("SELECT * FROM tickets WHERE id=?")
        .bind(&id).fetch_optional(&state.pool).await
        .map_err(|e| AppError::Internal(e.into()))?
        .map(Json).ok_or_else(|| AppError::NotFound(format!("ticket {}", id)))
}

async fn update_ticket_priority(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<PriorityPayload>,
) -> Result<Json<Ticket>, AppError> {
    let valid = ["low", "medium", "high"];
    if !valid.contains(&body.priority.as_str()) {
        return Err(AppError::BadRequest("invalid priority".into()));
    }
    let now = Utc::now().to_rfc3339();
    sqlx::query("UPDATE tickets SET priority=?,updated_at=? WHERE id=?")
        .bind(&body.priority).bind(&now).bind(&id)
        .execute(&state.pool).await.map_err(|e| AppError::Internal(e.into()))?;
    sqlx::query_as::<_, Ticket>("SELECT * FROM tickets WHERE id=?")
        .bind(&id).fetch_optional(&state.pool).await
        .map_err(|e| AppError::Internal(e.into()))?
        .map(Json).ok_or_else(|| AppError::NotFound(format!("ticket {}", id)))
}

async fn add_message(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<String>,
    Json(body): Json<MessagePayload>,
) -> Result<(StatusCode, Json<TicketMessage>), AppError> {
    if body.message.is_empty() { return Err(AppError::BadRequest("message required".into())); }
    let msg_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    sqlx::query("INSERT INTO ticket_messages (id,ticket_id,author_id,message,created_at) VALUES (?,?,?,?,?)")
        .bind(&msg_id).bind(&id).bind(&claims.sub).bind(&body.message).bind(&now)
        .execute(&state.pool).await.map_err(|e| AppError::Internal(e.into()))?;
    let msg = TicketMessage { id: msg_id, ticket_id: id, author_id: claims.sub,
        message: body.message, created_at: now };
    Ok((StatusCode::CREATED, Json(msg)))
}

async fn list_messages(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Vec<TicketMessage>>, AppError> {
    sqlx::query_as::<_, TicketMessage>(
        "SELECT * FROM ticket_messages WHERE ticket_id=? ORDER BY created_at ASC"
    ).bind(&id).fetch_all(&state.pool).await
     .map(Json).map_err(|e| AppError::Internal(e.into()))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/tickets", get(list_tickets).post(create_ticket))
        .route("/api/tickets/:id/status", patch(update_ticket_status))
        .route("/api/tickets/:id/priority", patch(update_ticket_priority))
        .route("/api/tickets/:id/messages", get(list_messages).post(add_message))
}
```

Tests follow same pattern as quotes — create pool, seed, generate admin token, TestServer, test create/status/priority/messages.

Commit: `feat(routes/tickets): full CRUD status priority messages + tests`

---

## _13_: src/routes/analytics.rs — summary endpoint

Replace stub `benchmark/canix-app-rust/src/routes/analytics.rs`:

```rust
use crate::{AppState, auth::jwt::Claims, errors::AppError};
use axum::{extract::{Extension, State}, routing::get, Json, Router};
use serde::Serialize;

#[derive(Serialize)]
pub struct RevenueSummary {
    pub total_approved: f64,
    pub quote_count_by_status: Vec<StatusCount>,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct StatusCount {
    pub status: String,
    pub count: i64,
    pub total: f64,
}

#[derive(Serialize)]
pub struct TicketSummary {
    pub by_status: Vec<TicketStatusCount>,
    pub by_priority: Vec<PriorityCount>,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct TicketStatusCount { pub status: String, pub count: i64 }

#[derive(Serialize, sqlx::FromRow)]
pub struct PriorityCount { pub priority: String, pub count: i64 }

#[derive(Serialize)]
pub struct AnalyticsSummary {
    pub revenue: RevenueSummary,
    pub tickets: TicketSummary,
    pub total_clients: i64,
    pub total_users: i64,
}

async fn summary(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<AnalyticsSummary>, AppError> {
    if claims.role != "admin" { return Err(AppError::Forbidden); }

    let quote_stats = sqlx::query_as::<_, StatusCount>(
        "SELECT status, COUNT(*) as count, COALESCE(SUM(total),0) as total FROM quotes GROUP BY status"
    ).fetch_all(&state.pool).await.map_err(|e| AppError::Internal(e.into()))?;

    let total_approved = quote_stats.iter()
        .filter(|r| r.status == "approved")
        .map(|r| r.total).sum();

    let ticket_status = sqlx::query_as::<_, TicketStatusCount>(
        "SELECT status, COUNT(*) as count FROM tickets GROUP BY status"
    ).fetch_all(&state.pool).await.map_err(|e| AppError::Internal(e.into()))?;

    let ticket_priority = sqlx::query_as::<_, PriorityCount>(
        "SELECT priority, COUNT(*) as count FROM tickets GROUP BY priority"
    ).fetch_all(&state.pool).await.map_err(|e| AppError::Internal(e.into()))?;

    let (total_clients,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM clients")
        .fetch_one(&state.pool).await.map_err(|e| AppError::Internal(e.into()))?;

    let (total_users,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
        .fetch_one(&state.pool).await.map_err(|e| AppError::Internal(e.into()))?;

    Ok(Json(AnalyticsSummary {
        revenue: RevenueSummary { total_approved, quote_count_by_status: quote_stats },
        tickets: TicketSummary { by_status: ticket_status, by_priority: ticket_priority },
        total_clients,
        total_users,
    }))
}

pub fn router() -> Router<AppState> {
    Router::new().route("/api/analytics/summary", get(summary))
}
```

Test: admin gets 200, non-admin gets 403.
Commit: `feat(routes/analytics): summary revenue tickets counts + tests`

---

## _14_: README.md + cargo test final

Create `benchmark/canix-app-rust/README.md`:

```markdown
# Canix App — Rust

PME management app built with Axum + SQLx + SQLite.

## Stack
- **Web**: Axum 0.7
- **DB**: SQLite via sqlx 0.7
- **Auth**: JWT (jsonwebtoken 9) + bcrypt 0.15

## Setup
cp .env.example .env
cargo build --release

## Run
cargo run

## Test
cargo test

## API
- POST /api/auth/login
- POST /api/auth/register
- GET  /api/auth/me
- GET/POST /api/clients
- GET/PUT/DELETE /api/clients/:id
- GET/POST /api/quotes
- PATCH /api/quotes/:id/status
- POST /api/quotes/:id/items
- GET/POST /api/tickets
- PATCH /api/tickets/:id/status
- PATCH /api/tickets/:id/priority
- GET/POST /api/tickets/:id/messages
- GET /api/analytics/summary (admin only)

## Default credentials
admin@canix.com / admin123
```

Then run: `cargo test 2>&1 | tail -20` — all tests must pass.
Then: `cargo build --release 2>&1 | tail -5` — must succeed.

Commit: `docs: README + final cargo test all passing`

Final push: `git push origin feat/canix-rust`
Close beads: all bu-rr* remaining open.
Nudge: `gt nudge mayor "all rust beads complete feat/canix-rust ready"`
