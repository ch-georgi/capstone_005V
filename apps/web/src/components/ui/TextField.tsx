import { forwardRef, useId, type InputHTMLAttributes } from "react";
import "./TextField.css";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
};

export const TextField = forwardRef<HTMLInputElement, Props>(
  ({ label, error, hint, id, ...rest }, ref) => {
    const autoId = useId();
    const fieldId = id ?? autoId;
    const errorId = `${fieldId}-error`;
    const hintId = `${fieldId}-hint`;

    return (
      <div className={`field${error ? " field-error" : ""}`}>
        <label htmlFor={fieldId}>{label}</label>
        <input
          id={fieldId}
          ref={ref}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          {...rest}
        />
        {error ? (
          <p className="field-msg field-msg-error" id={errorId} role="alert">
            {error}
          </p>
        ) : hint ? (
          <p className="field-msg" id={hintId}>
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);
TextField.displayName = "TextField";
