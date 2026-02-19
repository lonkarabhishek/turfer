"use client";

export function TurfMap({ embedLink }: { embedLink: string }) {
  let src = embedLink;
  const srcMatch = embedLink.match(/src="([^"]+)"/);
  if (srcMatch) {
    src = srcMatch[1];
  }

  return (
    <div className="rounded-2xl overflow-hidden">
      <iframe
        src={src}
        width="100%"
        height="360"
        style={{ border: 0 }}
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        title="Turf location on Google Maps"
      />
    </div>
  );
}
