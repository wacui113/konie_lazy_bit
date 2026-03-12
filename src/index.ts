import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getBitbucketBackend } from "./backends/index.ts";
import type {
  PagedResponse,
  PullRequest,
  Activity,
  Comment,
  DiffResponse,
} from "./types.ts";

// ─── Shared param shapes ─────────────────────────────────────────────────────

const repoShape = {
  project: z.string().describe("Bitbucket project key (e.g. PROJ) or workspace (Cloud)"),
  repo: z.string().describe("Repository slug (e.g. my-repo)"),
};

const prShape = {
  ...repoShape,
  prId: z.number().int().positive().describe("Pull request ID"),
};

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatPrList(data: PagedResponse<PullRequest>): string {
  if (data.values.length === 0) return "No pull requests found.";

  const lines = data.values.map((pr) => {
    const date = new Date(pr.updatedDate).toISOString().split("T")[0];
    return `#${pr.id} [${pr.state}] "${pr.title}" | ${pr.fromRef.displayId} -> ${pr.toRef.displayId} | by ${pr.author.user.displayName} | updated ${date}`;
  });

  const pagination = data.isLastPage
    ? `Showing all ${data.values.length} results.`
    : `Showing ${data.values.length} of more results. Next page starts at index ${data.nextPageStart}.`;

  return lines.join("\n") + "\n\n" + pagination;
}

function formatPrDetail(pr: PullRequest): string {
  const reviewerLines = pr.reviewers.map(
    (r) => `  - ${r.user.displayName} (${r.user.name}): ${r.status}`
  );

  return [
    `PR #${pr.id}: ${pr.title}`,
    `State: ${pr.state} | Version: ${pr.version}`,
    `Author: ${pr.author.user.displayName} (${pr.author.user.name})`,
    `Branch: ${pr.fromRef.displayId} -> ${pr.toRef.displayId}`,
    `Created: ${new Date(pr.createdDate).toISOString()}`,
    `Updated: ${new Date(pr.updatedDate).toISOString()}`,
    `URL: ${pr.links?.self?.[0]?.href ?? "N/A"}`,
    "",
    `Description:\n${pr.description ?? "(none)"}`,
    "",
    `Reviewers (${pr.reviewers.length}):`,
    ...reviewerLines,
  ].join("\n");
}

function formatActivities(data: PagedResponse<Activity>): string {
  if (data.values.length === 0) return "No activities found.";

  const lines = data.values.map((act) => {
    const date = new Date(act.createdDate)
      .toISOString()
      .replace("T", " ")
      .split(".")[0];
    const user = act.user.displayName;

    if (act.action === "COMMENTED" && act.comment) {
      const anchor = act.commentAnchor
        ? ` [${act.commentAnchor.path}:${act.commentAnchor.line}]`
        : "";
      return `[${date}] COMMENT by ${user}${anchor}:\n  ${act.comment.text.replace(/\n/g, "\n  ")}`;
    }

    return `[${date}] ${act.action} by ${user}`;
  });

  return lines.join("\n\n");
}

function formatDiff(data: DiffResponse): string {
  if (!data.diffs || data.diffs.length === 0) return "No diff available.";

  const fileDiffs = data.diffs.map((diff) => {
    const filePath =
      diff.destination?.toString ?? diff.source?.toString ?? "unknown";
    const hunkLines: string[] = [`--- ${filePath}`];

    for (const hunk of diff.hunks) {
      hunkLines.push(`@@ -${hunk.sourceLine} +${hunk.destinationLine} @@`);
      for (const segment of hunk.segments) {
        const prefix =
          segment.type === "ADDED"
            ? "+"
            : segment.type === "REMOVED"
              ? "-"
              : " ";
        for (const line of segment.lines) {
          hunkLines.push(`${prefix}${line.line}`);
        }
      }
    }

    return hunkLines.join("\n");
  });

  return fileDiffs.join("\n\n");
}

// ─── Server setup ─────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "bitbucket-mcp",
  version: "1.0.0",
});

