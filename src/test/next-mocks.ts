// Giả lập request context của Next (cookies/headers/redirect) cho test server action / query.
export class RedirectError extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT ${url}`);
  }
}

export type CookieOptions = Record<string, unknown>;

/** Cookie jar + header của 1 "request" giả; reset giữa các test */
export function createRequestContext() {
  const jar = new Map<string, { value: string; options?: CookieOptions }>();
  const headerValues = new Map<string, string>();
  const cookieStore = {
    get: (name: string) => {
      const entry = jar.get(name);
      return entry ? { name, value: entry.value } : undefined;
    },
    set: (name: string, value: string, options?: CookieOptions) => {
      jar.set(name, { value, options });
    },
  };
  const headerStore = {
    get: (name: string) => headerValues.get(name.toLowerCase()) ?? null,
  };
  return {
    jar,
    headerValues,
    cookies: async () => cookieStore,
    headers: async () => headerStore,
    reset() {
      jar.clear();
      headerValues.clear();
    },
  };
}

export function redirect(url: string): never {
  throw new RedirectError(url);
}

/** Chạy fn, trả về URL redirect (fail nếu không redirect) */
export async function expectRedirect(
  fn: () => Promise<unknown>,
): Promise<string> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof RedirectError) return error.url;
    throw error;
  }
  throw new Error("expected a redirect");
}
