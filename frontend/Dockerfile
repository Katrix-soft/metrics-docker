FROM node:20-alpine as builder
WORKDIR /app
# El contexto será la carpeta 'frontend'
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
# En Angular 17, el build suele estar en dist/ o dist/[proyecto]
# Copiamos todo 'dist' a la carpeta de nginx para no fallar por rutas internas
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 4200
CMD ["nginx", "-g", "daemon off;"]
