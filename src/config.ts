import { readFileSync } from "fs";

/** Cloud API base URL – fixed for Bitbucket Cloud. */
export const BITBUCKET_CLOUD_API_URL = "https://api.bitbucket.org/2.0";

export type BitbucketApiType = "server" | "cloud";

export interface Config {
  baseUrl: string;
  token: string;
  apiType: BitbucketApiType;
  /** For Cloud API tokens: Atlassian email for Basic auth. Required when using API tokens from id.atlassian.com. */
  email?: string;
}

function loadToken(): string {
  const tokenFile = process.env.BITBUCKET_TOKEN_FILE;
  if (tokenFile) {
    try {
      return readFileSync(tokenFile, "utf-8").trim();
    } catch (err) {
      throw new Error(
        `BITBUCKET_TOKEN_FILE is set but cannot read file "${tokenFile}": ${err}`
      );
    }
  }

  const token = process.env.BITBUCKET_TOKEN;
  if (token) {
    return token.trim();
  }

  throw new Error(
    "Missing Bitbucket token: set BITBUCKET_TOKEN_FILE or BITBUCKET_TOKEN env var"
  );
}

function loadConfig(): Config {
  const baseUrlEnv = process.env.BITBUCKET_BASE_URL?.trim();
  const apiTypeEnv = process.env.BITBUCKET_API_TYPE?.toLowerCase();

  let apiType: BitbucketApiType;
  let baseUrl: string;

  if (apiTypeEnv === "cloud") {
    apiType = "cloud";
    baseUrl = baseUrlEnv
      ? baseUrlEnv.replace(/\/$/, "")
      : BITBUCKET_CLOUD_API_URL;
  } else if (apiTypeEnv === "server") {
    apiType = "server";
    if (!baseUrlEnv) {
      throw new Error(
        "BITBUCKET_BASE_URL is required when BITBUCKET_API_TYPE=server"
      );
    }
    baseUrl = baseUrlEnv.replace(/\/$/, "");
  } else {
    if (!baseUrlEnv) {
      throw new Error(
        "Set BITBUCKET_BASE_URL (for server) or BITBUCKET_API_TYPE=cloud"
      );
    }
    baseUrl = baseUrlEnv.replace(/\/$/, "");
    apiType = baseUrl.includes("bitbucket.org") ? "cloud" : "server";
  }

  const email = process.env.BITBUCKET_EMAIL?.trim();

  return {
    baseUrl,
    token: loadToken(),
    apiType,
    email: email || undefined,
  };
}

export const config = loadConfig();
