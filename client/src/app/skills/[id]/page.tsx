import { Suspense } from "react";
import { SkillDetail } from "./_components/SkillDetail";

/* Route: /skills/[id] — the full-page view of one skill (Config / Preview /
   Versioning). Thin route entry: it only resolves the id and hands off. The
   segment stays a server component so `params` is awaited here rather than read
   through a client hook; Suspense is required because SkillDetail keeps its tab
   in `?tab=` via useSearchParams. */
export default async function SkillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense>
      <SkillDetail id={id} />
    </Suspense>
  );
}
