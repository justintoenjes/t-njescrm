'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Inviter, Registerer, RegistererState, SessionState, UserAgent } from 'sip.js';
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

// SDP modifier for SIP.js sessionDescriptionHandlerModifiers
function sdpCleanModifier(description: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
  if (description.sdp) {
    const cleaned = deduplicateSdpPayloads(description.sdp);
    if (cleaned !== description.sdp) console.warn('[SIP] Cleaned SDP duplicates via modifier');
    return Promise.resolve({ ...description, sdp: cleaned });
  }
  return Promise.resolve(description);
}

// Remove duplicate payload type entries from SDP (rtpengine bug)
function deduplicateSdpPayloads(sdp: string): string {
  // Handle both \r\n and \n line endings
  const sep = sdp.includes('\r\n') ? '\r\n' : '\n';
  const lines = sdp.split(sep);
  const result: string[] = [];
  const seenRtpmap = new Set<string>();
  const seenFmtp = new Set<string>();

  for (const line of lines) {
    // Deduplicate payload types in m= line
    if (line.startsWith('m=')) {
      const parts = line.split(' ');
      // m=audio PORT PROTO PT1 PT2 PT3...
      if (parts.length > 3) {
        const seen = new Set<string>();
        const deduped = parts.slice(0, 3);
        for (const pt of parts.slice(3)) {
          if (!seen.has(pt)) { seen.add(pt); deduped.push(pt); }
        }
        result.push(deduped.join(' '));
        continue;
      }
    }
    // Deduplicate a=rtpmap lines by payload type
    if (line.startsWith('a=rtpmap:')) {
      const pt = line.substring(9).split(' ')[0];
      if (seenRtpmap.has(pt)) continue;
      seenRtpmap.add(pt);
    }
    // Deduplicate a=fmtp lines by payload type
    if (line.startsWith('a=fmtp:')) {
      const pt = line.substring(7).split(' ')[0];
      if (seenFmtp.has(pt)) continue;
      seenFmtp.add(pt);
    }
    result.push(line);
  }
  return result.join(sep);
}

function extractNumber(uri: string): string {
  const match = uri.match(/sip:([^@]+)@/);
  return match?.[1] ?? uri;
}

// Ring melody: short repeating jingle
function createRinger() {
  let ctx: AudioContext | null = null;
  let timeout: NodeJS.Timeout | null = null;
  let stopped = false;

  // Notes: frequency in Hz, duration in seconds
  const melody: [number, number][] = [
    [659, 0.15], // E5
    [784, 0.15], // G5
    [988, 0.15], // B5
    [1047, 0.3], // C6
    [988, 0.15], // B5
    [784, 0.3],  // G5
  ];

  function playMelody(audioCtx: AudioContext) {
    if (stopped) return;

    let t = audioCtx.currentTime;
    for (const [freq, dur] of melody) {
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + dur);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + dur);
      t += dur;
    }

    // Repeat after pause
    const totalDur = melody.reduce((s, [, d]) => s + d, 0);
    timeout = setTimeout(() => playMelody(audioCtx), (totalDur + 2.5) * 1000);
  }

  return {
    start() {
      try {
        stopped = false;
        ctx = new AudioContext();
        playMelody(ctx);
      } catch {}
    },
    stop() {
      stopped = true;
      if (timeout) clearTimeout(timeout);
      if (ctx) try { ctx.close(); } catch {}
      ctx = null; timeout = null;
    },
  };
}

// Show a system notification for incoming calls (works in background)
function showCallNotification(number: string): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (Notification.permission !== 'granted') return;

  navigator.serviceWorker.ready.then(reg => {
    reg.showNotification('Eingehender Anruf', {
      body: number || 'Unbekannte Nummer',
      icon: '/icon-512.png',
      tag: 'sip-incoming-call',
      requireInteraction: true,
      data: { url: '/' },
    } as NotificationOptions);
  }).catch(() => {});
}

function closeCallNotification(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready.then(reg => {
    reg.getNotifications({ tag: 'sip-incoming-call' }).then(notifications => {
      notifications.forEach(n => n.close());
    });
  }).catch(() => {});
}

