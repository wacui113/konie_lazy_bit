/**
 * Re-exports HTTP client and error for backends and legacy usage.
 * The active Bitbucket API is accessed via getBitbucketBackend() from ./backends.
 */

export { BitbucketApiError, createHttpClient, type HttpClient } from "./http.ts";
