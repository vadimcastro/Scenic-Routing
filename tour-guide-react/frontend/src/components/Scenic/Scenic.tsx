import React, { useState, useEffect, useRef, useCallback } from 'react';
import { debounce } from 'lodash';  
import { Loader } from '@googlemaps/js-api-loader';
import { 
  Compass, 
  Car, 
  Footprints, 
  Bike, 
  Train, 
  Mountain, 
  Clock, 
  Layers, 
  X,
  ChevronLeft, 
  ChevronRight,
  Info,
  Plus,
  Star
} from 'lucide-react';
import InputFields  from './InputFields'
import ScenicPointTile from './ScenicPointTile';

// Type definitions
interface Step {
  instruction: string;
  distance: string;
  duration: string;
}

// Define color mapping
const ROUTE_COLORS = {
  FASTEST: '#3B82F6',
  SCENIC: '#10B981',
  MARKERS: {
    coastal: '#0EA5E9',
    forest: '#059669',
    iconic: '#8B5CF6',
    attraction: '#0EA5E9',
    nature: '#059669'
  } as const
} as const;

const MARKER_COLORS = {
  attraction: '#0EA5E9',
  nature: '#059669',
  landmark: '#8B5CF6',
  coastal: '#0EA5E9',
  forest: '#059669',
  iconic: '#8B5CF6',
  default: '#0EA5E9'
} as const;


interface ScenicPoint {
  location: string;
  type: string;
  name: string;
  weight: number;
  place_id?: string;
  rating?: number;
  user_ratings_total?: number;
  photo_reference?: string;
  address?: string;
  description?: string;
  website?: string;
  phone?: string;
  opening_hours?: string[];
}


interface RouteStep {
  instruction: string;
  distance: string;
  duration: string;
}

interface Route {
  distance: string;
  duration: string;
  steps: RouteStep[];
  polyline: string;
  scenic_points?: ScenicPoint[];
}

interface DirectionsResponse {
  fastest_route: Route;
  scenic_route?: Route;
}


interface TransportMode {
  id: string;
  icon: React.ReactNode;
  label: string;
}

interface NavigationState {
  isActive: boolean;
  currentStep: number;
  route: Route | null;
  type: 'fastest' | 'scenic' | null;
}

interface Stop {
  id: string;
  location: string;
}

const TRANSPORT_MODES: TransportMode[] = [
  { id: 'driving', icon: <Car className="w-5 h-5" />, label: 'Drive' },
  { id: 'walking', icon: <Footprints className="w-5 h-5" />, label: 'Walk' },
  { id: 'bicycling', icon: <Bike className="w-5 h-5" />, label: 'Bike' },
  { id: 'transit', icon: <Train className="w-5 h-5" />, label: 'Transit' }
];

const Scenic: React.FC = () => {

  const [etaTolerance, setEtaTolerance] = useState(15); // Default 15%
  const [startPoint, setStartPoint] = useState('');
  const [destination, setDestination] = useState('');
  const [transportMode, setTransportMode] = useState('driving');
  const [isScenic, setIsScenic] = useState(false);
  const [directions, setDirections] = useState<DirectionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRoute, setActiveRoute] = useState<'fastest' | 'scenic' | 'both'>('both');
  const [navigation, setNavigation] = useState<NavigationState>({
    isActive: false,
    currentStep: 0,
    route: null,
    type: null
  });
  const [stops, setStops] = useState<Stop[]>([]);
  
  

  // Refs
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const fastestRouteRef = useRef<google.maps.Polyline | null>(null);
  const scenicRouteRef = useRef<google.maps.Polyline | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const startAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const destAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  // Utility Components
  const EtaSlider = () => (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <label className="text-sm font-medium text-gray-700">
          Acceptable Extra Travel Time
        </label>
        <span className="text-sm text-emerald-600 font-medium">
          {etaTolerance}%
        </span>
      </div>
      <input
        type="range"
        min="10"
        max="75"
        value={etaTolerance}
        onChange={(e) => {
          setEtaTolerance(parseInt(e.target.value));
          if (startPoint && destination && isScenic) {
            generateRoute(transportMode);
          }
        }}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
      />
      <div className="flex justify-between text-xs text-gray-500">
        <span>10% longer</span>
        <span>75% longer</span>
      </div>
    </div>
  );

  // Add this helper function at the component level
