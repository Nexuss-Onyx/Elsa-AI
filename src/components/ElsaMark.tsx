interface ElsaMarkProps {
  size?: 'sm' | 'md' | 'lg';
}

export function ElsaMark({ size = 'md' }: ElsaMarkProps) {
  const dimensions =
    size === 'sm'
      ? 'h-8 w-8 rounded-xl'
      : size === 'lg'
        ? 'h-16 w-16 rounded-2xl'
        : 'h-9 w-9 rounded-xl';

  const svgSize =
    size === 'sm' ? 'h-5 w-5' : size === 'lg' ? 'h-9 w-9' : 'h-5 w-5';

  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center bg-[#1C1B19] text-[#FAF9F5] shadow-[0_2px_8px_rgba(28,27,25,0.14)] ${dimensions}`}
    >
      <svg
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={svgSize}
      >
        {/* Modern monochrome abstract geometric mark */}
        <path
          d="M18 5.5C11.0964 5.5 5.5 11.0964 5.5 18C5.5 24.9036 11.0964 30.5 18 30.5"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <path
          d="M18 11C21.866 11 25 14.134 25 18C25 21.866 21.866 25 18 25C14.134 25 11 21.866 11 18"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <path
          d="M18 18H29.5"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <circle cx="18" cy="18" r="2.2" fill="currentColor" />
      </svg>
    </div>
  );
}
