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
  // Tracks per-peer offer-in-progress to detect and resolve glare.
  const makingOfferRef = useRef<Set<string>>(new Set());

  const getOrCreatePC = useCallback((peerID: string): RTCPeerConnection => {
    const existing = pcsRef.current.get(peerID);
    if (existing && existing.signalingState !== 'closed') return existing;

    const pc = new RTCPeerConnection();
    pcsRef.current.set(peerID, pc);

    pc.onicecandidate = (e) => {
      if (e.candidate) send('WEBRTC_ICE', { to: peerID, candidate: e.candidate.toJSON() });
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

    // Perfect-negotiation offer loop: only fire when stable and not already offering.
    pc.onnegotiationneeded = async () => {
      if (pc.signalingState !== 'stable' || makingOfferRef.current.has(peerID)) return;
      makingOfferRef.current.add(peerID);
      try {
        await pc.setLocalDescription();
        // Guard: rollback may have occurred concurrently.
        if ((pc.signalingState as string) === 'have-local-offer') {
          send('WEBRTC_OFFER', { to: peerID, sdp: pc.localDescription });
        }
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

    // No automatic track-adding here — connectToPeer controls this explicitly.
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

  // initiator=true  → I add tracks/transceiver to trigger onnegotiationneeded (I offer).
  // initiator=false → I just prepare a PC and wait for their offer.
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
      const senders = pc.getSenders();
      myStreamRef.current.getTracks().forEach((t) => {
        if (!senders.find((s) => s.track === t)) pc.addTrack(t, myStreamRef.current!);
      });
    } else {
      // No own camera: a recvonly transceiver triggers onnegotiationneeded so we can receive.
      const hasVideo = pc.getTransceivers().some(
        (t) => t.receiver.track?.kind === 'video' || t.sender.track?.kind === 'video'
      );
      if (!hasVideo) pc.addTransceiver('video', { direction: 'recvonly' });
    }
  }, [getOrCreatePC]);

  useEffect(() => {
    return addMessageListener(async (msg) => {
      const p = msg.payload as Record<string, unknown>;

      if (msg.type === 'CAM_ON') {
        const from = p.from as string;
        const name = (p.name as string) || from;
        if (from === myPeerIDRef.current) return;
        const me = myPeerIDRef.current;
        // New cam peer received CAM_STATE and will offer to cam-ON clients.
        // If I also have camera: ID comparison prevents both sides initiating (glare).
        // If I have no camera: I must always initiate — they won't offer to cam-OFF clients.
        const initiator = camEnabledRef.current ? me < from : true;
        connectToPeer(from, name, initiator);
      }

      if (msg.type === 'CAM_STATE') {
        // Received on WS connect or after own CAM_OFF: I am the reconnecting side, I initiate.
        const cams = (p.cams as Array<{ from: string; name: string }>) ?? [];
        for (const { from, name } of cams) {
          if (from === myPeerIDRef.current) continue;
          connectToPeer(from, name, true);
        }
      }

      if (msg.type === 'CAM_OFF') {
        closePeer(p.from as string);
      }

      if (msg.type === 'WEBRTC_OFFER') {
        const from = p.from as string;
        const sdp = p.sdp as RTCSessionDescriptionInit;
        const me = myPeerIDRef.current;
        // Perfect negotiation: larger peerID is the "polite" side that yields on collision.
        const polite = me > from;
        const pc = getOrCreatePC(from);
        const offerCollision = pc.signalingState !== 'stable' || makingOfferRef.current.has(from);

        if (offerCollision) {
          if (!polite) return; // impolite: ignore their offer, wait for our answer
          // Polite: roll back own offer and accept theirs instead.
          await pc.setLocalDescription({ type: 'rollback' });
          makingOfferRef.current.delete(from);
        }

        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        // Include own camera in the answer if available.
        if (myStreamRef.current) {
          const senders = pc.getSenders();
          myStreamRef.current.getTracks().forEach((t) => {
            if (!senders.find((s) => s.track === t)) pc.addTrack(t, myStreamRef.current!);
          });
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send('WEBRTC_ANSWER', { to: from, sdp: pc.localDescription });
      }

      if (msg.type === 'WEBRTC_ANSWER') {
        const from = p.from as string;
        const pc = pcsRef.current.get(from);
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(p.sdp as RTCSessionDescriptionInit));
      }

      if (msg.type === 'WEBRTC_ICE') {
        const from = p.from as string;
        const pc = pcsRef.current.get(from);
        if (pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(p.candidate as RTCIceCandidateInit));
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
      // Close all PCs before CAM_OFF — using removeTrack() instead would trigger
      // onnegotiationneeded which races with peers closing their PCs and hangs other cameras.
      // Server sends updated CAM_STATE so we can reconnect receive-only.
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
        // Server responds with CAM_STATE; CAM_STATE handler calls connectToPeer for each peer.
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