const setupAutoComplete = useCallback((inputElement: HTMLInputElement, callback: (value: string) => void) => {
  if (!window.google || !inputElement || !mapInstanceRef.current) return;

  const autocomplete = new window.google.maps.places.Autocomplete(inputElement, {
    types: ['address'],
    fields: ['formatted_address', 'geometry']
  });

  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace();
    if (place?.formatted_address) {
      callback(place.formatted_address);
    }
  });

  // Prevent form submission
  inputElement.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') e.preventDefault();
  });

  // Bind to map bounds
  mapInstanceRef.current?.addListener('bounds_changed', () => {
    autocomplete.setBounds(mapInstanceRef.current?.getBounds() as google.maps.LatLngBounds);
  });
}, []);

  // Core Utility Functions
  const clearMapElements = useCallback(() => {
    if (fastestRouteRef.current) {
      fastestRouteRef.current.setMap(null);
      fastestRouteRef.current = null;
    }
    if (scenicRouteRef.current) {
      scenicRouteRef.current.setMap(null);
      scenicRouteRef.current = null;
    }
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];
  }, []);

  const fitMapToBounds = useCallback((paths: google.maps.LatLng[][]) => {
    if (!mapInstanceRef.current) return;

  const bounds = new google.maps.LatLngBounds();
  paths.forEach(path => {
    path.forEach(point => bounds.extend(point));
  });
    
  mapInstanceRef.current.fitBounds(bounds);
  setTimeout(() => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setZoom((mapInstanceRef.current.getZoom() || 15) - 1);
    }
  }, 100);
  }, []);

  const drawRoute = useCallback((
    polyline: string,
    color: string,
    routeRef: React.MutableRefObject<google.maps.Polyline | null>
  ): google.maps.LatLng[] | null => {
  if (!mapInstanceRef.current || !window.google) return null;

  const path = google.maps.geometry.encoding.decodePath(polyline);
  
  if (routeRef.current) {
    routeRef.current.setMap(null);
  }

  routeRef.current = new google.maps.Polyline({
    path,
    geodesic: true,
    strokeColor: color,
    strokeOpacity: 0.8,
    strokeWeight: 5,
    map: mapInstanceRef.current
  });

  return path;
}, []);

