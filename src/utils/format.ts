/**
 * Formats an amount in Costa Rican Colones (e.g., ₡1.500, ₡3.000)
 */
export function formatColones(amount: number): string {
  const rounded = Math.round(amount || 0);
  const formatted = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `₡${formatted}`;
}

/**
 * Compresses an uploaded image file (such as a SINPE Móvil receipt screenshot)
 * into a lightweight base64 JPEG data URL so it transfers quickly over mobile data.
 */
export function compressReceiptImage(file: File, maxWidth = 900, quality = 0.78): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };
      img.onerror = (err) => reject(err);
      img.src = event.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Plays a pleasant subtle notification chime using Web Audio API
 * when a new order arrives at Reception or Kitchen KDS.
 */
export function playNotificationChime(type: 'reception' | 'kitchen' = 'reception') {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';

    if (type === 'reception') {
      osc1.frequency.setValueAtTime(587.33, now); // D5
      osc1.frequency.setValueAtTime(880, now + 0.14); // A5
      osc2.frequency.setValueAtTime(293.66, now);
      osc2.frequency.setValueAtTime(440, now + 0.14);
    } else {
      osc1.frequency.setValueAtTime(523.25, now); // C5
      osc1.frequency.setValueAtTime(659.25, now + 0.12); // E5
      osc1.frequency.setValueAtTime(783.99, now + 0.24); // G5
      osc2.frequency.setValueAtTime(261.63, now);
    }

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.55);
    osc2.stop(now + 0.55);
  } catch {
    // Ignore audio autoplay restrictions if user hasn't interacted yet
  }
}

/**
 * Returns human-friendly elapsed time (e.g., "Hace 3 min")
 */
export function getElapsedMinutes(isoDate?: string): string {
  if (!isoDate) return 'Reciente';
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins === 0) return 'Hace instantes';
  if (mins === 1) return 'Hace 1 min';
  return `Hace ${mins} min`;
}
