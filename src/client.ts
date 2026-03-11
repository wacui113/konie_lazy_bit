import { config } from "./config.ts";

const API_BASE = `${config.baseUrl}/rest/api/latest`;

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

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.token}`,
    Accept: "application/json",
    ...extraHeaders,
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
      if (errBody.errors && errBody.errors.length > 0) {
        errorMessage = errBody.errors.map((e) => e.message).join("; ");
      } else if (errBody.message) {
        errorMessage = errBody.message;
      }
    } catch {
      // ignore JSON parse errors on error responses
    }
    throw new BitbucketApiError(res.status, method, url, errorMessage);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
