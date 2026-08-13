import React, { useState, useEffect, useCallback } from 'react';
import { CalendarCheck2, ClipboardCheck, AlertOctagon, CheckCircle2, Camera, Trash2, Users, Calendar, Send, ShieldAlert } from 'lucide-react';
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';

// ==========================================
// STANDARDIZED VENUE ASSET CHECKLISTS
// ==========================================
interface VenueAsset {
  id: string;
  name: string;
  category: string;
}

const VENUE_ASSET_CHECKLISTS: Record<string, VenueAsset[]> = {
  'v-grand-ballroom': [
    { id: 'ball-floor', name: 'Mahogany Dance Floor', category: 'Flooring & Surfaces' },
    { id: 'ball-chandeliers', name: 'Crystal Chandeliers', category: 'Decor & Fixtures' },
    { id: 'ball-tables', name: 'Banquet Tables', category: 'Furniture & Seating' },
    { id: 'ball-chairs', name: 'Dining Chairs', category: 'Furniture & Seating' },
    { id: 'ball-stage', name: 'Stage & Riser', category: 'Structure & Walls' },
    { id: 'ball-av', name: 'AV Projector & Screen', category: 'AV & Electrical' },
    { id: 'ball-sound', name: 'Sound System & Speakers', category: 'AV & Electrical' },
    { id: 'ball-bar', name: 'Private Bar Counter', category: 'Furniture & Seating' },
    { id: 'ball-sofas', name: 'VIP Lounge Sofas', category: 'Furniture & Seating' },
    { id: 'ball-carpet', name: 'Carpeting & Runners', category: 'Flooring & Surfaces' },
    { id: 'ball-windows', name: 'Floor-to-Ceiling Windows', category: 'Structure & Walls' },
    { id: 'ball-backstage', name: 'Backstage VIP Area', category: 'Structure & Walls' },
  ],
  'v-ashanti-estate': [
    { id: 'ash-courtyard', name: 'Arrival Courtyard Paving', category: 'Grounds & Outdoor' },
    { id: 'ash-fountain', name: 'Fountain Feature', category: 'Grounds & Outdoor' },
    { id: 'ash-bridal', name: 'Bridal Suite Interior', category: 'Structure & Walls' },
    { id: 'ash-patio', name: 'Patio Furniture', category: 'Furniture & Seating' },
    { id: 'ash-arch', name: 'Classical Archway & Columns', category: 'Structure & Walls' },
    { id: 'ash-lawn', name: 'Lawn & Landscaping', category: 'Grounds & Outdoor' },
    { id: 'ash-lighting', name: 'Exterior Lighting Fixtures', category: 'AV & Electrical' },
    { id: 'ash-gates', name: 'Exclusive Entrance Gates', category: 'Structure & Walls' },
  ],
  'v-klein-vineyards': [
    { id: 'klein-cellar', name: 'Wine Cellar Access Area', category: 'Structure & Walls' },
    { id: 'klein-decor', name: 'Rustic Tables & Decor', category: 'Decor & Fixtures' },
    { id: 'klein-lights', name: 'Fairy Lighting Strings', category: 'AV & Electrical' },
    { id: 'klein-pits', name: 'Outdoor Fire Pits', category: 'Grounds & Outdoor' },
    { id: 'klein-lawn', name: 'Vineyard Lawn & Pathways', category: 'Grounds & Outdoor' },
  ],
  'v-beach-pavilion': [
    { id: 'beach-deck', name: 'Wooden Decking', category: 'Grounds & Outdoor' },
    { id: 'beach-furniture', name: 'Beach Furniture & Loungers', category: 'Furniture & Seating' },
    { id: 'beach-torches', name: 'Tiki Torches', category: 'Decor & Fixtures' },
    { id: 'beach-lighting', name: 'Ambient Lighting', category: 'AV & Electrical' },
    { id: 'beach-sound', name: 'Outdoor Sound Equipment', category: 'AV & Electrical' },
  ],
  'v-garden-terrace': [
    { id: 'garden-marquee', name: 'Marquee Tent & Canopy', category: 'Grounds & Outdoor' },
    { id: 'garden-arches', name: 'Floral Arches', category: 'Decor & Fixtures' },
    { id: 'garden-seating', name: 'Outdoor Seating & Tables', category: 'Furniture & Seating' },
    { id: 'garden-water', name: 'Water Features', category: 'Grounds & Outdoor' },
    { id: 'garden-paving', name: 'Garden Paving & Paths', category: 'Grounds & Outdoor' },
    { id: 'garden-lawn', name: 'Lawn & Flora', category: 'Grounds & Outdoor' },
  ],
};

