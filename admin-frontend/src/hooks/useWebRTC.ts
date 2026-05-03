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
  const camEnabledRef = useRef(false);
  camEnabledRef.current = camEnabled;
  const myPeerIDRef = useRef(myPeerID);
  myPeerIDRef.current = myPeerID;
  // Per-peer flag to prevent concurrent offer attempts.
  const makingOfferRef = useRef<Set<string>>(new Set());

  const getOrCreatePC = useCallback((peerID: string): RTCPeerConnection => {
    const existing = pcsRef.current.get(peerID);
    if (existing && existing.signalingState !== 'closed') return existing;

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

    // Only offer when stable and not already mid-offer — avoids double-offer on track addition.
    pc.onnegotiationneeded = async () => {
      if (pc.signalingState !== 'stable' || makingOfferRef.current.has(peerID)) return;
      makingOfferRef.current.add(peerID);
      try {
        await pc.setLocalDescription();
        send('WEBRTC_OFFER', { to: peerID, sdp: pc.localDescription });
      } catch (e) {
        console.error('onnegotiationneeded error', e);
      } finally {
        makingOfferRef.current.delete(peerID);
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

    // Add own tracks if camera is already on when PC is created.
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
    makingOfferRef.current.delete(peerID);
    setActiveCams((prev) => {
      const next = new Map(prev);
      next.delete(peerID);
      return next;
    });
  }, []);

  // Connect to a peer who has their camera on.
  // initiator=true: I send the offer by adding tracks or a recvonly transceiver.
  // initiator=false: I just prepare a PC and wait for their offer.
  const connectToPeer = useCallback((peerID: string, peerName: string, initiator: boolean) => {
    const me = myPeerIDRef.current;
    if (!me || me === peerID) return;

    setActiveCams((prev) => {
      const next = new Map(prev);
      if (!next.has(peerID)) next.set(peerID, { name: peerName, stream: null });
      return next;
    });

    const pc = getOrCreatePC(peerID);
    if (!initiator) return;

    if (myStreamRef.current) {
      // Add camera tracks to trigger onnegotiationneeded → offer.
      const senders = pc.getSenders();
      myStreamRef.current.getTracks().forEach((t) => {
        if (!senders.find((s) => s.track === t)) {
          pc.addTrack(t, myStreamRef.current!);
        }
      });
    } else {
      // No camera but want to receive: recvonly transceiver triggers onnegotiationneeded.
      const hasVideo = pc.getTransceivers().some(
        (t) => t.receiver.track?.kind === 'video' || t.sender.track?.kind === 'video'
      );
      if (!hasVideo) {
        pc.addTransceiver('video', { direction: 'recvonly' });
      }
    }
  }, [getOrCreatePC]);

  useEffect(() => {
    return addMessageListener(async (msg) => {
      const p = msg.payload as Record<string, unknown>;

      if (msg.type === 'CAM_ON') {
        const from = p.from as string;
        const name = (p.name as string) || from;
        if (from === myPeerIDRef.current) return;
        // They are new and will offer to cam-ON peers (via their CAM_STATE).
        // If I also have camera: use ID comparison to avoid glare.
        // If I have no camera: I must initiate since they won't offer to cam-OFF clients.
        const me = myPeerIDRef.current;
        const initiator = camEnabledRef.current ? me < from : true;
        connectToPeer(from, name, initiator);
      }

      if (msg.type === 'CAM_STATE') {
        // Received on connect or after own CAM_OFF: I am the reconnecting side, I initiate.
        const cams = (p.cams as Array<{ from: string; name: string }>) ?? [];
        for (const { from, name } of cams) {
          if (from === myPeerIDRef.current) continue;
          connectToPeer(from, name, true);
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
      // Close all PCs before sending CAM_OFF — prevents onnegotiationneeded race
      // (removeTrack would trigger renegotiation that disrupts other cameras).
      // Server sends updated CAM_STATE after receiving CAM_OFF so we can reconnect.
      for (const pc of pcsRef.current.values()) pc.close();
      pcsRef.current.clear();
      makingOfferRef.current.clear();
      setActiveCams(new Map());
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
        send('CAM_ON', { name: myName });
        // Server responds with CAM_STATE showing existing cameras.
        // CAM_STATE handler will call connectToPeer for each existing cam.
      } catch {
        alert('Kamera-Zugriff verweigert. HTTPS wird benötigt (außer auf localhost).');
      }
    }
  }, [myName]);

  useEffect(() => {
    return () => {
      myStreamRef.current?.getTracks().forEach((t) => t.stop());
      pcsRef.current.forEach((pc) => pc.close());
    };
  }, []);

  return { camEnabled, activeCams, myStream: myStreamRef, toggleCam };
}
