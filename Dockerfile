# Stage 1: Build Frontend
FROM node:20-alpine as frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Build Backend
FROM node:20-alpine as backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
COPY backend/ ./
RUN npm run build

# Stage 3: Final Production Image
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Install essential tools for system monitoring
RUN apk add --no-cache tzdata procps util-linux

# Copy backend files
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=backend-builder /app/backend/package*.json ./

# Install only production dependencies to keep it light
RUN npm install --omit=dev

# Copy frontend assets to public folder for NestJS to serve
COPY --from=frontend-builder /app/frontend/dist ./public

# Expose port 3000
EXPOSE 3000

# Metadata
LABEL maintainer="Antigravity"
LABEL description="Katrix Monitor Lite - Ultra-lite VPS Monitoring"

CMD ["node", "dist/main"]
