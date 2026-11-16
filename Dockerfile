# syntax=docker/dockerfile:1

# ---- Build stage: install everything, build client + server ----
FROM node:22-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build
# Drop dev-only packages (tests, linters, Vite) from the final image
RUN npm prune --omit=dev

# ---- Runtime stage: just what's needed to run ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
USER node
# Hosts set PORT themselves; the server must listen on process.env.PORT
EXPOSE 3000
CMD ["node", "packages/server/dist/index.js"]
