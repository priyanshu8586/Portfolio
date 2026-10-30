// js/supabase-client.js
// Public configuration ONLY. These two values are safe to publish:
//   - the Supabase project URL
//   - the Supabase publishable (anon) key
// NEVER put a service-role / secret key, Google client secret, or any token in this file.
//
// HOW TO EDIT: replace the two placeholder strings below with your own values from
// Supabase Dashboard -> Project Settings -> API.

export const SUPABASE_URL = "https://vywzqndjcggejgvzraul.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_AznMu3N1ky4GL5Cb60RqsA_tWv4WCRN";

// Edge Function base URL (derived from the project URL).
export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

export function isConfigured() {
  return !SUPABASE_URL.includes("YOUR-PROJECT-REF") && !SUPABASE_PUBLISHABLE_KEY.includes("YOUR-PUBLISHABLE-KEY");
}

/**
 * Sends a contact message to the "contact-submit" Edge Function.
 * Returns { ok: true } or { ok: false, message }.
 * Never exposes internal details; the server decides what the error text is.
 */
export async function submitContact(payload) {
  if (!isConfigured()) {
    return { ok: false, message: "The contact form is not configured yet." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${FUNCTIONS_URL}/contact-submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    let data = null;
    try { data = await res.json(); } catch { /* non-JSON response */ }

    if (res.ok && data && data.ok === true) return { ok: true };

    if (res.status === 429) {
      return { ok: false, message: "Too many messages. Please wait a while and try again." };
    }
    return { ok: false, message: (data && data.error) || "Something went wrong. Please try again." };
  } catch (err) {
    const offline = err && err.name === "AbortError"
      ? "The request timed out. Please try again."
      : "Network error. Please check your connection and try again.";
    return { ok: false, message: offline };
  } finally {
    clearTimeout(timeout);
  }
}
