use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: String,
    pub email: String,
    pub password_hash: String,
    pub role: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
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

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Quote {
    pub id: String,
    pub client_id: String,
    pub created_by: String,
    pub status: String,
    pub total: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct QuoteItem {
    pub id: String,
    pub quote_id: String,
    pub description: String,
    pub quantity: i64,
    pub unit_price: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Ticket {
    pub id: String,
    pub client_id: String,
    pub assigned_to: Option<String>,
    pub title: String,
    pub description: String,
    pub status: String,
    pub priority: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct TicketMessage {
    pub id: String,
    pub ticket_id: String,
    pub author_id: String,
    pub message: String,
    pub created_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_user_serialize() {
        let user = User {
            id: "user1".to_string(),
            email: "test@example.com".to_string(),
            password_hash: "hash123".to_string(),
            role: "admin".to_string(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
        };

        let json = serde_json::to_string(&user).expect("Serialization should succeed");
        assert!(json.contains("test@example.com"));
    }

    #[test]
    fn test_quote_total_default() {
        let quote = Quote {
            id: "quote1".to_string(),
            client_id: "client1".to_string(),
            created_by: "user1".to_string(),
            status: "draft".to_string(),
            total: 0.0,
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: "2024-01-01T00:00:00Z".to_string(),
        };

        let _total: f64 = quote.total;
    }
}
