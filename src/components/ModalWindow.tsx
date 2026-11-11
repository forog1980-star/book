import React, { useEffect, useId, useRef, useState } from 'react';
import { Move, RotateCcw, X } from 'lucide-react';
import { registerModalInBackStack } from '../utils/navigationHistory';

let globalTopModalZ = 80;

interface ModalWindowProps {
  onClose: () => void;
  title?: string;
  maxWidthClass?: string;
  children: React.ReactNode;
  contentClassName?: string;
  zIndexClass?: string;
  hideTopBar?: boolean;
  initialDesktopOffset?: { x: number; y: number };
}

export const ModalWindow: React.FC<ModalWindowProps> = ({
  onClose,
  title,
  maxWidthClass = 'max-w-lg',
  children,
  contentClassName = 'p-4 sm:p-5 space-y-4 text-xs',
  hideTopBar = false,
  initialDesktopOffset
}) => {
  const modalId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [zIndex, setZIndex] = useState<number>(() => {
    globalTopModalZ += 2;
    return globalTopModalZ;
  });

  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 640 && initialDesktopOffset) {
      return initialDesktopOffset;
    }
    return { x: 0, y: 0 };
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; origX: number; origY: number }>({
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0
  });

  // ثبت خودکار پنجره در پشته بازگشت (Back) گوشی و کلید Escape
  useEffect(() => {
    const unregister = registerModalInBackStack(modalId, () => {
      onCloseRef.current();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      unregister();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [modalId]);

  // مدیریت جابه‌جایی (Move / Drag) پنجره با ماوس در لپ‌تاپ و کامپیوتر
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;
      const maxX = Math.max(160, window.innerWidth * 0.45);
      const maxY = Math.max(100, window.innerHeight * 0.44);

      const clampedX = Math.max(-maxX, Math.min(maxX, dragStartRef.current.origX + dx));
      const clampedY = Math.max(-maxY, Math.min(maxY, dragStartRef.current.origY + dy));

      setPosition({ x: clampedX, y: clampedY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const bringToFront = () => {
    globalTopModalZ += 2;
    setZIndex(globalTopModalZ);
  };

  const startDrag = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    bringToFront();
    // فقط در صفحه دسکتاپ/لپ‌تاپ جابه‌جایی پنجره فعال باشد تا اسکرول لمسی گوشی مختل نشود
    if (window.innerWidth < 640) return;

    const target = e.target as HTMLElement;
    if (
      target.closest(
        'button, input, select, textarea, a, label, [role="button"], [data-no-drag="true"]'
      )
    ) {
      return;
    }

    e.preventDefault();
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: position.x,
      origY: position.y
    };
    setIsDragging(true);
  };

  // اجازه جابه‌جایی پنجره در لپ‌تاپ حتی با گرفتن هدر داخلی پنجره
  const handleContentMouseDown = (e: React.MouseEvent) => {
    bringToFront();
    if (e.button !== 0 || window.innerWidth < 640) return;
    const target = e.target as HTMLElement;
    if (
      target.closest(
        'button, input, select, textarea, a, label, [role="button"], [data-no-drag="true"]'
      )
    ) {
      return;
    }
    if (target.closest('h2, h3, .modal-drag-handle')) {
      e.preventDefault();
      dragStartRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: position.x,
        origY: position.y
      };
      setIsDragging(true);
    }
  };

  const hasMoved = position.x !== 0 || position.y !== 0;

  return (
    <div
      style={{ zIndex }}
      className="fixed inset-0 bg-black/55 backdrop-blur-[2px] flex items-center justify-center px-3 sm:px-6 pt-[max(3.75rem,calc(env(safe-area-inset-top,0px)+2.5rem))] pb-[max(5rem,calc(env(safe-area-inset-bottom,0px)+3rem))] sm:py-6 overflow-hidden"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDragging) {
          onClose();
        }
      }}
    >
      <div
        style={{
          transform: hasMoved ? `translate3d(${position.x}px, ${position.y}px, 0)` : undefined
        }}
        onMouseDown={handleContentMouseDown}
        className={`bg-white border-2 border-[#E2D2BE] rounded-2xl ${maxWidthClass} w-full max-h-[calc(100dvh-8.75rem)] sm:max-h-[calc(100dvh-3.5rem)] flex flex-col shadow-2xl overflow-hidden transition-shadow ${
          isDragging ? 'shadow-[0_25px_60px_rgba(0,0,0,0.45)] ring-2 ring-[#6B3E26]' : ''
        }`}
      >
        {/* نوار ثابت بالای پنجره: دستگیره جابه‌جایی (Move) در لپ‌تاپ + کلید بستن همیشه در دسترس و ایمن از بریدگی */}
        {!hideTopBar && (
          <div
            onMouseDown={startDrag}
            onDoubleClick={() => setPosition({ x: 0, y: 0 })}
            className="bg-[#F6EFE6] border-b border-[#E2D2BE] px-3.5 py-2 flex items-center justify-between gap-2 shrink-0 sm:cursor-move select-none"
            title="در کامپیوتر و لپ‌تاپ می‌توانید این نوار را با ماوس بگیرید و پنجره را روی صفحه جابه‌جا کنید"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5C4033] truncate">
                <Move className="w-3.5 h-3.5 text-[#6B3E26] hidden sm:inline shrink-0" />
                <span className="truncate">{title || 'پنجره جزئیات و عملیات'}</span>
              </span>
              <span className="hidden md:inline-block text-[10px] text-[#78604E] bg-white/80 border border-[#E2D2BE] px-2 py-0.5 rounded-md">
                جابه‌جایی با ماوس (Move)
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {hasMoved && (
                <button
                  type="button"
                  onClick={() => setPosition({ x: 0, y: 0 })}
                  className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white hover:bg-[#EFE4D6] text-[#5C4033] border border-[#E2D2BE] text-[10px] font-bold cursor-pointer"
                  title="بازگرداندن پنجره به وسط صفحه"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>وسط صفحه</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="min-h-[30px] px-2.5 py-1 rounded-lg bg-[#A63A3A] hover:bg-[#872D2D] text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                aria-label="بستن پنجره"
              >
                <X className="w-3.5 h-3.5" />
                <span>بستن</span>
              </button>
            </div>
          </div>
        )}

        {/* محتوای درونی پنجره با اسکرول مستقل و فاصله امن از بالا و پایین گوشی */}
        <div className={`flex-1 overflow-y-auto overflow-x-hidden overscroll-contain ${contentClassName}`}>
          {children}
        </div>
      </div>
    </div>
  );
};
