# Canix App Rust — Implementation Plan

Repo: /Users/laurentcanis/gastown/beads_ui/crew/local_qwen
Branch: feat/canix-rust
Dir: benchmark/canix-app-rust/

Each section = one agent session. Grep your section, implement, cargo check loop, cargo test loop, commit, close bead, nudge mayor.

---

## _1_: Cargo.toml + stub main

File: `benchmark/canix-app-rust/Cargo.toml`
File: `benchmark/canix-app-rust/src/main.rs` (stub: `fn main() {}`)

Dependencies:
- axum = { version = "0.7", features = ["macros"] }
- tokio = { version = "1", features = ["full"] }
- sqlx = { version = "0.7", features = ["sqlite", "runtime-tokio-native-tls", "macros"] }
- serde = { version = "1", features = ["derive"] }
- serde_json = "1"
- jsonwebtoken = "9"
- bcrypt = "0.15"
- dotenv = "0.15"
- tower = "0.4"
- tower-http = { version = "0.5", features = ["cors", "fs"] }
- uuid = { version = "1", features = ["v4"] }
- chrono = { version = "0.4", features = ["serde"] }
- anyhow = "1"
- thiserror = "1"

dev-dependencies:
- axum-test = "15"

Commit: `feat(init): Cargo.toml + stub main`

---

## _2_: src/errors.rs

File: `benchmark/canix-app-rust/src/errors.rs`

```
pub enum AppError {
    NotFound(String),
    Unauthorized,
    Forbidden,
    BadRequest(String),
    Internal(anyhow::Error),  // #[from]
}
```

Derives: `thiserror::Error`, `Debug`
Impl: `IntoResponse` — each variant maps to its HTTP status + JSON `{ "error": "..." }`

Declare in `src/main.rs`: `mod errors;`

Tests (in same file, `#[cfg(test)]`):
- `test_not_found_status` → StatusCode::NOT_FOUND
- `test_unauthorized_status` → StatusCode::UNAUTHORIZED
- `test_bad_request_status` → StatusCode::BAD_REQUEST

Commit: `feat(errors): AppError IntoResponse + tests`

---

## _3_: src/models/mod.rs

File: `benchmark/canix-app-rust/src/models/mod.rs`

Structs (all derive `Debug, Clone, Serialize, Deserialize, sqlx::FromRow`):

```
User        { id, email, password_hash, role, created_at: String }
Client      { id, name, email, phone: Option<String>, company: Option<String>,
              assigned_to: Option<String>, created_at, updated_at: String }
Quote       { id, client_id, created_by, status, total: f64, created_at, updated_at: String }
QuoteItem   { id, quote_id, description: String, quantity: i64, unit_price: f64 }
Ticket      { id, client_id, assigned_to: Option<String>, title, description,
              status, priority, created_at, updated_at: String }
TicketMessage { id, ticket_id, author_id, message, created_at: String }
```

Declare in `src/main.rs`: `mod models;`

Tests:
- `test_user_serialize` → serde_json::to_string succeeds, contains email
- `test_quote_total_default` → total field is f64

Commit: `feat(models): all domain structs + tests`

---

## _4_: src/db/mod.rs

File: `benchmark/canix-app-rust/src/db/mod.rs`

```
pub async fn run_migrations(pool: &SqlitePool) -> Result<()>
pub async fn seed(pool: &SqlitePool) -> Result<()>
```

`run_migrations`: CREATE TABLE IF NOT EXISTS for all 6 tables:
- users: id TEXT PK, email TEXT UNIQUE, password_hash TEXT, role TEXT CHECK IN ('admin','employee','client'), created_at TEXT
- clients: id TEXT PK, name, email, phone?, company?, assigned_to? REFS users, created_at, updated_at TEXT
- quotes: id TEXT PK, client_id REFS clients, created_by REFS users, status CHECK IN ('draft','sent','approved','rejected') DEFAULT 'draft', total REAL DEFAULT 0, created_at, updated_at TEXT
- quote_items: id TEXT PK, quote_id REFS quotes ON DELETE CASCADE, description TEXT, quantity INTEGER DEFAULT 1, unit_price REAL DEFAULT 0
- tickets: id TEXT PK, client_id REFS clients, assigned_to? REFS users, title, description, status CHECK IN ('open','in_progress','resolved') DEFAULT 'open', priority CHECK IN ('low','medium','high') DEFAULT 'medium', created_at, updated_at TEXT
- ticket_messages: id TEXT PK, ticket_id REFS tickets ON DELETE CASCADE, author_id REFS users, message TEXT, created_at TEXT

