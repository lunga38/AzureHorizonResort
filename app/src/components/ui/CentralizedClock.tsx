import { useState, useEffect, useContext, createContext, type ReactNode } from 'react';
import { useTheme } from 'next-themes';
import { Clock } from 'lucide-react';

// Context to provide the current time globally
export const ClockContext = createContext<Date | null>(null);

export function useCentralClock(): Date {
  const context = useContext(ClockContext);
  return context || new Date();
}

interface CentralizedClockProviderProps {
  children: ReactNode;
}

export function CentralizedClockProvider({ children }: CentralizedClockProviderProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    // Update time every second
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <ClockContext.Provider value={currentTime}>
      {children}
    </ClockContext.Provider>
  );
}

export function CentralizedClock() {
  const { theme } = useTheme();
  const currentTime = useCentralClock();

  const hours = currentTime.getHours().toString().padStart(2, '0');
  const minutes = currentTime.getMinutes().toString().padStart(2, '0');
  const seconds = currentTime.getSeconds().toString().padStart(2, '0');

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors duration-200 ${
      theme === 'dark'
        ? 'bg-slate-800 border border-slate-700 text-slate-100'
        : 'bg-gray-100 border border-gray-300 text-gray-800'
    }`}>
      <Clock className="h-4 w-4 text-[#1e3a5f] dark:text-blue-400" />
      <time className="font-mono text-sm font-semibold tracking-wider">
        {hours}:{minutes}:{seconds}
      </time>
    </div>
  );
}
