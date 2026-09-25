# Multi-stage build: full node_modules (incl. devDependencies) to compile,
# then a lean runtime image with only production dependencies.

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
COPY migrations ./migrations
COPY scripts ./scripts

EXPOSE 3000
CMD ["node", "dist/main.js"]
