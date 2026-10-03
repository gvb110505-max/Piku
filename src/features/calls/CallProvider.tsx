import type { LocalVideoTrack, RemoteVideoTrack } from 'livekit-client';
import { router, usePathname } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Vibration } from 'react-native';

import { useAuth } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase';

import { acceptCall, CallApiError, fetchCall, fetchProfile, startCall as apiStartCall, updateCall } from './api';
import { CallRoom, MediaPermissionError, prepareLocalMedia, releaseLocalMedia, type LocalMedia } from './CallRoom';
import { errorToReason, type EndReason } from './messages';
import { nativeCallUi } from './nativeCallUi';
import { beginAudioSession, endAudioSession, setSpeakerOn, speakerSupported } from './platformMedia';
import { CALL_RING_TIMEOUT_SEC, profileName, type CallMedia, type CallRow, type PublicProfile } from './types';

/** 수락 후 상대가 룸에 들어오지 않을 때 / 상대가 룸에서 사라졌을 때 기다리는 시간 */
const PEER_WAIT_MS = 15_000;
/** 종료 문구를 보여주는 시간 */
const ENDED_SCREEN_MS = 1_800;

export type CallView =
  | { phase: 'idle' }
  | { phase: 'outgoing'; peer: PublicProfile; media: CallMedia; call: CallRow | null }
  | { phase: 'incoming'; peer: PublicProfile; media: CallMedia; call: CallRow }
  | { phase: 'connecting'; peer: PublicProfile; media: CallMedia; call: CallRow }
  | { phase: 'active'; peer: PublicProfile; media: CallMedia; call: CallRow; since: number }
  | { phase: 'ended'; peer: PublicProfile; media: CallMedia; reason: EndReason }
  | { phase: 'mic_denied'; peer: PublicProfile; media: CallMedia };

export type CallControls = {
  muted: boolean;
  speaker: boolean;
  speakerSupported: boolean;
  cameraOn: boolean;
  /** 영상 통화인데 카메라를 못 씀 */
  cameraUnavailable: boolean;
  reconnecting: boolean;
  localVideo: LocalVideoTrack | null;
  remoteVideo: RemoteVideoTrack | null;
};

type CallContextValue = {
  view: CallView;
  controls: CallControls;
  startCall: (peer: PublicProfile, media: CallMedia) => void;
  accept: () => void;
  decline: () => void;
  hangup: () => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  toggleCamera: () => void;
  dismiss: () => void;
};

const INITIAL_CONTROLS: CallControls = {
  muted: false,
  speaker: false,
  speakerSupported,
  cameraOn: false,
  cameraUnavailable: false,
  reconnecting: false,
  localVideo: null,
  remoteVideo: null,
};

/** 진행 중인 통화 하나의 내부 상태 (렌더와 무관한 값은 ref 로) */
type Session = {
  role: 'caller' | 'callee';
  peer: PublicProfile;
  media: CallMedia;
  callId: string | null;
  call: CallRow | null;
  local: LocalMedia | null;
  room: CallRoom | null;
  finished: boolean;
  timers: ReturnType<typeof setTimeout>[];
  peerWait: ReturnType<typeof setTimeout> | null;
};

const CallContext = createContext<CallContextValue | null>(null);

