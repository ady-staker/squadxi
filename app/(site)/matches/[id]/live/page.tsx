import { LiveMatchView } from "@/components/LiveMatchView";

export default function MatchLivePage({ params }: { params: { id: string } }) {
  return <LiveMatchView matchId={params.id} />;
}
