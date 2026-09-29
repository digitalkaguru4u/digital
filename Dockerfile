# Digital Guru — production image (Node 20, builds the admin SPA)
FROM node:20-alpine AS admin
WORKDIR /app/admin
COPY admin/package*.json ./
RUN npm ci
COPY admin/ ./
RUN npm run build

FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
COPY --from=admin /app/admin/dist ./admin/dist
EXPOSE 4000
USER node
CMD ["node", "server.js"]
