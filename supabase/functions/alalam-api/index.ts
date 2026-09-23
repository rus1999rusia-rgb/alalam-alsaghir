import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const BUCKET = "alalam-submissions";
const SESSION_HOURS = 8;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_ADMIN_IMAGES = 8;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_SECTIONS = new Set(["math_lab", "research", "school_trip", "reading_comprehension"]);
const ALLOWED_ORIGINS = new Set([
  "https://alalam-alsaghir.vercel.app",
  "https://rus1999rusia-rgb.github.io",
  "https://alalam-alsaghir.rus1999rusia.chatgpt.site",
  "http://localhost:3000",
  "http://localhost:4173",
  "http://localhost:8000",
]);

function getSecretKey() {
  const direct = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");
  if (direct) return direct;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
    return Object.values(keys)[0] ?? "";
  } catch {
    return "";
  }
}

const SECRET_KEY = getSecretKey();

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.has(origin) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://alalam-alsaghir.vercel.app",
    "Access-Control-Allow-Headers": "content-type, x-admin-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
  };
}

function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders(req) });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function rest(path: string, init: RequestInit = {}, attempt = 0): Promise<any> {
  if (!SUPABASE_URL || !SECRET_KEY) throw new Error("إعدادات الخادم غير مكتملة");
  const headers = new Headers(init.headers);
  headers.set("apikey", SECRET_KEY);
  headers.set("Authorization", `Bearer ${SECRET_KEY}`);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
  if (!response.ok) {
    if (attempt < 1 && (response.status === 401 || response.status === 429 || response.status >= 500)) {
      await new Promise((resolve) => setTimeout(resolve, 180));
      return await rest(path, init, attempt + 1);
    }
    const message = await response.text();
    console.error("Database request failed", response.status, path, message);
    throw new Error("تعذّر تنفيذ الطلب الآن");
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function storage(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("apikey", SECRET_KEY);
  headers.set("Authorization", `Bearer ${SECRET_KEY}`);
  const response = await fetch(`${SUPABASE_URL}/storage/v1/${path}`, { ...init, headers });
  if (!response.ok) {
    const message = await response.text();
    console.error("Storage request failed", response.status, path, message);
    throw new Error("تعذّر حفظ الصورة الآن");
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function signedImageUrl(path: string | null) {
  if (!path) return null;
  const safePath = path.split("/").map(encodeURIComponent).join("/");
  const result = await storage(`object/sign/${BUCKET}/${safePath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 1800 }),
  });
  const signed = result?.signedURL ?? result?.signedUrl ?? null;
  if (!signed) return null;
  if (/^https?:\/\//.test(signed)) return signed;
  return `${SUPABASE_URL}/storage/v1${signed.startsWith("/") ? signed : `/${signed}`}`;
}

async function attachSignedImages(rows: Array<Record<string, unknown>>) {
  return await Promise.all(rows.map(async (row) => ({
    ...row,
    image_url: await signedImageUrl(typeof row.image_path === "string" ? row.image_path : null),
    image_path: undefined,
  })));
}

async function attachSignedGalleries(rows: Array<Record<string, unknown>>) {
  return await Promise.all(rows.map(async (row) => {
    const paths = Array.isArray(row.image_paths) ? row.image_paths.filter((path): path is string => typeof path === "string" && path.length > 0) : [];
    return {
      ...row,
      image_urls: (await Promise.all(paths.map((path) => signedImageUrl(path)))).filter(Boolean),
      image_paths: undefined,
    };
  }));
}

async function publicFeed() {
  const [settingsRows, classes, assignments, submissions] = await Promise.all([
    rest("alalam_settings?select=key,value&key=neq.admin_pin_hash"),
    rest("alalam_classes?select=id,name,display_order,color&order=display_order.asc"),
    rest("alalam_assignments?select=id,section,class_id,title,description,due_date,created_at,image_paths&is_active=eq.true&order=created_at.desc"),
    rest("alalam_submissions?select=id,assignment_id,section,class_id,student_name,title,body_text,stars,featured,created_at,image_path&status=eq.approved&order=featured.desc,stars.desc,created_at.desc&limit=120"),
  ]);
  const settings = Object.fromEntries((settingsRows ?? []).map((row: { key: string; value: string }) => [row.key, row.value]));
  return {
    settings,
    classes,
    assignments: await attachSignedGalleries(assignments ?? []),
    submissions: await attachSignedImages(submissions ?? []),
  };
}

async function verifyAdmin(req: Request) {
  const token = req.headers.get("x-admin-token") ?? "";
  if (token.length < 30) return false;
  const tokenHash = await sha256(token);
  const now = new Date().toISOString();
  const rows = await rest(`alalam_admin_sessions?select=token_hash&token_hash=eq.${encodeURIComponent(tokenHash)}&expires_at=gt.${encodeURIComponent(now)}&limit=1`);
  if (!rows?.length) return false;
  await rest(`alalam_admin_sessions?token_hash=eq.${encodeURIComponent(tokenHash)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ last_used_at: now }),
  });
  return true;
}

async function login(pin: string) {
  const rows = await rest("alalam_settings?select=value&key=eq.admin_pin_hash&limit=1");
  const expected = rows?.[0]?.value ?? "";
  const actual = await sha256(pin.trim());
  if (!constantTimeEqual(actual, expected)) return null;
  await rest(`alalam_admin_sessions?expires_at=lt.${encodeURIComponent(new Date().toISOString())}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  const token = randomToken();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString();
  await rest("alalam_admin_sessions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ token_hash: tokenHash, expires_at: expiresAt }),
  });
  return { token, expires_at: expiresAt };
}

async function adminFeed() {
  const [settingsRows, classes, assignments, submissions] = await Promise.all([
    rest("alalam_settings?select=key,value&key=neq.admin_pin_hash"),
    rest("alalam_classes?select=id,name,display_order,color&order=display_order.asc"),
    rest("alalam_assignments?select=*&order=created_at.desc"),
    rest("alalam_submissions?select=*&order=created_at.desc&limit=250"),
  ]);
  return {
    settings: Object.fromEntries((settingsRows ?? []).map((row: { key: string; value: string }) => [row.key, row.value])),
    classes,
    assignments: await attachSignedGalleries(assignments ?? []),
    submissions: await attachSignedImages(submissions ?? []),
  };
}

function cleanText(value: unknown, max: number) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function parseClassId(value: unknown, allowAll = false) {
  if (allowAll && (value === null || value === "" || value === "all" || value === undefined)) return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1 || id > 4) throw new Error("اختاري الفصل الصحيح");
  return id;
}

function parseSection(value: unknown) {
  const section = String(value ?? "");
  if (!ALLOWED_SECTIONS.has(section)) throw new Error("القسم غير صحيح");
  return section;
}

async function rateLimit(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const client = forwarded || req.headers.get("cf-connecting-ip") || "unknown";
  const key = await sha256(`${client}|${req.headers.get("user-agent") ?? ""}`);
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const cleanupBefore = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await rest(`alalam_rate_limits?created_at=lt.${encodeURIComponent(cleanupBefore)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  const recent = await rest(`alalam_rate_limits?select=id&ip_hash=eq.${key}&created_at=gte.${encodeURIComponent(since)}&limit=5`);
  if ((recent?.length ?? 0) >= 4) throw new Error("وصلتِ للحد المؤقت للمشاركات. حاولي بعد ساعة");
  await rest("alalam_rate_limits", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ ip_hash: key }),
  });
}

async function uploadImage(file: File, folder: "pending" | "published", section: string, classId: number | null) {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) throw new Error("الصورة يجب أن تكون JPG أو PNG أو WebP");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("تعذّر تجهيز الصورة، حاولي اختيار صورة أخرى");
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${folder}/${section}/class-${classId ?? "all"}/${crypto.randomUUID()}.${extension}`;
  await storage(`object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { "Content-Type": file.type, "x-upsert": "false" },
    body: await file.arrayBuffer(),
  });
  return path;
}

