import assert from "node:assert/strict";
import test from "node:test";

import { confirmBooking } from "../../src/booking.js";

test("CTA action returns a truthful local confirmation state", () => {
  assert.deepEqual(confirmBooking({ name: "Aisha", quantity: 2 }), {
    status: "confirmed",
    heading: "You're on the list, Aisha.",
    message: "2 seats are reserved for the Saturday workshop demo.",
  });
});
