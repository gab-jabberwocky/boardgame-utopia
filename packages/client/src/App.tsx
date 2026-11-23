import { normalizeRoomCode } from "@utopia/shared";
import { CreateRoom } from "./pages/CreateRoom";
import { Home } from "./pages/Home";
import { RoomPage } from "./pages/RoomPage";
import { usePath } from "./router";

/** Pages: home, new room, and a room (lobby or game) at /r/CODE. */
export function App() {
  const path = usePath();
  if (path === "/new") return <CreateRoom />;
  const room = /^\/r\/([A-Za-z]{4})\/?$/.exec(path);
  if (room) return <RoomPage key={room[1]} code={normalizeRoomCode(room[1]!)} />;
  return <Home />;
}
