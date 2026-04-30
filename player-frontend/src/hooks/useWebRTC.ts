import { useCallback, useEffect, useRef, useState } from 'react';
import { addMessageListener, send } from '../ws/socket';

export interface CamPeer {
  name: string;
  stream: MediaStream | null;
}

export function useWebRTC(myPeerID: string, myName: string) {
  const [camEnabled, setCamEnabled] = useState(false);
  const [activeCams, setActiveCams] = useState<Map<string, CamPeer>>(new Map());

  const myStreamRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  // Track current camEnabled in a ref so effect callbacks stay up-to-date.
  const camEnabledRef = useRef(false);
  camEnabledRef.current = camEnabled;
  // Same for myPeerID (stable once logged in, but defensive).
  const myPeerIDRef = useRef(myPeerID);
  myPeerIDRef.current = myPeerID;

  const getOrCreatePC = useCallback((peerID: string): RTCPeerConnection => {
    const existing = pcsRef.current.get(peerID);
    if (existing) return existing;

    const pc = new RTCPeerConnection();
    pcsRef.current.set(peerID, pc);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        send('WEBRTC_ICE', { to: peerID, candidate: e.candidate.toJSON() });
      }
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? null;
      setActiveCams((prev) => {
        const next = new Map(prev);
        const info = next.get(peerID) ?? { name: peerID, stream: null };
        next.set(peerID, { ...info, stream });
        return next;
      });
    };

    pc.onnegotiationneeded = async () => {
      const me = myPeerIDRef.current;
      if (!me || me >= peerID) return; // only the smaller ID initiates
      try {
        await pc.setLocalDescription();
        send('WEBRTC_OFFER', { to: peerID, sdp: pc.localDescription });
      } catch (e) {
        console.error('onnegotiationneeded error', e);
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        setActiveCams((prev) => {
          const next = new Map(prev);
          const info = next.get(peerID);
          if (info) next.set(peerID, { ...info, stream: null });
          return next;
        });
      }
    };

    // Add own tracks if camera is already on
    if (myStreamRef.current) {
      myStreamRef.current.getTracks().forEach((t) => pc.addTrack(t, myStreamRef.current!));
    }

    return pc;
  }, []);

  const closePeer = useCallback((peerID: string) => {
    const pc = pcsRef.current.get(peerID);
    if (pc) {
      pc.close();
      pcsRef.current.delete(peerID);
    }
    setActiveCams((prev) => {
      const next = new Map(prev);
      next.delete(peerID);
      return next;
    });
  }, []);

  const connectToPeer = useCallback((peerID: string, peerName: string) => {
    const me = myPeerIDRef.current;
    setActiveCams((prev) => {
      const next = new Map(prev);
      if (!next.has(peerID)) next.set(peerID, { name: peerName, stream: null });
      return next;
    });
    if (!me || !camEnabledRef.current) return;
    if (me < peerID) {
      // I'm the initiator — add tracks to trigger onnegotiationneeded
      const pc = getOrCreatePC(peerID);
      if (myStreamRef.current) {
        const senders = pc.getSenders();
        myStreamRef.current.getTracks().forEach((t) => {
          if (!senders.find((s) => s.track === t)) {
            pc.addTrack(t, myStreamRef.current!);
          }
        });
      }
    } else {
      // They initiate — just create the PC so we're ready for their offer
      getOrCreatePC(peerID);
    }
  }, [getOrCreatePC]);

  // Handle all incoming WebSocket messages related to WebRTC
  useEffect(() => {
    return addMessageListener(async (msg) => {
      const p = msg.payload as Record<string, unknown>;

      if (msg.type === 'CAM_ON') {
        const from = p.from as string;
        const name = (p.name as string) || from;
        if (from === myPeerIDRef.current) return;
        connectToPeer(from, name);
      }

      if (msg.type === 'CAM_STATE') {
        const cams = (p.cams as Array<{ from: string; name: string }>) ?? [];
        for (const { from, name } of cams) {
          if (from === myPeerIDRef.current) continue;
          connectToPeer(from, name);
        }
      }

      if (msg.type === 'CAM_OFF') {
        const from = p.from as string;
        closePeer(from);
      }

      if (msg.type === 'WEBRTC_OFFER') {
        const from = p.from as string;
        const sdp = p.sdp as RTCSessionDescriptionInit;
        const pc = getOrCreatePC(from);
        // Add own tracks before answering if not yet added
        if (myStreamRef.current) {
          const senders = pc.getSenders();
          myStreamRef.current.getTracks().forEach((t) => {
            if (!senders.find((s) => s.track === t)) {
              pc.addTrack(t, myStreamRef.current!);
            }
          });
        }
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send('WEBRTC_ANSWER', { to: from, sdp: pc.localDescription });
      }

      if (msg.type === 'WEBRTC_ANSWER') {
        const from = p.from as string;
        const sdp = p.sdp as RTCSessionDescriptionInit;
        const pc = pcsRef.current.get(from);
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      }

      if (msg.type === 'WEBRTC_ICE') {
        const from = p.from as string;
        const candidate = p.candidate as RTCIceCandidateInit;
        const pc = pcsRef.current.get(from);
        if (pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.error('addIceCandidate error', e);
          }
        }
      }
    });
  }, [connectToPeer, closePeer, getOrCreatePC]);

  const toggleCam = useCallback(async () => {
    if (camEnabledRef.current) {
      myStreamRef.current?.getTracks().forEach((t) => t.stop());
      myStreamRef.current = null;
      setCamEnabled(false);
      // Remove tracks from all PCs
      for (const pc of pcsRef.current.values()) {
        pc.getSenders().forEach((s) => pc.removeTrack(s));
      }
      send('CAM_OFF', {});
    } else {
      if (!myPeerIDRef.current) {
        alert('Noch nicht mit dem Spiel verbunden.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        myStreamRef.current = stream;
        setCamEnabled(true);
        // Add tracks to all existing PCs
        for (const pc of pcsRef.current.values()) {
          stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        }
        send('CAM_ON', { name: myName });
      } catch {
        alert('Kamera-Zugriff verweigert. HTTPS wird benötigt (außer auf localhost).');
      }
    }
  }, [myName]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      myStreamRef.current?.getTracks().forEach((t) => t.stop());
      pcsRef.current.forEach((pc) => pc.close());
    };
  }, []);

  return { camEnabled, activeCams, myStream: myStreamRef, toggleCam };
}
