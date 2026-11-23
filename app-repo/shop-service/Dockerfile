FROM node:22-alpine
WORKDIR /app
COPY index.js package.json ./
COPY public ./public
USER node
EXPOSE 3000
CMD ["node", "index.js"]
