import { createHttpClient } from "../http.ts";
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

/**
 * Bitbucket Data Center / Server backend.
 * Uses /rest/api/latest and project/repo paths; responses match our domain types.
 */
export function createServerBackend(
  baseUrl: string,
  token: string
): IBitbucketBackend {
  const http = createHttpClient(
    `${baseUrl.replace(/\/$/, "")}/rest/api/latest`,
    token
  );

  const projectRepo = (project: string, repo: string) =>
    `/projects/${project}/repos/${repo}`;

  return {
    async listPullRequests(project, repo, options = {}) {
      const params = new URLSearchParams({
        state: options.state ?? "OPEN",
        limit: String(options.limit ?? 25),
        start: String(options.start ?? 0),
      });
      if (options.author) params.set("author.username", options.author);
      const path = `${projectRepo(project, repo)}/pull-requests?${params}`;
      return http.get<PagedResponse<PullRequest>>(path);
    },

    async getPullRequest(project, repo, prId) {
      return http.get<PullRequest>(
        `${projectRepo(project, repo)}/pull-requests/${prId}`
      );
    },

    async getPullRequestDiff(project, repo, prId, contextLines = 3) {
      const params = new URLSearchParams({ contextLines: String(contextLines) });
      return http.get<DiffResponse>(
        `${projectRepo(project, repo)}/pull-requests/${prId}/diff?${params}`
      );
    },

    async getPullRequestActivities(project, repo, prId, limit = 50) {
      return http.get<PagedResponse<Activity>>(
        `${projectRepo(project, repo)}/pull-requests/${prId}/activities?limit=${limit}`
      );
    },

    async createPullRequest(project, repo, options) {
      const body = {
        title: options.title,
        description: options.description ?? "",
        fromRef: {
          id: `refs/heads/${options.fromBranch}`,
          repository: { slug: repo, project: { key: project } },
        },
        toRef: {
          id: `refs/heads/${options.toBranch ?? "main"}`,
          repository: { slug: repo, project: { key: project } },
        },
        reviewers: (options.reviewers ?? []).map((slug) => ({ user: { name: slug } })),
      };
      return http.post<PullRequest>(
        `${projectRepo(project, repo)}/pull-requests`,
        body
      );
    },

    async addPrComment(project, repo, prId, options) {
      const body: Record<string, unknown> = { text: options.text };
      if (options.filePath != null && options.lineNumber != null) {
        body.anchor = {
          line: options.lineNumber,
          lineType: options.lineType ?? "ADDED",
          path: options.filePath,
          fileType: "TO",
        };
      }
      return http.post<Comment>(
        `${projectRepo(project, repo)}/pull-requests/${prId}/comments`,
        body
      );
    },

    async approvePullRequest(project, repo, prId, userSlug) {
      await http.put(
        `${projectRepo(project, repo)}/pull-requests/${prId}/participants/${userSlug}`,
        { status: "APPROVED" }
      );
    },

    async unapprovePullRequest(project, repo, prId, userSlug) {
      await http.put(
        `${projectRepo(project, repo)}/pull-requests/${prId}/participants/${userSlug}`,
        { status: "UNAPPROVED" }
      );
    },
  };
}
