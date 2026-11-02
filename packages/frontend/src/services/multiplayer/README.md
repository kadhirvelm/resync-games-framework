# Multiplayer room quick start

The shared gateway is for small games whose public state fits in one JSON
snapshot. It supplies room codes, create/join/leave commands, player presence,
capacity, host handoff, reconnect/rejoin behavior, and revision checks.

```tsx
"use client";

import { useMultiplayerRoom } from "@/services/multiplayer";

type GameState = {
  currentPlayerId: string;
  moves: string[];
};

interface PlayerProps {
  playerId: string;
  playerName: string;
}

export function MyGame({ playerId, playerName }: PlayerProps) {
  const multiplayer = useMultiplayerRoom<GameState>({
    gameId: "my-game",
    initialState: { currentPlayerId: playerId, moves: [] },
    maxPlayers: 2,
    player: { id: playerId, name: playerName },
  });

  // Lobby actions:
  // await multiplayer.createRoom();
  // await multiplayer.joinRoom(code);
  // await multiplayer.leaveRoom();

  const playMove = async (move: string) => {
    if (!multiplayer.room) return;
    await multiplayer.updateGameState({
      ...multiplayer.room.gameState,
      moves: [...multiplayer.room.gameState.moves, move],
    });
  };

  // Share multiplayer.room.id, list multiplayer.room.players, and render the
  // game from multiplayer.room.gameState. multiplayer.isHost identifies the
  // current lobby host.
  return <button onClick={() => void playMove("pass")}>Play move</button>;
}
```

Persist `playerId` in the browser or use the authenticated account id; do not
create a new one per render. Await one state update before sending the next. If
a command returns `REVISION_CONFLICT`, reapply the user action to the returned
latest room state.

For hidden information, ranked play, economy writes, or anti-cheat validation,
add game-specific server commands and reducers instead of letting clients
replace the complete snapshot.
