import { config } from "../config.ts";
import type { IBitbucketBackend } from "../types.ts";
import { createServerBackend } from "./server.ts";
import { createCloudBackend } from "./cloud.ts";

let backendInstance: IBitbucketBackend | null = null;

/**
 * Returns the configured Bitbucket backend (Server or Cloud).
 * Same env: BITBUCKET_BASE_URL, token; backend is chosen by BITBUCKET_API_TYPE or inferred from base URL.
 */
export function getBitbucketBackend(): IBitbucketBackend {
  if (!backendInstance) {
    backendInstance =
      config.apiType === "cloud"
        ? createCloudBackend(config.token, config.email)
        : createServerBackend(config.baseUrl, config.token);
  }
  return backendInstance;
}

export { createServerBackend } from "./server.ts";
export { createCloudBackend } from "./cloud.ts";
