/**
 * App-wide order for view-state search params, so shared URLs always read
 * the same way: ?chain=sol&pad=pons&tab=locked&tf=1h&q=mo
 */
export const VIEW_PARAM_ORDER = ["chain", "pad", "tab", "tf", "q"] as const;

export type ParamUpdates = Record<string, string | null>;

/**
 * Applies updates to a query string. A null or empty value removes the key,
 * which is how defaults are left out of the URL.
 */
export function applyParamUpdates(search: string, updates: ParamUpdates): URLSearchParams {
  const params = new URLSearchParams(search);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === "") params.delete(key);
    else params.set(key, value);
  }
  return params;
}

/** Serialises params with the known keys first, in VIEW_PARAM_ORDER. */
export function serializeParams(params: URLSearchParams): string {
  const ordered = new URLSearchParams();
  const known = new Set<string>(VIEW_PARAM_ORDER);
  for (const key of VIEW_PARAM_ORDER) {
    const value = params.get(key);
    if (value !== null) ordered.set(key, value);
  }
  params.forEach((value, key) => {
    if (!known.has(key)) ordered.append(key, value);
  });
  const text = ordered.toString();
  return text ? `?${text}` : "";
}
