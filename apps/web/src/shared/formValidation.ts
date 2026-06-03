export type FormValidationErrors<TField extends string> = Partial<Record<TField, string>>;

export type RequiredField<TField extends string> = {
  name: TField;
  value: string;
  message: string;
};

export function validateRequiredFields<TField extends string>(fields: readonly RequiredField<TField>[]) {
  const errors: FormValidationErrors<TField> = {};

  for (const field of fields) {
    if (!field.value.trim()) {
      errors[field.name] = field.message;
    }
  }

  return errors;
}

export function hasValidationErrors<TField extends string>(errors: FormValidationErrors<TField>) {
  return Object.keys(errors).length > 0;
}
