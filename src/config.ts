import { readFileSync } from "fs";

export interface Config {
  baseUrl: string;
  token: string;
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
  const baseUrl = process.env.BITBUCKET_BASE_URL;
  if (!baseUrl) {
    throw new Error("Missing BITBUCKET_BASE_URL env var");
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    token: loadToken(),
  };
}

export const config = loadConfig();
