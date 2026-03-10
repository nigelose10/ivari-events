import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";

let io: Server | null = null;

export function initSocketIO(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    path: "/api/socket.io",
  });

  io.on("connection", (socket: Socket) => {
    // Clients join event-specific rooms
    socket.on("join-event", (eventSlug: string) => {
      socket.join(`event:${eventSlug}`);
    });

    socket.on("leave-event", (eventSlug: string) => {
      socket.leave(`event:${eventSlug}`);
    });
  });

  return io;
}

/** Emit an RSVP update to all clients watching a specific event */
export function emitRsvpUpdate(eventSlug: string, data: {
  attending: number;
  declined: number;
  maybe: number;
  total: number;
  latestRsvp?: {
    guestName: string;
    status: string;
  };
}) {
  if (io) {
    io.to(`event:${eventSlug}`).emit("rsvp-update", data);
  }
}

/** Emit a new photo to all clients watching a specific event */
export function emitPhotoAdded(eventSlug: string, data: {
  id: number;
  imageUrl: string;
  caption: string | null;
  uploaderName: string | null;
}) {
  if (io) {
    io.to(`event:${eventSlug}`).emit("photo-added", data);
  }
}

export function getIO() {
  return io;
}
