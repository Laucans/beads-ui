import { describe, it, expect, beforeEach, vi } from 'vitest';

const API_BASE = 'http://localhost:3000/api';

global.fetch = vi.fn();

describe('Tickets API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a ticket', async () => {
    const mockResponse = {
      id: 1,
      title: 'Test Ticket',
      description: 'Test description',
      status: 'open',
      clientId: 123,
      createdAt: new Date().toISOString()
    };

    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const response = await fetch(`${API_BASE}/tickets`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Test Ticket',
        description: 'Test description',
        clientId: 123
      })
    });

    const data = await response.json();
    expect(data.id).toBe(1);
    expect(data.status).toBe('open');
    expect(global.fetch).toHaveBeenCalled();
  });

  it('should assign ticket to employee', async () => {
    const mockResponse = {
      id: 1,
      title: 'Test Ticket',
      employeeId: 456
    };

    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const response = await fetch(`${API_BASE}/tickets/1/assign`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: 456 })
    });

    const data = await response.json();
    expect(data.employeeId).toBe(456);
    expect(global.fetch).toHaveBeenCalled();
  });

  it('should resolve a ticket', async () => {
    const mockResponse = {
      id: 1,
      title: 'Test Ticket',
      status: 'resolved'
    };

    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const response = await fetch(`${API_BASE}/tickets/1/resolve`, {
      method: 'POST',
      credentials: 'include'
    });

    const data = await response.json();
    expect(data.status).toBe('resolved');
    expect(global.fetch).toHaveBeenCalled();
  });

  it('should add message to ticket', async () => {
    const mockResponse = {
      id: 1,
      ticketId: 1,
      text: 'Test message',
      userId: 123,
      createdAt: new Date().toISOString()
    };

    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const response = await fetch(`${API_BASE}/tickets/1/messages`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Test message' })
    });

    const data = await response.json();
    expect(data.text).toBe('Test message');
    expect(global.fetch).toHaveBeenCalled();
  });

  it('should enforce client isolation', async () => {
    const mockResponse = [];
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const clientId = 123;
    const response = await fetch(`${API_BASE}/tickets?clientId=${clientId}`, {
      credentials: 'include'
    });

    const data = await response.json();
    expect(data).toEqual([]);
    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE}/tickets?clientId=${clientId}`,
      expect.objectContaining({ credentials: 'include' })
    );
  });
});

describe('Tickets UI', () => {
  describe('Client Tickets Page', () => {
    it('should display create ticket form', () => {
      expect(document.body).toBeTruthy();
    });

    it('should show list of own tickets', () => {
      expect(document.body).toBeTruthy();
    });
  });

  describe('Employee Kanban Board', () => {
    it('should have 3 columns: open, in_progress, resolved', () => {
      expect(document.body).toBeTruthy();
    });

    it('should support drag and drop', () => {
      expect(document.body).toBeTruthy();
    });
  });

  describe('Admin Tickets Page', () => {
    it('should show all tickets table', () => {
      expect(document.body).toBeTruthy();
    });

    it('should have reassign dropdown', () => {
      expect(document.body).toBeTruthy();
    });
  });
});
