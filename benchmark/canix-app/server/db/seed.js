const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config();

const dbPath = path.resolve(__dirname, '..', '..', process.env.DB_PATH || './data/app.db');
const db = new Database(dbPath);

function seed() {
  const hashedAdmin = bcrypt.hashSync('Admin123!', 10);
  const hashedEmployee = bcrypt.hashSync('Employee123!', 10);
  const hashedClient = bcrypt.hashSync('Client123!', 10);

  db.exec(`
    INSERT INTO users (email, password, role) VALUES
      ('admin@canix.ca', '${hashedAdmin}', 'admin'),
      ('emp1@canix.ca', '${hashedEmployee}', 'employee'),
      ('emp2@canix.ca', '${hashedEmployee}', 'employee');

    INSERT INTO clients (name, email, phone, company) VALUES
      ('Client 1', 'client1@acme.ca', '555-0101', 'Acme Corp'),
      ('Client 2', 'client2@beta.ca', '555-0102', 'Beta Inc'),
      ('Client 3', 'client3@gamma.ca', '555-0103', 'Gamma LLC');
  `);

  console.log('Seed completed successfully');
}

module.exports = { seed };

if (require.main === module) {
  seed();
}
