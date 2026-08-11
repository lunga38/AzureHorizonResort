import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accessibility, Type, Contrast, Orbit } from 'lucide-react';

export function AccessibilityWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    if (largeText) html.classList.add('a11y-large-text');
    else html.classList.remove('a11y-large-text');

    if (highContrast) html.classList.add('a11y-high-contrast');
    else html.classList.remove('a11y-high-contrast');

    if (reducedMotion) html.classList.add('a11y-reduced-motion');
    else html.classList.remove('a11y-reduced-motion');
  }, [largeText, highContrast, reducedMotion]);

  return (
    <div className="fixed bottom-6 right-6 z-[100]">
      {isOpen && (
        <Card className="absolute bottom-16 right-0 w-72 shadow-2xl border-2 border-blue-500/20 dark:border-blue-400/20 bg-white dark:bg-slate-900 animate-in slide-in-from-bottom-5">
          <CardHeader className="pb-3 border-b dark:border-slate-800">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Accessibility className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Accessibility Menu
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <Button 
              variant={largeText ? "default" : "outline"}
              className={`w-full justify-start ${largeText ? 'bg-blue-600' : 'dark:border-slate-700 dark:text-gray-200'}`}
              onClick={() => setLargeText(!largeText)}
            >
              <Type className="h-4 w-4 mr-3" />
              Large Text
            </Button>
            
            <Button 
              variant={highContrast ? "default" : "outline"}
              className={`w-full justify-start ${highContrast ? 'bg-blue-600' : 'dark:border-slate-700 dark:text-gray-200'}`}
              onClick={() => setHighContrast(!highContrast)}
            >
              <Contrast className="h-4 w-4 mr-3" />
              High Contrast
            </Button>
            
            <Button 
              variant={reducedMotion ? "default" : "outline"}
              className={`w-full justify-start ${reducedMotion ? 'bg-blue-600' : 'dark:border-slate-700 dark:text-gray-200'}`}
              onClick={() => setReducedMotion(!reducedMotion)}
            >
              <Orbit className="h-4 w-4 mr-3" />
              Reduced Motion
            </Button>
          </CardContent>
        </Card>
      )}

      <Button
        onClick={() => setIsOpen(!isOpen)}
        size="icon"
        className="h-14 w-14 rounded-full shadow-2xl bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white"
        aria-label="Toggle Accessibility Menu"
      >
        <Accessibility className="h-7 w-7" />
      </Button>
    </div>
  );
}
