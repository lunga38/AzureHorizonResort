import { useState, useEffect } from 'react';
import { 
  Sun, 
  CloudSun, 
  Cloud, 
  CloudFog, 
  CloudRain, 
  CloudSnow, 
  CloudLightning,
  MapPin,
  Loader2,
  Edit2,
  Search,
  X,
  Sunrise,
  Sunset
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface WeatherData {
  current: {
    temp: number;
    code: number;
  };
  daily: {
    time: string[];
    maxTemp: number[];
    minTemp: number[];
    code: number[];
    sunrise: string[];
    sunset: string[];
  };
}

const getWeatherIcon = (code: number, className = "h-6 w-6") => {
  if (code === 0) return <Sun className={`${className} text-yellow-500`} />;
  if (code === 1 || code === 2) return <CloudSun className={`${className} text-blue-400`} />;
  if (code === 3) return <Cloud className={`${className} text-gray-400`} />;
  if (code === 45 || code === 48) return <CloudFog className={`${className} text-gray-500`} />;
  if (code >= 51 && code <= 65) return <CloudRain className={`${className} text-blue-500`} />;
  if (code >= 71 && code <= 77) return <CloudSnow className={`${className} text-cyan-400`} />;
  if (code >= 95) return <CloudLightning className={`${className} text-purple-500`} />;
  return <CloudSun className={`${className} text-blue-400`} />;
};

const getWeatherDesc = (code: number) => {
  if (code === 0) return "Clear Sky";
  if (code === 1 || code === 2) return "Partly Cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 65) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 95) return "Thunderstorm";
  return "Clear";
};

const formatTime = (isoString: string) => {
  if (!isoString) return "";
  return new Date(isoString).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

export function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [locationName, setLocationName] = useState("Azure Horizon Resort");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const fetchWeather = async (lat: number, lon: number, name?: string) => {
    try {
        setLoading(true);
        // Fetch weather from Open-Meteo
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,sunrise,sunset&current_weather=true&timezone=auto`;
        const res = await fetch(weatherUrl);
        const data = await res.json();
        
        setWeather({
          current: {
            temp: data.current_weather.temperature,
            code: data.current_weather.weathercode
          },
          daily: {
            time: data.daily.time,
            maxTemp: data.daily.temperature_2m_max,
            minTemp: data.daily.temperature_2m_min,
            code: data.daily.weathercode,
            sunrise: data.daily.sunrise,
            sunset: data.daily.sunset
          }
        });

        // Try to reverse geocode if name isn't provided
        if (!name) {
          try {
            const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
            const geoData = await geoRes.json();
            const city = geoData.address?.city || geoData.address?.town || geoData.address?.village || "Current Location";
            setLocationName(city);
          } catch (e) {
            setLocationName("Current Location");
          }
        } else {
          setLocationName(name);
        }
      } catch (err) {
        console.error("Weather fetch error:", err);
        setError("Unable to load weather forecast");
      } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchQuery)}&count=1&language=en&format=json`);
      const data = await res.json();
      
      if (data.results && data.results.length > 0) {
        const result = data.results[0];
        const fullName = `${result.name}${result.admin1 ? `, ${result.admin1}` : ''}`;
        await fetchWeather(result.latitude, result.longitude, fullName);
        setIsEditingLocation(false);
        setSearchQuery("");
      } else {
        alert("Location not found. Please try a different search term.");
      }
    } catch (err) {
      console.error("Geocoding error:", err);
      alert("Failed to search location.");
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    // Try to get user location
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          fetchWeather(position.coords.latitude, position.coords.longitude);
        },
        (_error) => {
          console.warn("Geolocation denied or failed, using default location.");
          // Default to Cape Town (approximate location for Azure Horizon Resort)
          fetchWeather(-33.9249, 18.4241, "Cape Town, SA");
        },
        { timeout: 5000 }
      );
    } else {
      // Default location if no geolocation
      fetchWeather(-33.9249, 18.4241, "Cape Town, SA");
    }
  }, []);

  if (loading) {
    return (
      <Card className="mb-8 border-none shadow-sm bg-gradient-to-br from-blue-50 to-white dark:from-slate-900 dark:to-slate-800">
        <CardContent className="p-8 flex justify-center items-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        </CardContent>
      </Card>
    );
  }

  if (error || !weather) return null;

  return (
    <Card className="mb-8 border-none shadow-lg overflow-hidden bg-white/60 dark:bg-slate-900/60 backdrop-blur-md">
      <div className="flex flex-col md:flex-row">
        {/* Current Weather Section */}
        <div className="bg-gradient-to-br from-[#1e3a5f] to-[#2c5282] p-6 text-white md:w-1/3 flex flex-col justify-between">
          <div>
            {isEditingLocation ? (
              <form onSubmit={handleSearch} className="flex items-center gap-2 mb-2">
                <Input 
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="E.g. Durban..."
                  className="h-8 text-sm bg-white/20 border-white/30 text-white placeholder:text-white/60 focus-visible:ring-white/50"
                />
                <Button type="submit" size="sm" variant="ghost" className="h-8 w-8 p-0 text-white hover:bg-white/20" disabled={isSearching}>
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0 text-white hover:bg-white/20" onClick={() => setIsEditingLocation(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </form>
            ) : (
              <div className="flex items-center gap-2 mb-1 group cursor-pointer" onClick={() => {
                setIsEditingLocation(true);
                setSearchQuery(locationName === "Current Location" ? "" : locationName);
              }}>
                <MapPin className="h-4 w-4 opacity-90 group-hover:opacity-100" />
                <span className="font-medium tracking-wide opacity-90 group-hover:opacity-100 transition-opacity flex-1 truncate" title={locationName}>{locationName}</span>
                <Edit2 className="h-3 w-3 opacity-0 group-hover:opacity-80 transition-opacity" />
              </div>
            )}
            <p className="text-white/70 text-sm">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          </div>
          
          <div className="mt-6 flex items-center justify-between">
            <div>
              <div className="text-5xl font-light tracking-tighter mb-1">
                {Math.round(weather.current.temp)}°
              </div>
              <p className="text-lg font-medium opacity-90">
                {getWeatherDesc(weather.current.code)}
              </p>
            </div>
            {getWeatherIcon(weather.current.code, "h-16 w-16 opacity-90")}
          </div>
        </div>

        {/* 5-Day Forecast Section */}
        <div className="p-6 md:w-2/3 flex items-center">
          <div className="w-full flex justify-between gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {weather.daily.time.slice(1, 6).map((timeStr, index) => {
              // start from index 1 (tomorrow) up to index 5
              const date = new Date(timeStr);
              const dayName = index === 0 ? 'Tomorrow' : date.toLocaleDateString(undefined, { weekday: 'short' });
              const code = weather.daily.code[index + 1];
              const max = Math.round(weather.daily.maxTemp[index + 1]);
              const min = Math.round(weather.daily.minTemp[index + 1]);
              const sunrise = formatTime(weather.daily.sunrise[index + 1]);
              const sunset = formatTime(weather.daily.sunset[index + 1]);

              return (
                <div key={timeStr} className="flex flex-col items-center min-w-[70px] p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">{dayName}</p>
                  {getWeatherIcon(code, "h-8 w-8 mb-2")}
                  <div className="flex items-center gap-2 text-sm mb-2">
                    <span className="font-semibold text-gray-800 dark:text-gray-200">{max}°</span>
                    <span className="text-gray-400 dark:text-gray-500">{min}°</span>
                  </div>
                  <div className="mt-auto text-[10px] text-gray-400 dark:text-gray-500 flex flex-col items-center gap-1">
                    <span className="flex items-center gap-1" title="Sunrise"><Sunrise className="h-3 w-3" /> {sunrise}</span>
                    <span className="flex items-center gap-1" title="Sunset"><Sunset className="h-3 w-3" /> {sunset}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