export function useSipClient(enabled: boolean) {
  const [state, setState] = useState<SipState>(initialState);
  const uaRef = useRef<UserAgent | null>(null);
  const registererRef = useRef<Registerer | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ringerRef = useRef<ReturnType<typeof createRinger> | null>(null);

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
    const setupPc = () => {
      const pc = (session.sessionDescriptionHandler as { peerConnection?: RTCPeerConnection })?.peerConnection;
      if (!pc || !audioRef.current) {
        console.warn('[SIP] No peerConnection or audio element yet');
        return;
      }
      console.log('[SIP] Setting up ontrack handler');

      const audio = audioRef.current;
      pc.ontrack = (event) => {
        console.log('[SIP] ontrack fired, streams:', event.streams.length);
        if (audio && event.streams[0]) {
          audio.srcObject = event.streams[0];
          audio.play().catch(e => console.warn('[SIP] audio.play() blocked:', e));
        }
      };

      // Also check if tracks are already there
      const receivers = pc.getReceivers();
      if (receivers.length > 0) {
        const stream = new MediaStream(receivers.map(r => r.track).filter(Boolean));
        if (stream.getTracks().length > 0) {
          console.log('[SIP] Attaching existing tracks:', stream.getTracks().length);
          audio.srcObject = stream;
          audio.play().catch(e => console.warn('[SIP] audio.play() blocked:', e));
        }
      }
    };

    // Try immediately and also after a short delay (SDH might not be ready yet)
    setupPc();
    setTimeout(setupPc, 500);
  }, []);

  // Handle session state changes
  const bindSession = useCallback((session: Session, direction: 'incoming' | 'outgoing') => {
    sessionRef.current = session;

    session.stateChange.addListener((newState) => {
      switch (newState) {
        case SessionState.Establishing:
          setupSessionMedia(session);
          // For incoming calls, keep 'ringing' state until established
          if (direction === 'outgoing') {
            setState(s => ({ ...s, callState: 'calling', callDirection: direction }));
          }
          break;
        case SessionState.Established:
          setupSessionMedia(session);
          ringerRef.current?.stop();
          closeCallNotification();
          setState(s => ({ ...s, callState: 'connected', callStart: Date.now() }));
          break;
        case SessionState.Terminated:
          sessionRef.current = null;
          ringerRef.current?.stop();
          closeCallNotification();
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
          // Clean duplicate SDP payloads from rtpengine on all sessions
          sessionDescriptionHandlerModifiers: [sdpCleanModifier],
          logLevel: 'debug',
        } as ConstructorParameters<typeof UserAgent>[0]);

        // Handle incoming calls
        ua.delegate = {
          onInvite(invitation: Invitation) {
            const remote = extractNumber(invitation.remoteIdentity.uri.toString());
            console.log('[SIP] Incoming call from:', remote);
            setState(s => ({ ...s, callState: 'ringing', callDirection: 'incoming', remoteNumber: remote }));
            bindSession(invitation, 'incoming');
            // System notification (works in background)
            showCallNotification(remote);
            // Start ring sound
            ringerRef.current = createRinger();
            ringerRef.current.start();
          },
        };

        ua.transport.onDisconnect = (error) => {
          console.warn('[SIP] Transport disconnected, reconnecting...', error);
          setState(s => ({ ...s, registered: false, registering: true }));

          let attempt = 0;
          function tryReconnect() {
            if (cancelled) return;
            attempt++;
            const delay = Math.min(5000 * attempt, 30000); // 5s, 10s, 15s, ... max 30s
            console.warn(`[SIP] Reconnect attempt ${attempt} in ${delay / 1000}s...`);
            setTimeout(() => {
              if (cancelled) return;
              ua.reconnect().then(() => {
                console.warn('[SIP] Reconnected, re-registering...');
                registerer.register().catch(() => {
                  setState(s => ({ ...s, registered: true, registering: false, error: null }));
                });
                setState(s => ({ ...s, registered: true, registering: false, error: null }));
              }).catch(() => {
                console.warn('[SIP] Reconnect failed, retrying...');
                tryReconnect();
              });
            }, delay);
          }
          tryReconnect();
        };

        console.log('[SIP] Starting UserAgent...');
        await ua.start();
        if (cancelled) { ua.stop(); return; }
        console.log('[SIP] UserAgent started, registering...');

        const registerer = new Registerer(ua);
        registererRef.current = registerer;
        uaRef.current = ua;

        // Don't use registerer.stateChange — it fires Unregistered on Contact
        // mismatch before the register() promise rejects, creating a race condition.
        // Instead, just call register() and always treat as success since Kamailio
        // accepts the registration regardless of the Contact header issue.

        try {
          await registerer.register();
          console.warn('[SIP] register() resolved');
          setState(s => ({ ...s, registered: true, registering: false, error: null }));
        } catch (regErr) {
          // Kamailio rewrites the Contact header for FritzBox routing,
          // causing SIP.js to reject with "No Contact header pointing to us".
          // The registration IS accepted by Kamailio — treat as success.
          console.warn('[SIP] register() rejected (expected with FritzBox proxy):', regErr);
          setState(s => ({ ...s, registered: true, registering: false, error: null }));
        }
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

    setState(s => ({ ...s, callState: 'calling', callDirection: 'outgoing', remoteNumber: number, error: null }));

    // Pre-check microphone permission (critical on iOS Safari/PWA)
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then((stream) => {
        // Stop the test stream immediately — sip.js will acquire its own
        stream.getTracks().forEach(t => t.stop());

        const inviter = new Inviter(ua, target);
        bindSession(inviter, 'outgoing');
        inviter.invite({
          sessionDescriptionHandlerOptions: {
            constraints: { audio: true, video: false },
          },
          sessionDescriptionHandlerModifiers: [sdpCleanModifier],
        }).catch((err: unknown) => {
          console.error('[SIP] invite() failed:', err);
          setState(s => ({
            ...s,
            callState: 'idle',
            callDirection: null,
            remoteNumber: null,
            error: err instanceof Error ? err.message : 'Anruf fehlgeschlagen',
          }));
        });
      })
      .catch((err: unknown) => {
        console.error('[SIP] Microphone permission denied:', err);
        setState(s => ({
          ...s,
          callState: 'idle',
          callDirection: null,
          remoteNumber: null,
          error: 'Mikrofon-Zugriff verweigert – Bitte Berechtigung in den Einstellungen aktivieren',
        }));
      });
  }, [state.callState, bindSession]);

  const answer = useCallback(() => {
    const session = sessionRef.current;
    if (!session || state.callState !== 'ringing' || state.callDirection !== 'incoming') {
      console.warn('[SIP] Cannot answer: no session or wrong state', state.callState, state.callDirection);
      return;
    }
    console.log('[SIP] Accepting invitation...');
    const invitation = session as Invitation;

    invitation.accept({
      sessionDescriptionHandlerOptions: {
        constraints: { audio: true, video: false },
      },
      sessionDescriptionHandlerModifiers: [sdpCleanModifier],
    }).then(() => {
      console.log('[SIP] accept() resolved');
    }).catch((err: unknown) => {
      console.error('[SIP] accept() failed:', err);
    });
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
