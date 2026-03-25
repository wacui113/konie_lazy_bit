import { createHttpClient, type AuthCredentials } from "../http.ts";
import type {
  IBitbucketBackend,
  PagedResponse,
  PullRequest,
  Activity,
  Comment,
  DiffResponse,
  ListPullRequestsOptions,
  CreatePullRequestOptions,
  AddCommentOptions,
} from "../types.ts";

// Cloud API response shapes (partial, for normalization)
interface CloudPullRequest {
  id: number;
  title: string;
  description?: string;
  state: string;
  author?: { display_name?: string; nickname?: string; uuid?: string };
  source?: { branch?: { name: string } };
  destination?: { branch?: { name: string } };
  created_on?: string;
  updated_on?: string;
  links?: { self?: { href?: string } };
  participants?: Array<{
    user?: { display_name?: string; nickname?: string };
    state?: string;
  }>;
}

interface CloudPaged<T> {
  values: T[];
  size?: number;
  pagelen?: number;
  page?: number;
  next?: string;
}

function normalizePr(c: CloudPullRequest): PullRequest {
  const fromBranch = c.source?.branch?.name ?? "unknown";
  const toBranch = c.destination?.branch?.name ?? "unknown";
  const created = c.created_on ? new Date(c.created_on).getTime() : 0;
  const updated = c.updated_on ? new Date(c.updated_on).getTime() : 0;
  const authorName = c.author?.display_name ?? c.author?.nickname ?? "unknown";
  const authorSlug = c.author?.nickname ?? c.author?.uuid ?? "unknown";

  return {
    id: c.id,
    title: c.title,
    description: c.description,
    state: c.state ?? "OPEN",
    version: 0,
    author: { user: { displayName: authorName, name: authorSlug } },
    reviewers: (c.participants ?? []).map((p) => ({
      user: {
        displayName: p.user?.display_name ?? p.user?.nickname ?? "unknown",
        name: p.user?.nickname ?? "unknown",
      },
      status: p.state ?? "UNAPPROVED",
    })),
    fromRef: { displayId: fromBranch },
    toRef: { displayId: toBranch },
    createdDate: created,
    updatedDate: updated,
    links: c.links?.self?.href ? { self: [{ href: c.links.self.href }] } : undefined,
  };
}

function normalizePagedPr(cloud: CloudPaged<CloudPullRequest>, opts: { limit: number; start: number }): PagedResponse<PullRequest> {
  const size = cloud.values?.length ?? 0;
  const limit = cloud.pagelen ?? opts.limit;
  const start = opts.start;
  const isLastPage = !cloud.next;
  const nextPageStart = isLastPage ? undefined : start + size;

  return {
    values: (cloud.values ?? []).map(normalizePr),
    size,
    isLastPage,
    start,
    limit,
    nextPageStart,
  };
}

function normalizeActivity(cloud: {
  id?: number;
  action?: string;
  created_on?: string;
  user?: { display_name?: string; nickname?: string };
  comment?: { id?: number; content?: { raw?: string } };
  comment_anchor?: { path?: string; line?: number };
}): Activity {
  const created = cloud.created_on ? new Date(cloud.created_on).getTime() : 0;
  const userName = cloud.user?.display_name ?? cloud.user?.nickname ?? "unknown";
  const userSlug = cloud.user?.nickname ?? "unknown";

  return {
    id: cloud.id ?? 0,
    action: cloud.action ?? "COMMENTED",
    createdDate: created,
    user: { displayName: userName, name: userSlug },
    comment: cloud.comment
      ? { id: cloud.comment.id ?? 0, text: cloud.comment.content?.raw ?? "" }
      : undefined,
    commentAnchor: cloud.comment_anchor
      ? { path: cloud.comment_anchor.path ?? "", line: cloud.comment_anchor.line ?? 0 }
      : undefined,
  };
}

function normalizeComment(cloud: {
  id?: number;
  content?: { raw?: string };
  user?: { display_name?: string; nickname?: string };
}): Comment {
  return {
    id: cloud.id ?? 0,
    text: cloud.content?.raw ?? "",
    author: cloud.user
      ? {
          displayName: cloud.user.display_name ?? cloud.user.nickname ?? "unknown",
          name: cloud.user.nickname ?? "unknown",
        }
      : undefined,
  };
}

