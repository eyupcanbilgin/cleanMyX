import { JobClient } from "./JobClient";

export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const p = await params;
  return <JobClient id={p.id} />;
}

