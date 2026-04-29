import { Server, Socket } from 'socket.io';
import { mongoSim } from '../config/db.js';

export const setupSockets = (io: Server) => {
  io.on('connection', (socket: Socket) => {
    console.log('Client connected:', socket.id);

    // Live Tracking Mode
    socket.on('location:update', async (data: { userId: string, coordinates: { lat: number, lng: number } }) => {
      const { userId, coordinates } = data;
      const timestamp = new Date().toISOString();

      await mongoSim.read();
      
      // Update or add live tracking entry
      const existing = mongoSim.data.live_tracking.find(t => t.userId === userId);
      if (existing) {
        existing.coordinates = coordinates;
        existing.timestamp = timestamp;
      } else {
        mongoSim.data.live_tracking.push({ userId, coordinates, timestamp });
      }
      
      await mongoSim.write();

      // Broadcast to all (for simplicity in this demo, real use would filter by distance)
      io.emit('location:broadcast', { userId, coordinates, timestamp });
    });

    // Emergency SOS
    socket.on('emergency:sos', (data: { userId: string, name: string, coordinates: { lat: number, lng: number } }) => {
      console.log('SOS Received from:', data.userId);
      // Broadcast to all nearby (everyone in this campus demo)
      socket.broadcast.emit('alert:sos', {
        ...data,
        type: 'SOS',
        timestamp: new Date().toISOString()
      });
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
};