`seed`: insert 1 admin (admin@canix.com / admin123 bcrypt), 2 employees. Skip if users table already has rows.

Declare in `src/main.rs`: `mod db;`

Tests (tokio::test, sqlite::memory:):
- `test_migrations_create_tables` → 6 tables in sqlite_master
- `test_seed_creates_admin` → COUNT(*) WHERE role='admin' = 1
- `test_seed_idempotent` → call seed twice, still 3 users total

Commit: `feat(db): migrations 6 tables + seed + tests`

---

## _5_: src/auth/password.rs

Files: `src/auth/mod.rs` (declares `pub mod password; pub mod jwt; pub mod middleware;`)
File: `src/auth/password.rs`

```
pub fn hash_password(password: &str) -> Result<String>   // bcrypt::hash DEFAULT_COST
pub fn verify_password(password: &str, hash: &str) -> Result<bool>  // bcrypt::verify
```

Declare in `src/main.rs`: `mod auth;`

Tests:
- `test_hash_and_verify_correct` → verify returns true
- `test_verify_wrong_password` → verify returns false
- `test_hash_uniqueness` → two hashes of same input differ

Commit: `feat(auth/password): hash_password verify_password + tests`

---

## _6_: src/auth/jwt.rs

File: `src/auth/jwt.rs`

```
pub struct Claims { pub sub: String, pub role: String, pub exp: usize }
// derives: Debug, Clone, Serialize, Deserialize

pub fn generate_token(user_id: &str, role: &str, secret: &str) -> Result<String>
// HS256, exp = now + 24h

pub fn validate_token(token: &str, secret: &str) -> Result<Claims>
// decode + verify, return Claims or error
```

Tests:
- `test_generate_and_validate` → claims.sub and claims.role match input
- `test_invalid_token_errors` → validate garbage string → Err
- `test_wrong_secret_errors` → validate with wrong secret → Err
- `test_role_preserved` → generate employee role, validate → role == "employee"

Commit: `feat(auth/jwt): Claims generate_token validate_token + tests`

---

## _7_: src/auth/middleware.rs

File: `src/auth/middleware.rs`

```
pub async fn auth_middleware(
    State(state): State<AppState>,
    mut req: Request<Body>,
    next: Next,
) -> Result<Response, AppError>
// Extracts "Bearer <token>" from Authorization header
// Validates token using state.jwt_secret
// Inserts Claims into req.extensions
// Returns Unauthorized if missing or invalid
```

```
pub fn require_role(allowed: &'static str) -> impl Fn(Claims) -> Result<(), AppError> + Clone
// Ok if claims.role == allowed OR claims.role == "admin"
// Err(AppError::Forbidden) otherwise
```

Note: AppState is defined in section _8_. For now declare a placeholder or use a forward reference — the file will compile once main.rs defines AppState.

Tests (unit, no HTTP):
- `test_require_role_admin_always_passes`
- `test_require_role_exact_match`
- `test_require_role_wrong_role_forbidden`

Commit: `feat(auth/middleware): auth_middleware require_role + tests`

---

## _8_: src/main.rs — AppState + full server

File: `src/main.rs` (replace stub)

```
pub struct AppState {
    pub pool: SqlitePool,
    pub jwt_secret: String,
}
// derive Clone
```

`main()`:
- dotenv().ok()
- DB_PATH from env (default: "sqlite:./data/canix.db")
- JWT_SECRET from env (default: dev string ≥32 chars)
- create_dir_all("./data")
- SqlitePool::connect → run_migrations → seed
- Router: merge all 5 route routers (auth, clients, quotes, tickets, analytics)
- Apply CorsLayer::permissive()
- TcpListener on 0.0.0.0:3000 → axum::serve

Files: `src/routes/mod.rs` with `pub mod auth; pub mod clients; pub mod quotes; pub mod tickets; pub mod analytics;`
Each route file stub: `pub fn router() -> Router<AppState> { Router::new() }`

File: `.env.example` with DB_PATH, JWT_SECRET, PORT=3000

