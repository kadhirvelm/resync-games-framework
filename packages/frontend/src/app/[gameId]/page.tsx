import { notFound } from "next/navigation";
import { GameExperienceHost } from "@/components/game-experiences/GameExperienceHost";
import {
  GAME_EXPERIENCE_IDS,
  isGameExperienceId,
} from "@/components/game-experiences/gameExperiencePaths";
import { ClientGate } from "@/lib/providers/ClientGate";

/**
 * One game's address. Refreshing this page mounts the same game again.
 * @param params - Dynamic path segment
 * @returns The hosted game
 */
export default async function GamePage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!isGameExperienceId(gameId)) {
    notFound();
  }

  return (
    <ClientGate>
      <GameExperienceHost gameId={gameId} />
    </ClientGate>
  );
}

/**
 * @returns The registered game paths Next can prerender
 */
export function generateStaticParams() {
  return GAME_EXPERIENCE_IDS.map((gameId) => ({ gameId }));
}
