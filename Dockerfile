FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
ENV MONGO_URI=
ENV REDIS_URL=

EXPOSE 3000

CMD ["npm", "start"]
