import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

interface RsvpUpdate {
  attending: number;
  declined: number;
  maybe: number;
  total: number;
  latestRsvp?: {
    guestName: string;
    status: string;
  };
}

interface PhotoAdded {
  id: number;
  imageUrl: string;
  caption: string | null;
  uploaderName: string | null;
}

export function useSocket(eventSlug: string | undefined) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [latestRsvp, setLatestRsvp] = useState<RsvpUpdate | null>(null);
  const [latestPhoto, setLatestPhoto] = useState<PhotoAdded | null>(null);

  useEffect(() => {
    if (!eventSlug) return;

    const socket = io(window.location.origin, {
      path: "/api/socket.io",
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join-event", eventSlug);
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("rsvp-update", (data: RsvpUpdate) => {
      setLatestRsvp(data);
    });

    socket.on("photo-added", (data: PhotoAdded) => {
      setLatestPhoto(data);
    });

    return () => {
      socket.emit("leave-event", eventSlug);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [eventSlug]);

  const clearLatestRsvp = useCallback(() => setLatestRsvp(null), []);
  const clearLatestPhoto = useCallback(() => setLatestPhoto(null), []);

  return {
    connected,
    latestRsvp,
    latestPhoto,
    clearLatestRsvp,
    clearLatestPhoto,
  };
}
