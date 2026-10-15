import { forwardRef, useId, type SelectHTMLAttributes } from "react";
import "./TextField.css";

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
  options: { value: string; label: string }[];
};

export const SelectField = forwardRef<HTMLSelectElement, Props>(
  ({ label, error, options, id, ...rest }, ref) => {
    const autoId = useId();
    const fieldId = id ?? autoId;
    const errorId = `${fieldId}-error`;

    return (
      <div className={`field${error ? " field-error" : ""}`}>
        <label htmlFor={fieldId}>{label}</label>
        <select
          id={fieldId}
          ref={ref}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...rest}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error ? (
          <p className="field-msg field-msg-error" id={errorId} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
SelectField.displayName = "SelectField";
