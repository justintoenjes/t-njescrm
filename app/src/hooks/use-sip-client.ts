'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Inviter, Registerer, SessionState, UserAgent } from 'sip.js';
import type { Invitation, Session } from 'sip.js';

export type SipState = {
  registered: boolean;
  registering: boolean;
  error: string | null;
  // Call state
  callState: 'idle' | 'calling' | 'ringing' | 'connected';
  callDirection: 'incoming' | 'outgoing' | null;
  remoteNumber: string | null;
  muted: boolean;
  onHold: boolean;
  callStart: number | null;
};

export type SipActions = {
  call: (number: string) => void;
  answer: () => void;
  hangup: () => void;
  toggleMute: () => void;
  toggleHold: () => void;
  sendDTMF: (tone: string) => void;
};

const initialState: SipState = {
  registered: false,
  registering: false,
  error: null,
  callState: 'idle',
  callDirection: null,
  remoteNumber: null,
  muted: false,
  onHold: false,
  callStart: null,
};

function extractNumber(uri: string): string {
  const match = uri.match(/sip:([^@]+)@/);
  return match?.[1] ?? uri;
}

export function useSipClient(enabled: boolean) {
  const [state, setState] = useState<SipState>(initialState);
  const uaRef = useRef<UserAgent | null>(null);
  const registererRef = useRef<Registerer | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Create/get audio element
  useEffect(() => {
    if (!enabled) return;
    let el = document.getElementById('sip-remote-audio') as HTMLAudioElement;
    if (!el) {
      el = document.createElement('audio');
      el.id = 'sip-remote-audio';
      el.autoplay = true;
      document.body.appendChild(el);
    }
    audioRef.current = el;
    return () => {
      if (el.parentNode) el.parentNode.removeChild(el);
      audioRef.current = null;
    };
  }, [enabled]);

  // Setup media on session
  const setupSessionMedia = useCallback((session: Session) => {
    const pc = (session.sessionDescriptionHandler as { peerConnection?: RTCPeerConnection })?.peerConnection;
    if (!pc || !audioRef.current) return;

    pc.ontrack = (event) => {
      if (audioRef.current && event.streams[0]) {
        audioRef.current.srcObject = event.streams[0];
      }
    };
  }, []);

  // Handle session state changes
  const bindSession = useCallback((session: Session, direction: 'incoming' | 'outgoing') => {
    sessionRef.current = session;

    session.stateChange.addListener((newState) => {
      switch (newState) {
        case SessionState.Establishing:
          setState(s => ({ ...s, callState: 'calling', callDirection: direction }));
          break;
        case SessionState.Established:
          setupSessionMedia(session);
          setState(s => ({ ...s, callState: 'connected', callStart: Date.now() }));
          break;
        case SessionState.Terminated:
          sessionRef.current = null;
          setState(s => ({ ...s, callState: 'idle', callDirection: null, remoteNumber: null, muted: false, onHold: false, callStart: null }));
          break;
      }
    });
  }, [setupSessionMedia]);

  // Connect and register
  useEffect(() => {
    if (!enabled) {
      // Cleanup if disabled
      if (registererRef.current) {
        try { registererRef.current.unregister(); } catch {}
      }
      if (uaRef.current) {
        try { uaRef.current.stop(); } catch {}
      }
      uaRef.current = null;
      registererRef.current = null;
      setState(initialState);
      return;
    }

    let cancelled = false;

    async function connect() {
      setState(s => ({ ...s, registering: true, error: null }));

      try {
        const res = await fetch('/api/sip/credentials');
        if (!res.ok) {
          setState(s => ({ ...s, registering: false, error: 'SIP nicht konfiguriert' }));
          return;
        }
        const { sipUsername, sipPassword, wsUrl } = await res.json();
        if (cancelled) return;

        const uri = UserAgent.makeURI(`sip:${sipUsername}@fritz.box`);
        if (!uri) throw new Error('Invalid SIP URI');

        const ua = new UserAgent({
          uri,
          transportOptions: { server: wsUrl },
          authorizationUsername: sipUsername,
          authorizationPassword: sipPassword,
          sessionDescriptionHandlerFactoryOptions: {
            peerConnectionConfiguration: {
              iceServers: [], // local network, no STUN/TURN needed
            },
          },
          logLevel: 'warn',
        });

        // Handle incoming calls
        ua.delegate = {
          onInvite(invitation: Invitation) {
            const remote = extractNumber(invitation.remoteIdentity.uri.toString());
            setState(s => ({ ...s, callState: 'ringing', callDirection: 'incoming', remoteNumber: remote }));
            bindSession(invitation, 'incoming');
          },
        };

        await ua.start();
        if (cancelled) { ua.stop(); return; }

        const registerer = new Registerer(ua);
        registererRef.current = registerer;
        uaRef.current = ua;

        registerer.stateChange.addListener((newState) => {
          setState(s => ({
            ...s,
            registered: newState === 'Registered',
            registering: false,
            error: newState === 'Unregistered' ? null : s.error,
          }));
        });

        await registerer.register();
      } catch (err) {
        if (!cancelled) {
          setState(s => ({
            ...s,
            registering: false,
            error: err instanceof Error ? err.message : 'SIP-Verbindung fehlgeschlagen',
          }));
        }
      }
    }

    connect();

    return () => {
      cancelled = true;
      if (registererRef.current) {
        try { registererRef.current.unregister(); } catch {}
      }
      if (uaRef.current) {
        try { uaRef.current.stop(); } catch {}
      }
      uaRef.current = null;
      registererRef.current = null;
    };
  }, [enabled, bindSession]);

  // Actions
  const call = useCallback((number: string) => {
    const ua = uaRef.current;
    if (!ua || state.callState !== 'idle') return;

    const target = UserAgent.makeURI(`sip:${number}@fritz.box`);
    if (!target) return;

    const inviter = new Inviter(ua, target);
    setState(s => ({ ...s, callState: 'calling', callDirection: 'outgoing', remoteNumber: number }));
    bindSession(inviter, 'outgoing');
    inviter.invite();
  }, [state.callState, bindSession]);

  const answer = useCallback(() => {
    const session = sessionRef.current;
    if (!session || state.callState !== 'ringing' || state.callDirection !== 'incoming') return;
    (session as Invitation).accept();
  }, [state.callState, state.callDirection]);

  const hangup = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;

    switch (session.state) {
      case SessionState.Initial:
      case SessionState.Establishing:
        if (state.callDirection === 'incoming') {
          (session as Invitation).reject();
        } else {
          (session as Inviter).cancel();
        }
        break;
      case SessionState.Established:
        session.bye();
        break;
    }
  }, [state.callDirection]);

  const toggleMute = useCallback(() => {
    const session = sessionRef.current;
    if (!session || session.state !== SessionState.Established) return;

    const pc = (session.sessionDescriptionHandler as { peerConnection?: RTCPeerConnection })?.peerConnection;
    if (!pc) return;

    const newMuted = !state.muted;
    pc.getSenders().forEach(sender => {
      if (sender.track?.kind === 'audio') {
        sender.track.enabled = !newMuted;
      }
    });
    setState(s => ({ ...s, muted: newMuted }));
  }, [state.muted]);

  const toggleHold = useCallback(() => {
    const session = sessionRef.current;
    if (!session || session.state !== SessionState.Established) return;

    const pc = (session.sessionDescriptionHandler as { peerConnection?: RTCPeerConnection })?.peerConnection;
    if (!pc) return;

    const newHold = !state.onHold;
    pc.getSenders().forEach(sender => {
      if (sender.track) sender.track.enabled = !newHold;
    });
    pc.getReceivers().forEach(receiver => {
      if (receiver.track) receiver.track.enabled = !newHold;
    });
    setState(s => ({ ...s, onHold: newHold }));
  }, [state.onHold]);

  const sendDTMF = useCallback((tone: string) => {
    const session = sessionRef.current;
    if (!session || session.state !== SessionState.Established) return;

    const pc = (session.sessionDescriptionHandler as { peerConnection?: RTCPeerConnection })?.peerConnection;
    if (!pc) return;

    const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
    if (sender?.dtmf) {
      sender.dtmf.insertDTMF(tone, 100, 70);
    }
  }, []);

  const actions: SipActions = { call, answer, hangup, toggleMute, toggleHold, sendDTMF };
  return { state, actions };
}
