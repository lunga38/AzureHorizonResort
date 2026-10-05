// UC34 — Public NPO partner application. Lets an organisation apply for food-rescue
// partner status instead of asking an administrator to create the record by hand.
//
// Flow: sign in (or register as a guest) -> fill the form -> createNpoApplication()
// writes verificationStatus:'pending' -> the admin queue (admin/NpoVerificationQueue)
// picks it up under review.
//
// RULES DEPENDENCY: firestore.rules allows `create` on npo_partners for admins only.
// This page therefore returns a permission error until the rule below is deployed:
//   allow create: if isSignedIn()
//     && (isAdmin() || (request.resource.data.verificationStatus == 'pending'
//         && request.resource.data.email == request.auth.token.email
//         && request.resource.data.createdBy == request.auth.uid));
// See RULES-NPO-SELF-REGISTRATION.md in the repo root.
import { useState } from 'react';
import { createNpoApplication } from '@/services/increment2-services';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertModal } from '@/components/ui/AlertModal';
import { Loader2, Building2, Send, ShieldCheck, Info } from 'lucide-react';
import type { FileMeta } from '@/types/increment2';

const TRANSPORT_OPTIONS = ['Own vehicle', 'Refrigerated truck', 'Third-party courier', 'On foot', 'Other'];

