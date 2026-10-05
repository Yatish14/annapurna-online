export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Right-hand side: buttons, badges */
  children?: React.ReactNode;
}) {
  return (
    <header className="ad-pagehead">
      <div>
        {eyebrow && <span className="ad-eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="ad-pagehead-side">{children}</div>}
    </header>
  );
}
