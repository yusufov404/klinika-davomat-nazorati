FROM node:20-alpine

WORKDIR /app

# native build deps (bcryptjs/umzug safe, but kept for future native modules)
RUN apk add --no-cache python3 make g++ tzdata

ENV TZ=Asia/Tashkent \
    NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY . .

RUN mkdir -p /app/uploads

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "src/server.js"]
