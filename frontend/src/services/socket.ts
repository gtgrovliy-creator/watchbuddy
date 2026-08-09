import { io } from 'socket.io-client';

// In dev, Vite proxies /socket.io to the backend
// In production, the backend serves the frontend, so same origin works
export const socket = io({
  autoConnect: false,
  transports: ['websocket', 'polling'],
});