import { MatchHub } from "@/components/MatchHub";

export default function MatchDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <MatchHub matchId={params.id} />;
}
