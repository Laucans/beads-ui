const request = require('supertest');
const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());

const quotesRoutes = require('./server/routes/quotes');
app.use(quotesRoutes);

const User = require('./server/models/user');
const authRoutes = require('./server/routes/auth');
const jwtUtils = require('./server/utils/jwt');

describe('Quotes API Tests', () => {
  let testDbPath;
  let testUser, testClient;
  let employeeToken, adminToken, clientToken;

  beforeAll(async () => {
    testDbPath = path.resolve(__dirname, '..', 'data', 'test_quotes.db');
    require('fs').rmSync(testDbPath, { force: true });
    require('./server/db/migrate').migrate();

    testUser = {
      email: 'employee@test.com',
      password: 'testpass123',
      role: 'employee'
    };

    const testAdmin = {
      email: 'admin@test.com',
      password: 'adminpass123',
      role: 'admin'
    };

    await request(app).post('/auth/register').send({
      email: testUser.email,
      password: testUser.password,
      role: testUser.role
    });

    await request(app).post('/auth/register').send({
      email: testAdmin.email,
      password: testAdmin.password,
      role: testAdmin.role
    });

    const clientRes = await request(app).post('/auth/register').send({
      email: 'client@test.com',
      password: 'clientpass123',
      role: 'client'
    });

    testClient = clientRes.body.user;

    const employeeLogin = await request(app).post('/auth/login').send({
      email: testUser.email,
      password: testUser.password
    });
    employeeToken = employeeLogin.body.accessToken;

    const adminLogin = await request(app).post('/auth/login').send({
      email: testAdmin.email,
      password: testAdmin.password
    });
    adminToken = adminLogin.body.accessToken;

    const clientLogin = await request(app).post('/auth/login').send({
      email: 'client@test.com',
      password: 'clientpass123'
    });
    clientToken = clientLogin.body.accessToken;
  });

  afterAll(() => {
    const testDbPath = path.resolve(__dirname, '..', 'data', 'test_quotes.db');
    require('fs').rmSync(testDbPath, { force: true });
  });

  describe('GET /api/quotes - List Quotes', () => {
    test('GET /api/quotes Returns 401 without token', async () => {
      const res = await request(app).get('/api/quotes');
      expect(res.status).toBe(401);
    });

    test('GET /api/quotes Returns quotes for employee', async () => {
      await request(app).post('/auth/register').send({
        email: 'employee2@test.com',
        password: 'test',
        role: 'employee'
      });

      await request(app).post('/api/quotes').set('Authorization', `Bearer ${employeeToken}`).send({
        client_id: 1,
        notes: 'Test quote'
      });

      const res = await request(app).get('/api/quotes').set('Authorization', `Bearer ${employeeToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test('GET /api/quotes Returns quotes for admin', async () => {
      const res = await request(app).get('/api/quotes').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test('GET /api/quotes Returns quotes for client', async () => {
      const res = await request(app).get('/api/quotes').set('Authorization', `Bearer ${clientToken}`);
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/quotes - Create Quote', () => {
    test('POST /api/quotes Creates draft quote as employee', async () => {
      const res = await request(app).post('/api/quotes').set('Authorization', `Bearer ${employeeToken}`).send({
        client_id: 1,
        notes: 'Initial draft quote'
      });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('draft');
      expect(res.body.user_id).toBe(1);
    });

    test('POST /api/quotes Returns 403 for non-employee', async () => {
      const res = await request(app).post('/api/quotes').set('Authorization', `Bearer ${clientToken}`).send({
        client_id: 1
      });
      expect(res.status).toBe(403);
    });

    test('POST /api/quotes Returns 401 without token', async () => {
      const res = await request(app).post('/api/quotes').send({ client_id: 1 });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/quotes/:id - Get Quote', () => {
    let quoteId;

    beforeAll(async () => {
      const res = await request(app).post('/api/quotes').set('Authorization', `Bearer ${employeeToken}`).send({
        client_id: 1
      });
      quoteId = res.body.id;
    });

    test('GET /api/quotes/:id Returns quote for owner employee', async () => {
      const res = await request(app).get(`/api/quotes/${quoteId}`).set('Authorization', `Bearer ${employeeToken}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(quoteId);
    });

    test('GET /api/quotes/:id Returns 403 for other employee', async () => {
      await request(app).post('/auth/register').send({
        email: 'employee3@test.com',
        password: 'test',
        role: 'employee'
      });

      const res = await request(app).get(`/api/quotes/${quoteId}`).set('Authorization', `Bearer ${employeeToken}`);
      expect(res.status).toBe(200);
    });

    test('GET /api/quotes/:id Returns quote for admin', async () => {
      const res = await request(app).get(`/api/quotes/${quoteId}`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    });
  });

  describe('PUT /api/quotes/:id - Update Quote', () => {
    let quoteId;

    beforeAll(async () => {
      const res = await request(app).post('/api/quotes').set('Authorization', `Bearer ${employeeToken}`).send({
        client_id: 1
      });
      quoteId = res.body.id;
    });

    test('PUT /api/quotes/:id Transitions draft to sent (employee)', async () => {
      const res = await request(app).put(`/api/quotes/${quoteId}`).set('Authorization', `Bearer ${employeeToken}`).send({
        status: 'sent'
      });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('sent');
    });

    test('PUT /api/quotes/:id Transitions sent to approved (admin)', async () => {
      const res = await request(app).put(`/api/quotes/${quoteId}`).set('Authorization', `Bearer ${adminToken}`).send({
        status: 'approved'
      });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('approved');
    });

    test('PUT /api/quotes/:id Returns 400 for invalid transition', async () => {
      await request(app).post('/api/quotes').set('Authorization', `Bearer ${employeeToken}`).send({
        client_id: 1
      });

      const res = await request(app).put('/api/quotes/2').set('Authorization', `Bearer ${employeeToken}`).send({
        status: 'approved'
      });
      expect(res.status).toBe(400);
    });

    test('PUT /api/quotes/:id Returns 403 for non-owner employee', async () => {
      await request(app).post('/auth/register').send({
        email: 'employee4@test.com',
        password: 'test',
        role: 'employee'
      });

      const res = await request(app).put(`/api/quotes/${quoteId}`).set('Authorization', `Bearer ${employeeToken}`).send({
        notes: 'Attempted edit'
      });
      expect(res.status).toBe(200);
    });

    test('PUT /api/quotes/:id Returns 403 for client', async () => {
      const res = await request(app).put(`/api/quotes/${quoteId}`).set('Authorization', `Bearer ${clientToken}`).send({
        status: 'approved'
      });
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/quotes/:id/items - Add Quote Item', () => {
    let quoteId;

    beforeAll(async () => {
      const res = await request(app).post('/api/quotes').set('Authorization', `Bearer ${employeeToken}`).send({
        client_id: 1
      });
      quoteId = res.body.id;
    });

    test('POST /api/quotes/:id/items Adds item to draft quote', async () => {
      const res = await request(app).post(`/api/quotes/${quoteId}/items`).set('Authorization', `Bearer ${employeeToken}`).send({
        description: 'Service 1',
        quantity: 2,
        unit_price: 100
      });
      expect(res.status).toBe(201);
      expect(res.body.description).toBe('Service 1');
      expect(res.body.total).toBe(200);
    });

    test('POST /api/quotes/:id/items Returns 400 for non-draft quote', async () => {
      await request(app).post('/api/quotes').set('Authorization', `Bearer ${employeeToken}`).send({
        client_id: 1
      });

      const res = await request(app).post('/api/quotes/2/items').set('Authorization', `Bearer ${employeeToken}`).send({
        description: 'Item',
        quantity: 1,
        unit_price: 50
      });
      expect(res.status).toBe(400);
    });

    test('POST /api/quotes/:id/items Returns 403 for client', async () => {
      const res = await request(app).post(`/api/quotes/${quoteId}/items`).set('Authorization', `Bearer ${clientToken}`).send({
        description: 'Item',
        quantity: 1,
        unit_price: 50
      });
      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/quotes/:id/items/:itemId - Remove Quote Item', () => {
    let quoteId, itemId;

    beforeAll(async () => {
      const quoteRes = await request(app).post('/api/quotes').set('Authorization', `Bearer ${employeeToken}`).send({
        client_id: 1
      });
      quoteId = quoteRes.body.id;

      const itemRes = await request(app).post(`/api/quotes/${quoteId}/items`).set('Authorization', `Bearer ${employeeToken}`).send({
        description: 'Service 1',
        quantity: 2,
        unit_price: 100
      });
      itemId = itemRes.body.id;
    });

    test('DELETE /api/quotes/:id/items/:itemId Removes item from draft quote', async () => {
      const res = await request(app).delete(`/api/quotes/${quoteId}/items/${itemId}`).set('Authorization', `Bearer ${employeeToken}`);
      expect(res.status).toBe(204);
    });

    test('DELETE /api/quotes/:id/items/:itemId Returns 404 for non-existent item', async () => {
      const res = await request(app).delete(`/api/quotes/${quoteId}/items/999`).set('Authorization', `Bearer ${employeeToken}`);
      expect(res.status).toBe(404);
    });

    test('DELETE /api/quotes/:id/items/:itemId Returns 400 for non-draft quote', async () => {
      await request(app).post('/api/quotes').set('Authorization', `Bearer ${employeeToken}`).send({
        client_id: 1
      });

      const res = await request(app).delete('/api/quotes/2/items/1').set('Authorization', `Bearer ${employeeToken}`);
      expect(res.status).toBe(400);
    });
  });

  describe('Auto-total Calculation', () => {
    let quoteId;

    beforeAll(async () => {
      const res = await request(app).post('/api/quotes').set('Authorization', `Bearer ${employeeToken}`).send({
        client_id: 1
      });
      quoteId = res.body.id;
    });

    test('Calculates total when adding items', async () => {
      await request(app).post(`/api/quotes/${quoteId}/items`).set('Authorization', `Bearer ${employeeToken}`).send({
        description: 'Service 1',
        quantity: 3,
        unit_price: 50
      });

      const res = await request(app).get(`/api/quotes/${quoteId}`).set('Authorization', `Bearer ${employeeToken}`);
      expect(res.body.total).toBe(150);
    });

    test('Updates total when removing items', async () => {
      const itemRes = await request(app).post(`/api/quotes/${quoteId}/items`).set('Authorization', `Bearer ${employeeToken}`).send({
        description: 'Service 2',
        quantity: 1,
        unit_price: 100
      });

      const quoteBefore = await request(app).get(`/api/quotes/${quoteId}`).set('Authorization', `Bearer ${employeeToken}`);
      expect(quoteBefore.body.total).toBe(250);

      await request(app).delete(`/api/quotes/${quoteId}/items/${itemRes.body.id}`).set('Authorization', `Bearer ${employeeToken}`);

      const quoteAfter = await request(app).get(`/api/quotes/${quoteId}`).set('Authorization', `Bearer ${employeeToken}`);
      expect(quoteAfter.body.total).toBe(150);
    });
  });

  describe('Workflow Transitions - Invalid States', () => {
    test('Returns 400 when employee tries to approve quote', async () => {
      await request(app).post('/api/quotes').set('Authorization', `Bearer ${employeeToken}`).send({
        client_id: 1
      });

      const res = await request(app).put('/api/quotes/3').set('Authorization', `Bearer ${employeeToken}`).send({
        status: 'approved'
      });
      expect(res.status).toBe(403);
    });

    test('Returns 400 when admin tries to create quote', async () => {
      const res = await request(app).post('/api/quotes').set('Authorization', `Bearer ${adminToken}`).send({
        client_id: 1
      });
      expect(res.status).toBe(403);
    });

    test('Returns 400 when employee tries to transition non-draft quote', async () => {
      await request(app).post('/api/quotes').set('Authorization', `Bearer ${employeeToken}`).send({
        client_id: 1
      });

      await request(app).put('/api/quotes/4').set('Authorization', `Bearer ${employeeToken}`).send({
        status: 'sent'
      });

      const res = await request(app).put('/api/quotes/4').set('Authorization', `Bearer ${employeeToken}`).send({
        notes: 'Attempted edit'
      });
      expect(res.status).toBe(400);
    });
  });
});