async function submitWork(req: Request, submittedForm?: FormData) {
  await rateLimit(req);
  const form = submittedForm ?? await req.formData();
  const section = parseSection(form.get("section"));
  const classId = parseClassId(form.get("class_id"));
  const studentName = cleanText(form.get("student_name"), 60);
  const title = cleanText(form.get("title"), 140);
  const bodyText = cleanText(form.get("body_text"), 3000);
  const assignmentRaw = cleanText(form.get("assignment_id"), 50);
  const assignmentId = assignmentRaw || null;
  const file = form.get("image");

  if (studentName.length < 2) throw new Error("اكتبي اسم الطالبة");
  if (title.length < 2) throw new Error("اكتبي عنوان المشاركة");
  if (assignmentId && !/^[0-9a-f-]{36}$/i.test(assignmentId)) throw new Error("الطلب المحدد غير صحيح");
  if (!bodyText && !(file instanceof File && file.size > 0)) throw new Error("أضيفي نصًا أو صورة للمشاركة");

  const imagePath = file instanceof File && file.size > 0 ? await uploadImage(file, "pending", section, classId as number) : null;
  await rest("alalam_submissions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      assignment_id: assignmentId,
      section,
      class_id: classId,
      student_name: studentName,
      title,
      body_text: bodyText,
      image_path: imagePath,
    }),
  });
  return { ok: true, message: "وصلت مشاركتك بنجاح، وستظهر بعد مراجعة المعلمة" };
}

