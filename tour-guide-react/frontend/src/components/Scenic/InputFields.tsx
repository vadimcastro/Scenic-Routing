import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, GripVertical } from 'lucide-react';
import { 
  DragDropContext, 
  Droppable, 
  Draggable, 
  DropResult,
  DroppableProvided,
  DroppableStateSnapshot,
  DraggableProvided,
  DraggableStateSnapshot
} from 'react-beautiful-dnd';

declare global {
  interface Window {
    google: typeof google;
  }
}

const StrictModeDroppable = ({ children, ...props }: any) => {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const animation = requestAnimationFrame(() => setEnabled(true));
    return () => {
      cancelAnimationFrame(animation);
      setEnabled(false);
    };
  }, []);

  if (!enabled) {
    return null;
  }

  return <Droppable {...props}>{children}</Droppable>;
};

interface Stop {
  id: string;
  location: string;
}

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  id: string;
  placeholder: string;
  label: string;
  mapInstance?: google.maps.Map | null;
}

const reorder = (list: Stop[], startIndex: number, endIndex: number): Stop[] => {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
};

const AutocompleteInput = ({ 
  value, 
  onChange, 
  id, 
  placeholder, 
  label,
  mapInstance 
}: AutocompleteInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input || typeof window === 'undefined' || !window.google?.maps?.places) return;

    autocompleteRef.current = new window.google.maps.places.Autocomplete(input, {
      fields: ['formatted_address', 'geometry', 'name'],
      types: ['geocode', 'establishment'],
    });

    const handlePlaceSelect = () => {
      const place = autocompleteRef.current?.getPlace();
      if (place) {
        const selectedValue = place.formatted_address || place.name || '';
        if (selectedValue) {
          onChange(selectedValue);
        }
      }
    };

    autocompleteRef.current.addListener('place_changed', handlePlaceSelect);

    const preventSubmit = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
      }
    };
    
    input.addEventListener('keydown', preventSubmit);

    if (mapInstance && autocompleteRef.current) {
      autocompleteRef.current.bindTo('bounds', mapInstance);
    }

    return () => {
      if (window.google?.maps && autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
      input.removeEventListener('keydown', preventSubmit);
    };
  }, [onChange, mapInstance]);

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-500 mb-1">
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white text-sm"
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
      />
    </div>
  );
};

interface InputFieldsProps {
  startPoint: string;
  setStartPoint: (value: string) => void;
  destination: string;
  setDestination: (value: string) => void;
  stops: Stop[];
  setStops: (stops: Stop[]) => void;
  mapInstance?: google.maps.Map | null;
}

const InputFields = ({ 
  startPoint,
  setStartPoint,
  destination,
  setDestination,
  stops,
  setStops,
  mapInstance
}: InputFieldsProps) => {
  const addStop = () => {
    const newStop: Stop = {
      id: crypto.randomUUID(),
      location: ''
    };
    setStops([...stops, newStop]);
  };

  const removeStop = (id: string) => {
    setStops(stops.filter(stop => stop.id !== id));
  };

  const updateStop = (id: string, location: string) => {
    setStops(stops.map(stop => 
      stop.id === id ? { ...stop, location } : stop
    ));
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    
    const items = reorder(
      stops,
      result.source.index,
      result.destination.index
    );
    
    setStops(items);
  };

  const MAX_STOPS = 5;

  return (
    <div className="space-y-3 -mt-2">
      {/* Starting Point */}
      <AutocompleteInput
        value={startPoint}
        onChange={setStartPoint}
        id="startPoint"
        placeholder="Enter starting point"
        label="Start"
        mapInstance={mapInstance}
      />

      {/* Stops */}
      {stops.length > 0 && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <StrictModeDroppable droppableId="stops">
            {(provided: DroppableProvided, snapshot: DroppableStateSnapshot) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className={`space-y-3 ${snapshot.isDraggingOver ? 'bg-gray-50 rounded-lg p-2' : ''}`}
              >
                {stops.map((stop, index) => (
                  <Draggable key={stop.id} draggableId={stop.id} index={index}>
                    {(provided: DraggableProvided, snapshot: DraggableStateSnapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        style={provided.draggableProps.style}
                        className={`relative rounded-lg ${
                          snapshot.isDragging ? 'bg-gray-50 shadow-lg' : ''
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <div
                            {...provided.dragHandleProps}
                            className="mt-7 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing"
                          >
                            <GripVertical className="w-5 h-5" />
                          </div>
                          <div className="flex-grow">
                            <AutocompleteInput
                              value={stop.location}
                              onChange={(value) => updateStop(stop.id, value)}
                              id={`stop-${stop.id}`}
                              placeholder={`Enter stop ${index + 1}`}
                              label={`Stop ${index + 1}`}
                              mapInstance={mapInstance}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeStop(stop.id)}
                            className="mt-6 p-1 text-gray-400 hover:text-red-500 transition-colors"
                            aria-label="Remove stop"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </StrictModeDroppable>
        </DragDropContext>
      )}

      {/* Add Stop Button */}
      {stops.length < MAX_STOPS && (
        <button
          type="button"
          onClick={addStop}
          className="w-full p-2 border border-dashed border-gray-300 rounded-lg text-gray-500 hover:text-emerald-600 hover:border-emerald-500 hover:bg-emerald-50 transition-colors text-sm flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Stop
        </button>
      )}

      {/* Destination */}
      <AutocompleteInput
        value={destination}
        onChange={setDestination}
        id="destination"
        placeholder="Enter destination"
        label="End"
        mapInstance={mapInstance}
      />
    </div>
  );
};

export default InputFields;