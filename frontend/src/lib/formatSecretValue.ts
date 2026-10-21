export function formatSecretValue(value: {
  password?: string;
  value?: string;
  key?: string;
  username?: string;
}) {
  if (value.password !== undefined) {
    return value.username ? `${value.username}:${value.password}` : value.password;
  }
  if (value.key !== undefined && value.value !== undefined) {
    return `${value.key}=${value.value}`;
  }
  return value.value ?? JSON.stringify(value);
}
