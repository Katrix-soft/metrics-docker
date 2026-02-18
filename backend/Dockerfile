FROM node:20-alpine
WORKDIR /app
# Copiamos desde la raíz del proyecto
COPY backend/package*.json ./
RUN npm install
COPY backend/ .
RUN npm run build

# Imagen final
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache tzdata procps util-linux
COPY --from=0 /app/dist ./dist
COPY --from=0 /app/package*.json ./
RUN npm install --omit=dev
EXPOSE 3000
CMD ["node", "dist/main"]