const addScenicMarkers = useCallback((points: ScenicPoint[]) => {
  if (!mapInstanceRef.current || !window.google) return;

  points.forEach((point) => {
    const [lat, lng] = point.location.split(',').map(Number);
    const marker = new google.maps.Marker({
      position: { lat, lng },
      map: mapInstanceRef.current,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: getPointColor(point.type),
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
      },
      title: point.name,
      animation: window.google.maps.Animation.DROP
    });

    // Create HTML content as a regular template literal string
    const infoContent = `
      <div style="padding: 1rem; max-width: 300px; font-family: system-ui, sans-serif;">
        <h3 style="font-size: 1.1rem; font-weight: 600; margin-bottom: 0.5rem;">${point.name}</h3>
        
        ${point.rating ? 
          `<div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
            <span style="color: #FBBF24">★</span>
            <span style="font-weight: 500">${point.rating}</span>
            ${point.user_ratings_total ? 
              `<span style="color: #6B7280; font-size: 0.875rem">(${point.user_ratings_total} reviews)</span>` 
              : ''
            }
          </div>`
          : ''
        }
        
        ${point.description ? 
          `<p style="color: #4B5563; font-size: 0.875rem; margin-bottom: 0.5rem;">
            ${point.description}
          </p>`
          : ''
        }
        
        ${point.address ? 
          `<p style="color: #6B7280; font-size: 0.875rem; margin-bottom: 0.5rem;">
            ${point.address}
          </p>`
          : ''
        }
        
        ${point.website ? 
          `<a href="${point.website}" 
              target="_blank" 
              style="color: #2563EB; text-decoration: underline; font-size: 0.875rem; display: block;">
            Visit Website
          </a>`
          : ''
        }
      </div>
    `;

    const infoWindow = new window.google.maps.InfoWindow({
      content: infoContent
    });

    marker.addListener('click', () => {
      infoWindow.open(mapInstanceRef.current, marker);
    });

    markersRef.current.push(marker);
  });
}, []);

  const addStop = () => {
    setStops([...stops, { id: crypto.randomUUID(), location: '' }]);
  };
  
  const removeStop = (id: string) => {
    setStops(stops.filter(stop => stop.id !== id));
  };
  
  const updateStop = (id: string, location: string) => {
    setStops(stops.map(stop => 
      stop.id === id ? { ...stop, location } : stop
    ));
  };

  // Route generation and map initialization
  const generateRoute = useCallback(async (mode: string) => {
    if (!startPoint || !destination) {
      setError('Please enter both start point and destination');
      return;
    }
  
    setLoading(true);
    setError(null);
    clearMapElements();
  
    try {
      const response = await fetch('http://localhost:8000/api/tour', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: startPoint,
          destination,
          waypoints: stops.map(stop => stop.location).filter(Boolean),
          mode,
          scenic: isScenic,
          eta_tolerance: etaTolerance
        })
      });

      console.log('Route response:', response);

      if (!response.ok) throw new Error('Failed to generate route');

      const data: DirectionsResponse = await response.json();
      setDirections(data);

      // Draw routes and collect paths for bounds
      const paths: google.maps.LatLng[][] = [];

      // Draw fastest route
      const fastestPath = drawRoute(
        data.fastest_route.polyline,
        ROUTE_COLORS.FASTEST,
        fastestRouteRef
      );
      if (fastestPath) paths.push(fastestPath);

      // Draw scenic route if available
      if (data.scenic_route) {
        const scenicPath = drawRoute(
          data.scenic_route.polyline,
          ROUTE_COLORS.SCENIC,
          scenicRouteRef
        );
        if (scenicPath) paths.push(scenicPath);

        // Add markers for scenic points
        if (data.scenic_route.scenic_points?.length) {
          addScenicMarkers(data.scenic_route.scenic_points);
        }
      }

      // Fit map to show all routes
      if (paths.length > 0) {
        fitMapToBounds(paths);
      }

    } catch (error) {
      console.error('Error generating route:', error);
      setError('Failed to generate route. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [ startPoint, destination, stops, isScenic, etaTolerance, clearMapElements ]);


  const debouncedGenerateRoute = useCallback(
    debounce((mode: string) => {
      if (startPoint && destination) {
        generateRoute(mode);
      }
    }, 1000),
    [startPoint, destination, generateRoute]
  );

  // Update your map initialization useEffect
  useEffect(() => {
    const initializeMap = async () => {
      if (!mapRef.current || mapInstanceRef.current) return;
  
      try {
        const loader = new Loader({
          apiKey: process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '',
          version: 'weekly',
          libraries: ['places', 'geometry']
        });
  
        await loader.load();
        
        const map = new google.maps.Map(mapRef.current, {
          center: { lat: 40.7128, lng: -74.0060 },
          zoom: 12,
          styles: [
            {
              featureType: 'water',
              elementType: 'geometry',
              stylers: [{ color: '#E0F2FE' }]
            },
            {
              featureType: 'landscape.natural',
              elementType: 'geometry',
              stylers: [{ color: '#F0FDF4' }]
            },
            {
              featureType: 'landscape.natural.terrain',
              elementType: 'geometry',
              stylers: [{ color: '#D1FAE5' }]
            }
          ],
          mapTypeControl: false,
          fullscreenControl: false,
          streetViewControl: false
        });
  
        mapInstanceRef.current = map;
      } catch (error) {
        console.error('Error initializing map:', error);
        setError('Failed to load Google Maps. Please check your API key and try again.');
      }
    };
  
    initializeMap();
  }, []);

  // Handle route visibility
  useEffect(() => {
    const showFastest = activeRoute === 'fastest' || activeRoute === 'both';
    const showScenic = activeRoute === 'scenic' || activeRoute === 'both';

    if (fastestRouteRef.current) {
      fastestRouteRef.current.setVisible(showFastest);
    }
    if (scenicRouteRef.current) {
      scenicRouteRef.current.setVisible(showScenic);
    }
    markersRef.current.forEach(marker => {
      marker.setVisible(showScenic);
    });
  }, [activeRoute]);

  // Update the route recalculation effect
useEffect(() => {
  if (startPoint && destination) {
    debouncedGenerateRoute(transportMode);
  }
}, [isScenic, transportMode]); // Only recalculate when scenic mode or transport mode changes

  // Cleanup effect
  useEffect(() => {
    return () => {
      clearMapElements();
      if (mapInstanceRef.current) {
        const google = window.google;
        if (google) {
          google.maps.event.clearInstanceListeners(mapInstanceRef.current);
        }
      }
    };
  }, [clearMapElements]);

  // Route Card Component
  const RouteCard = ({ 
    type, 
    route, 
    icon, 
    color, 
    isActive 
  }: {
    type: 'fastest' | 'scenic';
    route: Route;
    icon: React.ReactNode;
    color: string;
    isActive: boolean;
  }) => (
    <div className={`p-4 rounded-lg border-2 transition-all ${
      isActive 
        ? `border-${color}-500 bg-${color}-50` 
        : 'border-gray-200 hover:border-gray-300'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="font-medium capitalize">{type} Route</h3>
        </div>
        <div className={`px-2 py-1 rounded text-sm bg-${color}-100 text-${color}-700`}>
          {route.duration}
        </div>
      </div>
      <div className="text-sm text-gray-600">
        <p>Distance: {route.distance}</p>
        {type === 'scenic' && directions?.scenic_route?.scenic_points && (
          <p className="mt-1 text-emerald-600">
            {directions.scenic_route.scenic_points.length} scenic points
          </p>
        )}
      </div>
      <button
        onClick={() => {
          setNavigation({
            isActive: true,
            currentStep: 0,
            route,
            type
          });
        }}
        className={`mt-3 w-full p-2 rounded-lg text-sm font-medium transition-colors
          ${type === 'fastest' 
            ? 'bg-blue-600 hover:bg-blue-700 text-white'
            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
          }`}
      >
        Start Navigation
      </button>
    </div>
  );

  // Turn-by-Turn Navigation Panel
  const TurnByTurnPanel = ({ 
    route, 
    type, 
    onClose 
  }: {
    route: Route;
    type: 'fastest' | 'scenic';
    onClose: () => void;
  }) => {
    const [currentStep, setCurrentStep] = useState(0);

    return (
      <div className="absolute bottom-0 left-96 right-0 bg-white shadow-lg z-10">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            {type === 'fastest' ? (
              <Clock className="w-5 h-5 text-blue-600" />
            ) : (
              <Mountain className="w-5 h-5 text-emerald-600" />
            )}
            <h3 className="font-medium capitalize">{type} Route</h3>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              Step {currentStep + 1} of {route.steps.length}
            </span>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex">
          <div className="w-64 p-4 border-r bg-gray-50">
            <div className="space-y-2">
              <p className="text-sm font-medium">Distance: {route.distance}</p>
              <p className="text-sm font-medium">Duration: {route.duration}</p>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setCurrentStep(prev => Math.max(0, prev - 1))}
                disabled={currentStep === 0}
                className="flex-1 p-2 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4 mx-auto" />
              </button>
              <button
                onClick={() => setCurrentStep(prev => Math.min(route.steps.length - 1, prev + 1))}
                disabled={currentStep === route.steps.length - 1}
                className="flex-1 p-2 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
              >
                <ChevronRight className="w-4 h-4 mx-auto" />
              </button>
            </div>
          </div>
          <div className="flex-1 max-h-64 overflow-y-auto p-4">
            <div className="space-y-4">
              {route.steps.map((step, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg transition-colors cursor-pointer ${
                    currentStep === index
                      ? type === 'fastest'
                        ? 'bg-blue-50 border border-blue-200'
                        : 'bg-emerald-50 border border-emerald-200'
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() => setCurrentStep(index)}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                      currentStep === index
                        ? type === 'fastest'
                          ? 'bg-blue-600 text-white'
                          : 'bg-emerald-600 text-white'
                        : 'bg-gray-200 text-gray-700'
                    }`}>
                      {index + 1}
                    </div>
                    <div>
                      <div 
                        className="text-sm"
                        dangerouslySetInnerHTML={{ __html: step.instruction }}
                      />
                      <div className="text-xs text-gray-500 mt-1">
                        {step.distance} • {step.duration}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

// Helper function for type-safe color access
const getPointColor = (type: string): string => {
  return type in MARKER_COLORS 
    ? MARKER_COLORS[type as keyof typeof MARKER_COLORS] 
    : MARKER_COLORS.default;
};

  // Separate component for scenic points display
  const ScenicPointsList: React.FC<{ points: ScenicPoint[] }> = ({ points }) => {
    return (
      <div className="mt-4 bg-gray-50 rounded-lg p-4">
        <h3 className="font-medium mb-3">Scenic Points</h3>
        <div className="space-y-3">
          {points.map((point, index) => (
            <div key={index} className="flex items-start gap-3 p-2 bg-white rounded border border-gray-200">
              <div
                className="w-3 h-3 rounded-full mt-1"
                style={{ backgroundColor: getPointColor(point.type) }}
              />
              <div>
                <p className="font-medium text-sm">{point.name}</p>
                <p className="text-xs text-gray-500 capitalize">{point.type}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };
  
  const ScenicPointsSection: React.FC<{ directions: DirectionsResponse | null }> = ({ directions }) => {
    const [selectedPoint, setSelectedPoint] = useState<ScenicPoint | null>(null);
    const [showModal, setShowModal] = useState(false);
  
    const points = directions?.scenic_route?.scenic_points;
    if (!points || points.length === 0) return null;
  
    const closeModal = () => {
      setSelectedPoint(null);
      setShowModal(false);
    };
  
    return (
      <>
        <div className="mt-4 bg-gray-50 rounded-lg p-4">
          <h3 className="font-medium mb-3">Scenic Points</h3>
          <div className="space-y-3">
            {points.map((point, index) => (
              <div
                key={index}
                onClick={() => {
                  setSelectedPoint(point);
                  setShowModal(true);
                }}
                className="flex items-start gap-3 p-2 bg-white rounded border border-gray-200 cursor-pointer hover:border-emerald-500 transition-colors"
              >
                <div
                  className="w-3 h-3 rounded-full mt-1"
                  style={{ backgroundColor: getPointColor(point.type) }}
                />
                <div>
                  <p className="font-medium text-sm">{point.name}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-gray-500 capitalize">{point.type}</p>
                    {point.rating && (
                      <div className="flex items-center gap-1">
                        <Star className="w-3 h-3 fill-yellow-400 stroke-yellow-400" />
                        <span className="text-xs">{point.rating}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
  
        {showModal && selectedPoint && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={closeModal}
          >
            <div 
              className="bg-white rounded-lg max-w-md w-full p-6 relative"
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={closeModal}
                className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
  
              <div className="space-y-4">
                <h2 className="text-xl font-semibold">{selectedPoint.name}</h2>
                
                {selectedPoint.rating && (
                  <div className="flex items-center gap-2">
                    <Star className="w-5 h-5 fill-yellow-400 stroke-yellow-400" />
                    <span className="font-medium">{selectedPoint.rating}</span>
                    {selectedPoint.user_ratings_total && (
                      <span className="text-gray-500">
                        ({selectedPoint.user_ratings_total} reviews)
                      </span>
                    )}
                  </div>
                )}
  
                {selectedPoint.description && (
                  <p className="text-gray-600">{selectedPoint.description}</p>
                )}
  
                {selectedPoint.address && (
                  <div className="text-gray-600">{selectedPoint.address}</div>
                )}
  
                {selectedPoint.website && (
                <a
                  href={selectedPoint.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline block"
                >
                  Visit Website
                </a>
              )}
              </div>
            </div>
          </div>
        )}
      </>
    );
  };
  // Map marker creation function
  const createMarker = (point: ScenicPoint, mapInstance: google.maps.Map) => {
    return new google.maps.Marker({
      position: { 
        lat: parseFloat(point.location.split(',')[0]), 
        lng: parseFloat(point.location.split(',')[1]) 
      },
      map: mapInstance,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: getPointColor(point.type),  // Using our helper function here
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
      },
      title: point.name
    });
  };


  // Main render method
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-96 bg-white shadow-lg z-10 flex flex-col">
        {/* Header */}
        
        <div className="py-2 px-6 border-b flex items-center gap-8 bg-gradient-to-r from-emerald-800 to-emerald-600"> {/* Changed py-3 to py-2 */}
        <div className="w-10 h-10 flex items-center justify-center flex-shrink-0"> {/* Reduced from w-12 h-12 to w-10 h-10 */}
          <Compass className="w-8 h-8 text-white" /> {/* Reduced from w-10 h-10 to w-8 h-8 */}
        </div>
        <h1 className="text-3xl font-bold text-white tracking-[.8em] flex-grow text-center pr-14"> {/* Changed text-4xl to text-3xl */}
          SCENIC
        </h1>
      </div>
      
        {/* Main Content */}
        <div className="flex-1 p-6 space-y-6 overflow-y-auto">
          {/* Input Fields */}
          <div className="space-y-4">
          <InputFields
            startPoint={startPoint}
            setStartPoint={setStartPoint}
            destination={destination}
            setDestination={setDestination}
            stops={stops}
            setStops={setStops}
            mapInstance={mapInstanceRef.current}
          />

            {/* Transport Mode Selection */}
            <div className="grid grid-cols-4 gap-2">
              {TRANSPORT_MODES.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => {
                    setTransportMode(mode.id);
                    if (startPoint && destination) generateRoute(mode.id);
                  }}
                  className={`p-3 rounded-lg flex flex-col items-center justify-center transition-colors ${
                    transportMode === mode.id
                      ? 'bg-emerald-100 text-emerald-700 border-2 border-emerald-500'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {mode.icon}
                  <span className="text-xs mt-1">{mode.label}</span>
                </button>
              ))}
            </div>

            {/* Scenic Toggle and ETA Slider */}
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-lg">
                <label className="flex items-center gap-3">
                  <div className="relative">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={isScenic}
                      onChange={(e) => setIsScenic(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600" />
                  </div>
                  <span className="text-sm font-medium text-emerald-900">
                    Find Scenic Route
                  </span>
                </label>
                <Mountain className="w-5 h-5 text-emerald-600" />
              </div>

              {/* Show ETA Slider only when scenic mode is enabled */}
              {isScenic && <EtaSlider />}
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex justify-center items-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Routes Display */}
          {directions && (
            <div className="space-y-4">
              {/* Route Toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveRoute('fastest')}
                  className={`flex-1 p-2 rounded-lg flex items-center justify-center gap-2 transition-colors ${
                    activeRoute === 'fastest' || activeRoute === 'both'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  <span>Fastest</span>
                </button>
                {directions.scenic_route && (
                  <>
                    <button
                      onClick={() => setActiveRoute('scenic')}
                      className={`flex-1 p-2 rounded-lg flex items-center justify-center gap-2 transition-colors ${
                        activeRoute === 'scenic' || activeRoute === 'both'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <Mountain className="w-4 h-4" />
                      <span>Scenic</span>
                    </button>
                    <button
                      onClick={() => setActiveRoute('both')}
                      className={`p-2 rounded-lg transition-colors ${
                        activeRoute === 'both'
                          ? 'bg-gray-100 text-gray-700'
                          : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <Layers className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>

              {/* Routes Summary */}
              <div className="space-y-3">
                <RouteCard
                  type="fastest"
                  route={directions.fastest_route}
                  icon={<Clock className="w-5 h-5 text-blue-600" />}
                  color="blue"
                  isActive={activeRoute === 'fastest' || activeRoute === 'both'}
                />

                {directions.scenic_route && (
                  <RouteCard
                    type="scenic"
                    route={directions.scenic_route}
                    icon={<Mountain className="w-5 h-5 text-emerald-600" />}
                    color="emerald"
                    isActive={activeRoute === 'scenic' || activeRoute === 'both'}
                  />
                )}
              </div>
            </div>
          )}

          {directions?.scenic_route?.scenic_points && (
            <ScenicPointsSection directions={directions} />
          )}

        </div>
      </div>

      {/* Map Container */}
      <div ref={mapRef} className="flex-1" />

      {/* Navigation Panel */}
      {navigation.isActive && navigation.route && (
        <TurnByTurnPanel
          route={navigation.route}
          type={navigation.type!}
          onClose={() => setNavigation({
            isActive: false,
            currentStep: 0,
            route: null,
            type: null
          })}
        />
      )}
    </div>
  );
};

export default Scenic;