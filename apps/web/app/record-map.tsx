"use client";

import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";

type RecordMapProps = {
  latitude: number;
  longitude: number;
  title: string;
};

export default function RecordMap({
  latitude,
  longitude,
  title,
}: RecordMapProps) {
  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={15}
      scrollWheelZoom={false}
      className="record-map"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <CircleMarker
        center={[latitude, longitude]}
        radius={9}
        pathOptions={{ color: "#193126", fillColor: "#f3a712", fillOpacity: 1 }}
      >
        <Popup>{title}</Popup>
      </CircleMarker>
    </MapContainer>
  );
}
