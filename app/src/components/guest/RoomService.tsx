import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createServiceRequest, uploadImage, listenForServiceRequests } from '@/services/firebase-services';
import type { RoomServiceRequest, RequestStatus, User as CustomUser } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { 
  Home, 
  Wrench, 
  CheckCircle, 
  Loader2, 
  Camera, 
  Clock, 
  ChevronLeft,
  Bell,
  AlertCircle
} from 'lucide-react';

interface RoomServiceProps {
  onBack: () => void;
}

export function RoomService({ onBack }: RoomServiceProps) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<RoomServiceRequest[]>([]);
  const [requestType, setRequestType] = useState<'housekeeping' | 'maintenance'>('housekeeping');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const u = user as CustomUser;
    const userId = u?.id;
    if (!userId) return;

    const unsubscribe = listenForServiceRequests((allRequests) => {
      const myRequests = allRequests.filter(req => req.guestId === userId);
      setRequests(myRequests.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ));
      setIsLoading(false);
      
      // Check for completed requests that weren't completed before
      const justCompleted = myRequests.filter(req => 
        req.status === 'completed' && 
        new Date(req.createdAt).getTime() > Date.now() - 5000
      );
      if (justCompleted.length > 0) {
        setNotificationMessage(`Your ${justCompleted[0].type} request has been completed!`);
        setShowNotification(true);
        setTimeout(() => setShowNotification(false), 5000);
      }
    });

    return () => unsubscribe();
  }, [user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async () => {
    if (!description.trim()) return;
    setIsSubmitting(true);

    try {
      const u = user as CustomUser;
      let imageUrl: string | undefined = undefined;

      if (file) {
        const uploadResult = await uploadImage(
          file, 
          `service_requests/${Date.now()}_${file.name}`
        );
        if (uploadResult.url) imageUrl = uploadResult.url;
      }

      await createServiceRequest({
        guestId: u.id,
        guestName: u.name,
        roomNumber: u.roomNumber || 'TBD',
        type: requestType,
        description,
        status: 'pending',
        imageUrl: imageUrl || null
      } as RoomServiceRequest);

      setDescription('');
      setFile(null);
      setShowSuccessModal(true);
    } catch (error) {
      console.error("Submission failed:", error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to submit request. Please try again.');
      setShowErrorModal(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: RequestStatus) => {
    const styles: Record<RequestStatus, string> = {
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      in_progress: 'bg-blue-100 text-blue-800 border-blue-200',
      completed: 'bg-green-100 text-green-800 border-green-200',
      cancelled: 'bg-gray-100 text-gray-800 border-gray-200',
    };
    return (
      <Badge variant="outline" className={`${styles[status]} capitalize`}>
        {status === 'in_progress' ? 'In Progress' : status}
      </Badge>
    );
  };

  const getStatusIcon = (status: RequestStatus) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-3 w-3 text-yellow-500" />;
      case 'in_progress':
        return <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      default:
        return <AlertCircle className="h-3 w-3 text-gray-500" />;
    }
  };

  const pendingRequests = requests.filter(r => r.status === 'pending' || r.status === 'in_progress');
  const completedRequests = requests.filter(r => r.status === 'completed');

  return (
    <div className="max-w-4xl mx-auto">
      {/* Notification Toast */}
      {showNotification && (
        <div className="fixed top-20 right-4 z-50 animate-in slide-in-from-right-5 duration-300">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 shadow-lg flex items-center gap-3">
            <Bell className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-sm font-semibold text-green-800">Request Update</p>
              <p className="text-xs text-green-600">{notificationMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="max-w-md bg-white rounded-xl shadow-2xl">
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-xl font-serif font-bold text-[#1e3a5f] mb-2">Request Sent!</h3>
            <p className="text-gray-600 text-sm">
              Your {requestType} request has been submitted. Staff will attend to it shortly.
            </p>
            <Button 
              className="mt-6 bg-[#1e3a5f] hover:bg-[#2c5282] text-white"
              onClick={() => setShowSuccessModal(false)}
            >
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Error Modal */}
      <Dialog open={showErrorModal} onOpenChange={setShowErrorModal}>
        <DialogContent className="max-w-md bg-white rounded-xl shadow-2xl">
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <h3 className="text-xl font-serif font-bold text-red-600 mb-2">Submission Failed</h3>
            <p className="text-gray-600 text-sm">
              {errorMessage || "Failed to submit your request. Please try again."}
            </p>
            <Button 
              className="mt-6 bg-[#1e3a5f] hover:bg-[#2c5282] text-white"
              onClick={() => setShowErrorModal(false)}
            >
              Try Again
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-2xl font-serif font-bold text-[#1e3a5f]">Room Service</h2>
          <p className="text-gray-600 text-sm">Request assistance or maintenance</p>
        </div>
      </div>

      <Tabs defaultValue="new" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="new">New Request</TabsTrigger>
          <TabsTrigger value="history">
            My Requests ({pendingRequests.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="mt-6">
          <Card className="border-none shadow-lg overflow-hidden">
            <div className={`h-2 w-full ${requestType === 'housekeeping' ? 'bg-sky-700' : 'bg-orange-600'}`} />
            <CardHeader>
              <CardTitle>New Request</CardTitle>
              <CardDescription>How can we help you today?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <Button 
                  variant={requestType === 'housekeeping' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setRequestType('housekeeping')}
                >
                  <Home className="mr-2 h-4 w-4" /> Housekeeping
                </Button>
                <Button 
                  variant={requestType === 'maintenance' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setRequestType('maintenance')}
                >
                  <Wrench className="mr-2 h-4 w-4" /> Maintenance
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="desc">Request Details</Label>
                <Textarea 
                  id="desc"
                  placeholder={requestType === 'housekeeping' ? "e.g., Extra towels, room cleaning, toiletries..." : "e.g., AC not working, light bulb out, leaky faucet..."}
                  className="min-h-[120px]"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                {/* Order Again (Quick Add) */}
                {requests.filter((r: any) => r.type === requestType).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="text-xs text-gray-500 flex items-center mr-1">Quick Add:</span>
                    {Array.from(new Set(requests.filter((r: any) => r.type === requestType && r.description).map((r: any) => r.description))).slice(0, 3).map((desc: any, idx: number) => (
                      <Badge 
                        key={idx} 
                        variant="secondary" 
                        className="cursor-pointer bg-blue-50 text-blue-700 hover:bg-blue-100 border-none"
                        onClick={() => setDescription(desc)}
                      >
                        {desc.length > 30 ? desc.substring(0, 30) + '...' : desc}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="file-upload">Attachments (Optional)</Label>
                <div className="relative">
                  <label 
                    htmlFor="file-upload"
                    className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    {file ? (
                      <div className="flex flex-col items-center">
                        <CheckCircle className="h-8 w-8 text-green-500 mb-2" />
                        <span className="text-xs font-medium text-gray-600">{file.name}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Camera className="w-8 h-8 text-gray-400 mb-2" />
                        <p className="text-xs text-gray-500">Upload photo (Optional)</p>
                      </div>
                    )}
                    <input 
                      id="file-upload"
                      title="Upload a photo of the issue"
                      type="file" 
                      className="hidden" 
                      accept="image/*" 
                      onChange={handleFileChange} 
                    />
                  </label>
                </div>
              </div>

              <Button 
                className="w-full bg-[#1e3a5f] hover:bg-[#152a45] text-white py-6"
                onClick={handleSubmit}
                disabled={isSubmitting || !description.trim()}
              >
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Submit Request'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card className="border-none shadow-lg">
            <CardHeader>
              <CardTitle>Request History</CardTitle>
              <CardDescription>Track your service requests</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex flex-col items-center py-10">
                  <Loader2 className="h-8 w-8 animate-spin text-[#1e3a5f]" />
                </div>
              ) : requests.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <Bell className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No service requests yet.</p>
                  <p className="text-sm">Use the "New Request" tab to request assistance.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Active/Pending Requests */}
                  {pendingRequests.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-[#1e3a5f] mb-3 flex items-center gap-2">
                        <Clock className="h-4 w-4" /> Active Requests
                      </h4>
                      {pendingRequests.map((req) => (
                        <RequestCard
                          key={req.id}
                          request={req}
                          getStatusBadge={getStatusBadge}
                          getStatusIcon={getStatusIcon}
                        />
                      ))}
                    </div>
                  )}

                  {/* Completed Requests */}
                  {completedRequests.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-gray-500 mb-3 flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" /> Completed ({completedRequests.length})
                      </h4>
                      {completedRequests.map((req) => (
                        <RequestCard
                          key={req.id}
                          request={req}
                          getStatusBadge={getStatusBadge}
                          getStatusIcon={getStatusIcon}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Request Card Component
interface RequestCardProps {
  request: RoomServiceRequest;
  getStatusBadge: (status: RequestStatus) => React.ReactNode;
  getStatusIcon: (status: RequestStatus) => React.ReactNode;
}

function RequestCard({ request, getStatusBadge, getStatusIcon }: RequestCardProps) {
  return (
    <Card className="mb-3 shadow-sm border-gray-100">
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2">
            {request.type === 'housekeeping' ? (
              <Home className="h-4 w-4 text-sky-600" />
            ) : (
              <Wrench className="h-4 w-4 text-orange-600" />
            )}
            <span className="text-xs font-semibold uppercase text-gray-500">
              {request.type}
            </span>
          </div>
          {getStatusBadge(request.status)}
        </div>
        
        <p className="text-sm text-gray-700 mt-2">{request.description}</p>
        
        <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            {getStatusIcon(request.status)}
            Requested: {new Date(request.createdAt).toLocaleString()}
          </span>
          {request.completedAt && (
            <span className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              Completed: {new Date(request.completedAt).toLocaleString()}
            </span>
          )}
        </div>
        
        {request.imageUrl && (
          <div className="mt-3">
            <img src={request.imageUrl} alt="Request" className="h-20 w-20 object-cover rounded-lg" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}