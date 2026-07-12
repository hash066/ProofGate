const requirement = "an explicit HTTPS Worker origin is required";

export function resolveWorkerBaseUrl(value: string | undefined): string {
  if (!value) throw new Error(requirement);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(requirement);
  }
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(requirement);
  }
  return url.origin;
}
