/**
 * Shared domain types and backend interface.
 * Both Server and Cloud backends normalize their API responses to these types.
 */

// ─── Domain types (unified shape for both Server and Cloud) ───────────────────

export interface PagedResponse<T> {
  values: T[];
  size: number;
  isLastPage: boolean;
  start: number;
  limit: number;
  nextPageStart?: number;
}

export interface PullRequest {
  id: number;
  title: string;
  description?: string;
  state: string;
  version: number;
  author: { user: { displayName: string; name: string } };
  reviewers: Array<{
    user: { displayName: string; name: string };
    status: string;
  }>;
  fromRef: { displayId: string };
  toRef: { displayId: string };
  createdDate: number;
  updatedDate: number;
  links?: { self?: Array<{ href: string }> };
}

export interface Activity {
  id: number;
  action: string;
  createdDate: number;
  user: { displayName: string; name: string };
  comment?: { id: number; text: string };
  commentAnchor?: { path: string; line: number };
}

export interface Comment {
  id: number;
  text: string;
  author?: { displayName: string; name: string };
}

export interface DiffResponse {
  diffs: Array<{
    source?: { toString: string };
    destination?: { toString: string };
    hunks: Array<{
      sourceLine: number;
      destinationLine: number;
      segments: Array<{
        type: string;
        lines: Array<{ line: string; source: number; destination: number }>;
      }>;
    }>;
  }>;
}

// ─── Backend interface ──────────────────────────────────────────────────────

export interface ListPullRequestsOptions {
  state?: string;
  limit?: number;
  start?: number;
  author?: string;
}

export interface CreatePullRequestOptions {
  title: string;
  description?: string;
  fromBranch: string;
  toBranch?: string;
  reviewers?: string[];
}

export interface AddCommentOptions {
  text: string;
  filePath?: string;
  lineNumber?: number;
  lineType?: string;
}

/**
 * Abstraction over Bitbucket Server/Data Center and Bitbucket Cloud.
 * All methods return the same domain types regardless of backend.
 */
export interface IBitbucketBackend {
  listPullRequests(
    project: string,
    repo: string,
    options?: ListPullRequestsOptions
  ): Promise<PagedResponse<PullRequest>>;

  getPullRequest(
    project: string,
    repo: string,
    prId: number
  ): Promise<PullRequest>;

  getPullRequestDiff(
    project: string,
    repo: string,
    prId: number,
    contextLines?: number
  ): Promise<DiffResponse>;

  getPullRequestActivities(
    project: string,
    repo: string,
    prId: number,
    limit?: number
  ): Promise<PagedResponse<Activity>>;

  createPullRequest(
    project: string,
    repo: string,
    options: CreatePullRequestOptions
  ): Promise<PullRequest>;

  addPrComment(
    project: string,
    repo: string,
    prId: number,
    options: AddCommentOptions
  ): Promise<Comment>;

  approvePullRequest(
    project: string,
    repo: string,
    prId: number,
    userSlug: string
  ): Promise<void>;

  unapprovePullRequest(
    project: string,
    repo: string,
    prId: number,
    userSlug: string
  ): Promise<void>;
}
