// types.ts
export interface Step {
  instruction: string;
  distance: string;
  duration: string;
}

export interface Route {
  distance: string;
  duration: string;
  steps: Step[];
  polyline: string;
}

export interface ScenicPoint {
  location: string;
  type: 'coastal' | 'forest' | 'iconic';
  name: string;
}

export interface DirectionsResponse {
  fastest_route: Route;
  scenic_route?: Route & {
    scenic_points: ScenicPoint[];
  };
}

export interface TransportMode {
  id: string;
  icon: React.ReactNode;
  label: string;
}

// Constants
export const ROUTE_COLORS = {
  FASTEST: '#3B82F6',  // Blue
  SCENIC: '#10B981',   // Green
  MARKERS: {
    coastal: '#0EA5E9', // Sky blue
    forest: '#059669',  // Forest green
    iconic: '#8B5CF6'   // Purple
  }
} as const;

export const TRANSPORT_MODES: TransportMode[] = [
  { id: 'driving', icon: 'Car', label: 'Drive' },
  { id: 'walking', icon: 'Footprints', label: 'Walk' },
  { id: 'bicycling', icon: 'Bike', label: 'Bike' },
  { id: 'transit', icon: 'Train', label: 'Transit' }
];