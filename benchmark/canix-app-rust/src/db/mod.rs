use anyhow::Result;
use sqlx::SqlitePool;

pub async fn run_migrations(pool: &SqlitePool) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('admin', 'employee', 'client')),
            created_at TEXT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS clients (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT,
            company TEXT,
            assigned_to TEXT REFERENCES users(id),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS quotes (
            id TEXT PRIMARY KEY,
            client_id TEXT NOT NULL REFERENCES clients(id),
            created_by TEXT NOT NULL REFERENCES users(id),
            status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'approved', 'rejected')),
            total REAL NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS quote_items (
            id TEXT PRIMARY KEY,
            quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
            description TEXT NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 1,
            unit_price REAL NOT NULL DEFAULT 0
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS tickets (
            id TEXT PRIMARY KEY,
            client_id TEXT NOT NULL REFERENCES clients(id),
            assigned_to TEXT REFERENCES users(id),
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
            priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS ticket_messages (
            id TEXT PRIMARY KEY,
            ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
            author_id TEXT NOT NULL REFERENCES users(id),
            message TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn seed(pool: &SqlitePool) -> Result<()> {
    let existing_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(pool)
        .await?;

    if existing_count > 0 {
        return Ok(());
    }

    let admin_id = "admin-uuid";
    let admin_hash = bcrypt::hash("admin123", bcrypt::DEFAULT_COST)?;

    let now = chrono::Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(admin_id)
    .bind("admin@canix.com")
    .bind(&admin_hash)
    .bind("admin")
    .bind(&now)
    .execute(pool)
    .await?;

    let employee1_id = "emp1-uuid";
    let employee1_hash = bcrypt::hash("password1", bcrypt::DEFAULT_COST)?;

    sqlx::query(
        "INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(employee1_id)
    .bind("employee1@canix.com")
    .bind(&employee1_hash)
    .bind("employee")
    .bind(&now)
    .execute(pool)
    .await?;

    let employee2_id = "emp2-uuid";
    let employee2_hash = bcrypt::hash("password2", bcrypt::DEFAULT_COST)?;

    sqlx::query(
        "INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(employee2_id)
    .bind("employee2@canix.com")
    .bind(&employee2_hash)
    .bind("employee")
    .bind(&now)
    .execute(pool)
    .await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::SqlitePool;

    #[tokio::test]
    async fn test_migrations_create_tables() {
        let pool = SqlitePool::connect(":memory:").await.unwrap();
        run_migrations(&pool).await.unwrap();

        let tables: Vec<String> = sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type='table'")
            .fetch_all(&pool)
            .await
            .unwrap();

        assert_eq!(tables.len(), 6);
        assert!(tables.contains(&"users".to_string()));
        assert!(tables.contains(&"clients".to_string()));
        assert!(tables.contains(&"quotes".to_string()));
        assert!(tables.contains(&"quote_items".to_string()));
        assert!(tables.contains(&"tickets".to_string()));
        assert!(tables.contains(&"ticket_messages".to_string()));
    }

    #[tokio::test]
    async fn test_seed_creates_admin() {
        let pool = SqlitePool::connect(":memory:").await.unwrap();
        run_migrations(&pool).await.unwrap();
        seed(&pool).await.unwrap();

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE role='admin'")
            .fetch_one(&pool)
            .await
            .unwrap();

        assert_eq!(count, 1);

        let admin_email: String = sqlx::query_scalar("SELECT email FROM users WHERE role='admin'")
            .fetch_one(&pool)
            .await
            .unwrap();

        assert_eq!(admin_email, "admin@canix.com");
    }

    #[tokio::test]
    async fn test_seed_idempotent() {
        let pool = SqlitePool::connect(":memory:").await.unwrap();
        run_migrations(&pool).await.unwrap();
        seed(&pool).await.unwrap();
        seed(&pool).await.unwrap();

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
            .fetch_one(&pool)
            .await
            .unwrap();

        assert_eq!(count, 3);
    }
}