export function NpoApplicationPage({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    organisationName: '', registrationNumber: '', pboNumber: '',
    contactName: '', email: user?.email || '', phone: '',
    serviceAreas: '', beneficiaryCapacity: '', transportType: TRANSPORT_OPTIONS[0],
    refrigerationAvailable: false,
  });
  const [documents, setDocuments] = useState<FileMeta[]>([]);
  const [docUrl, setDocUrl] = useState('');
  const [docName, setDocName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof form, v: string | boolean) => setForm((p) => ({ ...p, [k]: v }));

  const addDocument = () => {
    const url = docUrl.trim();
    if (!url) return;
    setDocuments((p) => [...p, {
      url, fileName: docName.trim() || url.split('/').pop() || 'document',
      mimeType: /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url) ? 'image/*' : 'application/pdf',
      size: 0, uploadedAt: new Date().toISOString(), uploadedBy: user?.uid || 'applicant',
    }]);
    setDocUrl(''); setDocName('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError('Sign in (or create a guest account) before applying so we can link this application to you.');
      return;
    }
    const capacity = Number(form.beneficiaryCapacity);
    if (!Number.isFinite(capacity) || capacity <= 0) { setError('Beneficiary capacity must be a positive number.'); return; }
    setBusy(true); setError('');
    try {
      await createNpoApplication({
        organisationName: form.organisationName.trim(),
        registrationNumber: form.registrationNumber.trim(),
        pboNumber: form.pboNumber.trim() || undefined,
        contactName: form.contactName.trim(),
        email: (form.email || user.email || '').trim().toLowerCase(),
        phone: form.phone.trim(),
        serviceAreas: form.serviceAreas.split(',').map((s) => s.trim()).filter(Boolean),
        beneficiaryCapacity: Math.round(capacity),
        transportType: form.transportType,
        refrigerationAvailable: form.refrigerationAvailable,
        complianceDocuments: documents,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your application.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1e3a5f] to-[#4a7c9b] py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center text-white">
          <Building2 className="h-10 w-10 text-[#c9a227] mx-auto mb-3" />
          <h1 className="text-3xl font-serif font-bold italic">NPO Partner Application</h1>
          <p className="text-white/70 text-sm mt-2">Apply to receive surplus food from Azure Horizon Resort</p>
        </div>

        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800 space-y-2">
            <p className="font-semibold">Submission failed</p>
            <p>{error}</p>
            {/permission-denied/i.test(error) && (
              <p className="text-xs">
                Firestore currently only allows administrators to create partner records. Deploy the
                self-registration rule in <code>RULES-NPO-SELF-REGISTRATION.md</code> to enable this form.
              </p>
            )}
          </div>
        )}

        {done ? (
          <AlertModal
            open
            onClose={onBack}
            title="Application received"
            message="Your organisation is in the verification queue. An administrator will review the details and supporting documents. You can track the decision from the NPO portal once approved."
            type="success"
          />
        ) : (
          <Card className="bg-white/95 backdrop-blur-sm shadow-2xl border-0">
            <CardHeader>
              <CardTitle className="text-[#1e3a5f] flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Organisation details</CardTitle>
              <CardDescription>All fields marked required must be completed. Approval is subject to document review.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="npo-org">Organisation name *</Label>
                    <Input id="npo-org" required value={form.organisationName} onChange={(e) => set('organisationName', e.target.value)} placeholder="e.g. Soweto Community Trust" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="npo-reg">Registration number *</Label>
                    <Input id="npo-reg" required value={form.registrationNumber} onChange={(e) => set('registrationNumber', e.target.value)} placeholder="NPO-12345" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="npo-pbo">PBO number (optional)</Label>
                    <Input id="npo-pbo" value={form.pboNumber} onChange={(e) => set('pboNumber', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="npo-contact">Contact name *</Label>
                    <Input id="npo-contact" required value={form.contactName} onChange={(e) => set('contactName', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="npo-email">Contact email *</Label>
                    <Input id="npo-email" type="email" required value={form.email} onChange={(e) => set('email', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="npo-phone">Phone *</Label>
                    <Input id="npo-phone" required value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+27 82 000 0000" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="npo-cap">Beneficiary capacity *</Label>
                    <Input id="npo-cap" type="number" min={1} required value={form.beneficiaryCapacity} onChange={(e) => set('beneficiaryCapacity', e.target.value)} placeholder="250" />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="npo-areas">Service areas (comma separated)</Label>
                    <Input id="npo-areas" value={form.serviceAreas} onChange={(e) => set('serviceAreas', e.target.value)} placeholder="Soweto, Diepkloof" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="npo-transport">Transport type</Label>
                    <select
                      id="npo-transport"
                      value={form.transportType}
                      onChange={(e) => set('transportType', e.target.value)}
                      className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
                    >
                      {TRANSPORT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2 flex items-end">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={form.refrigerationAvailable} onChange={(e) => set('refrigerationAvailable', e.target.checked)} />
                      Refrigeration available
                    </label>
                  </div>
                </div>

                <div className="border-t pt-4 space-y-3">
                  <p className="text-sm font-medium flex items-center gap-2"><Info className="h-4 w-4 text-slate-500" /> Supporting documents</p>
                  <p className="text-xs text-slate-500">
                    Paste links to your registration certificate, NPO/PCoFI proof and any food-handling permits.
                    Administrators open these while reviewing your application.
                  </p>
                  {documents.length > 0 && (
                    <ul className="space-y-1 text-sm">
                      {documents.map((d, i) => (
                        <li key={i} className="flex items-center justify-between gap-2 border rounded-md px-3 py-2">
                          <a className="text-blue-600 underline truncate" href={d.url} target="_blank" rel="noreferrer">{d.fileName}</a>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setDocuments((p) => p.filter((_, x) => x !== i))}>Remove</Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-[2fr,1fr,auto] gap-2">
                    <Input value={docUrl} onChange={(e) => setDocUrl(e.target.value)} placeholder="https://…/licence.pdf" />
                    <Input value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="File name" />
                    <Button type="button" variant="outline" onClick={addDocument} disabled={!docUrl.trim()}>Attach</Button>
                  </div>
                </div>

                <Button type="submit" className="w-full bg-[#1e3a5f] hover:bg-[#2c5282] text-white py-6" disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : <><Send className="mr-2 h-4 w-4" /> Submit application</>}
                </Button>
                <Button type="button" variant="ghost" onClick={onBack} className="w-full text-[#1e3a5f]">Back to sign in</Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}