import { corsHeaders, jsonError } from '../utils/helpers.js';

export async function handleAdminSchoolsRequest(request, env, ctx, url) {
    const user = request.user;

    // 🔒 STRICT RBAC: Only Master Admins can manage physical schools and perform student transfers
    if (user.role !== 'master_admin') {
        return jsonError("Forbidden. Master Admin access required.", 403);
    }

    // ---------------------------------------------------------
    // 🏫 ROUTE: GET /api/admin/schools
    // List all schools
    // ---------------------------------------------------------
    if (request.method === "GET" && url.pathname === "/api/admin/schools") {
        try {
            const { results } = await env.DB.prepare(`SELECT id, name, created_at FROM schools ORDER BY id ASC`).all();
            return Response.json({ schools: results }, { headers: corsHeaders });
        } catch (err) {
            console.error("List Schools Error:", err);
            return jsonError("Failed to list schools", 500);
        }
    }

    // ---------------------------------------------------------
    // 🏫 ROUTE: POST /api/admin/schools
    // Create or Delete a school
    // ---------------------------------------------------------
    if (request.method === "POST" && url.pathname === "/api/admin/schools") {
        try {
            const { action, name, id } = await request.json();

            if (action === "create") {
                if (!name) return jsonError("School name is required.", 400);
                await env.DB.prepare(`INSERT INTO schools (name) VALUES (?)`).bind(name).run();
                return Response.json({ success: true, message: `School '${name}' created successfully.` }, { headers: corsHeaders });
            } 
            else if (action === "delete") {
                if (!id) return jsonError("School ID is required.", 400);
                if (id === 1) return jsonError("The DEFAULT fallback school (ID 1) cannot be deleted.", 403);
                
                await env.DB.prepare(`DELETE FROM schools WHERE id = ?`).bind(id).run();
                return Response.json({ success: true, message: "School deleted successfully." }, { headers: corsHeaders });
            }

            return jsonError("Invalid action type.", 400);
        } catch (err) {
            console.error("Modify Schools Error:", err);
            return jsonError("Failed to modify school.", 500);
        }
    }

    // ---------------------------------------------------------
    // 🎒 ROUTE: GET /api/admin/schools/students
    // List registered students
    // ---------------------------------------------------------
    if (request.method === "GET" && url.pathname === "/api/admin/schools/students") {
        try {
            // Include a JOIN to get the school name for the UI
            const { results } = await env.DB.prepare(`
                SELECT s.student_hash, s.school_id, s.registered_at, sc.name as school_name 
                FROM students s
                JOIN schools sc ON s.school_id = sc.id
                ORDER BY s.registered_at DESC LIMIT 500
            `).all();
            return Response.json({ students: results }, { headers: corsHeaders });
        } catch (err) {
            console.error("List Students Error:", err);
            return jsonError("Failed to fetch students.", 500);
        }
    }

    // ---------------------------------------------------------
    // 🔄 ROUTE: POST /api/admin/schools/students/transfer
    // Securely override the local enrollment lock and move a student
    // ---------------------------------------------------------
    if (request.method === "POST" && url.pathname === "/api/admin/schools/students/transfer") {
        try {
            const { studentHash, newSchoolId } = await request.json();

            if (!studentHash || !newSchoolId) return jsonError("Student Hash and New School ID are required.", 400);

            // Verify the new school actually exists
            const schoolCheck = await env.DB.prepare(`SELECT id FROM schools WHERE id = ?`).bind(newSchoolId).first();
            if (!schoolCheck) return jsonError("The target school does not exist.", 404);

            await env.DB.prepare(`UPDATE students SET school_id = ? WHERE student_hash = ?`).bind(newSchoolId, studentHash).run();

            // 📝 AUDIT LOGGING
            ctx.waitUntil((async () => {
                const settings = await env.DB.prepare(`SELECT setting_value FROM system_settings WHERE setting_key = 'enable_audit_logging'`).first();
                if (settings && settings.setting_value === '1') {
                    const auditUserId = user.id === 0 ? null : user.id;
                    await env.DB.prepare(`INSERT INTO audit_logs (user_id, action, target) VALUES (?, 'transfer_student', ?)`).bind(auditUserId, studentHash).run();
                }
            })());

            return Response.json({ success: true, message: "Student successfully transferred to new school." }, { headers: corsHeaders });
        } catch (err) {
            console.error("Student Transfer Error:", err);
            return jsonError("Failed to transfer student.", 500);
        }
    }

    return null;
}