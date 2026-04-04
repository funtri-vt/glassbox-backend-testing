import { corsHeaders } from './utils/helpers.js';
import { rebuildMasterRulesCache } from './utils/cache.js';
import { handleApiRequest } from './api.js';

export default {
    async fetch(request, env, ctx) {
        // Handle CORS preflight requests globally
        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);

        try {
            // ---------------------------------------------------------
            // 🌐 MASTER API ROUTER
            // ---------------------------------------------------------
            if (url.pathname.startsWith("/api/")) {
                const response = await handleApiRequest(request, env, ctx, url);
                if (response) return response;
            }

            // 404 Fallback for anything that didn't match the API routes
            return new Response("Not Found", { status: 404, headers: corsHeaders });

        } catch (err) {
            console.error("Global Request Error:", err);
            return Response.json(
                { error: "Server Error", details: err.message }, 
                { status: 500, headers: corsHeaders }
            );
        }
    },

    // ------------------------------------------------------------------
    // CRON JOB: Automatically rebuilds KV cache in the background
    // ------------------------------------------------------------------
    async scheduled(event, env, ctx) {
        console.log("Cron triggered...");
        // Delegates the work to our centralized Cache Manager
        await rebuildMasterRulesCache(env, ctx);

        // 🧹 ---------------------------------------------------------------
        // ROUTINE DATABASE CLEANUP
        // ------------------------------------------------------------------
        try {
            console.log("Running routine database cleanup...");
            
            // 1. Calculate our Version Cutoff (Current Version minus 50)
            const state = await env.DB.prepare(`SELECT current_version FROM system_state WHERE id = 1`).first();
            const cutoffVersion = Math.max(1, state.current_version - 50);

            // 2. Wipe old rules and stale requests in a single batch
            await env.DB.batch([
                // Delete deactivated rules older than 50 versions (since clients are forced to full-sync anyway)
                env.DB.prepare(`DELETE FROM rules WHERE is_active = 0 AND version_removed < ?`).bind(cutoffVersion),
                
                // Delete approved/denied requests older than 30 days
                env.DB.prepare(`DELETE FROM unblock_requests WHERE status != 'pending' AND created_at < date('now', '-30 days')`)
            ]);
            
            console.log("✅ Cleanup complete.");
        } catch (err) {
            console.error("❌ Cleanup failed:", err);
        }
    }
};