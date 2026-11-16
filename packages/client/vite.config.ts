import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // In dev the client runs on Vite; forward sockets and API calls to the game server.
    proxy: {
      "/socket.io": { target: "http://localhost:3000", ws: true },
      "/health": "http://localhost:3000",
    },
  },
});