const DEFAULT_CHECKLIST: VenueAsset[] = [
  { id: 'gen-furniture', name: 'Furniture & Seating', category: 'Furniture & Seating' },
  { id: 'gen-tables', name: 'Event Tables', category: 'Furniture & Seating' },
  { id: 'gen-av', name: 'AV & Sound Equipment', category: 'AV & Electrical' },
  { id: 'gen-floor', name: 'Flooring & Surfaces', category: 'Flooring & Surfaces' },
  { id: 'gen-structure', name: 'Walls, Windows & Structure', category: 'Structure & Walls' },
  { id: 'gen-decor', name: 'Decor & Fixtures', category: 'Decor & Fixtures' },
  { id: 'gen-lighting', name: 'Lighting', category: 'AV & Electrical' },
  { id: 'gen-grounds', name: 'Lawn & Outdoor Areas', category: 'Grounds & Outdoor' },
];

const ASSET_CATEGORIES = [
  'Furniture & Seating',
  'AV & Electrical',
  'Structure & Walls',
  'Flooring & Surfaces',
  'Decor & Fixtures',
  'Grounds & Outdoor',
];

type Condition = 'good' | 'damaged' | 'missing';

interface FlaggedDetail {
  description: string;
  estimatedCost: number;
  photo: string;
  photoName: string;
}

const getLocalDate = (iso?: string) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
};

