FROM node:22-alpine
WORKDIR /app
COPY index.js package.json ./
COPY images ./images
USER node
EXPOSE 3001
CMD ["node", "index.js"]
