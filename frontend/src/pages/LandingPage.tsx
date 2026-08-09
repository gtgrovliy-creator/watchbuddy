import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Link2, Monitor, ArrowRight, Flame, Copy, Check } from 'lucide-react';
import { getTelegramUsername, hapticFeedback, showAlert } from '../services/telegram';

export default function LandingPage() {
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  // Auto-fill username from Telegram
  useEffect(() => {
    const tgName = getTelegramUsername();
    if (tgName) setUsername(tgName);
  }, []);

  const handleCreateRoom = () => {
    if (!username.trim()) {
      hapticFeedback('error');
      return showAlert('Please enter your name first!');
    }
    hapticFeedback('success');
    const newRoomId = Math.random().toString(36).substring(2, 9);
    navigate(`/room/${newRoomId}`, { state: { username: username.trim() } });
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      hapticFeedback('error');
      return showAlert('Please enter your name first!');
    }
    if (!roomId.trim()) {
      hapticFeedback('error');
      return showAlert('Please enter a Room ID!');
    }
    hapticFeedback('success');
    navigate(`/room/${roomId.trim()}`, { state: { username: username.trim() } });
  };

  const copyRoomId = () => {
    if (!roomId.trim()) return;
    navigator.clipboard.writeText(roomId.trim());
    setCopied(true);
    hapticFeedback('success');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-bg-light text-text-main font-sans overflow-x-hidden pb-8">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
            <Flame className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">WatchBuddy</span>
        </div>
        <span className="text-xs font-semibold text-text-muted bg-white px-3 py-1.5 rounded-full border border-[#A89F94]/10">
          Telegram Mini App
        </span>
      </header>

      {/* Hero Section */}
      <main className="px-5">
        <div className="relative rounded-3xl overflow-hidden bg-[#2D2A26] h-[280px] flex flex-col items-center justify-center text-center px-4 shadow-2xl">
          <div className="absolute inset-0 opacity-30 mix-blend-overlay">
            <img
              src="https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&q=80&w=2000"
              alt="Living Room"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="relative z-10 space-y-4 max-w-sm">
            <h1 className="text-3xl font-bold text-white tracking-tight leading-tight">
              Watch YouTube Together
            </h1>
            <p className="text-text-muted text-sm font-medium leading-relaxed">
              Sync videos and chat with your friends in real-time right inside Telegram.
            </p>
            <div className="flex flex-col gap-3 pt-2">
              <button
                onClick={handleCreateRoom}
                className="w-full px-8 py-3.5 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl transition-all shadow-xl shadow-primary/20 active:scale-95"
              >
                Create Room
              </button>
              <button
                onClick={() => document.getElementById('join-input')?.focus()}
                className="w-full px-8 py-3.5 bg-white hover:bg-slate-50 text-text-main font-bold rounded-xl transition-all active:scale-95"
              >
                Join Room
              </button>
            </div>
          </div>
        </div>

        {/* Inputs Section */}
        <div className="space-y-4 mt-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-text-muted uppercase tracking-widest ml-1">Display Name</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your display name"
              autoComplete="off"
              className="w-full px-5 py-3.5 bg-white border border-[#A89F94]/20 rounded-2xl focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all text-base"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-text-muted uppercase tracking-widest ml-1">Room ID</label>
            <form onSubmit={handleJoinRoom} className="relative group">
              <input
                id="join-input"
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Enter Room ID to join"
                className="w-full px-5 py-3.5 bg-white border border-[#A89F94]/20 rounded-2xl focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all text-base pr-24"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {roomId && (
                  <button
                    type="button"
                    onClick={copyRoomId}
                    className="w-9 h-9 bg-slate-50 hover:bg-slate-100 rounded-xl flex items-center justify-center transition-all"
                  >
                    {copied ? <Check className="w-4 h-4 text-accent-green" /> : <Copy className="w-4 h-4 text-text-muted" />}
                  </button>
                )}
                <button
                  type="submit"
                  className="w-9 h-9 bg-slate-50 hover:bg-slate-100 rounded-xl flex items-center justify-center transition-all group-focus-within:bg-primary group-focus-within:text-white"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* How it Works Section */}
        <section className="mt-10">
          <div className="mb-6">
            <h2 className="text-xl font-bold tracking-tight mb-1">How it Works</h2>
            <p className="text-text-muted text-sm font-medium">Got started in seconds. No sign up required.</p>
          </div>

          <div className="space-y-4">
            <div className="bg-white p-5 rounded-3xl border border-[#A89F94]/10 shadow-sm flex items-start gap-4">
              <div className="w-11 h-11 bg-bg-light rounded-2xl flex items-center justify-center shrink-0">
                <Link2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-bold mb-1">Create Room</h3>
                <p className="text-text-muted leading-relaxed text-sm font-medium">
                  Create a room and get a unique ID to share with your partner.
                </p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-[#A89F94]/10 shadow-sm flex items-start gap-4">
              <div className="w-11 h-11 bg-bg-light rounded-2xl flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-bold mb-1">Invite Your Partner</h3>
                <p className="text-text-muted leading-relaxed text-sm font-medium">
                  Share the room ID with your girlfriend so she can join instantly.
                </p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-[#A89F94]/10 shadow-sm flex items-start gap-4">
              <div className="w-11 h-11 bg-bg-light rounded-2xl flex items-center justify-center shrink-0">
                <Monitor className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-bold mb-1">Watch Together</h3>
                <p className="text-text-muted leading-relaxed text-sm font-medium">
                  Enjoy perfectly synced playback and chat together in real-time.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}