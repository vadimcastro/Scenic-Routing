import React, { useState } from 'react';
import { ExternalLink, Phone, Clock, Star, Map, X } from 'lucide-react';

interface ScenicPoint {
  location: string;
  type: string;
  name: string;
  weight: number;
  place_id: string;
  rating?: number;
  user_ratings_total?: number;
  photo_reference?: string;
  address?: string;
  description?: string;
  website?: string;
  phone?: string;
  opening_hours?: string[];
}

interface ScenicPointTileProps {
  point: ScenicPoint;
}

const Modal = ({ isOpen, onClose, children }: { 
  isOpen: boolean; 
  onClose: () => void; 
  children: React.ReactNode;
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        {children}
      </div>
    </div>
  );
};

const ScenicPointTile: React.FC<ScenicPointTileProps> = ({ point }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  const getPhotoUrl = (photoReference?: string) => {
    if (!photoReference) return "/api/placeholder/400/300";
    return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photoReference}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`;
  };

  return (
    <>
      <div
        onClick={() => setIsOpen(true)}
        className="relative p-4 border rounded-lg hover:border-emerald-500 cursor-pointer transition-all bg-white hover:shadow-md"
      >
        <div className="flex items-start gap-4">
          <div className="w-20 h-20 rounded overflow-hidden flex-shrink-0">
            <img
              src={getPhotoUrl(point.photo_reference)}
              alt={point.name}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-grow">
            <h3 className="font-medium text-gray-900 mb-1">{point.name}</h3>
            <div className="flex items-center gap-1 text-sm text-gray-600">
              {point.rating && (
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 fill-yellow-400 stroke-yellow-400" />
                  <span>{point.rating}</span>
                  {point.user_ratings_total && (
                    <span className="text-gray-400">
                      ({point.user_ratings_total})
                    </span>
                  )}
                </div>
              )}
            </div>
            {point.address && (
              <p className="text-sm text-gray-500 mt-1 truncate">
                {point.address}
              </p>
            )}
          </div>
        </div>
      </div>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)}>
        <div className="p-6">
          <h2 className="text-2xl font-semibold mb-4">{point.name}</h2>
          
          <div className="space-y-4">
            {/* Main Image */}
            <div className="relative h-48 rounded-lg overflow-hidden bg-gray-100">
              <img
                src={getPhotoUrl(point.photo_reference)}
                alt={point.name}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Rating and Reviews */}
            {point.rating && (
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 fill-yellow-400 stroke-yellow-400" />
                <span className="font-medium">{point.rating}</span>
                {point.user_ratings_total && (
                  <span className="text-gray-500">
                    ({point.user_ratings_total} reviews)
                  </span>
                )}
              </div>
            )}

            {/* Description */}
            {point.description && (
              <p className="text-gray-600">
                {point.description}
              </p>
            )}

            {/* Address */}
            {point.address && (
              <div className="flex items-start gap-2">
                <Map className="w-5 h-5 text-gray-500 mt-1 flex-shrink-0" />
                <p className="text-gray-600">{point.address}</p>
              </div>
            )}

            {/* Contact Info */}
            <div className="space-y-2">
              {point.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-5 h-5 text-gray-500" />
                  <a
                    href={`tel:${point.phone}`}
                    className="text-blue-600 hover:underline"
                  >
                    {point.phone}
                  </a>
                </div>
              )}
              
              {point.website && (
                <div className="flex items-center gap-2">
                  <ExternalLink className="w-5 h-5 text-gray-500" />
                  <a
                    href={point.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Visit Website
                  </a>
                </div>
              )}
            </div>

            {/* Opening Hours */}
            {point.opening_hours && point.opening_hours.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-gray-900">
                  <Clock className="w-5 h-5" />
                  <h4 className="font-medium">Opening Hours</h4>
                </div>
                <div className="grid grid-cols-1 gap-1 text-sm text-gray-600 pl-7">
                  {point.opening_hours.map((hours, index) => (
                    <div key={index}>{hours}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
};

export default ScenicPointTile;