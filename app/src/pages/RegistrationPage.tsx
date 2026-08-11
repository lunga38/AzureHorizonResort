import { useState } from 'react';
import { registerUser } from '@/services/firebase-services';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Star, Loader2, ArrowLeft, UserPlus } from 'lucide-react';

// Define the interface for props to fix the IntrinsicAttributes errors
interface RegistrationPageProps {
  onBack: () => void;
}

export function RegistrationPage({ onBack }: RegistrationPageProps) {
  // REMOVED: navigate (Fixes ESLint/TS unused variable error)
  const { login } = useAuth();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      alert("Passwords do not match!");
      return;
    }

    setIsLoading(true);
    const result = await registerUser(email.trim().toLowerCase(), password, name);
    setIsLoading(false);

    if (result.user) {
      login(result.user);
      // Auth change will trigger the App.tsx redirect to /guest-portal
    } else {
      alert(result.error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1e3a5f] to-[#4a7c9b] flex items-center justify-center p-4 relative overflow-hidden">
      {/* FIXED: Moved inline style to a Tailwind arbitrary value class 
          (Fixes Microsoft Edge Tools no-inline-styles error)
      */}
      <div className="absolute inset-0 opacity-10 pointer-events-none bg-[url('data:image/svg+xml,%3Csvg_width=%2260%22_height=%2260%22_viewBox=%220_0_60_60%22_xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cg_fill=%22none%22_fill-rule=%22evenodd%22%3E%3Cg_fill=%22%23ffffff%22_fill-opacity=%220.4%22%3E%3Cpath_d=%22M36_34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6_34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6_4V0H4v4H0v2h4v4h2V6h4V4H6z%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')]">
      </div>

      <div className="max-w-md w-full space-y-8 relative z-10">
        <div className="text-center text-white">
          <Star className="h-10 w-10 text-[#c9a227] mx-auto mb-4" />
          <h1 className="text-3xl font-serif font-bold italic">Join Azure Horizon</h1>
          <p className="text-white/70 text-sm mt-2">Start your journey with us today</p>
        </div>

        <Card className="bg-white/95 backdrop-blur-sm shadow-2xl border-0">
          <CardHeader>
            <CardTitle className="text-[#1e3a5f]">Create Account</CardTitle>
            <CardDescription>Enter your details to register as a resort member</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reg-name">Full Name</Label>
                <Input 
                  id="reg-name" 
                  placeholder="John Doe" 
                  required 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-email">Email Address</Label>
                <Input 
                  id="reg-email" 
                  type="email" 
                  placeholder="john@example.com" 
                  required 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-password">Password</Label>
                <Input 
                  id="reg-password" 
                  type="password" 
                  required 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-confirm">Confirm Password</Label>
                <Input 
                  id="reg-confirm" 
                  type="password" 
                  required 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              <Button type="submit" className="w-full bg-[#1e3a5f] hover:bg-[#2c5282] text-white py-6" disabled={isLoading}>
                {isLoading ? <Loader2 className="animate-spin" /> : <><UserPlus className="mr-2 h-4 w-4" /> Register Account</>}
              </Button>
            </form>

            <div className="mt-6 text-center pt-4 border-t">
              <Button variant="ghost" onClick={onBack} className="text-sm text-[#1e3a5f] hover:bg-slate-100 flex items-center justify-center gap-2 w-full">
                <ArrowLeft className="h-3 w-3" /> Already have an account? Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}