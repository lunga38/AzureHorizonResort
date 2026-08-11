import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Sparkles, 
  Coffee, 
  Sun, 
  Moon, 
  Map, 
  Wifi, 
  ChevronRight,
  CloudRain,
  Bot,
  User as UserIcon,
  X
} from 'lucide-react';
import type { Booking, User } from '@/types';

type Message = {
  id: string;
  sender: 'bot' | 'user';
  text: string;
};

const PREDETERMINED_QUESTIONS = [
  {
    id: 'q1',
    text: 'What are the restaurant hours?',
    answer: 'The Azure Pavilion serves Breakfast from 6:30 AM to 10:30 AM, Lunch from 12:00 PM to 3:00 PM, and Dinner from 6:00 PM to 10:30 PM. Room service is available 24/7.'
  },
  {
    id: 'q2',
    text: 'Where is the Spa located?',
    answer: 'The Azure Spa is located on Level 2 of the main building, right next to the indoor heated pool. It is open daily from 8:00 AM to 8:00 PM.'
  },
  {
    id: 'q3',
    text: 'Do you offer airport shuttles?',
    answer: 'Yes! We offer complimentary airport shuttles for our resident guests. They run every hour on the hour. Please contact the front desk via the app or phone to reserve your seat.'
  },
  {
    id: 'q4',
    text: 'What time is check-out?',
    answer: 'Standard check-out is at 11:00 AM. If you need a late check-out, please contact the front desk. Late check-out until 2:00 PM may be available subject to availability.'
  },
  {
    id: 'q5',
    text: 'How do I book a tour?',
    answer: 'You can easily book a tour right here in the app! Just go to the "Tours & Excursions" tab, browse our catalog, select your preferred date, and confirm your booking.'
  }
];

interface SmartConciergeProps {
  user: User | null;
  activeBooking: Booking | null;
  onViewAction: (view: any) => void;
}

interface Suggestion {
  id: string;
  type: 'action' | 'info' | 'weather';
  title: string;
  description: string;
  icon: React.ReactNode;
  actionLabel?: string;
  actionView?: string;
  priority: 'high' | 'medium' | 'low';
}

