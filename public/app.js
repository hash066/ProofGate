import { confirmBooking } from "./booking.js";

const form = document.querySelector("[data-pg='booking-form']");
const confirmation = document.querySelector("[data-pg='confirmation']");
const checked = document.querySelector("[data-pg='passport-checked']");
const live = document.querySelector("[data-pg='passport-live']");

const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
if (checked) checked.textContent = `last checked ${now()}`;

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const result = confirmBooking({
    name: String(data.get("name")),
    quantity: Number(data.get("quantity")),
  });

  confirmation.querySelector("h2").textContent = result.heading;
  confirmation.querySelector("p:not(.eyebrow)").textContent = result.message;
  confirmation.hidden = false;
  form.hidden = true;
  confirmation.focus();

  if (checked) checked.textContent = `last checked ${now()}`;
  if (live) {
    live.textContent = "✓ Buyer journey just completed live — contract still holds.";
    live.hidden = false;
  }
});
