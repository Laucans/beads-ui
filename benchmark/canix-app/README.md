# canix-app

CRM and business management application with quotes and ticketing.

## Installation

```bash
npm install
npm start
```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `JWT_SECRET` | JWT token secret | `your-secret-key-here` |

## NPM Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start server in production mode |
| `npm run dev` | Start server with nodemon for development |
| `npm test` | Run test suite |
| `npm run lint` | Lint codebase |

## Architecture

```
benchmark/canix-app/
├── server/
│   ├── index.js       # Express app, middleware, routes
│   └── routes/        # API route handlers
│       ├── crm.js
│       ├── quotes.js
│       ├── tickets.js
│       └── analytics.js
├── public/            # Static files
│   ├── admin/
│   ├── client/
│   └── employee/
└── tests/             # Test files
```

## Test Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@demo.com | admin123 |
| Employee | employee@demo.com | employee123 |
| Client | client@demo.com | client123 |
