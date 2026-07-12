export function confirmBooking({ name, quantity }) {
  const buyerName = name.trim() || "guest";
  const seats = Number(quantity);

  return {
    status: "confirmed",
    heading: `You're on the list, ${buyerName}.`,
    message: `${seats} ${seats === 1 ? "seat is" : "seats are"} reserved for the Saturday workshop demo.`,
  };
}
