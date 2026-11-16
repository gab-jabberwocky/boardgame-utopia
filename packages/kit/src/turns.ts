import type { PlayerId } from "@utopia/shared";

/** Turn order as plain data, safe to keep in game state. */
export interface TurnOrder {
  /** Seat order. */
  players: PlayerId[];
  /** Index into `players` of whose turn it is. */
  current: number;
  /** 1 = clockwise (seat order), -1 = reversed. */
  direction: 1 | -1;
  eliminated: PlayerId[];
}

export function createTurnOrder(players: readonly PlayerId[], first = 0): TurnOrder {
  if (players.length === 0) throw new Error("createTurnOrder: no players");
  if (first < 0 || first >= players.length) throw new Error(`createTurnOrder: bad first ${first}`);
  return { players: [...players], current: first, direction: 1, eliminated: [] };
}

export function currentPlayer(order: TurnOrder): PlayerId {
  return order.players[order.current] as PlayerId;
}

/** Players still in the game, in seat order. */
export function activePlayers(order: TurnOrder): PlayerId[] {
  return order.players.filter((p) => !order.eliminated.includes(p));
}

/** Pass the turn to the next player who is not eliminated. */
export function nextTurn(order: TurnOrder): TurnOrder {
  if (activePlayers(order).length === 0) throw new Error("nextTurn: everyone is eliminated");
  const n = order.players.length;
  let i = order.current;
  do {
    i = (((i + order.direction) % n) + n) % n;
  } while (order.eliminated.includes(order.players[i] as PlayerId));
  return { ...order, current: i };
}

/** Skip the next player: the turn goes to the one after them. */
export function skipNext(order: TurnOrder): TurnOrder {
  return nextTurn(nextTurn(order));
}

export function reverseDirection(order: TurnOrder): TurnOrder {
  return { ...order, direction: order.direction === 1 ? -1 : 1 };
}

/** Remove a player from the rotation. If it was their turn, it stays on them until nextTurn. */
export function eliminate(order: TurnOrder, player: PlayerId): TurnOrder {
  if (!order.players.includes(player)) throw new Error(`eliminate: unknown player ${player}`);
  if (order.eliminated.includes(player)) return order;
  return { ...order, eliminated: [...order.eliminated, player] };
}
