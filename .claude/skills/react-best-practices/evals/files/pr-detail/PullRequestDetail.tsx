"use client";

import { ErrorBoundary } from "react-error-boundary";
import { usePathname } from "next/navigation";
import { Spinner } from "@/components/ui/Spinner";
import { Badge } from "@/components/ui/Badge";
import { usePullRequest } from "@/lib/hooks/pull-requests";
import { FindingItem } from "./FindingItem";

interface PullRequestDetailProps {
  repoId: string;
  number: number;
}

function CrashFallback({ error }: { error: Error }) {
  return (
    <div role="alert" className="rounded border border-red-300 p-4">
      <p>Something went wrong: {error.message}</p>
    </div>
  );
}

export function PullRequestDetail({ repoId, number }: PullRequestDetailProps) {
  const pathname = usePathname();
  const { data: pr, isLoading, isError } = usePullRequest(repoId, number);

  return (
    <ErrorBoundary FallbackComponent={CrashFallback}>
      <article>
        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <p role="alert">Could not load this pull request.</p>
        ) : pr && pr.findings.length > 0 ? (
          <>
            <header className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{pr.title}</h1>
              <Badge tone={pr.verdict}>{pr.verdict}</Badge>
            </header>
            <p style={{ marginTop: 12, color: "#6b7280", fontSize: 13 }}>
              {pr.findings.length} findings on {pathname}
            </p>
            <ul className="mt-3 space-y-2">
              {pr.findings.map((finding) => (
                <FindingItem key={finding.id} finding={finding} />
              ))}
            </ul>
          </>
        ) : (
          <p>No findings for this pull request.</p>
        )}
      </article>
    </ErrorBoundary>
  );
}
