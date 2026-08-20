import { requireUser } from "@/lib/auth";
import { TeamBuilder } from "@/components/TeamBuilder";

export const dynamic = "force-dynamic";

export default async function TeamBuilderPage({ params }: { params: { id: string } }) {
  await requireUser(`/matches/${params.id}/team-builder`);
  return <TeamBuilder matchId={params.id} />;
}
