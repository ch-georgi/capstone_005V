import { passwordStrength } from "../../lib/validation";
import "./PasswordStrength.css";

export function PasswordStrengthMeter({ value }: { value: string }) {
  if (!value) return null;
  const { score, label } = passwordStrength(value);

  return (
    <div className="pw-strength" aria-hidden="false">
      <div className="pw-strength-bars">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`pw-strength-bar${i < score ? " filled" : ""} level-${score}`} />
        ))}
      </div>
      <span className="pw-strength-label">{label}</span>
    </div>
  );
}
