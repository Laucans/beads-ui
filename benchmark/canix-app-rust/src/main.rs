use axum::Router;
use sqlx::SqlitePool;
use tower_http::cors::CorsLayer;

mod auth;
mod db;
mod errors;
mod models;
mod routes;

#[derive(Clone)]
pub struct AppState {
    pub pool: SqlitePool,
    pub jwt_secret: String,
}

#[tokio::main]
async fn main() {
    dotenv::dotenv().ok();
    let db_path = std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:./data/canix.db".to_string());
    let jwt_secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| "dev-secret-key-min-32-chars-long".to_string());
    let port: u16 = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string()).parse().unwrap();
    tokio::fs::create_dir_all("./data").await.unwrap();
    let pool = SqlitePool::connect(&db_path).await.unwrap();
    crate::db::run_migrations(&pool).await.unwrap();
    crate::db::seed(&pool).await.unwrap();
    let state = AppState { pool, jwt_secret };
    let app = Router::new()
        .merge(routes::auth::router())
        .merge(routes::clients::router())
        .merge(routes::quotes::router())
        .merge(routes::tickets::router())
        .merge(routes::analytics::router())
        .with_state(state)
        .layer(CorsLayer::permissive());
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
