import { create } from 'zustand';
import type { RoomInfo } from '../types';

const API = `http://${window.location.hostname}:8080`;

interface LobbyState {
  activeRoomCode: string | null;
  rooms: RoomInfo[];
  fetchRooms: () => Promise<void>;
  setActiveRoom: (code: string | null) => void;
}

export const useLobbyStore = create<LobbyState>((set) => ({
  activeRoomCode: null,
  rooms: [],

  fetchRooms: async () => {
    try {
      const res = await fetch(`${API}/api/rooms`);
      if (res.ok) {
        const data: RoomInfo[] = await res.json();
        set({ rooms: data ?? [] });
      }
    } catch {
      // network error – silently ignore, rooms stays stale
    }
  },

  setActiveRoom: (code) => set({ activeRoomCode: code }),
}));
