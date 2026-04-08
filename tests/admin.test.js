import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { handleAdminRequest } from '../src/api/admin.js';

// Mock context for the worker
const ctx = {};

// ==========================================
// 🛠️ DATABASE & ENV SETUP HOOK
// ==========================================
beforeEach(async () => {
    // 1. Wipe and recreate the push subscriptions table
    await env.DB.batch([
        env.DB.prepare(`DROP TABLE IF EXISTS admin_push_subscriptions`),
        env.DB.prepare(`CREATE TABLE admin_push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
    ]);

    // 2. Inject dummy environment variables for testing
    env.ADMIN_SECRET = "super_secret_test_key_123";
    env.VAPID_KEYS = JSON.stringify({
        publicKey: "dummy_public_key_abc",
        privateKey: "dummy_private_key_xyz"
    });
});

describe('Admin API - Global Auth Middleware', () => {

    it('should reject requests missing the Authorization header', async () => {
        const req = new Request('https://worker.local/api/admin/vapid-public', {
            method: 'GET'
            // No headers provided
        });
        
        const response = await handleAdminRequest(req, env, ctx, new URL(req.url));
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data.error).toBe("Unauthorized");
    });

    it('should reject requests with an incorrect Bearer token', async () => {
        const req = new Request('https://worker.local/api/admin/vapid-public', {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer wrong_key_here'
            }
        });
        
        const response = await handleAdminRequest(req, env, ctx, new URL(req.url));
        expect(response.status).toBe(401);
    });

});

describe('Admin API - Web Push Routes', () => {

    it('should securely return ONLY the VAPID public key', async () => {
        const req = new Request('https://worker.local/api/admin/vapid-public', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${env.ADMIN_SECRET}` }
        });
        
        const response = await handleAdminRequest(req, env, ctx, new URL(req.url));
        const data = await response.json();

        expect(response.status).toBe(200);
        
        // Assert it returned the public key
        expect(data.publicKey).toBe("dummy_public_key_abc");
        
        // CRITICAL SECURITY ASSERTION: Ensure the private key was NOT leaked
        expect(data.privateKey).toBeUndefined();
    });

    it('should successfully save a valid push subscription', async () => {
        const mockSubscription = {
            endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
            keys: {
                p256dh: "test_p256dh_key",
                auth: "test_auth_secret"
            }
        };

        const req = new Request('https://worker.local/api/admin/push/subscribe', {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${env.ADMIN_SECRET}`,
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify(mockSubscription)
        });
        
        const response = await handleAdminRequest(req, env, ctx, new URL(req.url));
        const data = await response.json();

        // 1. Verify HTTP Success
        expect(response.status).toBe(200);
        expect(data.success).toBe(true);

        // 2. Verify D1 Database state directly
        const dbResult = await env.DB.prepare(`SELECT * FROM admin_push_subscriptions`).all();
        expect(dbResult.results.length).toBe(1);
        expect(dbResult.results[0].endpoint).toBe("https://fcm.googleapis.com/fcm/send/test-endpoint");
        expect(dbResult.results[0].p256dh).toBe("test_p256dh_key");
        expect(dbResult.results[0].auth).toBe("test_auth_secret");
    });

    it('should silently update (UPSERT) an existing push subscription if endpoint matches', async () => {
        // 1. Pre-seed the database with an existing subscription
        await env.DB.prepare(`INSERT INTO admin_push_subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)`)
            .bind("https://same-endpoint.com", "old_key", "old_auth")
            .run();

        // 2. Send a new request with the SAME endpoint but NEW keys
        const mockUpdate = {
            endpoint: "https://same-endpoint.com",
            keys: { p256dh: "new_key", auth: "new_auth" }
        };

        const req = new Request('https://worker.local/api/admin/push/subscribe', {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${env.ADMIN_SECRET}`,
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify(mockUpdate)
        });
        
        await handleAdminRequest(req, env, ctx, new URL(req.url));

        // 3. Verify it UPSERTED (updated the existing row) instead of duplicating or crashing
        const dbResult = await env.DB.prepare(`SELECT * FROM admin_push_subscriptions`).all();
        expect(dbResult.results.length).toBe(1); // Still only 1 row!
        expect(dbResult.results[0].p256dh).toBe("new_key");
        expect(dbResult.results[0].auth).toBe("new_auth");
    });

    it('should reject malformed subscription payloads', async () => {
        // Missing the nested 'keys' object
        const malformedSub = {
            endpoint: "https://bad-payload.com"
        };

        const req = new Request('https://worker.local/api/admin/push/subscribe', {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${env.ADMIN_SECRET}`,
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify(malformedSub)
        });
        
        const response = await handleAdminRequest(req, env, ctx, new URL(req.url));
        expect(response.status).toBe(400);
    });

});