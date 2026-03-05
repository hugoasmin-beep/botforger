FROM node:20-alpine

WORKDIR /app

# Copier et installer les dépendances backend
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production

# Copier tout le code
COPY backend/ ./backend/
COPY frontend/ ./frontend/

WORKDIR /app/backend

EXPOSE 3000

CMD ["node", "server.js"]
