const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwcVXVNSpTM2ETBEd26Zb3tSY51h_uXrV9njdDhivOppY0MWCZvbNtyELuiFX9mc7g/exec";

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  if (request.method !== "POST") {
    return response.status(405).json({ ok: false, message: "طريقة الطلب غير مدعومة." });
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const payload = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    if (!payload || !["login", "updateEmail", "updateShirtSize"].includes(payload.action)) {
      return response.status(400).json({ ok: false, message: "الطلب غير صحيح." });
    }

    console.info("[team-api] request started", { action: payload.action });
    const upstream = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
      signal: controller.signal
    });

    const text = await upstream.text();
    const data = JSON.parse(text);
    console.info("[team-api] request completed", { action: payload.action, durationMs: Date.now() - startedAt });
    return response.status(upstream.ok ? 200 : 502).json(data);
  } catch (error) {
    const timedOut = error && error.name === "AbortError";
    console.error("[team-api] request failed", { timedOut, durationMs: Date.now() - startedAt, error: String(error) });
    return response.status(timedOut ? 504 : 502).json({
      ok: false,
      message: timedOut ? "استغرق الاتصال بالشيت وقتًا أطول من المتوقع. حاول مرة أخرى." : "تعذر الوصول إلى بيانات الشيت الآن."
    });
  } finally {
    clearTimeout(timeout);
  }
}
