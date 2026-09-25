// Pulsante "3D" del kit: faccia colorata (--c) e spessore sotto; premuto si
// abbassa di 4 px (vedi .gk-btn3d in gameKit.css). Qualsiasi prop extra va
// al <button> (onClick, disabled, aria-*, ...).
export default function Button3D({ color, className = '', children, ...rest }) {
  return (
    <button type="button" className={`gk-btn3d ${className}`} style={color ? { '--c': color } : undefined} {...rest}>
      {children}
    </button>
  );
}
