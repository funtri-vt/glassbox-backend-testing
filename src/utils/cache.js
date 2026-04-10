export async function rebuildMasterRulesCache(env, ctx, schoolId = 1) {
    console.log(`Rebuilding master_rules KV Cache for school_id: ${schoolId}...`);
    try {
        const state = await env.DB.prepare(`SELECT current_version FROM system_state WHERE id = 1`).first();
        
        // 🎯 FIX: Included classroom_id in the SELECT statement so the backend can filter the KV cache!
        const { results } = await env.DB.prepare(
            `SELECT id, target, match_type, action, classroom_id FROM rules WHERE is_active = 1 AND school_id IN (1, ?)`
        ).bind(schoolId).all();
        
        const fullState = { version: state.current_version, rules: results };
        const cacheKey = `master_rules_${schoolId}`;
        const cachePromise = env.GLASSBOX_KV.put(cacheKey, JSON.stringify(fullState));
        
        if (ctx && ctx.waitUntil) {
            ctx.waitUntil(cachePromise);
        } else {
            await cachePromise; 
        }
        
        console.log(`✅ KV Cache successfully updated to version ${state.current_version} for school_id: ${schoolId}`);
        return fullState;

    } catch (err) {
        console.error(`❌ Failed to rebuild KV cache for school_id: ${schoolId}:`, err);
        throw err; 
    }
}