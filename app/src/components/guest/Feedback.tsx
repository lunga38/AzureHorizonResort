import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/services/firebase-services';
import { collection, addDoc, onSnapshot, query, orderBy, limit, getDocs, where } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AlertModal } from '@/components/ui/AlertModal';
import { Star, ChevronLeft, Loader2, BedDouble, UtensilsCrossed, Compass, Sparkles, MessageCircle, TrendingUp, Users, ThumbsUp, Lock, Tag, ShieldCheck } from 'lucide-react';

import type { User as AppUser } from '@/types';

type AuthUserBridge = AppUser & { uid?: string };

interface FeedbackProps {
  onBack: () => void;
}

interface Review {
  id: string;
  guestId: string;
  guestName: string;
  category: string;
  rating: number;
  comments?: string;
  createdAt: string;
  helpful?: number;
  managementResponse?: string;
}

// Helper to extract common positive words from reviews
const getHighlights = (reviews: Review[]) => {
  const words = reviews
    .filter(r => r.rating >= 4 && r.comments)
    .flatMap(r => r.comments!.toLowerCase().replace(/[.,!]/g, '').split(' '))
    .filter(w => w.length > 4 && !['there', 'where', 'their', 'about', 'would', 'could'].includes(w));
  
  const counts = words.reduce((acc, w) => { acc[w] = (acc[w] || 0) + 1; return acc; }, {} as Record<string, number>);
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(entry => entry[0].charAt(0).toUpperCase() + entry[0].slice(1));
};

