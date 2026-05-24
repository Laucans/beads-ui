use anyhow::Result;
use bcrypt::{hash, verify};

pub fn hash_password(password: &str) -> Result<String> {
    hash(password, bcrypt::DEFAULT_COST).map_err(anyhow::Error::from)
}

pub fn verify_password(password: &str, hash: &str) -> Result<bool> {
    verify(password, hash).map_err(anyhow::Error::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_and_verify_correct() -> Result<()> {
        let password = "test_password_123";
        let hashed = hash_password(password)?;
        let is_valid = verify_password(password, &hashed)?;
        assert!(is_valid);
        Ok(())
    }

    #[test]
    fn test_verify_wrong_password() -> Result<()> {
        let password = "correct_password";
        let wrong_password = "wrong_password";
        let hashed = hash_password(password)?;
        let is_valid = verify_password(wrong_password, &hashed)?;
        assert!(!is_valid);
        Ok(())
    }

    #[test]
    fn test_hash_uniqueness() -> Result<()> {
        let password = "same_password";
        let hash1 = hash_password(password)?;
        let hash2 = hash_password(password)?;
        assert_ne!(hash1, hash2);
        Ok(())
    }
}
