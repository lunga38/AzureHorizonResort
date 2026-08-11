import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { QrCode, Download } from 'lucide-react';
import type { User as AppUser } from '@/types';

type AuthUserBridge = AppUser & { uid?: string };

export function QRCodeBadge() {
  const { user } = useAuth();
  const currentUser = user as AuthUserBridge;

  if (!currentUser || currentUser.status !== 'resident' || !currentUser.roomNumber) return null;

  const qrPayload = JSON.stringify({
    guestId: currentUser.id || currentUser.uid,
    name: currentUser.name,
    room: currentUser.roomNumber,
    tier: currentUser.loyaltyTier || 'bronze',
    issued: new Date().toISOString().split('T')[0],
  });

  const handleSave = () => {
    const svg = document.getElementById('guest-qr-code');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const link = document.createElement('a');
      link.download = `AzureHorizon_QR_${currentUser.roomNumber}.png`;
      link.href = canvas.toDataURL();
      link.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <Card className="bg-gradient-to-br from-[#1e3a5f] to-[#2c5282] text-white border-none shadow-xl overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <QrCode className="h-5 w-5 text-[#c9a227]" />
          <h3 className="font-bold text-lg">Digital Room Key</h3>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="bg-white p-3 rounded-xl shadow-inner">
            <QRCodeSVG
              id="guest-qr-code"
              value={qrPayload}
              size={140}
              bgColor="#ffffff"
              fgColor="#1e3a5f"
              level="M"
              includeMargin={false}
            />
          </div>
          <div className="text-center sm:text-left space-y-2">
            <p className="text-white/70 text-xs uppercase tracking-widest">Guest Verification</p>
            <p className="text-2xl font-bold">{currentUser.name}</p>
            <p className="text-[#c9a227] font-mono text-lg">Room {currentUser.roomNumber}</p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-2 bg-white/10 hover:bg-white/20 text-white border-white/20"
              onClick={handleSave}
            >
              <Download className="h-3 w-3 mr-1.5" /> Save QR Code
            </Button>
          </div>
        </div>
        <p className="text-[10px] text-white/40 mt-4 text-center">
          Present this QR code at the restaurant, spa, or front desk for instant identity verification.
        </p>
      </CardContent>
    </Card>
  );
}
