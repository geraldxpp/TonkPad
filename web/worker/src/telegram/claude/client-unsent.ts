/**
 * Whether a connection error ended before any of the request was written
 * (claude/client.ts): such a request can't have been billed, so the budget
 * releases its reservation (claude/budget.ts). It reads the system error
 * that fetch wraps: a DNS lookup that failed (ENOTFOUND, EAI_AGAIN), a
 * refused connection (ECONNREFUSED, every address of an aggregate), or a
 * TLS handshake that failed, a certificate check included. Anything else,
 * such as a reset or a socket closed mid-reply, may have followed a sent
 * request and stays charged.
 */

const DNS_OR_CONNECT = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED"]);
/** OpenSSL's certificate checks as Node names them (nodejs.org/api/tls.html, X509 certificate error codes), and Node's own host-name check. */
const CERTIFICATE = new Set([
  "UNABLE_TO_GET_ISSUER_CERT", "UNABLE_TO_GET_CRL", "UNABLE_TO_DECRYPT_CERT_SIGNATURE", "UNABLE_TO_DECRYPT_CRL_SIGNATURE",
  "UNABLE_TO_DECODE_ISSUER_PUBLIC_KEY", "CERT_SIGNATURE_FAILURE", "CRL_SIGNATURE_FAILURE", "CERT_NOT_YET_VALID", "CERT_HAS_EXPIRED",
  "CRL_NOT_YET_VALID", "CRL_HAS_EXPIRED", "ERROR_IN_CERT_NOT_BEFORE_FIELD", "ERROR_IN_CERT_NOT_AFTER_FIELD", "ERROR_IN_CRL_LAST_UPDATE_FIELD",
  "ERROR_IN_CRL_NEXT_UPDATE_FIELD", "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "CERT_CHAIN_TOO_LONG", "CERT_REVOKED", "INVALID_CA", "PATH_LENGTH_EXCEEDED", "INVALID_PURPOSE",
  "CERT_UNTRUSTED", "CERT_REJECTED", "HOSTNAME_MISMATCH", "ERR_TLS_CERT_ALTNAME_INVALID",
]);
/** OpenSSL's handshake failures: a protocol or version mismatch, or an alert during the handshake. Later TLS errors (a bad record, an early end) aren't. */
const HANDSHAKE = /^ERR_SSL_\w*(?:HANDSHAKE|WRONG_VERSION_NUMBER|UNSUPPORTED_PROTOCOL|PROTOCOL_VERSION|NO_PROTOCOLS_AVAILABLE)/;
/** How far down the cause chain to look: the SDK's error, fetch's TypeError, the system's error, and a little room. */
const DEPTH = 5;

const unsentCode = (code: string) => DNS_OR_CONNECT.has(code) || CERTIFICATE.has(code) || HANDSHAKE.test(code);
const codeOf = (v: unknown): string | null => (typeof v === "object" && v !== null && typeof (v as { code?: unknown }).code === "string" ? (v as { code: string }).code : null);

/** The first error code down the cause chain; an aggregate without one gives each of its errors' codes ("" for one without). */
function codesOf(error: unknown): string[] {
  let at: unknown = error;
  for (let depth = 0; depth < DEPTH && typeof at === "object" && at !== null; depth += 1) {
    const code = codeOf(at);
    if (code !== null) return [code];
    const errors = (at as { errors?: unknown }).errors;
    if (Array.isArray(errors) && errors.length > 0) return errors.map((e) => codeOf(e) ?? "");
    at = (at as { cause?: unknown }).cause;
  }
  return [];
}

/** True only when every code found says the connection failed before the request was written; false without one. */
export function neverSent(error: unknown): boolean {
  const codes = codesOf(error);
  return codes.length > 0 && codes.every(unsentCode);
}
