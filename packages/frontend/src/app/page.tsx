import { redirect } from "next/navigation";
import { GameLibrary } from "@/components/game-experiences/GameLibrary";
import { legacyExperienceRedirectTarget } from "@/components/game-experiences/gameExperiencePaths";
import { ClientGate } from "@/lib/providers/ClientGate";

/**
 * Game library. An old `?experience=` link is sent to that game's path so
 * existing playground bookmarks still open the same game.
 * @param searchParams - Home-route query
 * @returns The library, after any legacy redirect
 */
export default async function Application({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const legacyTarget = legacyExperienceRedirectTarget(await searchParams);
  if (legacyTarget !== null) {
    redirect(legacyTarget);
  }

  return (
    <ClientGate>
      <GameLibrary />
    </ClientGate>
  );
}
