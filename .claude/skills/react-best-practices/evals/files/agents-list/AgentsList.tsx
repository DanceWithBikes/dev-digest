"use client";

import { useEffect, useMemo, useCallback, useState } from "react";
import axios from "axios";
import { AgentCard } from "@/components/AgentCard";
import { Pagination } from "@/components/ui/Pagination";
import type { Agent } from "@devdigest/shared";

const PAGE_SIZE = 20;

interface AgentsListProps {
  workspaceId: string;
  currentUser: { firstName: string; lastName: string };
}

export function AgentsList({ workspaceId, currentUser }: AgentsListProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "archived">("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const displayName = useMemo(
    () => `${currentUser.firstName} ${currentUser.lastName}`,
    [currentUser.firstName, currentUser.lastName],
  );

  const handleQueryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setPage(1);
  }, []);

  useEffect(() => {
    setLoading(true);
    axios
      .get<Agent[]>(`/api/workspaces/${workspaceId}/agents`, {
        params: { q: query, status, page, pageSize: PAGE_SIZE },
      })
      .then((res) => setAgents(res.data))
      .finally(() => setLoading(false));
  }, [workspaceId, query, status, page]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/") document.getElementById("agent-search")?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sorted = useMemo(
    () => [...agents].sort((a, b) => b.findingsTotal - a.findingsTotal || a.name.localeCompare(b.name)),
    [agents],
  );

  return (
    <section>
      <p className="text-sm text-gray-500">Signed in as {displayName}</p>
      <input
        id="agent-search"
        type="search"
        value={query}
        onChange={handleQueryChange}
        placeholder="Search agents"
      />
      <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
        <option value="all">All</option>
        <option value="active">Active</option>
        <option value="archived">Archived</option>
      </select>
      {loading ? (
        <p>Loading…</p>
      ) : (
        <ul className="grid gap-3">
          {sorted.map((agent) => (
            <li key={agent.id}>
              <AgentCard agent={agent} />
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} onChange={setPage} pageSize={PAGE_SIZE} />
    </section>
  );
}
