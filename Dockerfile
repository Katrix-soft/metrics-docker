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
RUN apk add --no-cache tzdata procps util-linux

# Copy backend
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=backend-builder /app/backend/package*.json ./
RUN npm install --omit=dev

# Copy frontend to public folder (served by NestJS)
# En Angular 17 con builder estándar los archivos están en dist/
COPY --from=frontend-builder /app/frontend/dist ./public

EXPOSE 4200
ENV PORT=4200

# Metadata
LABEL maintainer="Katrix"
LABEL description="Katrix Monitor Lite - Monolithic Build"

CMD ["node", "dist/main"]
