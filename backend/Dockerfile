FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Producción
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache tzdata procps util-linux
COPY --from=0 /app/dist ./dist
COPY --from=0 /app/package*.json ./
RUN npm install --omit=dev
EXPOSE 3000
CMD ["node", "dist/main"]