// 1. list_pull_requests
server.registerTool(
  "list_pull_requests",
  {
    description:
      "List pull requests in a repository. Filter by state (OPEN, MERGED, DECLINED, ALL) and/or author username.",
    inputSchema: {
      ...repoShape,
      state: z
        .enum(["OPEN", "MERGED", "DECLINED", "ALL"])
        .optional()
        .default("OPEN")
        .describe("PR state filter"),
      author: z
        .string()
        .optional()
        .describe("Filter by author username (slug)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(25)
        .describe("Max results to return"),
      start: z
        .number()
        .int()
        .min(0)
        .optional()
        .default(0)
        .describe("Pagination start index"),
    },
  },
  async ({ project, repo, state, author, limit, start }) => {
    const backend = getBitbucketBackend();
    const data = await backend.listPullRequests(project, repo, {
      state: state ?? "OPEN",
      limit: limit ?? 25,
      start: start ?? 0,
      author: author ?? undefined,
    });
    return { content: [{ type: "text", text: formatPrList(data) }] };
  }
);

// 2. get_pull_request
server.registerTool(
  "get_pull_request",
  {
    description: "Get detailed information about a specific pull request.",
    inputSchema: prShape,
  },
  async ({ project, repo, prId }) => {
    const pr = await getBitbucketBackend().getPullRequest(project, repo, prId);
    return { content: [{ type: "text", text: formatPrDetail(pr) }] };
  }
);

// 3. get_pull_request_diff
server.registerTool(
  "get_pull_request_diff",
  {
    description:
      "Get the diff (code changes) of a pull request. Returns unified diff text.",
    inputSchema: {
      ...prShape,
      contextLines: z
        .number()
        .int()
        .min(0)
        .max(20)
        .optional()
        .default(3)
        .describe("Number of context lines around each change"),
    },
  },
  async ({ project, repo, prId, contextLines }) => {
    const data = await getBitbucketBackend().getPullRequestDiff(
      project,
      repo,
      prId,
      contextLines ?? 3
    );
    return { content: [{ type: "text", text: formatDiff(data) }] };
  }
);

// 4. get_pull_request_activities
server.registerTool(
  "get_pull_request_activities",
  {
    description:
      "Get activities (comments, reviews, commits) on a pull request.",
    inputSchema: {
      ...prShape,
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe("Max activities to return"),
    },
  },
  async ({ project, repo, prId, limit }) => {
    const data = await getBitbucketBackend().getPullRequestActivities(
      project,
      repo,
      prId,
      limit ?? 50
    );
    return { content: [{ type: "text", text: formatActivities(data) }] };
  }
);

// 5. create_pull_request
server.registerTool(
  "create_pull_request",
  {
    description: "Create a new pull request.",
    inputSchema: {
      ...repoShape,
      title: z.string().describe("PR title"),
      description: z
        .string()
        .optional()
        .describe("PR description (markdown)"),
      fromBranch: z.string().describe("Source branch name"),
      toBranch: z
        .string()
        .optional()
        .default("main")
        .describe("Target branch name (default: main)"),
      reviewers: z
        .array(z.string())
        .optional()
        .describe("List of reviewer usernames (slugs)"),
    },
  },
  async ({ project, repo, title, description, fromBranch, toBranch, reviewers }) => {
    const pr = await getBitbucketBackend().createPullRequest(project, repo, {
      title,
      description: description ?? "",
      fromBranch,
      toBranch: toBranch ?? "main",
      reviewers: reviewers ?? [],
    });
    const text = `Created PR #${pr.id}: "${pr.title}"\nURL: ${pr.links?.self?.[0]?.href ?? "N/A"}`;
    return { content: [{ type: "text", text }] };
  }
);

// 6. add_pr_comment
server.registerTool(
  "add_pr_comment",
  {
    description:
      "Add a comment to a pull request. Optionally anchor to a specific file/line for inline comments.",
    inputSchema: {
      ...prShape,
      text: z.string().describe("Comment text (markdown supported)"),
      filePath: z
        .string()
        .optional()
        .describe("File path to anchor the comment to (for inline comments)"),
      lineNumber: z
        .number()
        .int()
        .optional()
        .describe("Line number for inline comment (requires filePath)"),
      lineType: z
        .enum(["ADDED", "REMOVED", "CONTEXT"])
        .optional()
        .default("ADDED")
        .describe("Line type for inline comment"),
    },
  },
  async ({ project, repo, prId, text, filePath, lineNumber, lineType }) => {
    const comment = await getBitbucketBackend().addPrComment(project, repo, prId, {
      text,
      filePath,
      lineNumber,
      lineType: lineType ?? "ADDED",
    });
    const result = `Comment #${comment.id} added by ${comment.author?.displayName ?? "unknown"}.`;
    return { content: [{ type: "text", text: result }] };
  }
);

// 7. approve_pull_request
server.registerTool(
  "approve_pull_request",
  {
    description:
      "Approve a pull request. The token owner will be set as APPROVED reviewer.",
    inputSchema: {
      ...prShape,
      userSlug: z
        .string()
        .describe(
          "Your Bitbucket username (slug) - required for the API path"
        ),
    },
  },
  async ({ project, repo, prId, userSlug }) => {
    await getBitbucketBackend().approvePullRequest(project, repo, prId, userSlug);
    return {
      content: [{ type: "text", text: `PR #${prId} approved by ${userSlug}.` }],
    };
  }
);

// 8. unapprove_pull_request
server.registerTool(
  "unapprove_pull_request",
  {
    description:
      "Remove approval from a pull request (set status back to UNAPPROVED).",
    inputSchema: {
      ...prShape,
      userSlug: z.string().describe("Your Bitbucket username (slug)"),
    },
  },
  async ({ project, repo, prId, userSlug }) => {
    await getBitbucketBackend().unapprovePullRequest(project, repo, prId, userSlug);
    return {
      content: [
        {
          type: "text",
          text: `Approval removed from PR #${prId} by ${userSlug}.`,
        },
      ],
    };
  }
);


// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
