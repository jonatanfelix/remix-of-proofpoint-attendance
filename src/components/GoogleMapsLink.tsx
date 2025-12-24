import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type GoogleMapsLinkProps = {
  /** String in the form "lat,lng" */
  query: string;
  children: ReactNode;
  className?: string;
  title?: string;
};

const parseLatLng = (query: string): { latitude: number; longitude: number } | null => {
  const parts = query
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length < 2) return null;

  const latitude = Number(parts[0]);
  const longitude = Number(parts[1]);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  // Per requirement: treat 0 as invalid (avoid null/0 placeholders)
  if (latitude === 0 || longitude === 0) return null;

  return { latitude, longitude };
};

const GoogleMapsLink = ({ query, children, className, title }: GoogleMapsLinkProps) => {
  const coords = parseLatLng(query);
  if (!coords) return null;

  return (
    <a
      href={`https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(className)}
      title={title}
    >
      {children}
    </a>
  );
};

export default GoogleMapsLink;
