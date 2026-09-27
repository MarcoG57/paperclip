/** Restricted operator client. No redirects, retries, shell execution or model calls. */
import { invariant } from "./model.mjs";

export function apiOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("INVALID_API_ORIGIN");
  }
  invariant(
    !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/",
    "ORIGIN_ONLY_REQUIRED",
  );
  invariant(
    url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["127.0.0.1", "[::1]"].includes(url.hostname)),
    "HTTPS_OR_LITERAL_LOOPBACK_REQUIRED",
  );
  return url.origin;
}
export function createClient(
  origin,
  {
    token = "",
    cookie = "",
    fetchImpl = globalThis.fetch,
    timeoutMs = 120000,
    maxBytes = 2 * 1024 * 1024,
  } = {},
) {
  const base = apiOrigin(origin);
  invariant(!(token && cookie), "AMBIGUOUS_CREDENTIALS");
  invariant(!/[\r\n]/.test(token + cookie), "INVALID_CREDENTIAL_HEADER");
  invariant(
    base.startsWith("http://") || Boolean(token || cookie),
    "AUTH_REQUIRED",
  );
  return async function request(method, route, body) {
    invariant(["GET", "POST", "PATCH"].includes(method), "METHOD_NOT_ALLOWED");
    invariant(
      typeof route === "string" && route.startsWith("/api/"),
      "API_PATH_REQUIRED",
    );
    const url = new URL(route, base);
    invariant(
      url.origin === base && url.pathname.startsWith("/api/"),
      "CROSS_ORIGIN_REQUEST",
    );
    const headers = { Accept: "application/json", Origin: base };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new Error(
        method === "GET"
          ? "READ_FAILED"
          : "WRITE_OUTCOME_UNKNOWN_INSPECT_BEFORE_RETRY",
      );
    }
    invariant(response.ok, `API_HTTP_${response.status}`); // Never echo potentially sensitive error bodies.
    const declared = Number(response.headers.get("content-length"));
    invariant(
      !Number.isFinite(declared) || declared <= maxBytes,
      "RESPONSE_TOO_LARGE",
    );
    const reader = response.body?.getReader();
    invariant(reader, "EMPTY_API_RESPONSE");
    let size = 0;
    const chunks = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new Error("RESPONSE_TOO_LARGE");
        }
        chunks.push(value);
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch (error) {
      if (error.message === "RESPONSE_TOO_LARGE") throw error;
      throw new Error(
        method === "GET"
          ? "INVALID_API_RESPONSE"
          : "WRITE_OUTCOME_UNKNOWN_INSPECT_BEFORE_RETRY",
      );
    }
  };
}
