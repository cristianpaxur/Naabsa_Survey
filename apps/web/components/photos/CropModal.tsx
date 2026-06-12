'use client';

import { useCallback, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import type { Crop } from '@/lib/actions/photos';

/** Converte "4:3" → número 4/3. Default 4/3 se inválido. */
export function parseAspect(aspect: string): number {
  const m = aspect.split(':');
  const w = Number(m[0]);
  const h = Number(m[1]);
  if (Number.isFinite(w) && Number.isFinite(h) && h > 0) return w / h;
  return 4 / 3;
}

export interface CropModalProps {
  /** URL assinada da imagem processada. */
  imageUrl: string;
  /** Aspect do slot (ex.: "4:3"). */
  aspect: string;
  /** Rótulo do slot (exibido no cabeçalho). */
  slotLabel: string;
  /** Crop salvo anteriormente (restaura o recorte ao reabrir). */
  initialCrop: Crop | null;
  onClose: () => void;
  /** Salva o crop relativo à processada (0–1). */
  onSave: (crop: Crop) => Promise<void> | void;
}

/**
 * Modal "Recortar foto" (RF-18). react-easy-crop travado no aspect do slot,
 * grade de terços e zoom. Salva `{x,y,width,height}` relativo à processada
 * (0–1). Reabrir restaura o recorte anterior via `initialCrop`.
 */
export function CropModal({
  imageUrl,
  aspect,
  slotLabel,
  initialCrop,
  onClose,
  onSave,
}: CropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState<Crop>(
    initialCrop ?? { x: 0, y: 0, width: 1, height: 1 },
  );
  const [saving, setSaving] = useState(false);

  // react-easy-crop entrega croppedAreaPercent (0–100) em % da imagem. Salvamos
  // como proporções relativas (0–1) à processada.
  const onCropComplete = useCallback(
    (croppedAreaPercent: Area) => {
      setAreaPixels({
        x: croppedAreaPercent.x / 100,
        y: croppedAreaPercent.y / 100,
        width: croppedAreaPercent.width / 100,
        height: croppedAreaPercent.height / 100,
      });
    },
    [],
  );

  // initialCropArea espera percentuais (0–100); converte do salvo (0–1).
  const initialCropArea = initialCrop
    ? {
        x: initialCrop.x * 100,
        y: initialCrop.y * 100,
        width: initialCrop.width * 100,
        height: initialCrop.height * 100,
      }
    : undefined;

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(areaPixels);
    } finally {
      setSaving(false);
      onClose();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Recortar foto"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(21,21,21,.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: 20,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 14,
          width: 'min(560px, 100%)',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,.3)',
        }}
      >
        <div
          style={{
            padding: '18px 22px',
            borderBottom: '1px solid #ece8e1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Recortar foto</div>
            <div
              style={{ fontSize: 12, color: 'var(--rocha)', marginTop: 2 }}
            >
              Travado em{' '}
              <b
                style={{ fontFamily: 'var(--font-mono)', color: '#27406e' }}
              >
                {aspect}
              </b>{' '}
              · slot {slotLabel}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: '#f4f2ee',
              border: 'none',
              color: 'var(--rocha)',
              fontSize: 16,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <div
          style={{
            position: 'relative',
            height: 340,
            background: '#1b2330',
          }}
        >
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={parseAspect(aspect)}
            showGrid
            initialCroppedAreaPercentages={initialCropArea}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div style={{ padding: '16px 22px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 13,
              color: 'var(--rocha)',
            }}
          >
            Zoom
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              style={{ flex: 1 }}
            />
          </label>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 10,
              marginTop: 16,
            }}
          >
            <button
              onClick={onClose}
              disabled={saving}
              style={{
                height: 40,
                padding: '0 18px',
                background: '#fff',
                border: '1.5px solid #d9d4cb',
                borderRadius: 9,
                fontSize: 13.5,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                height: 40,
                padding: '0 20px',
                background: 'var(--navy)',
                color: '#fff',
                border: 'none',
                borderRadius: 9,
                fontSize: 13.5,
                fontWeight: 700,
                cursor: saving ? 'wait' : 'pointer',
              }}
            >
              {saving ? 'Salvando…' : 'Salvar recorte'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
