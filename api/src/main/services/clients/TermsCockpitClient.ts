import dotenv from 'dotenv';

dotenv.config();

export type RepoStatus = 'not_loaded' | 'loading' | 'ready' | 'error';

export interface KnownRepo {
  name: string;
  label: string;
  group: string;
  url: string;
  status: RepoStatus;
  error?: string | null;
  active: boolean;
}

export interface RepoDocumentSummary {
  name: string;
  versions: number;
  last_modified: number | null;
}

export interface ReadabilityDocument {
  document: string;
  commit: string | null;
  title: string;
  short_title: string;
  content: string;
}

export interface RawDocument {
  document: string;
  commit: string | null;
  content: string;
}

export interface DocumentChange {
  commit_hash: string;
  author: string;
  timestamp: number;
  insertions: number;
  deletions: number;
  blob_sha: string | null;
}

function encodeDocumentPath(document: string): string {
  return document.split('/').map(encodeURIComponent).join('/');
}

class TermsCockpitClient {
  private baseUrl(): string {
    const url = process.env.TERMSCOCKPIT_SERVICE_URL;
    if (!url) {
      throw new Error('ERROR: TERMSCOCKPIT_SERVICE_URL is not configured');
    }
    return url.replace(/\/$/, '');
  }

  private async getJson<T>(path: string): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl()}${path}`);
    } catch {
      throw new Error('ERROR: termscockpit service unavailable');
    }

    if (!response.ok) {
      throw new Error(`ERROR: termscockpit responded with status ${response.status} for ${path}`);
    }

    return (await response.json()) as T;
  }

  async listRepos(): Promise<KnownRepo[]> {
    const data = await this.getJson<{ repos: KnownRepo[] }>('/api/repos/');
    return data.repos;
  }

  async getRepoStatus(repo: string): Promise<RepoStatus> {
    const data = await this.getJson<{ status: RepoStatus }>(`/api/repos/status/${encodeURIComponent(repo)}`);
    return data.status;
  }

  async waitForRepoReady(repo: string, options: { timeoutMs?: number; intervalMs?: number } = {}): Promise<void> {
    const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
    const intervalMs = options.intervalMs ?? 3000;
    const deadline = Date.now() + timeoutMs;

    for (;;) {
      const status = await this.getRepoStatus(repo);
      if (status === 'ready') return;
      if (status === 'error') {
        throw new Error(`ERROR: termscockpit repository '${repo}' failed to load`);
      }
      if (Date.now() > deadline) {
        throw new Error(`ERROR: timed out waiting for termscockpit repository '${repo}' to become ready`);
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }

  async listServices(repo: string): Promise<string[]> {
    const data = await this.getJson<{ services: string[] }>(`/api/${encodeURIComponent(repo)}/services/`);
    return data.services;
  }

  async listServiceDocuments(repo: string, service: string): Promise<RepoDocumentSummary[]> {
    const data = await this.getJson<{ documents: RepoDocumentSummary[] }>(
      `/api/${encodeURIComponent(repo)}/services/${encodeURIComponent(service)}/documents`
    );
    return data.documents;
  }

  async getDocumentReadability(repo: string, document: string): Promise<ReadabilityDocument> {
    return this.getJson<ReadabilityDocument>(
      `/api/${encodeURIComponent(repo)}/documents/${encodeDocumentPath(document)}/readability`
    );
  }

  async getDocumentReadabilityAt(repo: string, document: string, commitHash: string): Promise<ReadabilityDocument> {
    return this.getJson<ReadabilityDocument>(
      `/api/${encodeURIComponent(repo)}/documents/${encodeDocumentPath(document)}/readability/at/${encodeURIComponent(commitHash)}`
    );
  }

  // For repos backed by an already-extracted "versions" collection (clean
  // text/markdown, not a raw scraped page), readability-lxml either doesn't
  // apply or actively hurts — this returns the file content as-is.
  async getDocumentContent(repo: string, document: string): Promise<RawDocument> {
    return this.getJson<RawDocument>(`/api/${encodeURIComponent(repo)}/documents/${encodeDocumentPath(document)}`);
  }

  async getDocumentContentAt(repo: string, document: string, commitHash: string): Promise<RawDocument> {
    return this.getJson<RawDocument>(
      `/api/${encodeURIComponent(repo)}/documents/${encodeDocumentPath(document)}/at/${encodeURIComponent(commitHash)}`
    );
  }

  // Returns [] (rather than throwing) when the repository has change-tracking
  // disabled (termscockpit responds 400) — callers treat that as "no history
  // available", not a fatal error. Any other failure (network, 5xx) throws.
  async listDocumentChanges(repo: string, document: string): Promise<DocumentChange[]> {
    let response: Response;
    try {
      response = await fetch(
        `${this.baseUrl()}/api/${encodeURIComponent(repo)}/documents/${encodeDocumentPath(document)}/changes`
      );
    } catch {
      throw new Error('ERROR: termscockpit service unavailable');
    }

    if (response.status === 400) {
      return [];
    }
    if (!response.ok) {
      throw new Error(`ERROR: termscockpit responded with status ${response.status} for document changes`);
    }

    const data = (await response.json()) as { changes: DocumentChange[] };
    return data.changes;
  }
}

export default TermsCockpitClient;
