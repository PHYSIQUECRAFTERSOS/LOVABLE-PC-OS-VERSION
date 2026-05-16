/**
 * FatSecret Platform API attribution badge.
 * Required by FatSecret Premier Free tier ToS.
 * Per FatSecret guidelines, the HTML/image must not be modified.
 */
interface Props {
  variant?: "inline" | "footer";
  className?: string;
}

export default function PoweredByFatSecret({ variant = "footer", className = "" }: Props) {
  const heightClass = variant === "inline" ? "h-5" : "h-6";
  const wrapperClass =
    variant === "inline"
      ? `inline-flex items-center ${className}`
      : `mt-6 flex justify-start opacity-70 hover:opacity-100 transition-opacity ${className}`;

  return (
    <div className={wrapperClass}>
      <a
        href="https://platform.fatsecret.com"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Nutrition information provided by fatsecret Platform API"
      >
        <img
          alt="Nutrition information provided by fatsecret Platform API"
          src="https://platform.fatsecret.com/api/static/images/powered_by_fatsecret_horizontal_dark.png"
          srcSet="https://platform.fatsecret.com/api/static/images/powered_by_fatsecret_horizontal_dark@2x.png 2x, https://platform.fatsecret.com/api/static/images/powered_by_fatsecret_horizontal_dark@3x.png 3x"
          className={`${heightClass} w-auto`}
          // @ts-ignore - FatSecret snippet requires border attribute
          border={0}
        />
      </a>
    </div>
  );
}
