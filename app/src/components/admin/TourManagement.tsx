import { useState, useEffect } from 'react';
import { listenForTours, createTour, updateTour } from '@/services/firebase-services';
import type { Tour, TourScheduleSlot, TourPricingTier } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertModal } from '@/components/ui/AlertModal';
import {
  Plus, Edit2, Check, X, ChevronLeft, Loader2,
  MapPin, Clock, Users, Calendar, Tag, ToggleLeft, ToggleRight, Trash2
} from 'lucide-react';

type AdminView = 'list' | 'form';

const EMPTY_SCHEDULE: TourScheduleSlot = { date: '', time: '', capacity: 20, bookedCount: 0 };
const EMPTY_PRICING: TourPricingTier = { adult: 0, child: 0, pensioner: 0 };
const EMPTY_TOUR: Omit<Tour, 'id' | 'createdAt'> = {
  name: '',
  description: '',
  duration: '',
  locations: '',
  images: [],
  pricing: { ...EMPTY_PRICING },
  schedules: [],
  isActive: true,
};

export function TourManagement() {
  const [tours, setTours] = useState<Tour[]>([]);
  const [view, setView] = useState<AdminView>('list');
  const [editingTour, setEditingTour] = useState<Tour | null>(null);
  const [form, setForm] = useState<Omit<Tour, 'id' | 'createdAt'>>({ ...EMPTY_TOUR, pricing: { ...EMPTY_PRICING }, schedules: [] });
  const [imageInput, setImageInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [alert, setAlert] = useState({ open: false, title: '', message: '', type: 'info' as 'success' | 'error' | 'info' | 'warning' });

  useEffect(() => {
    const unsub = listenForTours(setTours);
    return unsub;
  }, []);

  const openNew = () => {
    setEditingTour(null);
    setForm({ ...EMPTY_TOUR, pricing: { ...EMPTY_PRICING }, schedules: [] });
    setImageInput('');
    setView('form');
  };

  const openEdit = (tour: Tour) => {
    setEditingTour(tour);
    setForm({
      name: tour.name,
      description: tour.description,
      duration: tour.duration,
      locations: tour.locations,
      images: [...tour.images],
      pricing: { ...tour.pricing },
      schedules: tour.schedules.map(s => ({ ...s })),
      isActive: tour.isActive,
    });
    setImageInput('');
    setView('form');
  };

  const handleToggleActive = async (tour: Tour) => {
    await updateTour(tour.id, { isActive: !tour.isActive });
  };

  const addScheduleSlot = () => {
    setForm(p => ({ ...p, schedules: [...p.schedules, { ...EMPTY_SCHEDULE }] }));
  };

  const removeScheduleSlot = (idx: number) => {
    setForm(p => ({ ...p, schedules: p.schedules.filter((_, i) => i !== idx) }));
  };

  const updateScheduleSlot = (idx: number, field: keyof TourScheduleSlot, value: string | number) => {
    setForm(p => {
      const updated = [...p.schedules];
      updated[idx] = { ...updated[idx], [field]: field === 'capacity' ? Number(value) : value };
      return { ...p, schedules: updated };
    });
  };

  const addImage = () => {
    if (imageInput.trim()) {
      setForm(p => ({ ...p, images: [...p.images, imageInput.trim()] }));
      setImageInput('');
    }
  };

  const removeImage = (idx: number) => {
    setForm(p => ({ ...p, images: p.images.filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.description.trim() || !form.duration.trim() || !form.locations.trim()) {
      setAlert({ open: true, title: 'Missing Fields', message: 'Please fill in all required fields: Name, Description, Duration, and Locations.', type: 'warning' });
      return;
    }
    if (form.pricing.adult <= 0) {
      setAlert({ open: true, title: 'Pricing Required', message: 'Adult pricing must be greater than R 0.', type: 'warning' });
      return;
    }

    setIsSaving(true);
    let result;

    if (editingTour) {
      result = await updateTour(editingTour.id, form);
    } else {
      result = await createTour(form);
    }

    setIsSaving(false);

    if (result.success) {
      setAlert({
        open: true,
        title: editingTour ? 'Tour Updated' : 'Tour Created',
        message: `"${form.name}" has been ${editingTour ? 'updated' : 'added to the catalogue'} successfully.`,
        type: 'success'
      });
      setView('list');
    } else {
      setAlert({ open: true, title: 'Save Failed', message: result.error || 'An error occurred.', type: 'error' });
    }
  };

  const getSlotStatusColor = (slot: TourScheduleSlot) => {
    const pct = slot.bookedCount / slot.capacity;
    if (pct >= 1) return 'text-red-500';
    if (pct >= 0.75) return 'text-amber-500';
    return 'text-emerald-500';
  };

  // ── TOUR LIST ──
  if (view === 'list') {
    return (
      <div className="space-y-6">
        <AlertModal open={alert.open} onClose={() => setAlert(p => ({ ...p, open: false }))} title={alert.title} message={alert.message} type={alert.type} />

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-slate-100">Tour Catalogue</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">{tours.length} tours configured</p>
          </div>
          <Button className="bg-[#1e3a5f] hover:bg-[#163058]" onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" /> Add New Tour
          </Button>
        </div>

        {tours.length === 0 ? (
          <Card className="border-dashed border-2 border-gray-200 dark:border-slate-700">
            <CardContent className="py-16 text-center text-gray-400 dark:text-slate-500">
              <Tag className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No tours in catalogue yet</p>
              <p className="text-sm mt-1">Click "Add New Tour" to get started</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {tours.map(tour => (
              <Card key={tour.id} className="border-none shadow-sm hover:shadow-md transition-shadow dark:bg-slate-900">
                <CardContent className="p-5">
                  <div className="flex flex-col md:flex-row md:items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-gray-900 dark:text-slate-100 text-lg">{tour.name}</h3>
                        <Badge className={tour.isActive ? 'bg-emerald-100 text-emerald-700 border-none' : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 border-none'}>
                          {tour.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 line-clamp-2">{tour.description}</p>
                      <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-500 dark:text-slate-400">
                        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{tour.duration}</span>
                        <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 shrink-0" /><span className="truncate max-w-[200px]">{tour.locations}</span></span>
                        <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{tour.schedules.length} session{tour.schedules.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex gap-4 mt-3 text-sm">
                        <span className="text-[#1e3a5f] dark:text-blue-400 font-semibold">Adult R {tour.pricing.adult}</span>
                        <span className="text-gray-400 dark:text-slate-500">Child R {tour.pricing.child}</span>
                        <span className="text-gray-400 dark:text-slate-500">Pensioner R {tour.pricing.pensioner}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleActive(tour)}
                        className={tour.isActive ? 'text-amber-600 border-amber-200 hover:bg-amber-50' : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50'}
                      >
                        {tour.isActive ? <><ToggleRight className="h-4 w-4 mr-1" />Deactivate</> : <><ToggleLeft className="h-4 w-4 mr-1" />Activate</>}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openEdit(tour)}>
                        <Edit2 className="h-4 w-4 mr-1" /> Edit
                      </Button>
                    </div>
                  </div>

                  {tour.schedules.length > 0 && (
                    <div className="mt-4 pt-4 border-t dark:border-slate-700">
                      <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-2">Upcoming Sessions</p>
                      <div className="flex flex-wrap gap-2">
                        {tour.schedules.slice(0, 4).map((slot, i) => (
                          <div key={i} className="text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded px-2 py-1 flex items-center gap-1.5 text-gray-900 dark:text-slate-100">
                            <span className="font-medium">{slot.date}</span>
                            <span className="text-gray-400 dark:text-slate-500">@</span>
                            <span>{slot.time}</span>
                            <span className={`font-semibold ${getSlotStatusColor(slot)}`}>
                              {slot.capacity - slot.bookedCount}/{slot.capacity}
                            </span>
                          </div>
                        ))}
                        {tour.schedules.length > 4 && (
                          <div className="text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded px-2 py-1 text-gray-400 dark:text-slate-500">
                            +{tour.schedules.length - 4} more
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── TOUR FORM (Create / Edit) ──
  return (
    <div className="space-y-6 max-w-3xl">
      <AlertModal open={alert.open} onClose={() => setAlert(p => ({ ...p, open: false }))} title={alert.title} message={alert.message} type={alert.type} />

      <Button variant="ghost" onClick={() => setView('list')} className="text-[#1e3a5f] dark:text-blue-400">
        <ChevronLeft className="h-4 w-4 mr-1" /> Back to Catalogue
      </Button>

      <div>
        <h2 className="text-2xl font-bold text-gray-800 dark:text-slate-100">{editingTour ? 'Edit Tour' : 'Add New Tour'}</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">Fields marked * are required</p>
      </div>

      <div className="space-y-6">
        {/* Basic Details */}
        <Card className="border-none shadow-sm dark:bg-slate-900">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 dark:text-slate-100"><Tag className="h-4 w-4 text-[#1e3a5f] dark:text-blue-400" /> Tour Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="dark:text-slate-300">Tour Name *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Coastal Whale Watching" className="mt-1 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" />
            </div>
            <div>
              <Label className="dark:text-slate-300">Description *</Label>
              <textarea
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Describe the tour experience..."
                className="mt-1 w-full min-h-[100px] px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-md dark:bg-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20 resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="dark:text-slate-300">Duration *</Label>
                <Input value={form.duration} onChange={e => setForm(p => ({ ...p, duration: e.target.value }))} placeholder="e.g. 3 hours" className="mt-1 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" />
              </div>
              <div>
                <Label className="flex items-center gap-1 dark:text-slate-300">Active</Label>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => setForm(p => ({ ...p, isActive: !p.isActive }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.isActive ? 'bg-[#1e3a5f]' : 'bg-gray-300 dark:bg-slate-600'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                  <span className="text-sm text-gray-600 dark:text-slate-400">{form.isActive ? 'Visible to guests' : 'Hidden from guests'}</span>
                </div>
              </div>
            </div>
            <div>
              <Label className="dark:text-slate-300">Route / Locations *</Label>
              <Input value={form.locations} onChange={e => setForm(p => ({ ...p, locations: e.target.value }))} placeholder="e.g. Harbour → Whale Rock → Sunset Bay → Return" className="mt-1 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" />
            </div>
          </CardContent>
        </Card>

        {/* Images */}
        <Card className="border-none shadow-sm dark:bg-slate-900">
          <CardHeader className="pb-3">
            <CardTitle className="text-base dark:text-slate-100">Tour Images</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input value={imageInput} onChange={e => setImageInput(e.target.value)} placeholder="/tours/my-tour.jpg or https://..." className="flex-1 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100" />
              <Button variant="outline" onClick={addImage} type="button"><Plus className="h-4 w-4" /></Button>
            </div>
            {form.images.length > 0 && (
              <div className="space-y-2">
                {form.images.map((img, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-gray-50 dark:bg-slate-800 rounded px-3 py-2">
                    <span className="flex-1 truncate text-gray-600 dark:text-slate-300">{img}</span>
                    <button onClick={() => removeImage(i)} className="text-red-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card className="border-none shadow-sm dark:bg-slate-900">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 dark:text-slate-100"><Tag className="h-4 w-4 text-[#c9a227]" /> Pricing Tiers (ZAR)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {(['adult', 'child', 'pensioner'] as const).map(type => (
                <div key={type}>
                  <Label className="capitalize dark:text-slate-300">{type === 'child' ? 'Child (Under 12)' : type === 'pensioner' ? 'Pensioner (60+)' : 'Adult'} *</Label>
                  <div className="flex items-center mt-1">
                    <span className="px-3 py-2 bg-gray-100 dark:bg-slate-700 border border-r-0 border-gray-200 dark:border-slate-600 rounded-l text-sm text-gray-500 dark:text-slate-400">R</span>
                    <Input
                      type="number"
                      min={0}
                      value={form.pricing[type] || ''}
                      onChange={e => setForm(p => ({ ...p, pricing: { ...p.pricing, [type]: Number(e.target.value) } }))}
                      className="rounded-l-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
                      placeholder="0"
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Schedules */}
        <Card className="border-none shadow-sm dark:bg-slate-900">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2 dark:text-slate-100"><Calendar className="h-4 w-4 text-[#1e3a5f] dark:text-blue-400" /> Schedule Slots</CardTitle>
              <Button variant="outline" size="sm" onClick={addScheduleSlot}>
                <Plus className="h-4 w-4 mr-1" /> Add Slot
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {form.schedules.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-slate-500 text-center py-4">No schedule slots yet. Click "Add Slot" to create time slots for guests to book.</p>
            ) : (
              form.schedules.map((slot, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-end bg-gray-50 dark:bg-slate-800 rounded-lg p-3">
                  <div>
                    <Label className="text-xs dark:text-slate-300">Date</Label>
                    <Input type="date" value={slot.date} onChange={e => updateScheduleSlot(idx, 'date', e.target.value)} className="mt-1 h-8 text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100" />
                  </div>
                  <div className="w-24">
                    <Label className="text-xs dark:text-slate-300">Time</Label>
                    <Input type="time" value={slot.time} onChange={e => updateScheduleSlot(idx, 'time', e.target.value)} className="mt-1 h-8 text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100" />
                  </div>
                  <div className="w-24">
                    <Label className="text-xs flex items-center gap-1 dark:text-slate-300"><Users className="h-3 w-3" />Capacity</Label>
                    <Input type="number" min={1} value={slot.capacity} onChange={e => updateScheduleSlot(idx, 'capacity', e.target.value)} className="mt-1 h-8 text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100" />
                  </div>
                  <button onClick={() => removeScheduleSlot(idx)} className="mb-1 text-red-400 hover:text-red-600 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Save Actions */}
        <div className="flex gap-3 pb-8">
          <Button variant="outline" className="flex-1" onClick={() => setView('list')} disabled={isSaving}>
            Cancel
          </Button>
          <Button className="flex-1 bg-[#1e3a5f] hover:bg-[#163058]" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : <><Check className="mr-2 h-4 w-4" />{editingTour ? 'Update Tour' : 'Create Tour'}</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
