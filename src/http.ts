/**
 * Low-level HTTP client for Bitbucket API.
 * Backends use this with their own base URL and token.
 */

export class BitbucketApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly method: string,
    public readonly url: string,
    message: string
  ) {
    super(`Bitbucket API ${method} ${url} -> ${status}: ${message}`);
    this.name = "BitbucketApiError";
  }
}

export interface HttpClient {
  get<T>(path: string): Promise<T>;
  /** GET that returns response body as plain text (e.g. for diff endpoints). */
  getRaw(path: string): Promise<string>;
  post<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body?: unknown): Promise<T>;
  delete<T>(path: string): Promise<T>;
}

export type AuthCredentials =
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string };

export function createHttpClient(
  baseUrl: string,
  credentials: string | AuthCredentials
): HttpClient {
  const auth: AuthCredentials =
    typeof credentials === "string"
      ? { type: "bearer", token: credentials }
      : credentials;

  const authHeader =
    auth.type === "bearer"
      ? `Bearer ${auth.token}`
      : `Basic ${btoa(`${auth.username}:${auth.password}`)}`;

  const base = baseUrl.replace(/\/$/, "");

  async function request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${base}${path}`;
    const headers: Record<string, string> = {
      Authorization: authHeader,
      Accept: "application/json",
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      let errorMessage = res.statusText;
      try {
        const errBody = (await res.json()) as {
          errors?: Array<{ message: string }>;
          message?: string;
        };
        if (errBody.errors?.length) {
          errorMessage = errBody.errors.map((e) => e.message).join("; ");
        } else if (errBody.message) {
          errorMessage = errBody.message;
        }
      } catch {
        // ignore
      }
      throw new BitbucketApiError(res.status, method, url, errorMessage);
    }

    if (res.status === 204) {
      return undefined as T;
    }
    return res.json() as Promise<T>;
  }

  async function getRaw(path: string): Promise<string> {
    const url = `${base}${path}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: authHeader, Accept: "text/plain" },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new BitbucketApiError(res.status, "GET", url, text || res.statusText);
    }
    return res.text();
  }

  return {
    get: <T>(path: string) => request<T>("GET", path),
    getRaw,
    post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
    put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
    delete: <T>(path: string) => request<T>("DELETE", path),
  };
}
