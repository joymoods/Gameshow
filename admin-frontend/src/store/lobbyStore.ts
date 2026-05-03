import { create } from 'zustand';
import type { RoomInfo } from '../types';
import { API, apiFetch } from '../api/client';

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
      const res = await apiFetch(`${API}/api/rooms`);
      if (res.ok) {
        const data: RoomInfo[] = await res.json() ?? [];
        set((state) => {
          const dataMap = new Map(data.map((r) => [r.roomCode, r]));
          // Keep existing rooms in order (updated data), remove gone ones
          const existing = state.rooms
            .filter((r) => dataMap.has(r.roomCode))
            .map((r) => dataMap.get(r.roomCode)!);
          // New rooms go to the front (newest on top)
          const existingCodes = new Set(state.rooms.map((r) => r.roomCode));
          const added = data.filter((r) => !existingCodes.has(r.roomCode));
          return { rooms: [...added, ...existing] };
        });
      }
    } catch {
      // network error – silently ignore, rooms stays stale
    }
  },

  setActiveRoom: (code) => set({ activeRoomCode: code }),
}));
