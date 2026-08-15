import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Upload,
  Trash2,
  Star,
  X,
  Image as ImageIcon,
  AlertCircle,
  Check,
} from 'lucide-react';
import { LessonPhoto } from '../types';

interface ClassroomPhotoEvidenceProps {
  photos: LessonPhoto[];
  onChange: (photos: LessonPhoto[]) => void;
}

// Photos are persisted in localStorage alongside the rest of the record, so
// they are downscaled hard before being stored - full-resolution phone photos
// would blow the storage quota after only a handful of observations.
const MAX_EDGE_PX = 1280;
const JPEG_QUALITY = 0.7;
const MAX_PHOTOS = 12;

function compressToDataUrl(source: CanvasImageSource, width: number, height: number): string {
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

function readFileAsImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('That image could not be read.'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.readAsDataURL(file);
  });
}

export const ClassroomPhotoEvidence: React.FC<ClassroomPhotoEvidenceProps> = ({
  photos,
  onChange,
}) => {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }, []);

  // Never leave the camera running when this panel goes away.
  useEffect(() => stopCamera, [stopCamera]);

  const addPhoto = (dataUrl: string, source: LessonPhoto['source']) => {
    if (!dataUrl) return;
    if (photos.length >= MAX_PHOTOS) {
      setError(`A maximum of ${MAX_PHOTOS} photos can be attached to one observation.`);
      return;
    }
    onChange([
      ...photos,
      {
        id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        dataUrl,
        caption: '',
        source,
        capturedAt: new Date().toISOString(),
        isBestPractice: false,
      },
    ]);
  };

  const openCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      // The element only exists once the panel renders.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => undefined);
        }
      });
    } catch {
      setError(
        'Camera access was denied or unavailable. You can still upload photos from this device.'
      );
    }
  };

  const takeSnapshot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    addPhoto(compressToDataUrl(video, video.videoWidth, video.videoHeight), 'Camera');
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);

    const room = MAX_PHOTOS - photos.length;
    const chosen = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, room);
    if (!chosen.length) {
      setError('No usable image files were selected.');
      return;
    }

    const added: LessonPhoto[] = [];
    for (const file of chosen) {
      try {
        const img = await readFileAsImage(file);
        const dataUrl = compressToDataUrl(img, img.naturalWidth, img.naturalHeight);
        if (!dataUrl) continue;
        added.push({
          id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          dataUrl,
          caption: '',
          source: 'Upload',
          capturedAt: new Date().toISOString(),
          isBestPractice: false,
        });
      } catch (e: any) {
        setError(e?.message || 'One of the images could not be read.');
      }
    }

    if (added.length) onChange([...photos, ...added]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const update = (id: string, patch: Partial<LessonPhoto>) => {
    onChange(photos.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const remove = (id: string) => onChange(photos.filter((p) => p.id !== id));

  const bestPracticeCount = photos.filter((p) => p.isBestPractice).length;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-indigo-600" />
            Classroom Photo Evidence
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Capture the room or upload photos, caption them, and flag the ones worth sharing
            as best practice. Captioned photos appear in the observation report.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={cameraOpen ? stopCamera : openCamera}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition cursor-pointer shadow-2xs"
          >
            <Camera className="w-3.5 h-3.5 text-indigo-600" />
            {cameraOpen ? 'Close Camera' : 'Take Snapshot'}
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-sm"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload Photos
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 mb-4 p-2.5 rounded-xl bg-amber-50 border border-amber-200">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800">{error}</p>
        </div>
      )}

      {cameraOpen && (
        <div className="mb-4 rounded-xl overflow-hidden border border-slate-200 bg-slate-900 relative">
          <video ref={videoRef} playsInline muted className="w-full max-h-72 object-contain" />
          <div className="absolute inset-x-0 bottom-0 p-3 flex items-center justify-center gap-2 bg-gradient-to-t from-slate-900/80 to-transparent">
            <button
              type="button"
              onClick={takeSnapshot}
              className="flex items-center gap-2 px-4 py-2 bg-white text-slate-900 text-xs font-bold rounded-xl shadow cursor-pointer hover:bg-slate-100 transition"
            >
              <Camera className="w-4 h-4" />
              Capture Frame
            </button>
          </div>
        </div>
      )}

      {photos.length === 0 ? (
        <div className="border border-dashed border-slate-300 rounded-xl py-8 text-center">
          <ImageIcon className="w-7 h-7 text-slate-300 mx-auto mb-2" />
          <p className="text-xs font-semibold text-slate-600">No photos attached yet</p>
          <p className="text-[11px] text-slate-400 mt-1">
            Photo evidence is optional, and is only used where it supports an indicator.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className={`rounded-xl border overflow-hidden bg-slate-50 transition ${
                  photo.isBestPractice ? 'border-amber-300 ring-1 ring-amber-200' : 'border-slate-200'
                }`}
              >
                <div className="relative">
                  <img
                    src={photo.dataUrl}
                    alt={photo.caption || 'Classroom evidence'}
                    className="w-full h-36 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => remove(photo.id)}
                    title="Remove photo"
                    aria-label="Remove photo"
                    className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-slate-900/70 hover:bg-red-600 text-white flex items-center justify-center transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <span className="absolute top-1.5 left-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-900/70 text-white">
                    {photo.source}
                  </span>
                </div>

                <div className="p-2.5">
                  <textarea
                    value={photo.caption}
                    onChange={(e) => update(photo.id, { caption: e.target.value })}
                    placeholder="Caption this evidence (what it shows, why it matters)…"
                    rows={2}
                    className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg outline-none resize-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />

                  <button
                    type="button"
                    onClick={() => update(photo.id, { isBestPractice: !photo.isBestPractice })}
                    className={`mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                      photo.isBestPractice
                        ? 'bg-amber-50 text-amber-700 border-amber-300'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {photo.isBestPractice ? <Check className="w-3.5 h-3.5" /> : <Star className="w-3.5 h-3.5" />}
                    {photo.isBestPractice ? 'Shared as Best Practice' : 'Mark as Best Practice'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>
              {photos.length} of {MAX_PHOTOS} photos • {bestPracticeCount} flagged as best practice
            </span>
            {photos.some((p) => !p.caption.trim()) && (
              <span className="text-amber-700 font-medium">
                Uncaptioned photos are left out of the report.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
};
