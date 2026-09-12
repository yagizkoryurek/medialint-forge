import { type DragEvent, useId, useRef, useState } from 'react';
import styles from './DropZone.module.css';

const ACCEPT =
  '.mp4,.m4v,.mov,.webm,.mkv,.jpg,.jpeg,.png,.webp,video/mp4,video/quicktime,video/webm,video/x-matroska,image/jpeg,image/png,image/webp';

export function DropZone({
  onFile,
  compact = false,
}: {
  onFile: (f: File) => void;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const id = useId();

  const pick = (list: FileList | null) => {
    const f = list?.[0];
    if (f) onFile(f);
  };
  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setOver(false);
    pick(e.dataTransfer.files);
  };

  return (
    <section
      className={`${styles.zone} ${over ? styles.over : ''} ${compact ? styles.compact : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      aria-labelledby={`${id}-title`}
    >
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={ACCEPT}
        className="visually-hidden"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = '';
        }}
      />
      <div className={styles.icon} aria-hidden="true">
        ⤓
      </div>
      <h2 id={`${id}-title`} className={styles.title}>
        {compact ? 'Drop another file' : 'Drop a video or image'}
      </h2>
      <p className={styles.hint}>MP4, MOV, WebM, MKV · JPEG, PNG, WebP</p>
      <button type="button" className={styles.choose} onClick={() => inputRef.current?.click()}>
        Choose a file
      </button>
    </section>
  );
}
