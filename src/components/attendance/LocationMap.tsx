import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icon
delete (L.Icon.Default.prototype as { _getIconUrl?: () => string })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface LocationMapProps {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

const LocationMap = ({ latitude, longitude, accuracy }: LocationMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    // Initialize map only once
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current, {
        center: [latitude, longitude],
        zoom: 16,
        zoomControl: true,
        attributionControl: true,
      });

      // Add OpenStreetMap tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(mapInstanceRef.current);

      // Add marker
      markerRef.current = L.marker([latitude, longitude])
        .addTo(mapInstanceRef.current)
        .bindPopup('Lokasi Anda')
        .openPopup();

      // Add accuracy circle if available
      if (accuracy) {
        circleRef.current = L.circle([latitude, longitude], {
          color: '#3b82f6',
          fillColor: '#3b82f6',
          fillOpacity: 0.15,
          radius: accuracy,
          weight: 2,
        }).addTo(mapInstanceRef.current);
      }
    } else {
      // Update existing map
      mapInstanceRef.current.setView([latitude, longitude], 16);

      // Update marker position
      if (markerRef.current) {
        markerRef.current.setLatLng([latitude, longitude]);
      } else {
        markerRef.current = L.marker([latitude, longitude])
          .addTo(mapInstanceRef.current)
          .bindPopup('Lokasi Anda')
          .openPopup();
      }

      // Update accuracy circle
      if (accuracy) {
        if (circleRef.current) {
          circleRef.current.setLatLng([latitude, longitude]);
          circleRef.current.setRadius(accuracy);
        } else {
          circleRef.current = L.circle([latitude, longitude], {
            color: '#3b82f6',
            fillColor: '#3b82f6',
            fillOpacity: 0.15,
            radius: accuracy,
            weight: 2,
          }).addTo(mapInstanceRef.current);
        }
      }
    }

    return () => {
      // Cleanup on unmount
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
        circleRef.current = null;
      }
    };
  }, [latitude, longitude, accuracy]);

  return (
    <div
      ref={mapRef}
      className="w-full h-48 rounded-lg border-2 border-foreground overflow-hidden relative z-0"
      style={{ minHeight: '200px' }}
    />
  );
};

export default LocationMap;
