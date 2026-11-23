import type { AnyGameModule } from "@utopia/shared";
import jewels from "@utopia/game-jewels";
import glass from "@utopia/game-glass";
import beachcomber from "@utopia/game-beachcomber";
import bombBustersV2 from "@utopia/game-bomb-busters-v2";
import baristaPanic from "@utopia/game-barista-panic";
import dinnerDash from "@utopia/game-dinner-dash";
import jewelsDuel from "@utopia/game-jewels-duel";
import matchstickGlutton from "@utopia/game-matchstick-glutton";
import peak from "@utopia/game-peak";
import spy from "@utopia/game-spy";
import triplets from "@utopia/game-triplets";
import ultra7 from "@utopia/game-ultra7";

/**
 * Every playable game's rules, with no UI: the server and the client both read this.
 * Add new games here (and their Board in packages/client/src/games.ts).
 */
export const GAME_MODULES: AnyGameModule[] = [
  peak,
  ultra7,
  dinnerDash,
  jewelsDuel,
  triplets,
  spy,
  matchstickGlutton,
  jewels,
  glass,
  beachcomber,
  baristaPanic,
  bombBustersV2,
].map((m) => m as unknown as AnyGameModule);

export const findModule = (id: string) => GAME_MODULES.find((m) => m.id === id);
