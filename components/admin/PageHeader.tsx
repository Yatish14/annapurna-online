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
    <header className="ap-pagehead">
      <div>
        {eyebrow && <span className="ap-eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="ap-pagehead-side">{children}</div>}
    </header>
  );
}
