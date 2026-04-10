import { corsHeaders, jsonError } from '../utils/helpers.js';

export async function handleAdminClassroomsRequest(request, env, ctx, url) {
    const user = request.user;

    // ---------------------------------------------------------
    // 🏫 ROUTE: GET /api/admin/classrooms
    // List all classrooms for the admin's school
    // ---------------------------------------------------------
    if (request.method === "GET" && url.pathname === "/api/admin/classrooms") {
        try {
            // Fetch classrooms and their assigned teacher's username
            const { results } = await env.DB.prepare(`
                SELECT c.id, c.name, u.username as teacher_username 
                FROM classrooms c
                LEFT JOIN delegated_users u ON c.teacher_id = u.id
                WHERE c.school_id = ?
                ORDER BY c.name ASC
            `).bind(user.school_id).all();
            
            return Response.json({ classrooms: results }, { headers: corsHeaders });
        } catch (err) {
            console.error("List Classrooms Error:", err);
            return jsonError("Failed to list classrooms", 500);
        }
    }

    // ---------------------------------------------------------
    // 🏫 ROUTE: POST /api/admin/classrooms
    // Create or Delete a classroom
    // ---------------------------------------------------------
    if (request.method === "POST" && url.pathname === "/api/admin/classrooms") {
        try {
            const { action, name, teacherId, id } = await request.json();

            if (action === "create") {
                if (!name || !teacherId) return jsonError("Classroom name and teacher ID are required.", 400);
                
                // Verify the teacher exists and belongs to the same school
                const teacherCheck = await env.DB.prepare(`SELECT id FROM delegated_users WHERE id = ? AND school_id = ? AND role = 'teacher'`).bind(teacherId, user.school_id).first();
                if (!teacherCheck) return jsonError("Invalid teacher selected.", 400);

                await env.DB.prepare(`INSERT INTO classrooms (school_id, teacher_id, name) VALUES (?, ?, ?)`).bind(user.school_id, teacherId, name).run();
                return Response.json({ success: true, message: `Classroom created successfully.` }, { headers: corsHeaders });
            } 
            else if (action === "delete") {
                if (!id) return jsonError("Classroom ID is required.", 400);
                
                // Ensure the classroom belongs to this school
                const classCheck = await env.DB.prepare(`SELECT id FROM classrooms WHERE id = ? AND school_id = ?`).bind(id, user.school_id).first();
                if (!classCheck) return jsonError("Classroom not found or access denied.", 403);

                // Deleting the classroom will cascade delete the classroom_students entries automatically
                await env.DB.prepare(`DELETE FROM classrooms WHERE id = ?`).bind(id).run();
                return Response.json({ success: true, message: "Classroom deleted successfully." }, { headers: corsHeaders });
            }

            return jsonError("Invalid action type.", 400);
        } catch (err) {
            console.error("Modify Classrooms Error:", err);
            return jsonError("Failed to modify classroom.", 500);
        }
    }

    // ---------------------------------------------------------
    // 🎒 ROUTE: POST /api/admin/classrooms/enroll
    // Enroll a student into a classroom
    // ---------------------------------------------------------
    if (request.method === "POST" && url.pathname === "/api/admin/classrooms/enroll") {
        try {
            const { studentHash, classroomId } = await request.json();

            if (!studentHash || !classroomId) return jsonError("Student hash and classroom ID are required.", 400);

            // 1. Verify classroom belongs to admin's school
            const classCheck = await env.DB.prepare(`SELECT id FROM classrooms WHERE id = ? AND school_id = ?`).bind(classroomId, user.school_id).first();
            if (!classCheck) return jsonError("Invalid classroom.", 403);

            // 2. Pre-register the student if they don't exist yet!
            await env.DB.prepare(`INSERT OR IGNORE INTO students (student_hash, school_id) VALUES (?, ?)`).bind(studentHash, user.school_id).run();

            // 3. Verify the student is locked to THIS school
            // (If they were already registered to another campus, the IGNORE above skipped them)
            const studentCheck = await env.DB.prepare(`SELECT school_id FROM students WHERE student_hash = ?`).bind(studentHash).first();
            if (studentCheck.school_id !== user.school_id) {
                return jsonError("This student is registered to a different campus. A Master Admin must transfer them first.", 403);
            }

            // 4. Enroll the student in the classroom
            await env.DB.prepare(`INSERT OR IGNORE INTO classroom_students (classroom_id, student_hash) VALUES (?, ?)`).bind(classroomId, studentHash).run();

            return Response.json({ success: true, message: "Student enrolled securely." }, { headers: corsHeaders });
        } catch (err) {
            console.error("Enroll Student Error:", err);
            return jsonError("Failed to enroll student.", 500);
        }
    }

    return null;
}