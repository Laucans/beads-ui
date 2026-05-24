const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const dbPath = path.resolve(__dirname, '..', '..', process.env.DB_PATH || './data/app.db');
const db = new Database(dbPath);

class User {
  constructor(data) {
    this.id = data.id;
    this.email = data.email;
    this.password = data.password;
    this.role = data.role;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  static find(id) {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    const row = stmt.get(id);
    return row ? new User(row) : null;
  }

  static findByEmail(email) {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    const row = stmt.get(email);
    return row ? new User(row) : null;
  }

  static findAll() {
    const rows = db.prepare('SELECT * FROM users').all();
    return rows.map(row => new User(row));
  }

  static create({ email, password, role }) {
    const stmt = db.prepare('INSERT INTO users (email, password, role) VALUES (?, ?, ?)');
    const result = stmt.run(email, password, role || 'employee');
    return this.find(result.lastInsertRowid);
  }

  update(data) {
    const fields = [];
    const values = [];

    if (data.email) {
      fields.push('email = ?');
      values.push(data.email);
    }
    if (data.password) {
      fields.push('password = ?');
      values.push(data.password);
    }
    if (data.role) {
      fields.push('role = ?');
      values.push(data.role);
    }

    if (fields.length > 0) {
      values.push(this.id);
      const stmt = db.prepare(`UPDATE users SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
      stmt.run(...values);
      return this.find(this.id);
    }
    return this;
  }

  delete() {
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    stmt.run(this.id);
    return true;
  }
}

module.exports = User;