/**
 * Bitbucket Cloud backend.
 * Uses api.bitbucket.org/2.0 and repositories/{workspace}/{repo}; normalizes responses to domain types.
 * For API tokens from id.atlassian.com, pass email to use Basic auth (required).
 */
export function createCloudBackend(token: string, email?: string): IBitbucketBackend {
  const credentials: AuthCredentials = email
    ? { type: "basic", username: email, password: token }
    : { type: "bearer", token };
  const http = createHttpClient("https://api.bitbucket.org/2.0", credentials);

  const repoPath = (project: string, repo: string) =>
    `/repositories/${project}/${repo}`;

  return {
    async listPullRequests(project, repo, options = {}) {
      const limit = options.limit ?? 25;
      const start = options.start ?? 0;
      const page = Math.floor(start / limit) + 1;
      const params = new URLSearchParams({
        state: options.state ?? "OPEN",
        pagelen: String(limit),
        page: String(page),
      });
      if (options.author) params.set("q", `author.uuid="${options.author}"`);
      const path = `${repoPath(project, repo)}/pullrequests?${params}`;
      const raw = await http.get<CloudPaged<CloudPullRequest>>(path);
      return normalizePagedPr(raw, { limit, start });
    },

    async getPullRequest(project, repo, prId) {
      const path = `${repoPath(project, repo)}/pullrequests/${prId}`;
      const raw = await http.get<CloudPullRequest>(path);
      return normalizePr(raw);
    },

    async getPullRequestDiff(project, repo, prId, _contextLines = 3) {
      const path = `${repoPath(project, repo)}/pullrequests/${prId}/diff`;
      const rawText = await http.getRaw(path);
      const lines = rawText.split("\n").map((line) => ({
        line,
        source: 0,
        destination: 0,
      }));
      return {
        diffs: [
          {
            source: { toString: "diff" },
            hunks: [
              {
                sourceLine: 0,
                destinationLine: 0,
                segments: [{ type: "CONTEXT", lines }],
              },
            ],
          },
        ],
      } as DiffResponse;
    },

    async getPullRequestActivities(project, repo, prId, limit = 50) {
      const path = `${repoPath(project, repo)}/pullrequests/${prId}/activity?pagelen=${limit}`;
      const raw = await http.get<CloudPaged<Parameters<typeof normalizeActivity>[0]>>(path);
      const values = (raw.values ?? []).map(normalizeActivity);
      return {
        values,
        size: values.length,
        isLastPage: !raw.next,
        start: 0,
        limit: limit,
        nextPageStart: values.length,
      };
    },

    async createPullRequest(project, repo, options) {
      const body = {
        title: options.title,
        description: options.description ?? "",
        source: { branch: { name: options.fromBranch } },
        destination: { branch: { name: options.toBranch ?? "main" } },
        reviewers: (options.reviewers ?? []).map((uuid) => ({ uuid })),
      };
      const path = `${repoPath(project, repo)}/pullrequests`;
      const raw = await http.post<CloudPullRequest>(path, body);
      return normalizePr(raw);
    },

    async addPrComment(project, repo, prId, options) {
      const body: Record<string, unknown> = {
        content: { raw: options.text },
      };
      if (options.filePath != null && options.lineNumber != null) {
        body.anchor = {
          line: options.lineNumber,
          line_type: (options.lineType ?? "ADDED").toLowerCase(),
          path: options.filePath,
        };
      }
      const path = `${repoPath(project, repo)}/pullrequests/${prId}/comments`;
      const raw = await http.post<Parameters<typeof normalizeComment>[0]>(path, body);
      return normalizeComment(raw);
    },

    async approvePullRequest(project, repo, prId, _userSlug) {
      await http.post(`${repoPath(project, repo)}/pullrequests/${prId}/approve`, {});
    },

    async unapprovePullRequest(project, repo, prId, _userSlug) {
      await http.delete(`${repoPath(project, repo)}/pullrequests/${prId}/approve`);
    },
  };
}
