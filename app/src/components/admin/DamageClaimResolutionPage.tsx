import React, { useState, useEffect } from 'react';
import { Gavel, CheckCircle2, AlertCircle, ShieldCheck, Camera, Wrench } from 'lucide-react';
import { collection, doc, updateDoc, onSnapshot, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// --- CONSTANT OBJECT REPLACING ENUMS TO SATISFY ERASABLE SYNTAX ---
const ClaimDecision = {
  APPROVED_FULL_CHARGE: 'APPROVED_FULL_CHARGE',
  PARTIAL_WAIVER: 'PARTIAL_WAIVER',
  FULL_WAIVER: 'FULL_WAIVER',
  APPEAL_REJECTED: 'APPEAL_REJECTED'
} as const;

type ClaimDecisionType = typeof ClaimDecision[keyof typeof ClaimDecision];

export const DamageClaimResolutionPage: React.FC = () => {
  const [claims, setClaims] = useState<any[]>([]);
  const [isClaimsLoading, setIsClaimsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedClaim, setSelectedClaim] = useState<any | null>(null);
  const [decision, setDecision] = useState<ClaimDecisionType>(ClaimDecision.APPROVED_FULL_CHARGE);
  const [finalAmount, setFinalAmount] = useState<number>(0);
  const [resolutionReason, setResolutionReason] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successModal, setSuccessModal] = useState<{ claimRef: string; amount: number } | null>(null);
  const [maintenanceStaff, setMaintenanceStaff] = useState<any[]>([]);
  const [selectedTechnician, setSelectedTechnician] = useState<string>('');

  useEffect(() => {
    const fetchMaintenanceStaff = async () => {
      try {
        const q = query(collection(db, 'users'), where('role', '==', 'maintenance'));
        const snap = await getDocs(q);
        setMaintenanceStaff(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error fetching maintenance staff:", error);
      }
    };
    fetchMaintenanceStaff();
  }, []);

 useEffect(() => {
    // We fetch everything and filter in memory to prevent ANY Firebase Index errors during your demo
    const q = query(collection(db, 'damage_records'));
    const unsubscribe = onSnapshot(q, (snap) => {
      // 🚨 ADDED "as any" HERE TO SILENCE THE TYPESCRIPT ERROR
      const allRecords = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      // Filter out records that are already 'resolved' so we only see pending/in_repair items
      const activeClaims = allRecords.filter(record => 
        record.status !== 'resolved' && record.status !== 'RESOLVED'
      );
      
      setClaims(activeClaims);
      setIsClaimsLoading(false);
    }, (error) => {
      console.error("Error fetching damage records:", error);
      setIsClaimsLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  const handleSelectClaim = (claim: any) => {
    setSelectedClaim(claim);
    // 🚨 UPDATED: Maps to totalCost from your database
    setFinalAmount(claim.totalCost || claim.estimatedCost || 0);
    setDecision(ClaimDecision.APPROVED_FULL_CHARGE);
    setResolutionReason('After reviewing maintenance evidence, full repair costs are confirmed.');
    setSelectedTechnician(claim.assignedTechnicianId || '');
    setErrorMessage(null);
  };

  const handleDecisionChange = (d: ClaimDecisionType) => {
    setDecision(d);
    if (!selectedClaim) return;

    const baseAmount = selectedClaim.totalCost || selectedClaim.estimatedCost || 0;

    if (d === ClaimDecision.FULL_WAIVER) {
      setFinalAmount(0);
    } else if (d === ClaimDecision.PARTIAL_WAIVER) {
      setFinalAmount(Math.round(baseAmount * 0.5));
    } else {
      setFinalAmount(baseAmount);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClaim) return;
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      // 🚨 UPDATED: Updating the correct collection
      const claimRef = doc(db, 'damage_records', selectedClaim.id);
      await updateDoc(claimRef, {
        status: 'resolved', // Lowercase to match your DB style
        decision: decision,
        finalAssessedAmount: Number(finalAmount),
        resolutionReason: resolutionReason,
        assignedTechnicianId: selectedTechnician,
        resolvedAt: new Date().toISOString(), // Saving as ISO string to match your DB format
        updatedAt: serverTimestamp()
      });

      const displayRef = selectedClaim.inspectionId || `CLM-${selectedClaim.id.slice(-6).toUpperCase()}`;
      setSuccessModal({ claimRef: displayRef, amount: Number(finalAmount) });
      setSelectedClaim(null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to resolve damage claim.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center space-x-2 text-indigo-400 text-xs font-bold uppercase tracking-widest mb-2">
          <Gavel className="w-4 h-4" />
          <span>Azure Horizon Claims Adjudication</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white">Damage Claims Review</h1>
        <p className="text-slate-400 text-sm mt-1">
          Review venue maintenance reports, adjudicate guest liability, and issue final invoices or waivers.
        </p>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-xl font-bold text-white">Pending & Open Claims Roster</h2>

          {isClaimsLoading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="h-32 bg-slate-800/50 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : claims.length === 0 ? (
             <div className="bg-slate-800/40 border border-dashed border-slate-700/60 p-8 rounded-xl text-center text-slate-400">
               No pending damage claims to adjudicate.
             </div>
          ) : (
            <div className="space-y-4">
              {claims.map((claim: any) => {
                // 🚨 UPDATED: Fallback mappings to catch exact DB fields
                const displayRef = claim.inspectionId || `CLM-${claim.id.slice(-6).toUpperCase()}`;
                const eventRef = claim.eventId || claim.bookingRef || 'Unknown Event';
                const guestDisplay = claim.updatedByEmail || claim.guestEmail || claim.guestId || 'Unknown Guest';
                const claimTotal = claim.totalCost || claim.totalClaimAmount || 0;

                return (
                  <div
                    key={claim.id}
                    className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 shadow-xl hover:border-indigo-500/50 transition-all flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-3">
                        <span className="text-xs font-mono font-bold text-indigo-400">{displayRef}</span>
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase">
                          {claim.status}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-white">Event Booking REF: {eventRef}</p>
                      <p className="text-xs text-slate-400">Guest: {guestDisplay}</p>
                      <p className="text-xs text-slate-500">Inspected by: {claim.inspectorName || claim.inspectorEmail || 'Event Manager'} · {claim.venueName || ''}</p>
                    </div>

                    <div className="flex items-center space-x-6">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 uppercase block font-bold">Claimed Repair Amount</span>
                        <span className="text-lg font-black text-rose-400">R {claimTotal.toLocaleString()}</span>
                      </div>
                      <button
                        onClick={() => handleSelectClaim(claim)}
                        className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white rounded-lg text-xs font-bold transition-all shadow-md"
                      >
                        Adjudicate Claim
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
              <span>Adjudication Policy</span>
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              All damage claims are backed by Event Manager post-event inspections using the standardized venue asset checklist, with photo evidence. Partial or full waivers may be granted for pre-existing wear or resort guest loyalty status.
            </p>
          </div>
        </div>
      </div>

      {selectedClaim && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5">
            <h3 className="text-xl font-bold text-white">Adjudicate Claim {selectedClaim.inspectionId || selectedClaim.id.slice(-6).toUpperCase()}</h3>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700/50 space-y-2">
                <div className="flex justify-between text-slate-400">
                  <span>Guest Account:</span>
                  <span className="text-white font-bold">{selectedClaim.updatedByEmail || selectedClaim.guestId}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Inspected By:</span>
                  <span className="text-white font-bold">{selectedClaim.inspectorName || selectedClaim.inspectorEmail || 'Event Manager'}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Initial Damage Cost:</span>
                  <span className="text-rose-400 font-bold">R {(selectedClaim.totalCost || 0).toLocaleString()}</span>
                </div>
              </div>

              {(selectedClaim.items?.length > 0) && (
                <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700/50">
                  <p className="text-slate-300 font-bold mb-2 flex items-center space-x-1.5">
                    <Camera className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Inspected Assets & Photo Evidence ({selectedClaim.items.length})</span>
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {selectedClaim.items.map((item: any, i: number) => (
                      <div key={i} className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-2.5 flex items-start gap-3">
                        {item.photo || item.photoUrl ? (
                          <img src={item.photo || item.photoUrl} alt={item.assetName || 'Damage proof'} className="h-14 w-20 object-cover rounded-lg border border-slate-600 shrink-0" />
                        ) : (
                          <div className="h-14 w-20 bg-slate-900 rounded-lg border border-dashed border-slate-700 flex items-center justify-center text-slate-600 shrink-0">
                            No photo
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-white font-bold">{item.assetName || item.name || 'Asset'}</p>
                          <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 uppercase mr-1">
                            {item.condition || 'DAMAGED'}
                          </span>
                          <span className="text-slate-400">{item.category}</span>
                          <p className="text-slate-400 mt-0.5 truncate">{item.description}</p>
                          <p className="text-rose-400 font-mono font-bold">R {(item.estimatedCost || 0).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-slate-400 mb-1 font-medium flex items-center space-x-1.5">
                  <Wrench className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Assign Maintenance Technician</span>
                </label>
                <select
                  value={selectedTechnician}
                  onChange={(e) => setSelectedTechnician(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white font-bold"
                >
                  <option value="">-- Select Technician --</option>
                  {maintenanceStaff.map((tech: any) => (
                    <option key={tech.id || tech.email} value={tech.email || tech.name}>
                      {tech.name} ({tech.email})
                    </option>
                  ))}
                  <option value="Thabo Mbeki">Thabo Mbeki (t.mbeki@azurehorizon.com)</option>
                  <option value="Kevin Du Preez">Kevin Du Preez (k.dupreez@azurehorizon.com)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Adjudication Decision</label>
                <select
                  value={decision}
                  onChange={(e) => handleDecisionChange(e.target.value as ClaimDecisionType)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white font-bold"
                >
                  <option value={ClaimDecision.APPROVED_FULL_CHARGE}>APPROVED - Full Guest Charge</option>
                  <option value={ClaimDecision.PARTIAL_WAIVER}>PARTIAL WAIVER - 50% Resort Subsidy</option>
                  <option value={ClaimDecision.FULL_WAIVER}>FULL WAIVER - 100% Resort Courtesy</option>
                  <option value={ClaimDecision.APPEAL_REJECTED}>REJECTED APPEAL - Enforce Deposit</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Final Assessed Amount (ZAR)</label>
                <input
                  type="number"
                  value={finalAmount}
                  onChange={(e) => setFinalAmount(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-emerald-400 font-mono font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Resolution Rationale & Official Reason</label>
                <textarea
                  rows={3}
                  value={resolutionReason}
                  onChange={(e) => setResolutionReason(e.target.value)}
                  placeholder="Record formal justification for invoice statement..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
                  required
                />
              </div>

              {errorMessage && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedClaim(null)}
                  className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-indigo-500 hover:bg-indigo-400 text-white rounded-lg font-bold flex items-center justify-center space-x-2"
                >
                  {isSubmitting ? <span>Executing Ruling...</span> : <span>Confirm Final Ruling</span>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {successModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-indigo-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 bg-indigo-500/20 border border-indigo-500/40 rounded-full flex items-center justify-center mx-auto text-indigo-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white">Claim Adjudicated!</h3>
            <p className="text-xs text-slate-400">
              Claim <strong>{successModal.claimRef}</strong> resolved with final charge: <strong>R {successModal.amount.toLocaleString()}</strong>.
            </p>
            <button
              onClick={() => setSuccessModal(null)}
              className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-400 text-white rounded-lg font-bold text-xs"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};