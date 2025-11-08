/**
 * GitHub API Client
 *
 * Provides functions to interact with GitHub API for PR management
 */

import { getGitHubAppToken } from "./github-app-auth";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface GitHubPRDetails {
  number: number;
  title: string;
  state: "open" | "closed";
  merged: boolean;
  draft: boolean;
  user: {
    login: string;
  };
  head: {
    sha: string;
    ref: string;
  };
  base: {
    ref: string;
  };
  html_url: string;
  body: string | null;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
}

export interface GitHubPRCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
  };
}

export interface GitHubCheckRun {
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion: "success" | "failure" | "neutral" | "cancelled" | "timed_out" | "action_required" | "skipped" | null;
  started_at: string | null;
  completed_at: string | null;
  html_url: string;
}

export interface GitHubPRComment {
  id: number;
  user: {
    login: string;
  };
  body: string;
  created_at: string;
  updated_at: string;
  html_url: string;
}

export interface GitHubPRFile {
  filename: string;
  status: "added" | "removed" | "modified" | "renamed";
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export interface ListPRsOptions {
  state?: "open" | "closed" | "all";
  limit?: number;
}

/**
 * List pull requests for a repository
 */
export async function listGitHubPRs(
  repoFullName: string,
  options: ListPRsOptions = {}
): Promise<GitHubPRDetails[]> {
  const { state = "open", limit = 30 } = options;

  try {
    const token = await getGitHubAppToken(repoFullName);
    const cmd = `gh api repos/${repoFullName}/pulls --jq '.[]' -F state=${state} -F per_page=${limit}`;
    const { stdout } = await execAsync(cmd, {
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      env: { ...process.env, GH_TOKEN: token }
    });

    if (!stdout.trim()) {
      return [];
    }

    // Split by lines and parse each JSON object
    const lines = stdout.trim().split('\n');
    const prs = lines.map(line => JSON.parse(line));

    return prs;
  } catch (error) {
    console.error('[GitHub API] Error listing PRs:', error);
    throw new Error(`Failed to list PRs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get details for a specific pull request
 */
export async function getGitHubPR(
  repoFullName: string,
  prNumber: number
): Promise<GitHubPRDetails> {
  try {
    const token = await getGitHubAppToken(repoFullName);
    const cmd = `gh api repos/${repoFullName}/pulls/${prNumber}`;
    const { stdout } = await execAsync(cmd, {
      env: { ...process.env, GH_TOKEN: token }
    });

    return JSON.parse(stdout);
  } catch (error) {
    console.error(`[GitHub API] Error getting PR #${prNumber}:`, error);
    throw new Error(`Failed to get PR #${prNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get commits for a pull request
 */
export async function getGitHubPRCommits(
  repoFullName: string,
  prNumber: number
): Promise<GitHubPRCommit[]> {
  try {
    const token = await getGitHubAppToken(repoFullName);
    const cmd = `gh api repos/${repoFullName}/pulls/${prNumber}/commits --jq '.[]'`;
    const { stdout } = await execAsync(cmd, {
      maxBuffer: 1024 * 1024 * 10,
      env: { ...process.env, GH_TOKEN: token }
    });

    if (!stdout.trim()) {
      return [];
    }

    const lines = stdout.trim().split('\n');
    return lines.map(line => JSON.parse(line));
  } catch (error) {
    console.error(`[GitHub API] Error getting PR #${prNumber} commits:`, error);
    throw new Error(`Failed to get PR commits: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get check runs for a commit
 */
export async function getGitHubCheckRuns(
  repoFullName: string,
  sha: string
): Promise<GitHubCheckRun[]> {
  try {
    const token = await getGitHubAppToken(repoFullName);
    const cmd = `gh api repos/${repoFullName}/commits/${sha}/check-runs --jq '.check_runs[]'`;
    const { stdout } = await execAsync(cmd, {
      maxBuffer: 1024 * 1024 * 10,
      env: { ...process.env, GH_TOKEN: token }
    });

    if (!stdout.trim()) {
      return [];
    }

    const lines = stdout.trim().split('\n');
    return lines.map(line => JSON.parse(line));
  } catch (error) {
    console.error(`[GitHub API] Error getting check runs for ${sha}:`, error);
    throw new Error(`Failed to get check runs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get comments for a pull request (issue comments)
 */
export async function getGitHubPRComments(
  repoFullName: string,
  prNumber: number
): Promise<GitHubPRComment[]> {
  try {
    const token = await getGitHubAppToken(repoFullName);
    const cmd = `gh api repos/${repoFullName}/issues/${prNumber}/comments --jq '.[]'`;
    const { stdout } = await execAsync(cmd, {
      maxBuffer: 1024 * 1024 * 10,
      env: { ...process.env, GH_TOKEN: token }
    });

    if (!stdout.trim()) {
      return [];
    }

    const lines = stdout.trim().split('\n');
    return lines.map(line => JSON.parse(line));
  } catch (error) {
    console.error(`[GitHub API] Error getting PR #${prNumber} comments:`, error);
    throw new Error(`Failed to get PR comments: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get file changes for a pull request
 */
export async function getGitHubPRFiles(
  repoFullName: string,
  prNumber: number,
  includePatch: boolean = false
): Promise<GitHubPRFile[]> {
  try {
    const token = await getGitHubAppToken(repoFullName);
    const cmd = `gh api repos/${repoFullName}/pulls/${prNumber}/files --jq '.[]'`;
    const { stdout } = await execAsync(cmd, {
      maxBuffer: 1024 * 1024 * 20, // 20MB for large diffs
      env: { ...process.env, GH_TOKEN: token }
    });

    if (!stdout.trim()) {
      return [];
    }

    const lines = stdout.trim().split('\n');
    const files = lines.map(line => JSON.parse(line));

    // Optionally remove patch to reduce size
    if (!includePatch) {
      files.forEach(file => delete file.patch);
    }

    return files;
  } catch (error) {
    console.error(`[GitHub API] Error getting PR #${prNumber} files:`, error);
    throw new Error(`Failed to get PR files: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get review comments for a pull request (code review comments)
 */
export async function getGitHubPRReviewComments(
  repoFullName: string,
  prNumber: number
): Promise<GitHubPRComment[]> {
  try {
    const token = await getGitHubAppToken(repoFullName);
    const cmd = `gh api repos/${repoFullName}/pulls/${prNumber}/comments --jq '.[]'`;
    const { stdout } = await execAsync(cmd, {
      maxBuffer: 1024 * 1024 * 10,
      env: { ...process.env, GH_TOKEN: token }
    });

    if (!stdout.trim()) {
      return [];
    }

    const lines = stdout.trim().split('\n');
    return lines.map(line => JSON.parse(line));
  } catch (error) {
    console.error(`[GitHub API] Error getting PR #${prNumber} review comments:`, error);
    throw new Error(`Failed to get PR review comments: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Comment on a pull request
 */
export async function commentOnGitHubPR(
  repoFullName: string,
  prNumber: number,
  body: string
): Promise<GitHubPRComment> {
  try {
    const token = await getGitHubAppToken(repoFullName);
    const cmd = `gh api repos/${repoFullName}/issues/${prNumber}/comments -f body=${JSON.stringify(body)}`;
    const { stdout } = await execAsync(cmd, {
      env: { ...process.env, GH_TOKEN: token }
    });

    return JSON.parse(stdout);
  } catch (error) {
    console.error(`[GitHub API] Error commenting on PR #${prNumber}:`, error);
    throw new Error(`Failed to comment on PR: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
