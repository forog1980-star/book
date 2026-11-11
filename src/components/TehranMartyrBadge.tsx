import React from 'react';

interface TehranMartyrBadgeProps {
  /** اندازه نشان: کوچک (پیش‌فرض کنار نام‌ها و عناوین) یا متوسط */
  size?: 'xs' | 'sm' | 'md';
  /** توضیح راهنما هنگام ایستادن ماوس */
  title?: string;
  className?: string;
}

/**
 * نشان دایره‌ای/کپسولی ظریف «تهرانی» (زمینه قرمز ملایم و متن سفید خوانا)
 * برای نمایش در کنار نام شهدای گلزار شهدای تهران (۲۸٬۳۶۸ شهید) و عنوان کتاب‌های مرتبط با شهدای تهرانی
 */
export const TehranMartyrBadge: React.FC<TehranMartyrBadgeProps> = ({
  size = 'sm',
  title = 'منطبق با بانک ۲۸٬۳۶۸ شهید گلزار شهدای بهشت زهرا (س) تهران',
  className = ''
}) => {
  const sizeClasses =
    size === 'xs'
      ? 'px-1.5 py-[2px] text-[9px] min-w-[34px] h-[17px]'
      : size === 'md'
      ? 'px-2.5 py-0.5 text-[10.5px] min-w-[44px] h-[21px]'
      : 'px-2 py-[2.5px] text-[9.5px] min-w-[38px] h-[19px]';

  return (
    <span
      title={title}
      className={`inline-flex items-center justify-center rounded-full bg-[#B91C1C] text-white font-bold tracking-tight leading-none border border-[#991B1B]/40 shadow-2xs shrink-0 select-none align-middle ${sizeClasses} ${className}`}
    >
      تهرانی
    </span>
  );
};

export default TehranMartyrBadge;