Declare all mods in main.rs: `mod auth; mod db; mod errors; mod models; mod routes;`

No tests for main.rs itself — cargo check must pass.

Commit: `feat(main): AppState server router stubs .env.example`

---

## _9_: src/routes/auth.rs

File: `src/routes/auth.rs`

Request/response types:
```
struct LoginRequest    { email: String, password: String }
struct RegisterRequest { email: String, password: String, role: Option<String> }
struct AuthResponse    { token: String, user: UserDto }
struct UserDto         { id: String, email: String, role: String }
// impl From<User> for UserDto
```

Handlers:
```
async fn login(State, Json<LoginRequest>) -> Result<Json<AuthResponse>, AppError>
// find user by email, verify_password, generate_token

async fn register(State, Json<RegisterRequest>) -> Result<(StatusCode::CREATED, Json<AuthResponse>), AppError>
// validate email non-empty + password >= 6 chars, check no duplicate, hash_password, insert, generate_token

async fn me(Extension<Claims>, State) -> Result<Json<UserDto>, AppError>
// fetch user by claims.sub
```

Private helpers:
```
async fn find_user_by_email(pool: &SqlitePool, email: &str) -> Result<Option<User>, AppError>
async fn create_user(pool: &SqlitePool, email: &str, password: &str, role: &str) -> Result<User, AppError>
```

```
pub fn router() -> Router<AppState>
// POST /api/auth/login → login
// POST /api/auth/register → register
// GET  /api/auth/me → me (protected by auth_middleware)
```

Tests (axum-test, sqlite::memory:, seed data):
- `test_login_admin_success` → 200, token present, role == "admin"
- `test_login_wrong_password` → 400
- `test_register_new_user` → 201
- `test_me_with_valid_token` → 200, email matches
- `test_me_without_token` → 401

Commit: `feat(routes/auth): login register me + tests`

---

## _10_: src/routes/clients.rs

File: `src/routes/clients.rs`

Request type:
```
struct ClientPayload { name, email: String, phone, company, assigned_to: Option<String> }
```

Handlers:
```
async fn list_clients(State, Extension<Claims>) -> Result<Json<Vec<Client>>, AppError>
// admin: all clients; others: WHERE assigned_to = claims.sub

async fn get_client(State, Path<String>) -> Result<Json<Client>, AppError>

async fn create_client(State, Json<ClientPayload>) -> Result<(StatusCode::CREATED, Json<Client>), AppError>
// validate name + email non-empty

async fn update_client(State, Path<String>, Json<ClientPayload>) -> Result<Json<Client>, AppError>
// 404 if not found

async fn delete_client(State, Path<String>) -> Result<StatusCode::NO_CONTENT, AppError>
// 404 if not found
```

```
pub fn router() -> Router<AppState>
// GET/POST /api/clients
// GET/PUT/DELETE /api/clients/:id
// all routes protected by auth_middleware
```

Tests (axum-test, admin token):
- `test_create_and_list_client`
- `test_get_client_not_found` → 404
- `test_create_client_missing_fields` → 400
- `test_delete_client`

Commit: `feat(routes/clients): CRUD list get create update delete + tests`

---

## _11_: src/routes/quotes.rs

File: `src/routes/quotes.rs`

Request types:
```
struct CreateQuotePayload { client_id: String }
struct StatusPayload      { status: String }  // draft|sent|approved|rejected
struct AddItemPayload     { description: String, quantity: i64, unit_price: f64 }
```

Private helper:
```
async fn recalculate_total(pool: &SqlitePool, quote_id: &str) -> Result<f64, AppError>
// SUM(quantity * unit_price) from quote_items WHERE quote_id = ?
// UPDATE quotes SET total = ? WHERE id = ?
```

Handlers:
```
async fn list_quotes(State, Extension<Claims>) -> Result<Json<Vec<Quote>>, AppError>
// admin: all; others: WHERE created_by = claims.sub

async fn create_quote(State, Extension<Claims>, Json) -> Result<(CREATED, Json<Quote>), AppError>
// status defaults to "draft", total = 0

async fn update_status(State, Path<String>, Json<StatusPayload>) -> Result<Json<Quote>, AppError>
// validate status value; 404 if quote not found

async fn add_item(State, Path<String>, Json<AddItemPayload>) -> Result<(CREATED, Json<QuoteItem>), AppError>
// insert item, call recalculate_total
```