export function SmartConcierge({ user, activeBooking, onViewAction }: SmartConciergeProps) {
  const hour = new Date().getHours();
  
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: 'initial', sender: 'bot', text: `Hello ${user?.name?.split(' ')[0] || 'there'}! I am Azure Insight, your personal AI concierge. How can I assist you today?` }
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isChatOpen) {
      setTimeout(scrollToBottom, 100);
    }
  }, [messages, isChatOpen]);

  const handleAskQuestion = (questionText: string, answerText: string) => {
    const newUserMsg: Message = { id: Date.now().toString(), sender: 'user', text: questionText };
    setMessages(prev => [...prev, newUserMsg]);

    setTimeout(() => {
      const newBotMsg: Message = { id: (Date.now() + 1).toString(), sender: 'bot', text: answerText };
      setMessages(prev => [...prev, newBotMsg]);
    }, 600);
  };
  
  const suggestions = useMemo(() => {
    const list: Suggestion[] = [];
    
    // Time-based greetings & suggestions
    if (hour >= 5 && hour < 11) {
      list.push({
        id: 'breakfast',
        type: 'action',
        title: 'Morning Excellence',
        description: 'Our award-winning breakfast buffet is now serving at the Azure Pavilion.',
        icon: <Coffee className="h-5 w-5 text-amber-500" />,
        actionLabel: 'View Menu',
        actionView: 'restaurant',
        priority: 'high'
      });
    } else if (hour >= 11 && hour < 17) {
      list.push({
        id: 'tours',
        type: 'action',
        title: 'Afternoon Adventure',
        description: 'Perfect weather for the coastal excursion. 3 slots remaining for the 2 PM tour.',
        icon: <Map className="h-5 w-5 text-blue-500" />,
        actionLabel: 'Book Tour',
        actionView: 'tours',
        priority: 'medium'
      });
    } else {
      list.push({
        id: 'dinner',
        type: 'action',
        title: 'Evening Elegance',
        description: 'The starlight lounge is hosting a private wine tasting tonight at 8 PM.',
        icon: <Moon className="h-5 w-5 text-purple-500" />,
        actionLabel: 'Reserve Table',
        actionView: 'restaurant',
        priority: 'high'
      });
    }

    // Status-based suggestions
    if (user?.status === 'resident' && activeBooking) {
      list.push({
        id: 'digital-key',
        type: 'info',
        title: 'Digital Key Ready',
        description: `Your digital access for Room ${activeBooking.roomNumber} is active and secure.`,
        icon: <Wifi className="h-5 w-5 text-emerald-500" />,
        actionLabel: 'Open Key',
        actionView: 'digital-key',
        priority: 'high'
      });
    } else if (user?.status === 'visitor') {
      list.push({
        id: 'checkin-promo',
        type: 'action',
        title: 'Extend Your Luxury',
        description: 'Loving the vibe? Check our premium suites for a full resident experience.',
        icon: <Sparkles className="h-5 w-5 text-amber-400" />,
        actionLabel: 'Explore Rooms',
        actionView: 'room-gallery',
        priority: 'medium'
      });
    }

    // Weather Simulation (Innovating with simulated external data)
    const isRaining = false; // Mocking weather data
    if (isRaining) {
      list.push({
        id: 'weather-rain',
        type: 'weather',
        title: 'Cozy Indoors',
        description: 'It looks rainy outside. Why not visit our heated indoor spa pool?',
        icon: <CloudRain className="h-5 w-5 text-blue-400" />,
        actionLabel: 'Spa Services',
        actionView: 'spa',
        priority: 'high'
      });
    } else {
      list.push({
        id: 'weather-sun',
        type: 'weather',
        title: 'Azure Skies',
        description: 'UV levels are moderate. The main pool area is currently at 40% capacity.',
        icon: <Sun className="h-5 w-5 text-amber-500" />,
        priority: 'low'
      });
    }

    return list.sort((a, b) => {
      const p = { high: 0, medium: 1, low: 2 };
      return p[a.priority] - p[b.priority];
    });
  }, [hour, user?.status, activeBooking]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <Sparkles className="h-5 w-5 text-blue-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Azure Insight</h2>
        </div>
        <Badge variant="outline" className="border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/20">
          AI Personal Concierge
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {suggestions.map((suggestion) => (
          <Card 
            key={suggestion.id}
            className="group relative overflow-hidden border-none shadow-sm hover:shadow-md transition-all duration-300 bg-white dark:bg-slate-900/50 backdrop-blur-sm border border-slate-100 dark:border-slate-800"
          >
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
              {suggestion.icon}
            </div>
            
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                  {suggestion.icon}
                </div>
                <div className="space-y-1 pr-6">
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm tracking-tight">{suggestion.title}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {suggestion.description}
                  </p>
                </div>
              </div>

              {suggestion.actionLabel && (
                <div className="mt-4 pt-4 border-t border-slate-50 dark:border-slate-800/50 flex justify-end">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-xs font-bold gap-1 p-0 h-auto"
                    onClick={() => onViewAction(suggestion.actionView)}
                  >
                    {suggestion.actionLabel}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="p-4 rounded-2xl bg-gradient-to-r from-[#1e3a5f] to-[#2c5282] text-white shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 opacity-10">
          <Sparkles className="h-40 w-40" />
        </div>
        <div className="relative z-10 flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="font-bold text-lg">Need anything else?</h3>
            <p className="text-blue-100 text-xs opacity-90">I am here to ensure your stay is absolutely perfect.</p>
          </div>
          <Button 
            className="bg-white text-[#1e3a5f] hover:bg-blue-50 font-bold px-6 shadow-lg hover:shadow-xl transition-all"
            onClick={() => setIsChatOpen(true)}
          >
            Chat with Concierge
          </Button>
        </div>
      </div>

      <Dialog open={isChatOpen} onOpenChange={setIsChatOpen}>
        <DialogContent className="sm:max-w-[450px] p-0 overflow-hidden border-none shadow-2xl bg-white dark:bg-slate-900 flex flex-col h-[600px] max-h-[85vh]">
          <div className="bg-gradient-to-r from-[#1e3a5f] to-[#2c5282] p-4 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-white text-lg font-bold">Azure Insight</DialogTitle>
                <DialogDescription className="text-blue-100 text-xs m-0">Always here to help</DialogDescription>
              </div>
            </div>
            <button onClick={() => setIsChatOpen(false)} className="text-white/80 hover:text-white transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          <ScrollArea className="flex-1 p-4 bg-slate-50 dark:bg-slate-900/50">
            <div className="space-y-4 pb-4">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`flex gap-2 max-w-[85%] ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.sender === 'user' ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400' : 'bg-[#1e3a5f] text-white'}`}>
                      {msg.sender === 'user' ? <UserIcon className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>
                    <div className={`p-3 rounded-2xl text-sm ${msg.sender === 'user' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-white dark:bg-slate-800 border dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-tl-sm shadow-sm'}`}>
                      {msg.text}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          <div className="p-4 bg-white dark:bg-slate-900 border-t dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wider">Ask a question</p>
            <div className="flex flex-wrap gap-2">
              {PREDETERMINED_QUESTIONS.map(q => (
                <button
                  key={q.id}
                  onClick={() => handleAskQuestion(q.text, q.answer)}
                  className="text-left text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-full transition-colors border dark:border-slate-700"
                >
                  {q.text}
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