async function saveAssignment(body: Record<string, unknown>) {
  const id = cleanText(body.id, 50);
  const payload = {
    section: parseSection(body.section),
    class_id: parseClassId(body.class_id, true),
    title: cleanText(body.title, 140),
    description: cleanText(body.description, 3000),
    due_date: cleanText(body.due_date, 10) || null,
    is_active: body.is_active !== false,
    updated_at: new Date().toISOString(),
  };
  if (payload.title.length < 2) throw new Error("اكتبي عنوان الطلب أو النشاط");
  if (id) {
    await rest(`alalam_assignments?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(payload),
    });
  } else {
    await rest("alalam_assignments", {
      method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(payload),
    });
  }
}

async function removeStoredImages(paths: string[]) {
  const cleanPaths = paths.filter((path) => typeof path === "string" && path.length > 0);
  if (!cleanPaths.length) return;
  try {
    await storage(`object/${BUCKET}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: cleanPaths }),
    });
  } catch (error) {
    console.error("Unable to remove stored images", error);
  }
}

async function saveAssignmentWithImages(form: FormData) {
  const id = cleanText(form.get("id"), 50);
  if (id && !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("بيانات المحتوى غير صحيحة");
  const section = parseSection(form.get("section"));
  const classId = parseClassId(form.get("class_id"), true);
  const payload: Record<string, unknown> = {
    section,
    class_id: classId,
    title: cleanText(form.get("title"), 140),
    description: cleanText(form.get("description"), 3000),
    due_date: cleanText(form.get("due_date"), 10) || null,
    is_active: String(form.get("is_active")) === "true",
    updated_at: new Date().toISOString(),
  };
  if (String(payload.title).length < 2) throw new Error("اكتبي عنوان الطلب أو النشاط");

  const existingRows = id ? await rest(`alalam_assignments?select=image_paths&id=eq.${encodeURIComponent(id)}&limit=1`) : [];
  if (id && !existingRows?.length) throw new Error("المحتوى المطلوب غير موجود");
  const previousPaths = Array.isArray(existingRows?.[0]?.image_paths) ? existingRows[0].image_paths.filter((path: unknown) => typeof path === "string") : [];
  const removeExisting = String(form.get("remove_images")) === "true";
  const basePaths = removeExisting ? [] : previousPaths;
  const files = form.getAll("images").filter((item): item is File => item instanceof File && item.size > 0);
  if (files.length > MAX_ADMIN_IMAGES) throw new Error("يمكن إضافة ثماني صور في المرة الواحدة");
  if (basePaths.length + files.length > 16) throw new Error("وصل هذا المحتوى إلى الحد الأعلى للصور؛ احذفي الصور الحالية ثم أضيفي الجديدة");

  const uploadedPaths: string[] = [];
  try {
    for (const file of files) uploadedPaths.push(await uploadImage(file, "published", section, classId));
    const imagePaths = [...basePaths, ...uploadedPaths];
    payload.image_paths = imagePaths;
    if (id) {
      await rest(`alalam_assignments?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(payload),
      });
    } else {
      await rest("alalam_assignments", {
        method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(payload),
      });
    }
  } catch (error) {
    await removeStoredImages(uploadedPaths);
    throw error;
  }

  if (removeExisting) await removeStoredImages(previousPaths);
  return { ok: true, image_count: basePaths.length + uploadedPaths.length };
}

async function deleteAssignment(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("بيانات المحتوى غير صحيحة");
  const rows = await rest(`alalam_assignments?select=image_paths&id=eq.${encodeURIComponent(id)}&limit=1`);
  const paths = Array.isArray(rows?.[0]?.image_paths) ? rows[0].image_paths.filter((path: unknown) => typeof path === "string") : [];
  await rest(`alalam_assignments?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  await removeStoredImages(paths);
}

async function moderateSubmission(body: Record<string, unknown>) {
  const id = cleanText(body.id, 50);
  const status = String(body.status ?? "pending");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["pending", "approved", "rejected"].includes(status)) throw new Error("بيانات المشاركة غير صحيحة");
  const stars = Math.min(5, Math.max(0, Number(body.stars) || 0));
  await rest(`alalam_submissions?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status, stars, featured: Boolean(body.featured), updated_at: new Date().toISOString() }),
  });
}

async function deleteSubmission(id: string) {
  const rows = await rest(`alalam_submissions?select=image_path&id=eq.${encodeURIComponent(id)}&limit=1`);
  const path = rows?.[0]?.image_path;
  await rest(`alalam_submissions?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  if (path) {
    try {
      await storage(`object/${BUCKET}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: [path] }),
      });
    } catch (error) {
      console.error("Unable to remove orphaned image", error);
    }
  }
}

async function updateClass(body: Record<string, unknown>) {
  const id = parseClassId(body.id);
  const name = cleanText(body.name, 50);
  if (name.length < 2) throw new Error("اكتبي اسم الفصل");
  await rest(`alalam_classes?id=eq.${id}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ name, updated_at: new Date().toISOString() }),
  });
}

async function updateSettings(body: Record<string, unknown>) {
  const allowed: Record<string, number> = { school_name: 120, lab_name: 80, teacher_name: 80, principal_name: 80 };
  for (const [key, max] of Object.entries(allowed)) {
    if (!(key in body)) continue;
    const value = cleanText(body[key], max);
    if (!value) throw new Error("لا يمكن ترك بيانات التعريف فارغة");
    await rest(`alalam_settings?key=eq.${key}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ value, updated_at: new Date().toISOString() }),
    });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "الطريقة غير مدعومة" }, 405);

  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const action = cleanText(form.get("action"), 40);
      if (action === "admin_save_assignment") {
        if (!(await verifyAdmin(req))) return json(req, { error: "انتهت جلسة المشرفة، سجلي الدخول مرة أخرى" }, 401);
        return json(req, await saveAssignmentWithImages(form), 201);
      }
      return json(req, await submitWork(req, form), 201);
    }

    const body = await req.json() as Record<string, unknown>;
    const action = String(body.action ?? "public_feed");

    if (action === "public_feed") return json(req, await publicFeed());
    if (action === "admin_login") {
      const session = await login(cleanText(body.pin, 20));
      return session ? json(req, session) : json(req, { error: "رمز المشرفة غير صحيح" }, 401);
    }

    if (!(await verifyAdmin(req))) return json(req, { error: "انتهت جلسة المشرفة، سجلي الدخول مرة أخرى" }, 401);

    if (action === "admin_feed") return json(req, await adminFeed());
    if (action === "save_assignment") await saveAssignment(body);
    else if (action === "delete_assignment") await deleteAssignment(cleanText(body.id, 50));
    else if (action === "moderate_submission") await moderateSubmission(body);
    else if (action === "delete_submission") await deleteSubmission(cleanText(body.id, 50));
    else if (action === "update_class") await updateClass(body);
    else if (action === "update_settings") await updateSettings(body);
    else if (action === "admin_logout") {
      const token = req.headers.get("x-admin-token") ?? "";
      const tokenHash = await sha256(token);
      await rest(`alalam_admin_sessions?token_hash=eq.${encodeURIComponent(tokenHash)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    } else return json(req, { error: "الإجراء غير معروف" }, 400);

    return json(req, { ok: true });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "حدث خطأ غير متوقع";
    const status = /الحد المؤقت/.test(message) ? 429 : 400;
    return json(req, { error: message }, status);
  }
});
