const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());

const User = require('../server/models/user');
const authRoutes = require('../server/routes/auth');
const jwtUtils = require('../server/utils/jwt');
const bcryptUtils = require('../server/utils/bcrypt');

app.post('/auth/register', authRoutes.register);
app.post('/auth/login', authRoutes.login);
app.get('/auth/me', authRoutes.protectedRoute, (req, res) => {
  res.status(200).json({ user: req.user });
});

describe('Auth Tests', () => {
  let testUser = {
    email: 'test@example.com',
    password: 'testpass123',
    role: 'employee'
  };

  beforeAll(async () => {
    const testDbPath = path.resolve(__dirname, '..', '..', 'data', 'test_app.db');
    require('fs').rmSync(testDbPath, { force: true });
    require('../server/db/migrate').migrate();
  });

  afterAll(() => {
    const testDbPath = path.resolve(__dirname, '..', '..', 'data', 'test_app.db');
    require('fs').rmSync(testDbPath, { force: true });
  });

  test('register creates user and returns token', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({
        email: testUser.email,
        password: testUser.password,
        role: testUser.role
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user.email).toBe(testUser.email);
    expect(res.body.user.role).toBe(testUser.role);
  });

  test('login returns token for existing user', async () => {
    await request(app).post('/auth/register').send({
      email: 'login@example.com',
      password: 'password123',
      role: 'employee'
    });

    const res = await request(app)
      .post('/auth/login')
      .send({
        email: 'login@example.com',
        password: 'password123'
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
  });

  test('wrong password returns 401', async () => {
    await request(app).post('/auth/register').send({
      email: 'wrongpass@example.com',
      password: 'correctpass',
      role: 'employee'
    });

    const res = await request(app)
      .post('/auth/login')
      .send({
        email: 'wrongpass@example.com',
        password: 'wrongpass'
      });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  test('GET /auth/me with valid token returns 200', async () => {
    const registerRes = await request(app).post('/auth/register').send({
      email: 'token@example.com',
      password: 'tokenpass',
      role: 'employee'
    });

    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${registerRes.body.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toHaveProperty('email');
  });

  test('GET /auth/me without token returns 401', async () => {
    const res = await request(app).get('/auth/me');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });
});
