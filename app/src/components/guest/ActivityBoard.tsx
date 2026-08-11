import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { listenForActivityPosts, createActivityPost, likeActivityPost } from '@/services/firebase-services';
import type { ActivityPost, User as AppUser } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { AlertModal } from '@/components/ui/AlertModal';
import { ChevronLeft, Send, Heart, Users, Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type AuthUserBridge = AppUser & { uid?: string };

interface ActivityBoardProps {
  onBack: () => void;
}

export function ActivityBoard({ onBack }: ActivityBoardProps) {
  const { user } = useAuth();
  const currentUser = user as AuthUserBridge;
  const [posts, setPosts] = useState<ActivityPost[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [alert, setAlert] = useState({ open: false, title: '', message: '', type: 'info' as 'success' | 'error' | 'warning' });

  useEffect(() => {
    const unsub = listenForActivityPosts(setPosts);
    return unsub;
  }, []);

  const handlePost = async () => {
    if (!newMessage.trim()) return;
    setIsPosting(true);
    const result = await createActivityPost({
      guestId: currentUser?.id || currentUser?.uid || 'anonymous',
      guestName: currentUser?.name || 'Anonymous Guest',
      roomNumber: currentUser?.roomNumber,
      message: newMessage.trim(),
    });
    setIsPosting(false);
    if (result.success) {
      setNewMessage('');
      toast.success('Posted to the Activity Board!');
    } else {
      setAlert({ open: true, title: 'Post Failed', message: 'Could not publish your post.', type: 'error' });
    }
  };

  const handleLike = async (postId: string) => {
    const guestId = currentUser?.id || currentUser?.uid || 'anonymous';
    const result = await likeActivityPost(postId, guestId);
    if (!result.success) {
      toast.error(result.error || 'Could not like post');
    } else {
      toast.success('Liked!');
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const getResortVibe = () => {
    if (posts.length === 0) return { label: 'Peaceful', color: 'text-blue-500', icon: '🕊️' };
    
    const text = posts.map(p => p.message.toLowerCase()).join(' ');
    const vibes = [
      { keywords: ['fun', 'excited', 'party', 'great', 'awesome', 'dinner'], label: 'Vibrant', color: 'text-amber-500', icon: '🔥' },
      { keywords: ['relax', 'spa', 'quiet', 'peace', 'sunset', 'calm'], label: 'Zen', color: 'text-emerald-500', icon: '🧘' },
      { keywords: ['tour', 'buddy', 'anyone', 'join', 'group', 'meet'], label: 'Social', color: 'text-blue-500', icon: '🤝' }
    ];
    
    let bestVibe = vibes[0];
    let maxCount = -1;
    
    vibes.forEach(v => {
      const count = v.keywords.reduce((sum, kw) => sum + (text.split(kw).length - 1), 0);
      if (count > maxCount) {
        maxCount = count;
        bestVibe = v;
      }
    });
    
    return bestVibe;
  };

  const ResortVibe = () => {
    const vibe = getResortVibe();
    return (
      <Card className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-md border-none shadow-sm overflow-hidden group">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-2xl shadow-inner group-hover:scale-110 transition-transform">
              {vibe.icon}
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Current Resort Vibe</p>
              <h3 className={`text-xl font-bold font-serif ${vibe.color}`}>{vibe.label}</h3>
            </div>
          </div>
          <div className="text-right">
            <Badge variant="outline" className="bg-white/80 dark:bg-slate-800/80 border-slate-100 dark:border-slate-700 text-[10px] py-0 h-5">
              Live Analysis
            </Badge>
            <p className="text-[10px] text-slate-400 mt-1 italic">Based on {posts.length} recent posts</p>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <AlertModal open={alert.open} onClose={() => setAlert(p => ({ ...p, open: false }))} title={alert.title} message={alert.message} type={alert.type} />

      <Button variant="ghost" onClick={onBack} className="text-[#1e3a5f] hover:bg-[#1e3a5f]/5 -ml-4">
        <ChevronLeft className="mr-2 h-4 w-4" /> Back to Dashboard
      </Button>

      <div>
        <h1 className="text-3xl font-serif font-bold text-[#1e3a5f] dark:text-blue-400">Activity Board</h1>
        <p className="text-gray-500 dark:text-slate-400 mt-1">Connect with fellow guests. Share plans, find companions for tours, or simply say hello!</p>
      </div>

      <ResortVibe />

      {/* Compose */}
      <Card className="border-none shadow-lg overflow-hidden">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-full bg-[#1e3a5f] flex items-center justify-center text-white font-bold text-lg">
              {currentUser?.name?.charAt(0) || '?'}
            </div>
            <div>
              <p className="font-semibold text-gray-800 text-sm">{currentUser?.name || 'Guest'}</p>
              {currentUser?.roomNumber && <p className="text-xs text-gray-400">Room {currentUser.roomNumber}</p>}
            </div>
          </div>
          <Textarea
            placeholder="What's on your mind? Looking for tour buddies? Share a sunset photo spot? 🌅"
            className="min-h-[80px] resize-none border-gray-200 focus:ring-[#c9a227]"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
          />
          <div className="flex justify-end">
            <Button
              className="bg-[#1e3a5f] hover:bg-[#163058]"
              disabled={!newMessage.trim() || isPosting}
              onClick={handlePost}
            >
              {isPosting ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Send className="mr-2 h-4 w-4" />}
              Post
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Feed */}
      {posts.length === 0 ? (
        <Card className="border-dashed border-2 border-gray-200 bg-gray-50/50">
          <CardContent className="p-12 text-center">
            <Users className="h-12 w-12 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-400 italic">No posts yet. Be the first to share something!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => {
            const guestId = currentUser?.id || currentUser?.uid || 'anonymous';
            const userLiked = post.likedBy?.includes(guestId) || false;
            
            return (
              <Card key={post.id} className="border-none shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1e3a5f] to-[#4a7c9b] flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {post.guestName.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-800 text-sm">{post.guestName}</span>
                        {post.roomNumber && (
                          <span className="text-[10px] bg-[#1e3a5f]/10 text-[#1e3a5f] px-2 py-0.5 rounded-full font-medium">Room {post.roomNumber}</span>
                        )}
                        <span className="text-xs text-gray-400 flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(post.createdAt)}</span>
                      </div>
                      <p className="text-gray-700 mt-2 text-sm leading-relaxed">{post.message}</p>
                      <button
                        onClick={() => handleLike(post.id)}
                        disabled={userLiked}
                        className={`flex items-center gap-1.5 mt-3 text-xs transition-colors group ${
                          userLiked 
                            ? 'text-red-500 cursor-default' 
                            : 'text-gray-400 hover:text-red-500'
                        }`}
                      >
                        <Heart className={`h-4 w-4 transition-all ${
                          userLiked 
                            ? 'fill-red-500' 
                            : 'group-hover:fill-red-500'
                        }`} />
                        <span>{post.likes || 0}</span>
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