const CATEGORIES = [
  { id: 'room', label: 'Room & Stay', icon: BedDouble, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/30', ring: 'ring-blue-200 dark:ring-blue-800' },
  { id: 'restaurant', label: 'Dining', icon: UtensilsCrossed, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/30', ring: 'ring-orange-200 dark:ring-orange-800' },
  { id: 'tour', label: 'Tours & Excursions', icon: Compass, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/30', ring: 'ring-amber-200 dark:ring-amber-800' },
  { id: 'spa', label: 'Spa Services', icon: Sparkles, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/30', ring: 'ring-purple-200 dark:ring-purple-800' },
];

const CATEGORY_MAP: Record<string, typeof CATEGORIES[0]> = {};
CATEGORIES.forEach(c => CATEGORY_MAP[c.id] = c);

const RATING_LABELS: Record<number, string> = {
  1: 'Terrible',
  2: 'Poor',
  3: 'Average',
  4: 'Very Good',
  5: 'Excellent',
};

function timeAgo(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-rose-500',
  'bg-amber-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-pink-500',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function Feedback({ onBack }: FeedbackProps) {
  const { user } = useAuth();
  const currentUser = user as AuthUserBridge;

  // Tab state
  const [activeTab, setActiveTab] = useState<'browse' | 'write'>('browse');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  // Write form state
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [comments, setComments] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reviews state
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoadingReviews, setIsLoadingReviews] = useState(true);
  const [eligibleCategories, setEligibleCategories] = useState<Set<string>>(new Set());
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(true);

  const [alert, setAlert] = useState({
    open: false,
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'warning'
  });

  // Listen to reviews in real-time
  useEffect(() => {
    const q = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Review));
      setReviews(data);
      setIsLoadingReviews(false);
    }, () => {
      setIsLoadingReviews(false);
    });
    return () => unsubscribe();
  }, []);

  // Check which services the guest has actually used
  useEffect(() => {
    const guestId = currentUser?.id || currentUser?.uid;
    if (!guestId) { setIsCheckingEligibility(false); return; }

    const checkEligibility = async () => {
      const eligible = new Set<string>();
      try {
        // Room bookings (checked_in or checked_out)
        const roomSnap = await getDocs(query(collection(db, 'bookings'), where('guestId', '==', guestId)));
        if (!roomSnap.empty) eligible.add('room');

        // Tour bookings
        const tourSnap = await getDocs(query(collection(db, 'tour_bookings'), where('guestId', '==', guestId)));
        if (!tourSnap.empty) eligible.add('tour');

        // Spa bookings
        const spaSnap = await getDocs(query(collection(db, 'spa_bookings'), where('guestId', '==', guestId)));
        if (!spaSnap.empty) eligible.add('spa');

        // Restaurant orders
        const diningSnap = await getDocs(query(collection(db, 'order_confirmations'), where('guestId', '==', guestId)));
        if (!diningSnap.empty) eligible.add('restaurant');
      } catch (e) {
        console.error('Eligibility check error:', e);
      }
      setEligibleCategories(eligible);
      setIsCheckingEligibility(false);
    };
    checkEligibility();
  }, [currentUser]);

  // Computed stats
  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : '0.0';
  const ratingDistribution = [5, 4, 3, 2, 1].map(star => ({
    star,
    count: reviews.filter(r => r.rating === star).length,
    pct: reviews.length > 0 ? Math.round((reviews.filter(r => r.rating === star).length / reviews.length) * 100) : 0,
  }));

  const filteredReviews = filterCategory === 'all'
    ? reviews
    : reviews.filter(r => r.category === filterCategory);

  const handleSubmit = async () => {
    if (!selectedCategory) {
      setAlert({ open: true, title: 'Missing Information', message: 'Please select a category to review.', type: 'warning' });
      return;
    }
    if (rating === 0) {
      setAlert({ open: true, title: 'Missing Information', message: 'Please provide a star rating.', type: 'warning' });
      return;
    }

    setIsSubmitting(true);
    try {
      const reviewData = {
        guestId: currentUser?.id || currentUser?.uid || 'anonymous',
        guestName: currentUser?.name || 'Anonymous Guest',
        category: selectedCategory,
        rating,
        comments,
        createdAt: new Date().toISOString(),
        helpful: 0,
      };

      await addDoc(collection(db, 'reviews'), reviewData);

      setAlert({
        open: true,
        title: 'Thank You!',
        message: 'Your feedback has been submitted successfully. You can see it in the community reviews!',
        type: 'success'
      });

      // Reset form
      setSelectedCategory(null);
      setRating(0);
      setComments('');
      setActiveTab('browse');
    } catch (error) {
      console.error('Error submitting review:', error);
      setAlert({
        open: true,
        title: 'Submission Failed',
        message: 'There was an error submitting your review. Please try again.',
        type: 'error'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">
      <AlertModal
        open={alert.open}
        onClose={() => setAlert(prev => ({ ...prev, open: false }))}
        title={alert.title}
        message={alert.message}
        type={alert.type}
      />

      <Button variant="ghost" onClick={onBack} className="text-[#1e3a5f] dark:text-blue-400 hover:bg-[#1e3a5f]/5 dark:hover:bg-blue-400/10 -ml-4">
        <ChevronLeft className="mr-2 h-4 w-4" /> Back to Dashboard
      </Button>

      <div>
        <h1 className="text-3xl font-serif font-bold text-[#1e3a5f] dark:text-white">Reviews & Ratings</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">See what other guests are saying, or share your own experience.</p>
      </div>

      {/* ───── Stats Summary Bar ───── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-none shadow-sm bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-800/40 flex items-center justify-center">
              <Star className="h-6 w-6 text-amber-500 fill-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{avgRating}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Average Rating</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-800/40 flex items-center justify-center">
              <MessageCircle className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{reviews.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total Reviews</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-800/40 flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {reviews.length > 0 ? Math.round((reviews.filter(r => r.rating >= 4).length / reviews.length) * 100) : 0}%
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Satisfaction</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-800/40 flex items-center justify-center">
              <Users className="h-6 w-6 text-violet-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {new Set(reviews.map(r => r.guestId)).size}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Guest Reviewers</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ───── Tab Switcher ───── */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-slate-700">
        <button
          onClick={() => setActiveTab('browse')}
          className={`px-5 py-3 text-sm font-semibold transition-all border-b-2 -mb-px ${
            activeTab === 'browse'
              ? 'border-[#1e3a5f] text-[#1e3a5f] dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
          }`}
        >
          <MessageCircle className="inline h-4 w-4 mr-2 -mt-0.5" />
          Community Reviews ({reviews.length})
        </button>
        <button
          onClick={() => setActiveTab('write')}
          className={`px-5 py-3 text-sm font-semibold transition-all border-b-2 -mb-px ${
            activeTab === 'write'
              ? 'border-[#1e3a5f] text-[#1e3a5f] dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
          }`}
        >
          <Star className="inline h-4 w-4 mr-2 -mt-0.5" />
          Write a Review
        </button>
      </div>

      {/* ═══════ BROWSE TAB ═══════ */}
      {activeTab === 'browse' && (
        <div className="grid lg:grid-cols-[280px_1fr] gap-6">
          {/* Sidebar — Rating Breakdown + Filter */}
          <div className="space-y-5">
            {/* Rating Breakdown */}
            <Card className="border-none shadow-sm bg-white dark:bg-slate-900">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-gray-900 dark:text-white">Rating Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {ratingDistribution.map(({ star, count, pct }) => (
                  <div key={star} className="flex items-center gap-2 text-sm">
                    <span className="w-6 text-right font-medium text-gray-700 dark:text-gray-300">{star}</span>
                    <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                    <div className="flex-1 h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-400 rounded-full transition-all duration-700"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-xs text-gray-400 dark:text-gray-500">{count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Category Filter */}
            <Card className="border-none shadow-sm bg-white dark:bg-slate-900">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-gray-900 dark:text-white">Filter by Service</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                <button
                  onClick={() => setFilterCategory('all')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filterCategory === 'all'
                      ? 'bg-[#1e3a5f] text-white'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800'
                  }`}
                >
                  All Categories ({reviews.length})
                </button>
                {CATEGORIES.map(cat => {
                  const count = reviews.filter(r => r.category === cat.id).length;
                  const Icon = cat.icon;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setFilterCategory(cat.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
                        filterCategory === cat.id
                          ? 'bg-[#1e3a5f] text-white'
                          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${filterCategory === cat.id ? 'text-white' : cat.color}`} />
                      {cat.label} ({count})
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            {/* Highlights */}
            {reviews.length > 0 && (
              <Card className="border-none shadow-sm bg-white dark:bg-slate-900 mt-4">
                <CardContent className="p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-3 text-sm flex items-center gap-2">
                    <Tag className="h-4 w-4 text-[#1e3a5f] dark:text-blue-400" /> Review Highlights
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {getHighlights(reviews).map(word => (
                      <Badge key={word} variant="secondary" className="bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        {word}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Reviews Feed */}
          <div className="space-y-4">
            {isLoadingReviews ? (
              <Card className="border-none shadow-sm bg-white dark:bg-slate-900">
                <CardContent className="p-12 flex justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[#1e3a5f] dark:text-blue-400" />
                </CardContent>
              </Card>
            ) : filteredReviews.length === 0 ? (
              <Card className="border-dashed border-2 border-gray-200 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-900/50">
                <CardContent className="p-12 text-center">
                  <MessageCircle className="h-12 w-12 text-gray-300 dark:text-slate-600 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400 font-medium">No reviews yet in this category.</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Be the first to share your experience!</p>
                  <Button className="mt-4 bg-[#1e3a5f] hover:bg-[#163058]" onClick={() => setActiveTab('write')}>
                    Write a Review
                  </Button>
                </CardContent>
              </Card>
            ) : (
              filteredReviews.map((review) => {
                const cat = CATEGORY_MAP[review.category];
                const CatIcon = cat?.icon || Star;
                return (
                  <Card key={review.id} className="border-none shadow-sm bg-white dark:bg-slate-900 hover:shadow-md transition-shadow group">
                    <CardContent className="p-5">
                      <div className="flex items-start gap-4">
                        {/* Avatar */}
                        <div className={`w-10 h-10 rounded-full ${getAvatarColor(review.guestName)} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
                          {getInitials(review.guestName)}
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* Header row */}
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900 dark:text-white text-sm">{review.guestName}</span>
                              <span className="text-xs text-gray-400 dark:text-gray-500">•</span>
                              <span className="text-xs text-gray-400 dark:text-gray-500">{timeAgo(review.createdAt)}</span>
                            </div>
                            {cat && (
                              <Badge variant="outline" className={`text-xs ${cat.bg} ${cat.color} border-none font-medium flex items-center gap-1`}>
                                <CatIcon className="h-3 w-3" />
                                {cat.label}
                              </Badge>
                            )}
                          </div>

                          {/* Stars */}
                          <div className="flex items-center gap-1 mt-1.5">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={`h-4 w-4 ${
                                  s <= review.rating
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'text-gray-200 dark:text-slate-600'
                                }`}
                              />
                            ))}
                            <span className="ml-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                              {RATING_LABELS[review.rating] || ''}
                            </span>
                          </div>

                          {/* Comment */}
                          {review.comments && (
                            <p className="mt-2.5 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                              "{review.comments}"
                            </p>
                          )}

                          {/* Management Response */}
                          {(review as any).managementResponse && (
                            <div className="mt-3 bg-gray-50 dark:bg-slate-800 p-3 rounded-lg border-l-2 border-[#1e3a5f] dark:border-blue-400">
                              <p className="text-xs font-bold text-[#1e3a5f] dark:text-blue-400 flex items-center gap-1 mb-1">
                                <ShieldCheck className="h-3 w-3" /> Management Response
                              </p>
                              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                                "{(review as any).managementResponse}"
                              </p>
                            </div>
                          )}

                          {/* Helpful */}
                          <div className="mt-3 flex items-center gap-3">
                            <button className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors">
                              <ThumbsUp className="h-3.5 w-3.5" />
                              Helpful {review.helpful ? `(${review.helpful})` : ''}
                            </button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ═══════ WRITE TAB ═══════ */}
      {activeTab === 'write' && (
        <Card className="border-none shadow-lg overflow-hidden bg-white dark:bg-slate-900">
          <CardHeader className="bg-gray-50 dark:bg-slate-800 border-b dark:border-slate-700 pb-8">
            <CardTitle className="text-gray-900 dark:text-white">What would you like to review?</CardTitle>
            <CardDescription className="dark:text-gray-400">Select the aspect of your stay you want to provide feedback on.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-8">
            {/* Categories */}
            {isCheckingEligibility ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-[#1e3a5f] dark:text-blue-400" /></div>
            ) : eligibleCategories.size === 0 ? (
              <div className="text-center py-8 px-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
                <Lock className="h-8 w-8 text-amber-500 mx-auto mb-3" />
                <p className="font-semibold text-gray-900 dark:text-white">No Services Used Yet</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">You can only review services you've actually booked or used. Book a room, tour, spa treatment, or place a dining order first!</p>
              </div>
            ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {CATEGORIES.map(category => {
                const isSelected = selectedCategory === category.id;
                const isEligible = eligibleCategories.has(category.id);
                const Icon = category.icon;
                return (
                  <div
                    key={category.id}
                    onClick={() => isEligible && setSelectedCategory(category.id)}
                    className={`rounded-xl border-2 p-4 flex flex-col items-center justify-center gap-3 transition-all duration-200 relative ${
                      !isEligible
                        ? 'border-transparent bg-gray-100 dark:bg-slate-800/50 opacity-50 cursor-not-allowed'
                        : isSelected
                          ? 'border-[#1e3a5f] dark:border-blue-400 bg-[#1e3a5f]/5 dark:bg-blue-400/10 shadow-sm scale-[1.02] cursor-pointer'
                          : 'border-transparent bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 hover:scale-[1.02] cursor-pointer'
                    }`}
                  >
                    {!isEligible && (
                      <div className="absolute top-2 right-2">
                        <Lock className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                      </div>
                    )}
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${category.bg} ${category.color}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <span className={`text-sm font-medium text-center ${!isEligible ? 'text-gray-400 dark:text-gray-500' : isSelected ? 'text-[#1e3a5f] dark:text-blue-400' : 'text-gray-600 dark:text-gray-300'}`}>
                      {category.label}
                    </span>
                    {!isEligible && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">No booking found</span>
                    )}
                  </div>
                );
              })}
            </div>
            )}

            {/* Rating */}
            <div className="space-y-3 pt-4 border-t dark:border-slate-700">
              <Label className="text-base font-semibold text-gray-900 dark:text-white">How would you rate your experience?</Label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setRating(star)}
                    className="focus:outline-none transition-transform hover:scale-110"
                  >
                    <Star
                      className={`h-10 w-10 ${
                        star <= (hoverRating || rating)
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-gray-200 dark:text-slate-600'
                      } transition-colors`}
                    />
                  </button>
                ))}
              </div>
              {rating > 0 && (
                <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                  {RATING_LABELS[rating]}
                </p>
              )}
            </div>

            {/* Comments */}
            <div className="space-y-3 pt-4 border-t dark:border-slate-700">
              <Label className="text-base font-semibold text-gray-900 dark:text-white">Additional Comments (Optional)</Label>
              <Textarea
                placeholder="Tell us what you loved or what we could improve..."
                className="min-h-[120px] resize-none dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
              />
            </div>

            <Button
              className="w-full bg-[#1e3a5f] hover:bg-[#163058] h-12 text-lg"
              onClick={handleSubmit}
              disabled={isSubmitting || !selectedCategory || rating === 0}
            >
              {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : null}
              Submit Review
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