```
pub fn router() -> Router<AppState>
// GET/POST /api/quotes
// PATCH /api/quotes/:id/status
// POST  /api/quotes/:id/items
// all protected by auth_middleware
```

Tests:
- `test_create_quote`
- `test_add_item_updates_total`
- `test_update_status_sent`
- `test_update_status_invalid` → 400

Commit: `feat(routes/quotes): list create status items recalculate_total + tests`

---

## _12_: src/routes/tickets.rs

File: `src/routes/tickets.rs`

Request types:
```
struct CreateTicketPayload { client_id, title, description: String, priority: Option<String>, assigned_to: Option<String> }
struct StatusPayload       { status: String }    // open|in_progress|resolved
struct PriorityPayload     { priority: String }  // low|medium|high
struct MessagePayload      { message: String }
```

Handlers:
```
async fn list_tickets(State, Extension<Claims>) -> Result<Json<Vec<Ticket>>, AppError>
// admin: all; employee: WHERE assigned_to = claims.sub; client: WHERE client_id IN (their clients)

async fn create_ticket(State, Extension<Claims>, Json) -> Result<(CREATED, Json<Ticket>), AppError>
// validate title non-empty; status defaults "open"; priority defaults "medium"

async fn update_ticket_status(State, Path<String>, Json<StatusPayload>) -> Result<Json<Ticket>, AppError>
async fn update_ticket_priority(State, Path<String>, Json<PriorityPayload>) -> Result<Json<Ticket>, AppError>

async fn add_message(State, Extension<Claims>, Path<String>, Json<MessagePayload>) -> Result<(CREATED, Json<TicketMessage>), AppError>
async fn list_messages(State, Path<String>) -> Result<Json<Vec<TicketMessage>>, AppError>
```

```
pub fn router() -> Router<AppState>
// GET/POST /api/tickets
// PATCH /api/tickets/:id/status
// PATCH /api/tickets/:id/priority
// GET/POST /api/tickets/:id/messages
// all protected by auth_middleware
```

Tests:
- `test_create_ticket`
- `test_update_status`
- `test_update_priority`
- `test_add_and_list_messages`
- `test_create_ticket_missing_title` → 400

Commit: `feat(routes/tickets): CRUD status priority messages + tests`

---

## _13_: src/routes/analytics.rs

File: `src/routes/analytics.rs`

Response types:
```
struct StatusCount    { status: String, count: i64, total: f64 }  // sqlx::FromRow
struct TicketStatusCount { status: String, count: i64 }           // sqlx::FromRow
struct PriorityCount  { priority: String, count: i64 }            // sqlx::FromRow
struct RevenueSummary { total_approved: f64, quote_count_by_status: Vec<StatusCount> }
struct TicketSummary  { by_status: Vec<TicketStatusCount>, by_priority: Vec<PriorityCount> }
struct AnalyticsSummary { revenue: RevenueSummary, tickets: TicketSummary, total_clients: i64, total_users: i64 }
```

Handler:
```
async fn summary(State, Extension<Claims>) -> Result<Json<AnalyticsSummary>, AppError>
// Forbidden if claims.role != "admin"
// GROUP BY status on quotes for revenue
// GROUP BY status + priority on tickets
// COUNT clients, COUNT users
```

```
pub fn router() -> Router<AppState>
// GET /api/analytics/summary (protected by auth_middleware)
```

Tests:
- `test_summary_admin_ok` → 200, fields present
- `test_summary_non_admin_forbidden` → 403

Commit: `feat(routes/analytics): summary revenue tickets counts + tests`

---

## _14_: README.md + final validation

File: `benchmark/canix-app-rust/README.md`

Contents: project name, stack (Axum/SQLx/SQLite/JWT/bcrypt), setup (cp .env.example .env, cargo build --release), run (cargo run), test (cargo test), full API route list, default credentials (admin@canix.com / admin123).

Then run:
- `cargo test 2>&1 | tail -20` → must show 0 failures
- `cargo build --release 2>&1 | tail -5` → must succeed

git push origin feat/canix-rust
Close all remaining open bu-rs* beads.
gt nudge mayor "all rust beads complete feat/canix-rust ready"

Commit: `docs: README final cargo test all passing`
