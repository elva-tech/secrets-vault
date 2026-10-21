import { useState } from 'react';
import {
  generateSecureSecret,
  SecureRandomUnavailableError,
} from '../../lib/secretGenerator';

type RotateSecretValueInputProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function RotateSecretValueInput({
  value,
  onChange,
  disabled = false,
}: RotateSecretValueInputProps) {
  const [generateError, setGenerateError] = useState<string | null>(null);

  function onGenerate() {
    setGenerateError(null);
    try {
      onChange(generateSecureSecret());
    } catch (err) {
      if (err instanceof SecureRandomUnavailableError) {
        setGenerateError(err.message);
        return;
      }
      setGenerateError('Could not generate a secret. Try entering a value manually.');
    }
  }

  return (
    <label>
      New value
      <div className="vault-input-group">
        <input
          type="text"
          className="vault-input-group__field"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          data-lpignore="true"
          data-1p-ignore="true"
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm vault-input-group__btn"
          onClick={onGenerate}
          disabled={disabled}
          aria-label="Generate strong random secret"
        >
          Generate
        </button>
      </div>
      {generateError && (
        <p className="field-error" role="alert">{generateError}</p>
      )}
    </label>
  );
}
