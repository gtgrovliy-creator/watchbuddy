import React, { useEffect, useState, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import YouTube, { type YouTubeEvent, type YouTubePlayer } from 'react-youtube';
import {
  Users,
  MessageSquare,
  Share2,
  LogOut,
  Search,
  Crown,
  Shield,
  User as UserIcon,
  Send,
  PlayCircle,
  Check,
  Tv,
  X,
  Play,
  Loader2,
  ArrowLeft,
  Link2,
  Film,
  Globe
} from 'lucide-react';
import { socket } from '../services/socket';
import { getTelegramUsername, hapticFeedback, showAlert, shareLink } from '../services/telegram';
import { parseVideoUrl, type VideoSource } from '../services/videoUtils';

interface UserData {
  socketId: string;
  username: string;
  role: 'Host' | 'Moderator' | 'Participant';
}

interface SearchResult {
  id: string;
  title: string;
  thumbnail: string;
  channel: string;
}

interface ChatMessage {
  id: string;
  username: string;
  text: string;
  timestamp: string;
  role: string;
  socketId?: string;
  replyToId?: string | null;
  replyToText?: string | null;
  replyToSender?: string | null;
}

interface ReactionMap {
  [emoji: string]: string[];
}

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [username, setUsername] = useState(location.state?.username || getTelegramUsername() || '');

  const [users, setUsers] = useState<UserData[]>([]);
  const [myRole, setMyRole] = useState<'Host' | 'Moderator' | 'Participant'>('Participant');
  const [video, setVideo] = useState<VideoSource | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'participants'>('chat');
  const [linkInput, setLinkInput] = useState('');

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; sender: string; text: string } | null>(null);
  const [reactions, setReactions] = useState<Record<string, ReactionMap>>({});
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);
  const [reactionPickerRect, setReactionPickerRect] = useState<{ top: number; left: number; isMine: boolean } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressMsgRef = useRef<string | null>(null);

  const playerRef = useRef<YouTubePlayer | null>(null);
  const htmlVideoRef = useRef<HTMLVideoElement>(null);
  const isInternalChange = useRef(false);
  const targetState = useRef<{ currentTime: number; isPlaying: boolean } | null>(null);
  const htmlListenersAdded = useRef(false);

  const canControl = myRole === 'Host' || myRole === 'Moderator';

  const trendingVideos: SearchResult[] = [
    { id: 'dQw4w9WgXcQ', title: 'Rick Astley - Never Gonna Give You Up', thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg', channel: 'Rick Astley' },
    { id: 'jfKfPfyJRdk', title: 'lofi hip hop radio - beats to relax/study to', thumbnail: 'https://img.youtube.com/vi/jfKfPfyJRdk/mqdefault.jpg', channel: 'Lofi Girl' },
    { id: 'hT_nvWreIhg', title: 'OneRepublic - Counting Stars', thumbnail: 'https://img.youtube.com/vi/hT_nvWreIhg/mqdefault.jpg', channel: 'OneRepublic' },
    { id: '09R8_2nJtjg', title: 'Maroon 5 - Sugar', thumbnail: 'https://img.youtube.com/vi/09R8_2nJtjg/mqdefault.jpg', channel: 'Maroon 5' }
  ];

  useEffect(() => {
    if (!username) {
      const name = prompt('Please enter your name to join the room:');
      if (name) setUsername(name);
      else navigate('/');
    }
  }, [username, navigate]);

  useEffect(() => {
    if (!username || !roomId) return;

    if (!socket.connected) socket.connect();
    socket.emit('join_room', { roomId, username });

    socket.on('room_state', (state) => {
      setVideo(state.video || null);
      setUsers(state.users);
      setMyRole(state.myRole);
      targetState.current = { currentTime: state.currentTime, isPlaying: state.isPlaying };
      if (playerRef.current) applyTargetState();
      if (htmlVideoRef.current) applyHtmlVideoState();
    });

    socket.on('user_joined', (updatedUsers) => {
      setUsers(updatedUsers);
      const me = updatedUsers.find((u: UserData) => u.socketId === socket.id);
      if (me) setMyRole(me.role);
    });

    socket.on('user_left', (updatedUsers) => {
      setUsers(updatedUsers);
      const me = updatedUsers.find((u: UserData) => u.socketId === socket.id);
      if (me) setMyRole(me.role);
    });

    socket.on('sync_state', ({ action, payload }) => {
      if (action === 'change_video') {
        setVideo(payload.video);
        targetState.current = { currentTime: 0, isPlaying: true };
        setTimeout(() => {
          if (playerRef.current) applyTargetState();
          if (htmlVideoRef.current) applyHtmlVideoState();
        }, 200);
        return;
      }

      if (action === 'play') targetState.current = { currentTime: payload.currentTime, isPlaying: true };
      if (action === 'pause') targetState.current = { currentTime: payload.currentTime, isPlaying: false };
      if (action === 'seek') targetState.current = { ...targetState.current, currentTime: payload.currentTime, isPlaying: targetState.current?.isPlaying ?? true };

      if (playerRef.current) applyTargetState();
      if (htmlVideoRef.current) applyHtmlVideoState();
    });

    socket.on('new_message', (msg: ChatMessage) => {
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      hapticFeedback('light');
    });

    socket.on('ALL_REACTIONS', ({ reactions: allReactions }: { reactions: Record<string, ReactionMap> }) => {
      setReactions(allReactions);
    });

    socket.on('message-reaction-updated', ({ messageId, reactions: msgReactions }: { messageId: string; reactions: ReactionMap }) => {
      setReactions(prev => ({
        ...prev,
        [messageId]: msgReactions
      }));
    });

    socket.on('error', (msg) => showAlert(msg));

    return () => {
      socket.emit('leave_room', { roomId });
      socket.off('room_state');
      socket.off('user_joined');
      socket.off('user_left');
      socket.off('sync_state');
      socket.off('new_message');
      socket.off('ALL_REACTIONS');
      socket.off('message-reaction-updated');
      socket.off('error');
    };
  }, [roomId, username]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleClickOutside = () => {
      if (reactionPickerMsgId) {
        setReactionPickerMsgId(null);
        setReactionPickerRect(null);
      }
    };

    if (reactionPickerMsgId) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [reactionPickerMsgId]);

  const applyHtmlVideoState = () => {
    if (!htmlVideoRef.current || !targetState.current) return;
    isInternalChange.current = true;
    const { currentTime, isPlaying } = targetState.current;

    const videoEl = htmlVideoRef.current;
    if (Math.abs(videoEl.currentTime - currentTime) > 2) {
      videoEl.currentTime = currentTime;
    }

    if (isPlaying) {
      videoEl.play().catch(() => {});
    } else {
      videoEl.pause();
    }

    setTimeout(() => { isInternalChange.current = false; }, 1000);
  };

  const applyTargetState = () => {
    if (!playerRef.current || !targetState.current) return;
    isInternalChange.current = true;
    const { currentTime, isPlaying } = targetState.current;

    const currentPos = playerRef.current.getCurrentTime();
    if (Math.abs(currentPos - currentTime) > 2) {
      playerRef.current.seekTo(currentTime, true);
    }

    if (isPlaying) playerRef.current.playVideo();
    else playerRef.current.pauseVideo();

    setTimeout(() => { isInternalChange.current = false; }, 1000);
  };

  const getCurrentTime = (): number | null => {
    if (video?.type === 'youtube' && playerRef.current) {
      return playerRef.current.getCurrentTime();
    }
    if (video?.type === 'direct' && htmlVideoRef.current) {
      return htmlVideoRef.current.currentTime;
    }
    return null;
  };

  useEffect(() => {
    if (!canControl) return;

    const syncInterval = setInterval(() => {
      const currentTime = getCurrentTime();
      if (currentTime !== null) {
        socket.emit('sync_action', { roomId, action: 'seek', payload: { currentTime } });
      }
    }, 5000);

    return () => clearInterval(syncInterval);
  }, [canControl, roomId, video?.type]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      handleSearch(e);
      return;
    }
    setIsSearching(true);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setIsLoadingResults(true);

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();

      if (Array.isArray(data)) {
        setSearchResults(data);
      } else {
        setSearchResults(trendingVideos.filter(v => v.title.toLowerCase().includes(searchQuery.toLowerCase())));
      }
    } catch (error) {
      console.error('Error fetching search results:', error);
      setSearchResults(trendingVideos.filter(v => v.title.toLowerCase().includes(searchQuery.toLowerCase())));
    } finally {
      setIsLoadingResults(false);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    socket.emit('send_message', {
      roomId,
      message: inputMessage,
      replyToId: replyTo?.id || null,
      replyToText: replyTo?.text || null,
      replyToSender: replyTo?.sender || null
    });
    setInputMessage('');
    setReplyTo(null);
    hapticFeedback('light');
  };

  const cancelReply = () => setReplyTo(null);

  const sendReaction = (messageId: string, emoji: string) => {
    socket.emit('send-message-reaction', { roomId, messageId, emoji, sender: username });
    setReactionPickerMsgId(null);
  };

  const handleReactionPickerToggle = (messageId: string) => {
    if (reactionPickerMsgId === messageId) {
      setReactionPickerMsgId(null);
      setReactionPickerRect(null);
      return;
    }

    const msgEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!msgEl) return;

    const rect = msgEl.getBoundingClientRect();
    const isMine = msgEl.classList.contains('outgoing') || msgEl.closest('.items-end') !== null;

    setReactionPickerRect({
      top: rect.top - 44,
      left: rect.left,
      isMine: !!isMine
    });
    setReactionPickerMsgId(messageId);
    hapticFeedback('light');
  };

  const handleReplyToMessage = (msg: ChatMessage) => {
    setReplyTo({ id: msg.id, sender: msg.username, text: msg.text });
    hapticFeedback('medium');
  };

  const getReactionsForMessage = (messageId: string): ReactionMap => {
    return reactions[messageId] || {};
  };

  const getMyReactionsForMessage = (messageId: string): string[] => {
    const msgReactions = reactions[messageId] || {};
    return Object.entries(msgReactions)
      .filter(([, userIds]) => userIds.includes(socket.id || ''))
      .map(([emoji]) => emoji);
  };

  const playVideo = (vId: string) => {
    if (!canControl) return showAlert('Only Hosts/Moderators can change the video.');
    const newVideo: VideoSource = {
      type: 'youtube',
      videoId: vId,
      title: 'YouTube Video',
      thumbnail: `https://img.youtube.com/vi/${vId}/mqdefault.jpg`,
      channel: 'YouTube'
    };
    setVideo(newVideo);
    socket.emit('sync_action', { roomId, action: 'change_video', payload: { video: newVideo } });
    setIsSearching(false);
    setSearchQuery('');
    setSearchResults([]);
    hapticFeedback('success');
  };

  const handleLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkInput.trim()) return;
    if (!canControl) return showAlert('Only Hosts/Moderators can change the video.');

    const parsed = parseVideoUrl(linkInput);
    if (!parsed) {
      hapticFeedback('error');
      return showAlert('Could not recognize this link. Please enter a YouTube, VK Video link, or direct .mp4 URL.');
    }

    setVideo(parsed);
    socket.emit('sync_action', { roomId, action: 'change_video', payload: { video: parsed } });
    setLinkInput('');
    setIsSearching(false);
    hapticFeedback('success');
  };

  const onReady = (event: YouTubeEvent) => {
    playerRef.current = event.target;
    applyTargetState();
  };

  const onStateChange = (event: YouTubeEvent) => {
    if (isInternalChange.current || !canControl) return;
    const state = event.data;
    const currentTime = event.target.getCurrentTime();
    if (state === YouTube.PlayerState.PLAYING) {
      socket.emit('sync_action', { roomId, action: 'play', payload: { currentTime } });
    } else if (state === YouTube.PlayerState.PAUSED) {
      socket.emit('sync_action', { roomId, action: 'pause', payload: { currentTime } });
    }
  };

  const handleHtmlVideoLoaded = () => {
    const videoEl = htmlVideoRef.current;
    if (!videoEl || htmlListenersAdded.current) {
      if (videoEl) applyHtmlVideoState();
      return;
    }
    htmlListenersAdded.current = true;

    videoEl.addEventListener('play', () => {
      if (isInternalChange.current || !canControl) return;
      socket.emit('sync_action', { roomId, action: 'play', payload: { currentTime: videoEl.currentTime || 0 } });
    });
    videoEl.addEventListener('pause', () => {
      if (isInternalChange.current || !canControl) return;
      socket.emit('sync_action', { roomId, action: 'pause', payload: { currentTime: videoEl.currentTime || 0 } });
    });
    videoEl.addEventListener('seeked', () => {
      if (isInternalChange.current || !canControl) return;
      socket.emit('sync_action', { roomId, action: 'seek', payload: { currentTime: videoEl.currentTime || 0 } });
    });

    applyHtmlVideoState();
  };

  const copyRoomLink = () => {
    const url = window.location.href;
    shareLink(url, `Join my WatchBuddy room! Room ID: ${roomId}`);
    setCopied(true);
    hapticFeedback('success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePromote = (targetSocketId: string) => {
    socket.emit('promote_user', { roomId, targetSocketId, newRole: 'Host' });
    hapticFeedback('medium');
  };

  const renderVideoPlayer = () => {
    if (!video) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center text-text-muted space-y-3 bg-[#2D2A26]">
          <div className="w-16 h-16 bg-white/5 rounded-3xl flex items-center justify-center animate-float">
            <PlayCircle className="w-8 h-8 opacity-20" />
          </div>
          <p className="font-bold tracking-widest uppercase text-[9px] text-center px-4">Add a video via search or paste a link</p>
        </div>
      );
    }

    if (video.type === 'youtube' && video.videoId) {
      return (
        <div className="relative w-full h-full">
          {!canControl && <div className="absolute inset-0 z-10 cursor-not-allowed" />}
          <YouTube
            videoId={video.videoId}
            onReady={onReady}
            onStateChange={onStateChange}
            opts={{
              width: '100%',
              height: '100%',
              playerVars: { autoplay: 1, controls: canControl ? 1 : 0, modestbranding: 1, rel: 0 },
            }}
            className="w-full h-full"
          />
        </div>
      );
    }

    if (video.type === 'direct') {
      return (
        <div className="relative w-full h-full">
          {!canControl && <div className="absolute inset-0 z-10 cursor-not-allowed" />}
          <video
            ref={htmlVideoRef}
            src={video.url}
            controls={canControl}
            autoPlay
            playsInline
            className="w-full h-full object-contain bg-black"
            onLoadedMetadata={handleHtmlVideoLoaded}
            onLoadedData={handleHtmlVideoLoaded}
          >
            Your browser does not support video playback.
          </video>
        </div>
      );
    }

    if (video.type === 'vk') {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[#2D2A26] p-4 text-center">
          <div className="text-white font-bold mb-2 flex items-center gap-2">
            <Globe className="w-5 h-5 text-[#0077FF]" />
            VK Video
          </div>
          {video.url && (
            <a
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-3 bg-[#0077FF] text-white rounded-xl font-bold text-sm shadow-lg hover:bg-[#0069E0] transition-all active:scale-95"
            >
              Open VK Video in new tab
            </a>
          )}
          <p className="text-text-muted text-xs mt-4">
            VK Video works best in a new tab for synced watching. Open it simultaneously.
          </p>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="h-screen bg-[#17212b] text-[#f5f5f5] font-sans flex flex-col selection:bg-primary/20 overflow-hidden">
      <nav className="h-14 bg-[rgba(23,33,43,0.97)] backdrop-blur-xl border-b border-white/5 px-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
            <ArrowLeft className="w-5 h-5 text-[#708499]" />
          </button>
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg tracking-tight text-[#5288c1]">WatchBuddy</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-1 max-w-xs justify-end">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 hidden sm:block">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full pl-3 pr-8 py-1.5 bg-[#232e3c] rounded-xl text-xs border border-white/5 focus:ring-2 focus:ring-[#5288c1]/20 transition-all text-white placeholder:text-[#708499]"
            />
            <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 text-[#708499] hover:text-[#5288c1] transition-colors">
              <Search className="w-3.5 h-3.5" />
            </button>
          </form>
          <button onClick={() => setIsSearching(true)} className="sm:hidden p-2 hover:bg-white/5 rounded-xl transition-colors">
            <Search className="w-4 h-4 text-[#708499]" />
          </button>
          <div className="flex items-center gap-1.5 bg-[#232e3c] px-3 py-1.5 rounded-full border border-white/5">
            <Tv className="w-3.5 h-3.5 text-[#708499]" />
            <span className="text-xs font-bold text-[#708499]">{roomId}</span>
          </div>
        </div>
        <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-white/10 shadow-sm ring-1 ring-white/5 shrink-0">
          <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${username}`} alt="avatar" className="w-full h-full" />
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden relative">
        {isSearching && (
          <div className="absolute inset-0 z-40 bg-white/95 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="flex items-center justify-between border-b border-[#A89F94]/10 pb-4">
                <div>
                  <h2 className="text-xl font-bold tracking-tight">Add Video</h2>
                  <p className="text-xs text-text-muted mt-0.5">Paste a link or search YouTube</p>
                </div>
                <button onClick={() => { setIsSearching(false); setSearchQuery(''); setSearchResults([]); setLinkInput(''); }} className="p-2.5 hover:bg-bg-light rounded-xl transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-bg-light rounded-2xl p-4 border border-[#A89F94]/10">
                <label className="text-xs font-bold text-text-muted uppercase tracking-widest ml-1 mb-2 block">
                  Paste Video Link
                </label>
                <form onSubmit={handleLinkSubmit} className="relative group">
                  <input
                    type="text"
                    value={linkInput}
                    onChange={(e) => setLinkInput(e.target.value)}
                    placeholder="YouTube, VK Video, or direct .mp4 URL..."
                    className="w-full px-4 py-3 bg-white border border-[#A89F94]/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all pr-12"
                  />
                  <button
                    type="submit"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-all"
                  >
                    <Link2 className="w-4 h-4" />
                  </button>
                </form>
                <p className="text-[10px] text-text-muted mt-2 ml-1">
                  <Film className="w-3 h-3 inline mr-1" />
                  Supports YouTube, VK Video links, and direct .mp4/.webm/.m3u8 URLs
                </p>
              </div>

              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search YouTube..."
                    className="w-full pl-4 pr-10 py-3 bg-bg-light border border-[#A89F94]/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                  <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-text-muted hover:text-primary transition-colors">
                    <Search className="w-4 h-4" />
                  </button>
                </div>
              </form>

              {isLoadingResults ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-3">
                  <Loader2 className="w-10 h-10 text-primary animate-spin" />
                  <p className="text-text-muted font-medium animate-pulse">Searching YouTube...</p>
                </div>
              ) : searchQuery ? (
                <div className="grid grid-cols-2 gap-4">
                  {(searchResults.length > 0 ? searchResults : trendingVideos).map(videoItem => (
                    <div key={videoItem.id} className="group cursor-pointer space-y-2" onClick={() => playVideo(videoItem.id)}>
                      <div className="relative aspect-video rounded-2xl overflow-hidden shadow-sm group-hover:shadow-xl transition-all">
                        <img src={videoItem.thumbnail} alt={videoItem.title} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center text-white scale-75 group-hover:scale-100 transition-transform shadow-xl">
                            <Play className="w-6 h-6 fill-white ml-0.5" />
                          </div>
                        </div>
                      </div>
                      <div className="px-0.5">
                        <h3 className="font-bold text-xs line-clamp-2 leading-snug group-hover:text-primary transition-colors" dangerouslySetInnerHTML={{ __html: videoItem.title }} />
                        <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mt-1">{videoItem.channel}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <p className="text-xs font-bold text-text-muted uppercase tracking-widest mb-3">Popular Videos</p>
                  <div className="grid grid-cols-2 gap-4">
                    {trendingVideos.map(videoItem => (
                      <div key={videoItem.id} className="group cursor-pointer space-y-2" onClick={() => playVideo(videoItem.id)}>
                        <div className="relative aspect-video rounded-2xl overflow-hidden shadow-sm group-hover:shadow-xl transition-all">
                          <img src={videoItem.thumbnail} alt={videoItem.title} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center text-white scale-75 group-hover:scale-100 transition-transform shadow-xl">
                              <Play className="w-6 h-6 fill-white ml-0.5" />
                            </div>
                          </div>
                        </div>
                        <div className="px-0.5">
                          <h3 className="font-bold text-xs line-clamp-2 leading-snug group-hover:text-primary transition-colors">{videoItem.title}</h3>
                          <p className="text-[9px] font-black uppercase tracking-widest text-text-muted mt-1">{videoItem.channel}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="space-y-4">
            <div className="relative rounded-3xl overflow-hidden bg-black aspect-video shadow-2xl ring-1 ring-black/5">
              {renderVideoPlayer()}
            </div>

            <div className="flex items-start justify-between">
              <div className="space-y-1 min-w-0 flex-1 mr-3">
                <h2 className="text-lg font-bold tracking-tight truncate">
                  {video?.title || 'Watching Room'}
                </h2>
                <div className="flex items-center gap-2 text-[10px] font-bold text-text-muted uppercase tracking-widest">
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {users.length} Watching</span>
                  <div className="w-1 h-1 bg-[#A89F94]/30 rounded-full" />
                  <span className="text-primary">{myRole}</span>
                  {video && (
                    <>
                      <div className="w-1 h-1 bg-[#A89F94]/30 rounded-full" />
                      <span className="flex items-center gap-1">
                        {video.type === 'youtube' && <Film className="w-3 h-3" />}
                        {video.type === 'direct' && <Link2 className="w-3 h-3" />}
                        {video.type === 'vk' && <Globe className="w-3 h-3" />}
                        {video.type}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={() => setIsSearching(true)}
                className="px-4 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl flex items-center gap-2 text-xs font-bold shadow-lg shadow-primary/20 transition-all active:scale-95 shrink-0"
              >
                <Search className="w-3.5 h-3.5" /> Browse
              </button>
            </div>
           </div>

           <div className="grid grid-cols-3 gap-3">
             <div className="bg-[#232e3c] p-4 rounded-2xl border border-white/5 shadow-sm space-y-2">
               <p className="text-[9px] font-black uppercase tracking-[0.15em] text-[#708499]">Status</p>
               <div className="text-lg font-bold tracking-tight text-white">Active</div>
               <p className="text-[9px] font-bold text-[#8bc34a] uppercase">Syncing</p>
             </div>
             <div className="bg-[#232e3c] p-4 rounded-2xl border border-white/5 shadow-sm space-y-2">
               <p className="text-[9px] font-black uppercase tracking-[0.15em] text-[#708499]">People</p>
               <div className="text-lg font-bold tracking-tight text-white">{users.length}</div>
               <p className="text-[9px] font-bold text-[#708499] uppercase">In room</p>
             </div>
             <div className="bg-[#232e3c] p-4 rounded-2xl border border-white/5 shadow-sm space-y-2">
               <p className="text-[9px] font-black uppercase tracking-[0.15em] text-[#708499]">Access</p>
               <div className="text-lg font-bold tracking-tight text-white truncate">{myRole}</div>
               <p className="text-[9px] font-bold text-[#708499] uppercase">Role</p>
             </div>
           </div>
         </div>

         <aside className="w-full md:w-80 bg-[#232e3c] border-t md:border-t-0 md:border-l border-white/5 flex flex-col md:max-h-full max-h-[45vh]">
           <div className="p-4 border-b border-white/5 flex items-center justify-between">
             <div>
               <h3 className="font-bold text-base text-[#5288c1]">Room Dashboard</h3>
               <p className="text-xs text-[#708499] font-medium flex items-center gap-2">
                 {username} <div className="w-1.5 h-1.5 rounded-full bg-[#8bc34a]" />
               </p>
             </div>
             <button onClick={copyRoomLink} className="p-2.5 bg-[#5288c1] text-white rounded-xl hover:bg-[#4a7ab0] transition-all active:scale-95 shadow-lg shadow-[#5288c1]/20">
               {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
             </button>
           </div>

           <div className="flex p-1.5 gap-1.5 bg-[#17212b]/50 mx-4 mt-3 rounded-xl border border-white/5">
             <button onClick={() => setActiveTab('chat')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'chat' ? 'bg-[#232e3c] text-[#5288c1] shadow-sm' : 'text-[#708499] hover:text-white'}`}>Chat</button>
             <button onClick={() => setActiveTab('participants')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'participants' ? 'bg-[#232e3c] text-[#5288c1] shadow-sm' : 'text-[#708499] hover:text-white'}`}>People</button>
           </div>

           <div className="flex-1 overflow-y-auto p-4 flex flex-col min-h-0">
             {activeTab === 'participants' ? (
               <div className="space-y-3">
                 {users.map(user => (
                   <div key={user.socketId} className="flex items-center gap-3 p-2.5 hover:bg-white/5 rounded-xl transition-colors group">
                     <div className="w-9 h-9 rounded-xl bg-[#17212b] border border-white/10 flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                       {user.role === 'Host' ? <Crown className="w-4 h-4 text-[#5288c1]" /> : <UserIcon className="w-4 h-4 text-[#708499]" />}
                     </div>
                     <div className="min-w-0">
                       <span className="block text-sm font-bold truncate text-white">{user.username} {user.socketId === socket.id && '(You)'}</span>
                       <span className="text-[9px] font-black uppercase tracking-widest text-[#708499]">{user.role}</span>
                     </div>
                     {myRole === 'Host' && user.socketId !== socket.id && user.role !== 'Host' && (
                       <button
                         onClick={() => handlePromote(user.socketId)}
                         className="ml-auto p-2 text-[#5288c1] hover:bg-white/5 rounded-lg transition-colors"
                         title="Promote to Host"
                       >
                         <Shield className="w-4 h-4" />
                       </button>
                     )}
                   </div>
                 ))}
               </div>
             ) : (
               <div className="flex-1 flex flex-col min-h-0">
                 <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                   {messages.length === 0 ? (
                     <div className="h-full flex flex-col items-center justify-center text-center p-4 text-[#708499]">
                       <MessageSquare className="w-10 h-10 opacity-10 mb-3" />
                       <p className="text-sm font-medium italic">No messages yet. Say hi!</p>
                     </div>
                   ) : (
                    messages.map((msg) => {
                      const isMine = msg.username === username;
                      const msgReactions = getReactionsForMessage(msg.id);
                      const myReactions = getMyReactionsForMessage(msg.id);

                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} group`}
                          onTouchStart={() => {
                            longPressMsgRef.current = msg.id;
                            longPressTimerRef.current = window.setTimeout(() => {
                              handleReactionPickerToggle(msg.id);
                              longPressMsgRef.current = null;
                            }, 400);
                          }}
                          onTouchMove={() => {
                            if (longPressTimerRef.current) {
                              clearTimeout(longPressTimerRef.current);
                              longPressTimerRef.current = null;
                            }
                          }}
                          onTouchEnd={() => {
                            if (longPressTimerRef.current) {
                              clearTimeout(longPressTimerRef.current);
                              longPressTimerRef.current = null;
                            }
                          }}
                          onDoubleClick={() => handleReactionPickerToggle(msg.id)}
                        >
                          <div className="flex items-center gap-2 mb-0.5 px-1">
                            <span className="text-[10px] font-bold text-text-muted">{msg.username}</span>
                            <span className="text-[9px] text-text-muted/60">{msg.timestamp}</span>
                          </div>

                          <div
                            className={`px-3.5 py-2 rounded-2xl text-sm max-w-[85%] shadow-sm relative ${
                              isMine
                                ? 'bg-[#2b5278] text-white rounded-tr-none'
                                : 'bg-[#182533] text-white rounded-tl-none'
                            }`}
                          >
                            {msg.replyToId && msg.replyToText && (
                              <div className="border-l-2 border-[#64b5ef] pl-2 mb-1.5 bg-white/5 rounded-r-md">
                                <span className="text-[11px] font-semibold text-[#64b5ef] block">{msg.replyToSender}</span>
                                <span className="text-[11px] text-white/70 line-clamp-1 block">{msg.replyToText.slice(0, 50)}</span>
                              </div>
                            )}
                            <span className="text-[13px] leading-relaxed">{msg.text}</span>
                          </div>

                          {Object.keys(msgReactions).length > 0 && (
                            <div className={`flex flex-wrap gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                              {Object.entries(msgReactions).map(([emoji, userIds]) => (
                                <button
                                  key={emoji}
                                  onClick={() => sendReaction(msg.id, emoji)}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-all ${
                                    myReactions.includes(emoji)
                                      ? 'bg-white/15 border-white/25'
                                      : 'bg-white/5 border-white/10'
                                  }`}
                                >
                                  <span>{emoji}</span>
                                  <span className="text-[10px] font-semibold text-white/80">{userIds.length}</span>
                                </button>
                              ))}
                            </div>
                          )}

                          {reactionPickerMsgId === msg.id && reactionPickerRect && (
                            <div
                              className="fixed z-50 bg-[#1e2c3a] border border-white/15 rounded-full px-2 py-1.5 shadow-xl flex items-center gap-1"
                              style={{
                                top: `${reactionPickerRect.top}px`,
                                [reactionPickerRect.isMine ? 'right' : 'left']: reactionPickerRect.isMine ? 'auto' : `${reactionPickerRect.left}px`,
                                ...(reactionPickerRect.isMine ? { right: `${window.innerWidth - reactionPickerRect.left}px` } : {})
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {['❤️', '💖', '😂', '🔥', '👍', '😮', '😢', '👏'].map(emoji => (
                                <button
                                  key={emoji}
                                  onClick={() => sendReaction(msg.id, emoji)}
                                  className="text-lg hover:scale-125 transition-transform active:scale-90"
                                >
                                  {emoji}
                                </button>
                              ))}
                              <button
                                onClick={() => handleReplyToMessage(msg)}
                                className="text-[10px] text-[#64b5ef] hover:text-white transition-colors px-2 font-semibold"
                              >
                                Reply
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                  <div ref={chatEndRef} />
                </div>

                {replyTo && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-[#232e3c] border-t border-white/5">
                    <div className="w-1 h-8 bg-[#64b5ef] rounded-full" />
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] font-semibold text-[#64b5ef] block">{replyTo.sender}</span>
                      <span className="text-[11px] text-white/60 truncate block">{replyTo.text.slice(0, 50)}</span>
                    </div>
                    <button onClick={cancelReply} className="p-1 text-white/40 hover:text-white transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <form onSubmit={handleSendMessage} className="px-3 py-2 bg-[#17212b] border-t border-white/5">
                  <div className="relative flex items-center gap-2">
                    <input
                      type="text"
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      placeholder={replyTo ? 'Reply...' : 'Type a message...'}
                      className="flex-1 bg-[#232e3c] border border-white/10 rounded-full px-4 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/20 transition-colors"
                    />
                    <button
                      type="submit"
                      disabled={!inputMessage.trim()}
                      className="w-8 h-8 rounded-full bg-[#5288c1] hover:bg-[#4a7ab0] disabled:bg-white/10 disabled:text-white/30 text-white flex items-center justify-center transition-all active:scale-90 flex-shrink-0"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

           <div className="p-4 border-t border-white/5 bg-[#232e3c]">
             <button onClick={() => navigate('/')} className="w-full py-3 bg-[#17212b] text-[#f5f5f5] text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-white/5 transition-all border border-white/10 flex items-center justify-center gap-2 active:scale-95">
               <LogOut className="w-4 h-4" /> Leave Room
             </button>
           </div>
         </aside>
       </div>
     </div>
   );
 }