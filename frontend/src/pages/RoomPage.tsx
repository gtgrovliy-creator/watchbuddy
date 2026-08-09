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
  const chatEndRef = useRef<HTMLDivElement>(null);

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
      setMessages(prev => [...prev, msg]);
      hapticFeedback('light');
    });

    socket.on('error', (msg) => showAlert(msg));

    return () => {
      socket.emit('leave_room', { roomId });
      socket.off('room_state');
      socket.off('user_joined');
      socket.off('user_left');
      socket.off('sync_state');
      socket.off('new_message');
      socket.off('error');
    };
  }, [roomId, username]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
    socket.emit('send_message', { roomId, message: inputMessage });
    setInputMessage('');
    hapticFeedback('light');
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
    <div className="min-h-screen bg-bg-light text-text-main font-sans flex flex-col selection:bg-primary/20">
      <nav className="h-14 bg-white border-b border-[#A89F94]/10 px-4 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 hover:bg-bg-light rounded-xl transition-colors">
            <ArrowLeft className="w-5 h-5 text-text-muted" />
          </button>
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg tracking-tight text-primary">WatchBuddy</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-1 max-w-xs justify-end">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 hidden sm:block">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full pl-3 pr-8 py-1.5 bg-bg-light rounded-xl text-xs border-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
            <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-primary transition-colors">
              <Search className="w-3.5 h-3.5" />
            </button>
          </form>
          <button onClick={() => setIsSearching(true)} className="sm:hidden p-2 hover:bg-bg-light rounded-xl transition-colors">
            <Search className="w-4 h-4 text-text-muted" />
          </button>
          <div className="flex items-center gap-1.5 bg-bg-light px-3 py-1.5 rounded-full">
            <Tv className="w-3.5 h-3.5 text-text-muted" />
            <span className="text-xs font-bold text-text-muted">{roomId}</span>
          </div>
        </div>
        <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-white shadow-sm ring-1 ring-[#A89F94]/20 shrink-0">
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
            <div className="bg-white p-4 rounded-2xl border border-[#A89F94]/10 shadow-sm space-y-2">
              <p className="text-[9px] font-black uppercase tracking-[0.15em] text-text-muted">Status</p>
              <div className="text-lg font-bold tracking-tight">Active</div>
              <p className="text-[9px] font-bold text-accent-green uppercase">Syncing</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-[#A89F94]/10 shadow-sm space-y-2">
              <p className="text-[9px] font-black uppercase tracking-[0.15em] text-text-muted">People</p>
              <div className="text-lg font-bold tracking-tight">{users.length}</div>
              <p className="text-[9px] font-bold text-text-muted uppercase">In room</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-[#A89F94]/10 shadow-sm space-y-2">
              <p className="text-[9px] font-black uppercase tracking-[0.15em] text-text-muted">Access</p>
              <div className="text-lg font-bold tracking-tight truncate">{myRole}</div>
              <p className="text-[9px] font-bold text-text-muted uppercase">Role</p>
            </div>
          </div>
        </div>

        <aside className="w-full md:w-80 bg-white border-t md:border-t-0 md:border-l border-[#A89F94]/10 flex flex-col md:max-h-full max-h-[45vh]">
          <div className="p-4 border-b border-[#A89F94]/10 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-base text-primary">Room Dashboard</h3>
              <p className="text-xs text-text-muted font-medium flex items-center gap-2">
                {username} <div className="w-1.5 h-1.5 rounded-full bg-accent-green" />
              </p>
            </div>
            <button onClick={copyRoomLink} className="p-2.5 bg-primary text-white rounded-xl hover:bg-primary-dark transition-all active:scale-95 shadow-lg shadow-primary/20">
              {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex p-1.5 gap-1.5 bg-bg-light/50 mx-4 mt-3 rounded-xl border border-[#A89F94]/5">
            <button onClick={() => setActiveTab('chat')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'chat' ? 'bg-white text-primary shadow-sm' : 'text-text-muted hover:text-text-main'}`}>Chat</button>
            <button onClick={() => setActiveTab('participants')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'participants' ? 'bg-white text-primary shadow-sm' : 'text-text-muted hover:text-text-main'}`}>People</button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col min-h-0">
            {activeTab === 'participants' ? (
              <div className="space-y-3">
                {users.map(user => (
                  <div key={user.socketId} className="flex items-center gap-3 p-2.5 hover:bg-bg-light rounded-xl transition-colors group">
                    <div className="w-9 h-9 rounded-xl bg-white border border-[#A89F94]/10 flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                      {user.role === 'Host' ? <Crown className="w-4 h-4 text-primary" /> : <UserIcon className="w-4 h-4 text-text-muted" />}
                    </div>
                    <div className="min-w-0">
                      <span className="block text-sm font-bold truncate">{user.username} {user.socketId === socket.id && '(You)'}</span>
                      <span className="text-[9px] font-black uppercase tracking-widest text-text-muted">{user.role}</span>
                    </div>
                    {myRole === 'Host' && user.socketId !== socket.id && user.role !== 'Host' && (
                      <button
                        onClick={() => handlePromote(user.socketId)}
                        className="ml-auto p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
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
                    <div className="h-full flex flex-col items-center justify-center text-center p-4 text-text-muted">
                      <MessageSquare className="w-10 h-10 opacity-10 mb-3" />
                      <p className="text-sm font-medium italic">No messages yet. Say hi!</p>
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <div key={msg.id} className={`flex flex-col ${msg.username === username ? 'items-end' : 'items-start'}`}>
                        <div className="flex items-center gap-2 mb-0.5 px-1">
                          <span className="text-[10px] font-bold text-text-muted">{msg.username}</span>
                          <span className="text-[9px] text-text-muted/60">{msg.timestamp}</span>
                        </div>
                        <div className={`px-3.5 py-2 rounded-2xl text-sm max-w-[85%] shadow-sm ${
                          msg.username === username
                            ? 'bg-primary text-white rounded-tr-none'
                            : 'bg-bg-light text-text-main rounded-tl-none border border-[#A89F94]/10'
                        }`}>
                          {msg.text}
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={chatEndRef} />
                </div>

                <form onSubmit={handleSendMessage} className="mt-3 pt-3 border-t border-[#A89F94]/10 relative">
                  <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="w-full pl-4 pr-11 py-2.5 bg-bg-light rounded-xl text-sm border-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                  <button
                    type="submit"
                    disabled={!inputMessage.trim()}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 text-primary disabled:text-text-muted/30 transition-colors"
                  >
                    <Send className="w-4.5 h-4.5" />
                  </button>
                </form>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-[#A89F94]/10 bg-white">
            <button onClick={() => navigate('/')} className="w-full py-3 bg-bg-light text-text-main text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-slate-100 transition-all border border-[#A89F94]/10 flex items-center justify-center gap-2 active:scale-95">
              <LogOut className="w-4 h-4" /> Leave Room
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}