export function CallProvider({ children }: { children: ReactNode }) {
  const { session: authSession } = useAuth();
  const me = authSession?.user.id ?? null;
  const [view, setView] = useState<CallView>({ phase: 'idle' });
  const [controls, setControls] = useState<CallControls>(INITIAL_CONTROLS);
  const sessionRef = useRef<Session | null>(null);
  const endedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patchControls = useCallback((patch: Partial<CallControls>) => setControls((c) => ({ ...c, ...patch })), []);

  // ── 종료 처리 (멱등) ─────────────────────────────────────
  /**
   * @param reason 화면에 보여줄 종료 이유. null 이면 바로 닫는다 (발신 취소·거절 등 본인 조작)
   * @param action 서버에 알릴 상태 변경. 이미 서버가 바꾼 상태(Realtime 수신)면 null
   */
  const finish = useCallback(
    (reason: EndReason | 'mic_denied' | null, action: 'hangup' | 'decline' | 'timeout' | 'fail' | null) => {
      const s = sessionRef.current;
      if (!s || s.finished) return;
      s.finished = true;
      s.timers.forEach(clearTimeout);
      if (s.peerWait) clearTimeout(s.peerWait);
      Vibration.cancel();
      if (s.callId) nativeCallUi.reportEnded(s.callId);
      const room = s.room;
      const local = s.local;
      // 서버에 상태를 먼저 알리고 룸을 나간다. 순서가 바뀌면 LiveKit 웹훅(참가자 이탈)이 먼저 도착해
      // 정상 종료가 '연결 끊김(failed)'으로 기록된다. 응답이 늦으면 3초 뒤 그냥 나간다.
      const notified =
        s.callId && action
          ? Promise.race([updateCall(s.callId, action), new Promise((r) => setTimeout(r, 3000))])
          : Promise.resolve();
      notified
        .catch(() => undefined)
        .then(() => (room ? room.leave() : releaseLocalMedia(local)))
        .catch(() => undefined)
        .finally(() => endAudioSession().catch(() => undefined));
      sessionRef.current = null;
      setControls(INITIAL_CONTROLS);

      if (reason === 'mic_denied') {
        setView({ phase: 'mic_denied', peer: s.peer, media: s.media });
        return;
      }
      if (!reason) {
        setView({ phase: 'idle' });
        return;
      }
      setView({ phase: 'ended', peer: s.peer, media: s.media, reason });
      if (endedTimer.current) clearTimeout(endedTimer.current);
      endedTimer.current = setTimeout(() => {
        setView((v) => (v.phase === 'ended' ? { phase: 'idle' } : v));
      }, ENDED_SCREEN_MS);
    },
    [],
  );

  const goActive = useCallback(() => {
    const s = sessionRef.current;
    if (!s || s.finished || !s.call) return;
    if (s.peerWait) clearTimeout(s.peerWait);
    s.peerWait = null;
    if (s.callId) nativeCallUi.reportConnected(s.callId);
    const call = s.call;
    setView((v) => (v.phase === 'active' ? v : { phase: 'active', peer: s.peer, media: s.media, call, since: Date.now() }));
  }, []);

  /** 상대가 룸에 들어오지 않거나 사라졌을 때 일정 시간 뒤 실패 처리 */
  const waitForPeer = useCallback(() => {
    const s = sessionRef.current;
    if (!s || s.finished) return;
    if (s.peerWait) clearTimeout(s.peerWait);
    s.peerWait = setTimeout(() => {
      if (sessionRef.current === s && !s.room?.hasRemote) finish('failed', 'fail');
    }, PEER_WAIT_MS);
  }, [finish]);

  const joinRoom = useCallback(
    async (s: Session, url: string, token: string) => {
      if (!s.local) return;
      const room = new CallRoom(s.local, {
        onRemoteJoined: () => {
          // 발신자는 수락(accepted) 이후에만 통화 중으로 전환
          if (s.call?.status === 'accepted') goActive();
        },
        onRemoteLeft: () => {
          // 보통은 상대의 hangup 이 Realtime 으로 먼저 도착한다. 안 오면 끊김으로 처리.
          if (s.call?.status === 'accepted') waitForPeer();
        },
        onRemoteVideo: (track) => patchControls({ remoteVideo: track }),
        onReconnecting: (reconnecting) => patchControls({ reconnecting }),
        onLost: () => finish('failed', 'fail'),
      });
      s.room = room;
      await beginAudioSession().catch(() => undefined);
      await room.connect(url, token);
    },
    [finish, goActive, patchControls, waitForPeer],
  );

  // ── 서버 상태 변화 반영 (Realtime / 조회) ────────────────
  const applyServerState = useCallback(
    (row: CallRow) => {
      const s = sessionRef.current;
      if (!s || s.finished || s.callId !== row.id) return;
      s.call = row;
      switch (row.status) {
        case 'ringing':
          return;
        case 'accepted':
          if (s.role === 'caller') {
            s.timers.forEach(clearTimeout); // 응답 없음 타이머 해제
            if (s.room?.hasRemote) goActive();
            else {
              setView({ phase: 'connecting', peer: s.peer, media: s.media, call: row });
              waitForPeer();
            }
          }
          return;
        case 'declined':
          return finish(s.role === 'caller' ? 'declined' : null, null);
        case 'missed':
          return finish(s.role === 'caller' ? 'no_answer' : 'missed', null);
        case 'ended':
          return finish('ended', null);
        case 'failed':
          return finish('failed', null);
      }
    },
    [finish, goActive, waitForPeer],
  );

  /** 수신 전화 표시 (Realtime INSERT, 앱 복귀 시 조회, 네이티브 푸시) */
  const presentIncoming = useCallback(
    async (row: CallRow) => {
      if (!me || row.callee_id !== me || row.status !== 'ringing') return;
      if (sessionRef.current) return; // 이미 통화 중 (서버도 막지만 이중 방어)
      const peer = (await fetchProfile(row.caller_id)) ?? {
        id: row.caller_id,
        username: null,
        display_name: null,
        avatar_url: null,
      };
      if (sessionRef.current) return;
      const s: Session = {
        role: 'callee',
        peer,
        media: row.media,
        callId: row.id,
        call: row,
        local: null,
        room: null,
        finished: false,
        timers: [],
        peerWait: null,
      };
      sessionRef.current = s;
      // 발신자가 timeout 을 못 보내는 경우 대비: 수신 측도 타임아웃 후 화면을 닫는다 (서버 정리 작업이 missed 처리)
      const elapsed = Date.now() - new Date(row.started_at).getTime();
      s.timers.push(
        setTimeout(() => finish('missed', null), Math.max(0, CALL_RING_TIMEOUT_SEC * 1000 - Math.max(0, elapsed)) + 5000),
      );
      Vibration.vibrate([0, 800, 800], true);
      setView({ phase: 'incoming', peer, media: row.media, call: row });
    },
    [finish, me],
  );

  // Realtime 구독: 나에게 오는 전화(INSERT) + 내 통화의 상태 변화(UPDATE)
  useEffect(() => {
    if (!me) return;
    const supabase = getSupabase();
    const onRow = (row: CallRow, event: 'INSERT' | 'UPDATE') => {
      if (event === 'INSERT') void presentIncoming(row);
      else applyServerState(row);
    };
    const channel = supabase
      .channel(`calls:${me}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls', filter: `callee_id=eq.${me}` }, (p) =>
        onRow(p.new as CallRow, 'INSERT'),
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls', filter: `callee_id=eq.${me}` }, (p) =>
        onRow(p.new as CallRow, 'UPDATE'),
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls', filter: `caller_id=eq.${me}` }, (p) =>
        onRow(p.new as CallRow, 'UPDATE'),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [me, presentIncoming, applyServerState]);

  // 앱이 백그라운드에 있는 동안 놓친 수신 전화 / 상태 변화 확인
  const resync = useCallback(async () => {
    if (!me) return;
    const s = sessionRef.current;
    if (s?.callId) {
      const row = await fetchCall(s.callId);
      if (row) applyServerState(row);
      return;
    }
    const since = new Date(Date.now() - CALL_RING_TIMEOUT_SEC * 1000).toISOString();
    const { data } = await getSupabase()
      .from('calls')
      .select('*')
      .eq('callee_id', me)
      .eq('status', 'ringing')
      .gt('started_at', since)
      .order('started_at', { ascending: false })
      .limit(1);
    if (data?.[0]) await presentIncoming(data[0] as CallRow);
  }, [me, applyServerState, presentIncoming]);

  useEffect(() => {
    void resync();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void resync();
    });
    return () => sub.remove();
  }, [resync]);

  // 로그아웃 시 진행 중인 통화 정리
  useEffect(() => {
    if (!me && sessionRef.current) finish(null, 'hangup');
  }, [me, finish]);

  // ── 사용자 조작 ──────────────────────────────────────────
  const startCall = useCallback(
    async (peer: PublicProfile, media: CallMedia) => {
      if (sessionRef.current) return; // 한 번에 한 통화
      if (endedTimer.current) clearTimeout(endedTimer.current);
      const s: Session = {
        role: 'caller',
        peer,
        media,
        callId: null,
        call: null,
        local: null,
        room: null,
        finished: false,
        timers: [],
        peerWait: null,
      };
      sessionRef.current = s;
      setControls(INITIAL_CONTROLS);
      setView({ phase: 'outgoing', peer, media, call: null });

      // 1) 마이크(·카메라) 먼저 — 권한이 없으면 상대를 울리지 않는다
      try {
        s.local = await prepareLocalMedia(media);
      } catch (e) {
        return finish(e instanceof MediaPermissionError ? (e.kind === 'mic_denied' ? 'mic_denied' : 'no_device') : 'failed', null);
      }
      patchControls({
        cameraOn: Boolean(s.local.video),
        cameraUnavailable: s.local.cameraUnavailable,
        localVideo: s.local.video,
      });
      if (s.finished) return releaseLocalMedia(s.local);

      // 2) 서버에 발신 요청 (차단·맞팔·통화 중 확인)
      let join;
      try {
        join = await apiStartCall(peer.id, media);
      } catch (e) {
        return finish(errorToReason(e instanceof CallApiError ? e.code : 'failed'), null);
      }
      s.callId = join.call.id;
      s.call = join.call;
      if (s.finished) {
        // 요청 중에 사용자가 취소
        updateCall(join.call.id, 'hangup').catch(() => undefined);
        return;
      }
      setView({ phase: 'outgoing', peer, media, call: join.call });
      nativeCallUi.reportOutgoing(join.call.id, profileName(peer), media === 'video');

      // 3) 응답 없음 타이머 (Q5: 30초)
      s.timers.push(setTimeout(() => finish('no_answer', 'timeout'), CALL_RING_TIMEOUT_SEC * 1000));

      // 4) 룸에 먼저 들어가 기다린다
      try {
        await joinRoom(s, join.url, join.token);
      } catch {
        return finish('failed', 'fail');
      }
      // Realtime 보다 먼저 상태가 바뀌었을 수 있으니 한 번 확인
      const latest = await fetchCall(join.call.id);
      if (latest) applyServerState(latest);
    },
    [applyServerState, finish, joinRoom, patchControls],
  );

  const accept = useCallback(async () => {
    const s = sessionRef.current;
    if (!s || s.role !== 'callee' || !s.callId || !s.call) return;
    if (view.phase !== 'incoming') return;
    Vibration.cancel();
    s.timers.forEach(clearTimeout);
    s.timers = [];
    setView({ phase: 'connecting', peer: s.peer, media: s.media, call: s.call });
    nativeCallUi.reportAnswered(s.callId);

    try {
      s.local = await prepareLocalMedia(s.media);
    } catch (e) {
      const kind = e instanceof MediaPermissionError ? e.kind : 'failed';
      return finish(kind === 'mic_denied' ? 'mic_denied' : kind === 'no_device' ? 'no_device' : 'failed', 'fail');
    }
    patchControls({
      cameraOn: Boolean(s.local.video),
      cameraUnavailable: s.local.cameraUnavailable,
      localVideo: s.local.video,
    });
    if (s.finished) return releaseLocalMedia(s.local);

    let res;
    try {
      res = await acceptCall(s.callId);
    } catch (e) {
      return finish(errorToReason(e instanceof CallApiError ? e.code : 'failed'), null);
    }
    s.call = res.call;
    if (res.call.status !== 'accepted' || !res.token || !res.url) {
      return finish(res.call.status === 'missed' ? 'missed' : 'failed', null);
    }
    try {
      await joinRoom(s, res.url, res.token);
    } catch {
      return finish('failed', 'fail');
    }
    if (s.room?.hasRemote) goActive();
    else waitForPeer();
  }, [finish, goActive, joinRoom, patchControls, view.phase, waitForPeer]);

  const decline = useCallback(() => finish(null, 'decline'), [finish]);

  const hangup = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    // 연결 전 취소는 종료 화면 없이 닫는다
    const connected = s.call?.status === 'accepted';
    finish(connected ? 'ended' : null, s.role === 'callee' && !connected ? 'decline' : 'hangup');
  }, [finish]);

  const toggleMute = useCallback(() => {
    const room = sessionRef.current?.room;
    setControls((c) => {
      void room?.setMicEnabled(c.muted);
      return { ...c, muted: !c.muted };
    });
  }, []);

  const toggleSpeaker = useCallback(() => {
    setControls((c) => {
      void setSpeakerOn(!c.speaker).catch(() => undefined);
      return { ...c, speaker: !c.speaker };
    });
  }, []);

  const toggleCamera = useCallback(() => {
    const room = sessionRef.current?.room;
    setControls((c) => {
      if (!c.localVideo) return c;
      void room?.setCameraEnabled(!c.cameraOn);
      return { ...c, cameraOn: !c.cameraOn };
    });
  }, []);

  const dismiss = useCallback(() => {
    if (endedTimer.current) clearTimeout(endedTimer.current);
    setView((v) => (v.phase === 'ended' || v.phase === 'mic_denied' ? { phase: 'idle' } : v));
  }, []);

  // 네이티브 수신 UI(잠금화면 등)에서 받기/끊기
  const acceptRef = useRef(accept);
  acceptRef.current = accept;
  useEffect(
    () =>
      nativeCallUi.setup({
        onAnswer: (callId) => {
          if (sessionRef.current?.callId === callId) void acceptRef.current();
        },
        onEnd: (callId) => {
          if (sessionRef.current?.callId === callId) hangup();
        },
        onMute: (callId, muted) => {
          if (sessionRef.current?.callId !== callId) return;
          setControls((c) => {
            if (c.muted !== muted) void sessionRef.current?.room?.setMicEnabled(!muted);
            return { ...c, muted };
          });
        },
      }),
    [hangup],
  );

  // 통화 화면 열기/닫기
  const pathname = usePathname();
  useEffect(() => {
    const onCallScreen = pathname === '/in-call';
    if (view.phase !== 'idle' && !onCallScreen) router.push('/in-call');
    if (view.phase === 'idle' && onCallScreen) {
      if (router.canGoBack()) router.back();
      else router.replace('/call');
    }
  }, [view.phase, pathname]);

  const value = useMemo<CallContextValue>(
    () => ({
      view,
      controls,
      startCall: (peer, media) => void startCall(peer, media),
      accept: () => void accept(),
      decline,
      hangup,
      toggleMute,
      toggleSpeaker,
      toggleCamera,
      dismiss,
    }),
    [view, controls, startCall, accept, decline, hangup, toggleMute, toggleSpeaker, toggleCamera, dismiss],
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall 은 CallProvider 안에서만 사용할 수 있습니다.');
  return ctx;
}
