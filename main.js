// js/main.js
import { submitContact } from "./supabase-client.js";

/* ---------- Limits (must match the server in contact-submit) ---------- */
const LIMITS = {
  name: { min: 2, max: 100 },
  email: { min: 5, max: 254 },
  subject: { min: 3, max: 150 },
  message: { min: 10, max: 2000 },
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ---------- Footer year ---------- */
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

/* ---------- Mobile navigation ---------- */
const toggle = document.getElementById("navToggle");
const menu = document.getElementById("navMenu");

function setMenu(open) {
  toggle.setAttribute("aria-expanded", String(open));
  menu.classList.toggle("open", open);
}
toggle?.addEventListener("click", () => setMenu(toggle.getAttribute("aria-expanded") !== "true"));
menu?.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
    setMenu(false);
    toggle.focus();
  }
});

/* ---------- Disabled placeholder links ---------- */
document.querySelectorAll("a[data-placeholder]").forEach((a) => {
  a.addEventListener("click", (e) => e.preventDefault());
});

/* ---------- Scroll reveal + active nav link ---------- */
const reveals = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  reveals.forEach((el) => io.observe(el));
} else {
  reveals.forEach((el) => el.classList.add("visible"));
}

const navLinks = [...document.querySelectorAll(".nav-menu a")];
if ("IntersectionObserver" in window) {
  const sections = navLinks
    .map((a) => document.querySelector(a.getAttribute("href")))
    .filter(Boolean);
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        navLinks.forEach((a) =>
          a.classList.toggle("active", a.getAttribute("href") === `#${entry.target.id}`));
      }
    });
  }, { rootMargin: "-40% 0px -55% 0px" });
  sections.forEach((s) => spy.observe(s));
}

/* ---------- Contact form ---------- */
const form = document.getElementById("contactForm");
const statusEl = document.getElementById("formStatus");
const submitBtn = document.getElementById("submitBtn");
const messageEl = document.getElementById("message");
const counterEl = document.getElementById("message-count");

let submitting = false;

messageEl?.addEventListener("input", () => {
  counterEl.textContent = `${messageEl.value.length} / ${LIMITS.message.max}`;
});

function fieldError(id, text) {
  const input = document.getElementById(id);
  const err = document.getElementById(`${id}-error`);
  err.textContent = text || "";
  if (text) input.setAttribute("aria-invalid", "true");
  else input.removeAttribute("aria-invalid");
}

function validate(values) {
  const errors = {};
  const labels = { name: "Name", email: "Email", subject: "Subject", message: "Message" };

  for (const key of Object.keys(LIMITS)) {
    const v = values[key];
    if (!v) errors[key] = `${labels[key]} is required.`;
    else if (v.length < LIMITS[key].min) errors[key] = `${labels[key]} must be at least ${LIMITS[key].min} characters.`;
    else if (v.length > LIMITS[key].max) errors[key] = `${labels[key]} must be at most ${LIMITS[key].max} characters.`;
  }
  if (!errors.email && !EMAIL_RE.test(values.email)) errors.email = "Please enter a valid email address.";
  return errors;
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = `form-status${kind ? ` ${kind}` : ""}`;
}

function setLoading(on) {
  submitting = on;
  submitBtn.disabled = on;
  submitBtn.classList.toggle("loading", on);
  submitBtn.querySelector(".btn-label").textContent = on ? "Sending..." : "Send Message";
  form.setAttribute("aria-busy", String(on));
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (submitting) return; // prevent duplicate submissions

  const values = {
    name: form.elements["name"].value.trim(),
    email: form.elements["email"].value.trim(),
    subject: form.elements["subject"].value.trim(),
    message: form.elements["message"].value.trim(),
    website: form.elements["website"].value, // honeypot
  };

  const errors = validate(values);
  ["name", "email", "subject", "message"].forEach((k) => fieldError(k, errors[k]));
  const firstBad = Object.keys(errors)[0];
  if (firstBad) {
    setStatus("Please fix the highlighted fields.", "fail");
    document.getElementById(firstBad).focus();
    return;
  }

  setStatus("", "");
  setLoading(true);
  const result = await submitContact(values);
  setLoading(false);

  if (result.ok) {
    form.reset();
    counterEl.textContent = `0 / ${LIMITS.message.max}`;
    setStatus("Thank you! Your message has been sent.", "success");
  } else {
    setStatus(result.message, "fail");
  }
});