export function EventManagerDashboard() {
  const { user } = useAuth();

  const [bookings, setBookings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState<any | null>(null);
  const [conditions, setConditions] = useState<Record<string, Condition>>({});
  const [flaggedDetails, setFlaggedDetails] = useState<Record<string, FlaggedDetail>>({});
  const [generalNotes, setGeneralNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successModal, setSuccessModal] = useState<{ reportRef: string; total: number } | null>(null);

  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const snap = await getDocs(collection(db, 'event_bookings'));
        const data = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a: any, b: any) => String(b.eventDate || '').localeCompare(String(a.eventDate || '')));
        setBookings(data);
      } catch (error) {
        console.error("Error fetching event bookings:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchBookings();
  }, []);

  const checklist = selectedBooking?.venueId && VENUE_ASSET_CHECKLISTS[selectedBooking.venueId]
    ? VENUE_ASSET_CHECKLISTS[selectedBooking.venueId]
    : DEFAULT_CHECKLIST;

  const isPastEvent = useCallback((b: any) => {
    const date = b.eventDate ? new Date(b.eventDate) : null;
    return date ? date.getTime() < Date.now() : false;
  }, []);

  const damagedCount = checklist.filter(a => conditions[a.id] === 'damaged').length;
  const missingCount = checklist.filter(a => conditions[a.id] === 'missing').length;
  const flaggedCount = damagedCount + missingCount;
  const totalEstimatedCost = checklist.reduce((sum, a) => {
    if (conditions[a.id] === 'damaged' || conditions[a.id] === 'missing') {
      return sum + (Number(flaggedDetails[a.id]?.estimatedCost) || 0);
    }
    return sum;
  }, 0);

  const startInspection = (booking: any) => {
    setSelectedBooking(booking);
    setConditions({});
    setFlaggedDetails({});
    setGeneralNotes('');
    setErrorMessage(null);
  };

  const setCondition = (asset: VenueAsset, condition: Condition) => {
    setConditions(prev => ({ ...prev, [asset.id]: condition }));
    if (condition === 'good') {
      setFlaggedDetails(prev => {
        const next = { ...prev };
        delete next[asset.id];
        return next;
      });
    } else if (!flaggedDetails[asset.id]) {
      setFlaggedDetails(prev => ({
        ...prev,
        [asset.id]: { description: '', estimatedCost: 0, photo: '', photoName: '' },
      }));
    }
  };

  const updateFlaggedDetail = (assetId: string, field: keyof FlaggedDetail, value: string | number) => {
    setFlaggedDetails(prev => ({
      ...prev,
      [assetId]: { ...prev[assetId], [field]: value },
    }));
  };

  const handlePhotoUpload = (assetId: string, file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      updateFlaggedDetail(assetId, 'photo', String(reader.result || ''));
      updateFlaggedDetail(assetId, 'photoName', file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!selectedBooking) return;
    setErrorMessage(null);

    if (flaggedCount === 0) {
      setErrorMessage('No damaged or missing assets flagged. Mark at least one asset before submitting.');
      return;
    }

    const flaggedItems = checklist
      .filter(a => conditions[a.id] === 'damaged' || conditions[a.id] === 'missing')
      .map(a => {
        const detail = flaggedDetails[a.id] || { description: '', estimatedCost: 0, photo: '', photoName: '' };
        return {
          assetId: a.id,
          assetName: a.name,
          category: a.category,
          condition: conditions[a.id],
          description: detail.description || `${a.name} flagged as ${conditions[a.id]}`,
          estimatedCost: Number(detail.estimatedCost) || 0,
          photo: detail.photo,
          photoName: detail.photoName,
        };
      });

    if (flaggedItems.some(item => item.estimatedCost <= 0)) {
      setErrorMessage('Please enter an estimated repair cost for every flagged asset.');
      return;
    }

    const inspectionId = `INSP-${Math.floor(1000 + Math.random() * 9000)}`;
    setIsSubmitting(true);

    try {
      await addDoc(collection(db, 'damage_records'), {
        eventId: selectedBooking.id,
        bookingRef: selectedBooking.bookingRef || selectedBooking.id.slice(-6).toUpperCase(),
        guestId: selectedBooking.guestId || 'Unknown',
        guestEmail: selectedBooking.guestEmail || 'guest@example.com',
        venueId: selectedBooking.venueId || '',
        venueName: selectedBooking.venueName || 'Event Venue',
        eventDate: selectedBooking.eventDate || '',
        expectedAttendance: selectedBooking.expectedAttendance || 0,
        inspectorId: user?.uid || 'Unknown',
        inspectorName: user?.name || 'Event Manager',
        inspectorEmail: user?.email || 'events@azurehorizon.com',
        assignedTechnicianId: '',
        updatedByEmail: user?.email || 'events@azurehorizon.com',
        items: flaggedItems,
        generalNotes,
        totalCost: totalEstimatedCost,
        status: 'reported',
        inspectionId,
        damageFlagged: true,
        createdAt: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'event_bookings', selectedBooking.id), {
        damageRecorded: true,
        damageReportedAt: new Date().toISOString(),
        damagePenaltyTotal: totalEstimatedCost,
        damageInspectionId: inspectionId,
      });

      setSuccessModal({ reportRef: inspectionId, total: totalEstimatedCost });
      setSelectedBooking(null);
      setConditions({});
      setFlaggedDetails({});
      setGeneralNotes('');

      const refreshed = bookings.map((b: any) =>
        b.id === selectedBooking.id ? { ...b, damageRecorded: true, damagePenaltyTotal: totalEstimatedCost } : b
      );
      setBookings(refreshed);
    } catch (err: any) {
      console.error("Error submitting inspection:", err);
      setErrorMessage(err?.message || 'Failed to submit the event inspection. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center space-x-2 text-emerald-400 text-xs font-bold uppercase tracking-widest mb-2">
          <CalendarCheck2 className="w-4 h-4" />
          <span>Azure Horizon Events & Venue Protection</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white">Event Manager Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">
          Inspect completed events against the standardized venue asset checklist, flag damage with photo proof, and report to Admin.
        </p>
      </div>

      {/* OVERVIEW STATS */}
      <div className="max-w-7xl mx-auto mb-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Event Bookings</p>
          <p className="text-3xl font-black text-white mt-1">{bookings.length}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Completed Events (Inspectable)</p>
          <p className="text-3xl font-black text-white mt-1">{bookings.filter(isPastEvent).length}</p>
        </div>
        <div className="bg-slate-800/60 border border-rose-500/30 rounded-xl p-5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Events Flagged: Damage Recorded</p>
          <p className="text-3xl font-black text-rose-400 mt-1">{bookings.filter((b: any) => b.damageRecorded).length}</p>
        </div>
      </div>

      {!selectedBooking ? (
        <div className="max-w-7xl mx-auto">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center space-x-2">
            <ClipboardCheck className="w-5 h-5 text-emerald-400" />
            <span>Completed Events Queue</span>
          </h2>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-24 bg-slate-800/50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : bookings.length === 0 ? (
            <div className="bg-slate-800/40 border border-dashed border-slate-700/60 p-10 rounded-xl text-center text-slate-400">
              No event bookings found. Events booked by guests will appear here for inspection once completed.
            </div>
          ) : (
            <div className="space-y-3">
              {bookings.map((b: any) => {
                const past = isPastEvent(b);
                return (
                  <div
                    key={b.id}
                    className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-emerald-500/40 transition-all"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center flex-wrap gap-2">
                        <h3 className="text-base font-bold text-white">{b.venueName || 'Event Venue'}</h3>
                        {b.damageRecorded && (
                          <Badge className="bg-rose-500/20 text-rose-400 border border-rose-500/40">
                            <ShieldAlert className="h-3 w-3 mr-1" /> Damage Recorded
                          </Badge>
                        )}
                        {!b.damageRecorded && past && (
                          <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Ready to Inspect
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" /> {getLocalDate(b.eventDate) || 'Date TBC'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" /> {b.expectedAttendance || 0} guests
                        </span>
                        <span className="font-mono">REF: {b.bookingRef || b.id.slice(-6).toUpperCase()}</span>
                        {b.damagePenaltyTotal > 0 && (
                          <span className="text-rose-400 font-bold font-mono">
                            Penalty: R {b.damagePenaltyTotal.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => startInspection(b)}
                      disabled={!past && !b.damageRecorded}
                      className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-2 ${
                        past || b.damageRecorded
                          ? 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/20'
                          : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      <ClipboardCheck className="w-4 h-4" />
                      <span>{b.damageRecorded ? 'Re-Inspect Event' : 'Start Inspection'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="max-w-7xl mx-auto">
          {/* INSPECTION HEADER */}
          <div className="mb-6 bg-slate-800/80 border border-emerald-500/40 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Post-Event Venue Inspection</p>
              <h2 className="text-xl font-bold text-white mt-1">{selectedBooking.venueName || 'Event Venue'}</h2>
              <p className="text-xs text-slate-400 mt-1">
                {getLocalDate(selectedBooking.eventDate)} · {selectedBooking.expectedAttendance || 0} guests ·
                REF: {selectedBooking.bookingRef || selectedBooking.id.slice(-6).toUpperCase()}
              </p>
            </div>
            <button
              onClick={() => setSelectedBooking(null)}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-bold"
            >
              Back to Event Queue
            </button>
          </div>

          {/* ASSET CHECKLIST */}
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <ClipboardCheck className="w-5 h-5 text-emerald-400" />
                <span>Standardized Venue Asset Checklist</span>
              </h3>
              <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-full">
                {flaggedCount} Flagged · Est. Penalty R {totalEstimatedCost.toLocaleString()}
              </span>
            </div>

            <div className="text-xs text-slate-400 mb-5 p-3 bg-slate-900/60 border border-slate-700/50 rounded-lg">
              Tap each asset to mark its condition. Flagged assets (<span className="text-rose-400 font-bold">Damaged</span> or{' '}
              <span className="text-amber-400 font-bold">Missing</span>) require a description, estimated repair cost, and photo proof.
            </div>

            {ASSET_CATEGORIES.map(category => {
              const assets = checklist.filter(a => a.category === category);
              if (assets.length === 0) return null;
              return (
                <div key={category} className="mb-6">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{category}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {assets.map(asset => {
                      const condition = conditions[asset.id] || 'good';
                      const detail = flaggedDetails[asset.id];
                      const flagged = condition === 'damaged' || condition === 'missing';
                      return (
                        <div
                          key={asset.id}
                          className={`border rounded-xl p-4 transition-all ${
                            flagged ? 'border-rose-500/50 bg-rose-500/5' : 'border-slate-700/60 bg-slate-900/40'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-white">{asset.name}</p>
                            <div className="flex bg-slate-800 rounded-lg p-0.5 shrink-0">
                              <button
                                onClick={() => setCondition(asset, 'good')}
                                className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${
                                  condition === 'good' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'
                                }`}
                              >
                                GOOD
                              </button>
                              <button
                                onClick={() => setCondition(asset, 'damaged')}
                                className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${
                                  condition === 'damaged' ? 'bg-rose-500 text-white' : 'text-slate-400 hover:text-white'
                                }`}
                              >
                                DAMAGED
                              </button>
                              <button
                                onClick={() => setCondition(asset, 'missing')}
                                className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${
                                  condition === 'missing' ? 'bg-amber-500 text-white' : 'text-slate-400 hover:text-white'
                                }`}
                              >
                                MISSING
                              </button>
                            </div>
                          </div>

                          {flagged && detail && (
                            <div className="mt-3 space-y-3">
                              <input
                                type="text"
                                value={detail.description}
                                onChange={(e) => updateFlaggedDetail(asset.id, 'description', e.target.value)}
                                placeholder={`Describe the ${condition === 'damaged' ? 'damage' : 'missing item'}...`}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white placeholder:text-slate-600"
                              />
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-[10px] text-slate-400 mb-1">Est. Repair / Replacement Cost (ZAR)</label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={detail.estimatedCost || ''}
                                    onChange={(e) => updateFlaggedDetail(asset.id, 'estimatedCost', Number(e.target.value))}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-emerald-400 font-mono font-bold"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] text-slate-400 mb-1">Photo Proof</label>
                                  {detail.photo ? (
                                    <div className="relative inline-block">
                                      <img src={detail.photo} alt="Damage proof" className="h-12 w-20 object-cover rounded-lg border border-slate-600" />
                                      <button
                                        onClick={() => updateFlaggedDetail(asset.id, 'photo', '')}
                                        className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1"
                                        title="Remove photo"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ) : (
                                    <label className="flex items-center gap-2 bg-slate-900 border border-dashed border-slate-700 rounded-lg p-2 text-[11px] text-slate-400 hover:border-emerald-500/50 cursor-pointer">
                                      <Camera className="w-4 h-4" /> Upload Photo
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => handlePhotoUpload(asset.id, e.target.files?.[0] || null)}
                                      />
                                    </label>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="mt-4">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Inspector Observations</label>
              <textarea
                rows={3}
                value={generalNotes}
                onChange={(e) => setGeneralNotes(e.target.value)}
                placeholder="Record overall venue condition, turnover status, and any notes for the Admin adjudicator..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-sm placeholder:text-slate-600"
              />
            </div>

            {errorMessage && (
              <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs flex items-center space-x-2">
                <AlertOctagon className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-sm">
                <span className="text-slate-400">Total Estimated Damage Penalty: </span>
                <span className="font-black text-rose-400 text-xl">R {totalEstimatedCost.toLocaleString()}</span>
              </div>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || flaggedCount === 0}
                className={`px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center space-x-2 ${
                  isSubmitting || flaggedCount === 0
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/30'
                }`}
              >
                {isSubmitting ? (
                  <span>Submitting Inspection...</span>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Submit Report & Flag Booking (Damage Recorded)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {successModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-emerald-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white">Damage Recorded</h3>
            <p className="text-xs text-slate-400">
              Inspection report <strong className="text-emerald-400">{successModal.reportRef}</strong> submitted. The event booking has
              been flagged as <strong className="text-rose-400">Damage Recorded</strong> with an estimated penalty of{' '}
              <strong className="text-rose-400">R {successModal.total.toLocaleString()}</strong>.
            </p>
            <div className="bg-slate-900 p-3 rounded-xl text-xs text-emerald-400">
              Report sent to Admin for adjudication in the Damage Claims tab.
            </div>
            <button
              onClick={() => setSuccessModal(null)}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg font-bold text-xs"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
